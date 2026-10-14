use serde_json::Value;

const API_BASE: &str = "https://livetgtv.lovable.app/api/public";

#[tauri::command]
async fn get_channels() -> Result<Value, String> {
    let response = reqwest::Client::new()
        .get(format!("{API_BASE}/channels"))
        .header(reqwest::header::ACCEPT, "application/json")
        .send().await.map_err(|e| format!("Could not contact LiveTGTV V1: {e}"))?;
    let status = response.status();
    if !status.is_success() { return Err(format!("LiveTGTV returned HTTP {status}")); }
    response.json::<Value>().await.map_err(|e| format!("Invalid channel-list response: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_channels])
        .run(tauri::generate_context!())
        .expect("error while running TGTV Desktop");
}