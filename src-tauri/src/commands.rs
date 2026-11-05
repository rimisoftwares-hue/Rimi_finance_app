use tauri::command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[command]
pub fn print_document(_title: String, _html_content: String) -> Result<(), String> {
    Ok(())
}

#[command]
pub fn create_print_window(_title: String, _html_content: String) -> Result<(), String> {
    Ok(())
}

#[command]
pub fn open_os_privacy_settings(permission_type: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let uri = match permission_type.as_str() {
            "camera" => "ms-settings:privacy-webcam",
            "location" => "ms-settings:privacy-location",
            "notification" => "ms-settings:notifications",
            _ => "ms-settings:privacy",
        };
        std::process::Command::new("cmd")
            .args(["/C", "start", "", uri])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("Failed to open Windows settings: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        let url = match permission_type.as_str() {
            "camera" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
            "location" => "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices",
            "notification" => "x-apple.systempreferences:com.apple.preference.notifications",
            _ => "x-apple.systempreferences:com.apple.preference.security",
        };
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open macOS settings: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        let panel = match permission_type.as_str() {
            "location" => "location",
            "notification" => "notifications",
            _ => "privacy",
        };
        let ok = std::process::Command::new("gnome-control-center").arg(panel).spawn().is_ok()
            || std::process::Command::new("systemsettings").spawn().is_ok();
        if !ok {
            return Err("Could not open system settings. Please open your system settings manually and allow access for this app.".into());
        }
    }

    Ok(())
}

/// Clears the webview's stored permission decisions (needed when the user clicked "Block"
/// in the WebView2 / WKWebView prompt, which the webview then remembers).
/// WARNING: this also clears localStorage/cookies/IndexedDB for the webview.
#[command]
pub fn reset_webview_permissions(window: tauri::WebviewWindow) -> Result<(), String> {
    window.clear_all_browsing_data().map_err(|e| e.to_string())
}
