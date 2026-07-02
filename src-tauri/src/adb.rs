//! Thin ADB wrapper. Used by the emulator manager to list devices and to
//! install/launch APKs inside the sandboxed emulator for dynamic analysis.

use std::process::Command;

fn adb() -> Command {
    Command::new("adb")
}

/// Return the list of attached devices/emulators (e.g. "emulator-5554").
pub fn devices() -> Vec<String> {
    let out = match adb().arg("devices").output() {
        Ok(o) => o,
        Err(_) => return vec![],
    };
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines()
        .skip(1) // "List of devices attached"
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let serial = parts.next()?;
            let state = parts.next()?;
            if state == "device" || state == "emulator" {
                Some(serial.to_string())
            } else {
                None
            }
        })
        .collect()
}

/// Install an APK onto the given device.
pub fn install(serial: &str, apk_path: &str) -> anyhow::Result<()> {
    let status = adb()
        .args(["-s", serial, "install", "-r", apk_path])
        .status()?;
    if !status.success() {
        anyhow::bail!("adb install failed for {apk_path}");
    }
    Ok(())
}
