//! Manages the bundled Python analysis microservice: spawns it as a child
//! process, waits for it to become healthy, and proxies HTTP requests to it.
//! This is the Rust-side "Python Process Spawner" from the system architecture.

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use crate::models::ServiceHealth;

pub const SERVICE_HOST: &str = "127.0.0.1";
pub const SERVICE_PORT: u16 = 8756;

pub fn base_url() -> String {
    format!("http://{SERVICE_HOST}:{SERVICE_PORT}")
}

/// Handle to the spawned microservice; kept in Tauri managed state.
pub struct PythonService {
    child: Mutex<Option<Child>>,
    http: reqwest::Client,
}

impl PythonService {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(600))
                .build()
                .expect("build reqwest client"),
        }
    }

    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    /// Resolve the directory that contains the `app` package. In development
    /// this is `../python-service`; in a bundled app it is a resource dir.
    fn service_dir(&self) -> PathBuf {
        // Dev: crate is at src-tauri/, service is a sibling of the project root.
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(|p| p.join("python-service"))
            .unwrap_or_default();
        if dev.exists() {
            return dev;
        }
        // Fallback: current working directory.
        PathBuf::from("python-service")
    }

    /// Resolve the Python interpreter to launch. Prefers a `.venv` inside the
    /// service directory (created by `scripts/setup`), then falls back to the
    /// system interpreter.
    fn python_bin(dir: &std::path::Path) -> String {
        let venv = if cfg!(windows) {
            dir.join(".venv").join("Scripts").join("python.exe")
        } else {
            dir.join(".venv").join("bin").join("python3")
        };
        if venv.exists() {
            return venv.to_string_lossy().to_string();
        }
        if cfg!(windows) {
            "python".to_string()
        } else {
            "python3".to_string()
        }
    }

    /// Locate the frozen service sidecar next to the app executable. Tauri
    /// strips the target triple when installing an `externalBin`, so the binary
    /// sits beside the main app as `lumina-service[.exe]`. Present only in a
    /// packaged build — `None` in dev, where we run uvicorn from source.
    fn sidecar_path() -> Option<PathBuf> {
        let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
        let name = if cfg!(windows) {
            "lumina-service.exe"
        } else {
            "lumina-service"
        };
        let p = dir.join(name);
        if p.exists() {
            Some(p)
        } else {
            None
        }
    }

    /// Environment for the child: point the analysis service at the bundled
    /// JADX + JRE when they were packaged (resources/tools), so decompilation
    /// works with zero external installs. Falls back silently to a system
    /// `jadx`/`java` on PATH when the bundle is absent (e.g. dev).
    fn tool_env(app: &tauri::AppHandle) -> Vec<(String, String)> {
        use tauri::Manager;
        let mut envs: Vec<(String, String)> = Vec::new();

        // Candidate locations for the bundled tools, most-specific first:
        //   1. packaged app resource dir (…/tools)
        //   2. dev source tree (src-tauri/resources/tools) — so `tools:fetch`
        //      also lights up JADX during `tauri dev`.
        let mut candidates: Vec<PathBuf> = Vec::new();
        if let Ok(res) = app.path().resource_dir() {
            candidates.push(res.join("tools"));
        }
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("resources")
                .join("tools"),
        );
        let Some(tools) = candidates.into_iter().find(|p| p.exists()) else {
            return envs;
        };

        let jadx = if cfg!(windows) {
            tools.join("jadx").join("bin").join("jadx.bat")
        } else {
            tools.join("jadx").join("bin").join("jadx")
        };
        if jadx.exists() {
            envs.push(("LUMINA_JADX_PATH".into(), jadx.to_string_lossy().into()));
        }

        // macOS JREs nest the runtime under Contents/Home.
        let jre = if cfg!(target_os = "macos") {
            tools.join("jre").join("Contents").join("Home")
        } else {
            tools.join("jre")
        };
        let java = if cfg!(windows) {
            jre.join("bin").join("java.exe")
        } else {
            jre.join("bin").join("java")
        };
        if java.exists() {
            envs.push(("JAVA_HOME".into(), jre.to_string_lossy().into()));
            let bin = jre.join("bin");
            let sep = if cfg!(windows) { ";" } else { ":" };
            let path = std::env::var("PATH").unwrap_or_default();
            envs.push(("PATH".into(), format!("{}{}{}", bin.to_string_lossy(), sep, path)));
        }
        envs
    }

    /// Spawn the analysis service. No-op if already running. Prefers the frozen
    /// sidecar binary (packaged build); otherwise runs uvicorn from the source
    /// tree via the project venv / system Python (development).
    pub fn spawn(&self, app: &tauri::AppHandle) -> anyhow::Result<()> {
        let mut guard = self.child.lock().unwrap();
        if guard.is_some() {
            return Ok(());
        }
        let envs = Self::tool_env(app);
        let child = if let Some(bin) = Self::sidecar_path() {
            Command::new(bin)
                .envs(envs)
                .env("LUMINA_SERVICE_HOST", SERVICE_HOST)
                .env("LUMINA_SERVICE_PORT", SERVICE_PORT.to_string())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()?
        } else {
            let dir = self.service_dir();
            Command::new(Self::python_bin(&dir))
                .args([
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    SERVICE_HOST,
                    "--port",
                    &SERVICE_PORT.to_string(),
                ])
                .current_dir(&dir)
                .envs(envs)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()?
        };
        *guard = Some(child);
        Ok(())
    }

    /// Politely terminate the child process (called on app exit).
    pub fn shutdown(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }

    pub async fn health(&self) -> ServiceHealth {
        match self
            .http
            .get(format!("{}/health", base_url()))
            .timeout(Duration::from_secs(3))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => resp
                .json::<ServiceHealth>()
                .await
                .unwrap_or_else(|_| offline_health()),
            _ => offline_health(),
        }
    }
}

impl Drop for PythonService {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn offline_health() -> ServiceHealth {
    ServiceHealth {
        ok: false,
        version: "unavailable".into(),
        androguard: false,
        jadx: false,
        frida: false,
        llm: false,
        provider: None,
        model: None,
    }
}
