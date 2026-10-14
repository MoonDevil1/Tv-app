use serde::Deserialize;
use serde_json::Value;
use std::{fs, process::Command};

const API_BASE: &str = "https://livetgtv.lovable.app/api/public";
const RELEASE_API: &str = "https://api.github.com/repos/MoonDevil1/Tv-app/releases/latest";

#[derive(Deserialize)]
struct ReleaseAsset { name: String, browser_download_url: String }
#[derive(Deserialize)]
struct Release { tag_name: String, body: Option<String>, assets: Vec<ReleaseAsset> }
#[derive(serde::Serialize)]
struct UpdateInfo { version: String, download_url: String, file_name: String, notes: String }

#[tauri::command]
async fn get_channels() -> Result<Value, String> {
    let response = reqwest::Client::new().get(format!("{API_BASE}/channels"))
        .header(reqwest::header::ACCEPT, "application/json").send().await
        .map_err(|e| format!("Could not contact LiveTGTV V1: {e}"))?;
    let status = response.status();
    if !status.is_success() { return Err(format!("LiveTGTV returned HTTP {status}")); }
    response.json::<Value>().await.map_err(|e| format!("Invalid channel-list response: {e}"))
}

#[tauri::command]
async fn check_for_updates() -> Result<Option<UpdateInfo>, String> {
    let response = reqwest::Client::new().get(RELEASE_API)
        .header(reqwest::header::USER_AGENT, "TGTV-Desktop")
        .header(reqwest::header::ACCEPT, "application/vnd.github+json").send().await
        .map_err(|e| format!("Could not contact GitHub Releases: {e}"))?;
    if !response.status().is_success() { return Err(format!("GitHub Releases returned HTTP {}", response.status())); }
    let release: Release = response.json().await.map_err(|e| format!("Invalid release information: {e}"))?;
    let asset = release.assets.into_iter().find(|a| a.name.to_ascii_lowercase().ends_with(".exe"));
    Ok(asset.map(|a| UpdateInfo { version: release.tag_name.trim_start_matches('v').to_string(), download_url: a.browser_download_url, file_name: a.name, notes: release.body.unwrap_or_default().chars().take(500).collect() }))
}

#[tauri::command]
async fn download_and_install_update(download_url: String, file_name: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&download_url).map_err(|_| "Invalid update download URL".to_string())?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("github.com") || !parsed.path().contains("/MoonDevil1/Tv-app/releases/download/") {
        return Err("Update URL is not from the official TGTV Desktop GitHub Releases.".to_string());
    }
    if !file_name.to_ascii_lowercase().ends_with(".exe") || file_name.contains('/') || file_name.contains('\\') { return Err("Unexpected installer filename.".to_string()); }
    let response = reqwest::Client::new().get(parsed).header(reqwest::header::USER_AGENT, "TGTV-Desktop").send().await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !response.status().is_success() { return Err(format!("Installer download returned HTTP {}", response.status())); }
    let bytes = response.bytes().await.map_err(|e| format!("Could not read installer: {e}"))?;
    if bytes.len() < 1024 { return Err("Downloaded installer appears incomplete.".to_string()); }
    let mut path = std::env::temp_dir(); path.push(file_name);
    fs::write(&path, &bytes).map_err(|e| format!("Could not save installer: {e}"))?;
    Command::new(&path).spawn().map_err(|e| format!("Could not launch installer: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default().invoke_handler(tauri::generate_handler![get_channels, check_for_updates, download_and_install_update])
        .run(tauri::generate_context!()).expect("error while running TGTV Desktop");
}
