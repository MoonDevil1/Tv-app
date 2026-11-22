# TG IPTV — Cinema Edition

A cross-platform desktop IPTV player built with Electron, React 19, TypeScript, Shaka Player and hls.js.

## Downloads — v2.0.2

Choose the download for your operating system. All installers below are attached to the [published v2.0.2 GitHub release](https://github.com/MoonDevil1/Tv-app/releases/tag/v2.0.2).

### Windows

| Package | Download | Notes |
|---|---|---|
| Windows Installer (x64) | [Download `.exe`](https://github.com/MoonDevil1/Tv-app/releases/download/v2.0.2/TG.IPTV.Setup.2.0.2.exe) | Recommended; installs the app and supports the configured updater |
| Portable (x64) | [Download `.exe`](https://github.com/MoonDevil1/Tv-app/releases/download/v2.0.2/TG.IPTV.2.0.2.exe) | Run without installation; update manually |

### macOS

| Package | Download | Notes |
|---|---|---|
| Apple Silicon DMG (ARM64) | [Download `.dmg`](https://github.com/MoonDevil1/Tv-app/releases/download/v2.0.2/TG.IPTV-2.0.2-arm64.dmg) | For Apple Silicon Macs (M1, M2, M3, M4) |
| Apple Silicon ZIP (ARM64) | [Download `.zip`](https://github.com/MoonDevil1/Tv-app/releases/download/v2.0.2/TG.IPTV-2.0.2-arm64-mac.zip) | ZIP distribution for Apple Silicon Macs |

> Intel Mac (x64) builds are not included in v2.0.2. macOS automatic updates require a Developer ID-signed and notarized build.

### Linux

| Package | Download | Notes |
|---|---|---|
| AppImage (x64) | [Download `.AppImage`](https://github.com/MoonDevil1/Tv-app/releases/download/v2.0.2/TG.IPTV-2.0.2.AppImage) | Portable Linux application image; mark it executable before launching |

For checksums, update metadata and any additional release files, see the [complete v2.0.2 release](https://github.com/MoonDevil1/Tv-app/releases/tag/v2.0.2).

---

## Features

- Import remote M3U/M3U8 and JSON playlists or open local playlist files.
- LiveTGTV playlist URL is prefilled in the Add Playlist dialog.
- Channel search, category filters, favorites and recently watched.
- Responsive virtualized channel grid for large playlists.
- XMLTV EPG now/next guide when the playlist declares an accessible EPG feed.
- Per-playlist automatic refresh (manual, 1m, 5m, 15m or 1h).
- GitHub release updates: installed builds check for updates, download on request and restart to install. Draft releases are not offered until published.
- HLS and DASH playback, including authorized ClearKey/Widevine configurations supported by the runtime.
- Player controls: play/pause, seek, mouse-wheel volume, quality, audio/subtitle selection, aspect fit, fullscreen and picture-in-picture.
- Channel zapping, mini-player mode and keyboard shortcuts (Space/K play, arrows seek or zap, M mute, F fullscreen, I PiP, Ctrl/⌘+K or / search).
- Lightweight static interface without animated transitions, ambient video sampling or blur-heavy overlays.
- Automatic local diagnostics for playback failures, renderer errors and buffering stalls; reports omit stream URLs and credentials. The Feedback action opens a prefilled GitHub issue for user review and submission.

## Diagnostics and feedback

Playback errors and renderer failures are written locally to the Electron user-data `logs/diagnostics.log` file (rotated after approximately 2 MB). Buffering reports include media readiness, buffered seconds and dropped-frame counters, not stream URLs, cookies, license keys or credentials. Use **Settings → Feedback and diagnostics** or **Report problem** in the player to open a prefilled GitHub issue. The issue is not submitted until the user reviews and clicks Submit; the app cannot send background reports directly to a ChatGPT conversation.

## Development

Requirements: Node.js 22+ and npm 10+.

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

## Desktop packaging

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Installers are written to `release/`. Published GitHub releases provide update metadata and binaries; the updater intentionally ignores draft releases. Windows NSIS-installed, macOS ZIP and Linux AppImage builds are update targets; the portable Windows executable must be updated manually. macOS updates require a Developer ID-signed and notarized build.

GitHub Actions can build Windows, macOS and Linux installers from **Actions → Desktop Release → Run workflow**. To publish a release, create a version tag such as `v2.0.2` only after the feature branch has passed the full CI matrix. The release workflow stamps the tag version into the app, builds and smoke-tests each platform, then publishes the GitHub release with all generated installers attached.

## Continuous integration

Every feature-branch push runs type-checking, the unit suite and the Electron production build on Windows, macOS and Linux. The Electron header proxy also has regression tests for host scoping and header-injection filtering.

## Architecture

- Electron main process owns the desktop window and scoped stream request-header policy.
- The isolated preload exposes a narrow, typed IPC surface.
- React renderer owns navigation, channel library, EPG and player controls.
- Playlist parsing, token refresh, DRM conversion, playback and EPG are isolated under `src/core`.
- Shaka Player handles DASH; hls.js handles HLS; direct progressive streams use the native media element.

## Security and playback

Chromium web security remains enabled. The app does not disable CORS globally or bypass DRM. Playlist media headers are scoped to the stream origin; DRM license headers are kept separate and sent only to the configured license endpoint.

M3U parsing accepts `#EXTHTTP` headers before `#EXTINF`, `#EXTVLCOPT` request headers, Kodi `inputstream.adaptive.stream_headers`, inline `LicenseURL`, and `drmScheme` / `drmLicense` URL metadata. ClearKey JWK and `keyId:key` mappings are normalized for Shaka. DRM-tagged HLS streams are routed through Shaka/EME rather than the unencrypted HLS.js path.

Widevine, PlayReady and FairPlay metadata can be represented in the player configuration, but actual key-system availability depends on the operating system and Electron build. Electron documents Widevine CDM loading as experimental and requires a Widevine-enabled build (`enable_widevine = true`), a compatible CDM and provider-authorized license response. The stock app build has not been verified with a production Widevine CDM; no CDM or license credentials are bundled. See the [Electron Widevine CDM documentation](https://github.com/electron/electron/blob/main/docs/api/command-line-switches.md#--widevine-cdm-pathpath) before relying on Widevine playback. DRM is not bypassed. Some providers restrict cross-origin EPG or stream requests; those restrictions are surfaced as errors rather than bypassed.

## Playlist compatibility

The playlist engine supports M3U/M3U8 and JSON channel collections, EXTINF metadata, EPG URLs, per-stream headers, tokenized URLs, catch-up metadata and authorized ClearKey/Widevine metadata. LiveTGTV is preconfigured as a convenient source URL, but its live endpoint contents and availability depend on that service and are not bundled or guaranteed.

TG IPTV is a player only. Users must supply playlists and streams they are authorized to access.
