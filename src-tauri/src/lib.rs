//! Lumina Tauri core (the "Main Process / Orchestrator" from the architecture).
//! Owns the Python microservice lifecycle and exposes IPC commands.

mod adb;
mod commands;
mod models;
mod python;

use python::PythonService;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PythonService::new())
        .setup(|app| {
            // Boot the bundled Python analysis microservice on startup.
            let svc = app.state::<PythonService>();
            if let Err(e) = svc.spawn() {
                eprintln!("[lumina] failed to spawn python service: {e}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Ensure the child process is reaped when the window closes.
                window.state::<PythonService>().shutdown();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::ingest_apk,
            commands::run_analysis,
            commands::run_static_analysis,
            commands::run_dynamic_analysis,
            commands::get_report,
            commands::list_reports,
            commands::service_health,
            commands::export_report_pdf,
            commands::list_devices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lumina");
}
