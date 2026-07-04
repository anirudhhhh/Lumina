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

    /// Spawn uvicorn serving `app.main:app`. No-op if already running.
    pub fn spawn(&self) -> anyhow::Result<()> {
        let mut guard = self.child.lock().unwrap();
        if guard.is_some() {
            return Ok(());
        }
        let dir = self.service_dir();
        let child = Command::new(Self::python_bin(&dir))
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
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;
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
