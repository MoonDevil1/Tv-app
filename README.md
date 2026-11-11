# TG IPTV — Windows Desktop

![TG IPTV](assets/tg-logo.svg)

A lightweight Windows IPTV desktop application based on the supplied TG-IPTV Android APK. Built with **Tauri 2 + Rust + vanilla JavaScript + Shaka Player** (not Electron).

## Implemented feature areas
- M3U/M3U8 URL and local-file import, playlist listing, export, refresh and app-data backup/restore
- Live channel grid, category filtering, global search, favorites and recently watched history
- Shaka-powered HLS/DASH playback, adaptive streaming, audio-language selection and subtitle tracks
- DRM Lab with Widevine/PlayReady license URL and headers, and ClearKey configuration for authorized streams
- Google Drive URL/file-ID helper for publicly accessible or authorized media
- Fullscreen, picture-in-picture, previous/next channel, and persistent preferences

## Build on Windows
Install Rust stable, Node.js 22, and the Microsoft WebView2 Runtime:

```powershell
cargo install tauri-cli --version "^2" --locked
cd src-tauri
cargo tauri dev
cargo tauri build
```

The NSIS and MSI installers are generated under `src-tauri/target/release/bundle/`. GitHub Actions builds them on changes to the application or by manual workflow dispatch.

## Playback limitations
DRM requires a supported WebView2 CDM, a valid license server, required authorization headers, and playback rights. This app does not bypass DRM. ClearKey is only available where the stream and player runtime permit it. Google Drive direct playback depends on the file being accessible and browser-compatible; Drive does not expose a universal direct stream URL for every file.

## APK reference
The Android APK was inspected for its channel, playlist, favorites, history, player, subtitle, DRM Lab, and Google Drive flows. Its original app logo is included in `assets/tg-logo.svg`.
