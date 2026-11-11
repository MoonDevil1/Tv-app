# TG IPTV — Windows Desktop

![Original TG IPTV APK logo](assets/tg-logo.svg)

A lightweight Windows desktop IPTV player recreated from the supplied TG-IPTV Android APK using **Tauri 2, Rust, Vite, vanilla JavaScript and Shaka Player**. It avoids Electron.

## Included features
- Import M3U, M3U8 and supported JSON channel playlists from URLs or local files
- Manage multiple playlists, refresh remote sources, delete sources and export M3U
- Browse Live TV, channel groups/categories, search, favorites and recently watched history
- Player with HLS/DASH playback, adaptive quality and manual quality selection
- Audio-language and subtitle track selection, fullscreen, picture-in-picture, previous/next and autoplay
- Audio gain boost up to 200% where WebAudio/CORS permissions allow it
- Buffer-ahead tuning, live buffer diagnostics and copyable stream information
- Stream Config for manual channels, logos, categories, request headers and DRM parameters
- DRM Lab for authorized Widevine, PlayReady and ClearKey configuration
- Google Drive URL/file-ID helper for public or authorized compatible media
- Persistent preferences and JSON app-data backup/restore
- Original app logo extracted from the APK and included in the desktop interface

## Build on Windows
Install Rust stable, Node.js 22 and Microsoft WebView2 Runtime. From the repository root:

```powershell
npm install
cargo install tauri-cli --version "^2" --locked
cd src-tauri
cargo tauri dev
cargo tauri build
```

The NSIS and MSI installers are generated under `src-tauri/target/release/bundle/`. GitHub Actions also builds both Windows installer formats and uploads them as a workflow artifact.

## Playback compatibility
DRM playback requires a supported WebView2 Content Decryption Module (CDM), a valid license server, any required authorization headers, and rights to play the content. This player does not bypass DRM. ClearKey works only when the stream and runtime permit it. Browser security restricts some request headers (including User-Agent, Origin and Referer), and Google Drive does not provide a universal direct media URL for every file. Stream compatibility depends on the source, CORS configuration, codecs and license provider.

## APK reference
The Android APK was inspected for its playlist, channel, favorites, history, player, audio/subtitle, quality, buffering, Stream Config, DRM Lab and Google Drive surfaces. This is a native desktop reimplementation, not an APK-to-EXE conversion; Android-only services and behavior must be adapted to Windows.
