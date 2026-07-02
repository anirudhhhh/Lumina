//! Domain model mirroring the TypeScript contract in `src/lib/types.ts` and
//! the Python service models. All structs serialize as camelCase JSON so the
//! frontend can consume them directly.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApkMeta {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub sha256: String,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_sdk: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_sdk: Option<u32>,
}

/// A full analysis report is passed through opaquely as JSON — the Python
/// service is the source of truth for its shape, and the Rust core only
/// augments the APK metadata. Using `serde_json::Value` keeps the two in sync
/// without duplicating the entire schema in Rust.
pub type AnalysisReport = serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceHealth {
    pub ok: bool,
    pub version: String,
    pub androguard: bool,
    pub jadx: bool,
    pub frida: bool,
    pub llm: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEvent {
    pub ts: String,
    pub kind: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub severity: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineProgress {
    pub stage: String,
    pub message: String,
}
