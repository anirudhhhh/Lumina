//! Tauri commands — the IPC surface invoked from the React frontend.
//! Most commands proxy to the Python microservice; `ingest_apk` additionally
//! hashes the file on the Rust side (File System Manager role).

use std::fs;
use std::io::Read;
use std::path::Path;

use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::{Emitter, State};

use crate::adb;
use crate::models::{AnalysisReport, ApkMeta, PipelineProgress, ServiceHealth};
use crate::python::{base_url, PythonService};

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Hash a file with SHA-256, returning the lowercase hex digest.
fn sha256_file(path: &Path) -> anyhow::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Ingest an APK: hash it, gather basic metadata, and register it with the
/// Python service (which enriches with package/version via Androguard).
#[tauri::command]
pub async fn ingest_apk(path: String, svc: State<'_, PythonService>) -> CmdResult<ApkMeta> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {path}"));
    }
    let size_bytes = fs::metadata(p).map_err(err)?.len();
    let sha256 = sha256_file(p).map_err(err)?;
    let file_name = p
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown.apk".into());
    let id = format!("APK_{}", &sha256[..8]);

    let payload = json!({
        "id": id,
        "path": path,
        "sha256": sha256,
        "sizeBytes": size_bytes,
        "fileName": file_name,
    });

    let resp = svc
        .http()
        .post(format!("{}/ingest", base_url()))
        .json(&payload)
        .send()
        .await
        .map_err(err)?;

    if !resp.status().is_success() {
        return Err(format!("ingest failed: HTTP {}", resp.status()));
    }
    resp.json::<ApkMeta>().await.map_err(err)
}

async fn proxy_report(
    endpoint: &str,
    apk_id: &str,
    svc: &PythonService,
) -> CmdResult<AnalysisReport> {
    let resp = svc
        .http()
        .post(format!("{}/{}", base_url(), endpoint))
        .json(&json!({ "apkId": apk_id }))
        .send()
        .await
        .map_err(err)?;
    if !resp.status().is_success() {
        return Err(format!("{endpoint} failed: HTTP {}", resp.status()));
    }
    resp.json::<AnalysisReport>().await.map_err(err)
}

#[tauri::command]
pub async fn run_analysis(
    apk_id: String,
    app: tauri::AppHandle,
    svc: State<'_, PythonService>,
) -> CmdResult<AnalysisReport> {
    let _ = app.emit(
        "pipeline-progress",
        PipelineProgress {
            stage: "STATIC_PARSING".into(),
            message: "Running full static + AI pipeline…".into(),
        },
    );
    proxy_report("analyze", &apk_id, &svc).await
}

#[tauri::command]
pub async fn run_static_analysis(
    apk_id: String,
    svc: State<'_, PythonService>,
) -> CmdResult<AnalysisReport> {
    proxy_report("analyze/static", &apk_id, &svc).await
}

#[tauri::command]
pub async fn run_dynamic_analysis(
    apk_id: String,
    app: tauri::AppHandle,
    svc: State<'_, PythonService>,
) -> CmdResult<AnalysisReport> {
    let _ = app.emit(
        "pipeline-progress",
        PipelineProgress {
            stage: "DYNAMIC_EMULATION".into(),
            message: "Starting Frida instrumentation…".into(),
        },
    );
    proxy_report("analyze/dynamic", &apk_id, &svc).await
}

#[tauri::command]
pub async fn get_report(apk_id: String, svc: State<'_, PythonService>) -> CmdResult<AnalysisReport> {
    let resp = svc
        .http()
        .get(format!("{}/report/{}", base_url(), apk_id))
        .send()
        .await
        .map_err(err)?;
    if !resp.status().is_success() {
        return Err(format!("report not found: HTTP {}", resp.status()));
    }
    resp.json::<AnalysisReport>().await.map_err(err)
}

#[tauri::command]
pub async fn list_reports(svc: State<'_, PythonService>) -> CmdResult<Vec<ApkMeta>> {
    let resp = svc
        .http()
        .get(format!("{}/reports", base_url()))
        .send()
        .await
        .map_err(err)?;
    resp.json::<Vec<ApkMeta>>().await.map_err(err)
}

#[tauri::command]
pub async fn service_health(svc: State<'_, PythonService>) -> CmdResult<ServiceHealth> {
    Ok(svc.health().await)
}

#[tauri::command]
pub async fn export_report_pdf(
    apk_id: String,
    svc: State<'_, PythonService>,
) -> CmdResult<String> {
    let resp = svc
        .http()
        .post(format!("{}/report/{}/export", base_url(), apk_id))
        .send()
        .await
        .map_err(err)?;
    let v: serde_json::Value = resp.json().await.map_err(err)?;
    Ok(v.get("path")
        .and_then(|p| p.as_str())
        .unwrap_or("")
        .to_string())
}

#[tauri::command]
pub fn list_devices() -> CmdResult<Vec<String>> {
    Ok(adb::devices())
}
