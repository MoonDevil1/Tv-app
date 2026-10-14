# TGTV Desktop

A lightweight Windows desktop app for **LiveTGTV V1** built with Tauri 2, Rust, TypeScript and Vite. It uses the official V1 embed page for playback so the service's own player handles its stream formats and playback requirements. This project does not use LiveTGTV V2.

## Features

- Loads the public V1 channel directory from `/api/public/channels`
- Search by channel name and filter by category
- Channel logos, dark desktop UI and refresh controls
- Opens the official player at `/embed/{id}` inside the app
- Windows installer workflow for NSIS `.exe` and MSI `.msi`
- Uses native WebView2 through Tauri instead of bundling Chromium/Electron

## Build on Windows 10/11

Install:
1. Node.js 22 LTS
2. Rust using rustup
3. Microsoft C++ Build Tools (Desktop development with C++) and Windows SDK
4. WebView2 Runtime (usually already present on Windows 10/11)

Then, from the repository folder:

```powershell
npm install
npm run tauri dev
```

Build installers:

```powershell
npm run tauri build
```

Artifacts are created in `src-tauri/target/release/bundle/`.

## Build through GitHub Actions

1. Open the repository's **Actions** tab.
2. Select **Build TGTV Desktop for Windows**.
3. Click **Run workflow**.
4. When the run finishes, download the `TGTV-Desktop-Windows-v0.1.0` artifact from the workflow run.

The workflow can also run when a `v*` tag is pushed. This repository's source was added, but a successful Windows build and real-device playback still need to be verified by the Actions run.

## Playback notes

The desktop app embeds the official LiveTGTV V1 `/embed/{id}` player instead of extracting direct manifests. Playback depends on the service's availability, its embed policy, and any authorization/DRM requirements. The app does not bypass DRM or extract decryption keys. If the channel works in a normal browser but not inside the desktop app, inspect the embed restrictions and WebView2 compatibility.
