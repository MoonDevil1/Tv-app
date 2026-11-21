# TG IPTV — Windows Edition

A lightweight Windows desktop IPTV player built with Electron, React, TypeScript, Shaka Player and hls.js.

## Windows downloads — v2.0.1

Choose the Windows x64 build from the [published v2.0.1 GitHub release](https://github.com/MoonDevil1/Tv-app/releases/tag/v2.0.1).

| Package | Download | Notes |
|---|---|---|
| Windows Installer (x64) | [Download Setup .exe](https://github.com/MoonDevil1/Tv-app/releases/download/v2.0.1/TG.IPTV.Setup.2.0.1.exe) | Recommended; installs the app and supports the configured updater |
| Portable (x64) | [Download Portable .exe](https://github.com/MoonDevil1/Tv-app/releases/download/v2.0.1/TG.IPTV.2.0.1.exe) | Run without installation; update manually |

Only Windows x64 is targeted. macOS and Linux builds are no longer maintained.

## Features

- Import remote M3U/M3U8 and JSON playlists or open local playlist files.
- LiveTGTV playlist URL is prefilled in the Add Playlist dialog.
- Channel search, category filters, favorites and recently watched.
- Responsive virtualized channel grid for large playlists.
- XMLTV EPG now/next guide when the playlist declares an accessible EPG feed.
- Per-playlist automatic refresh (manual, 1m, 5m, 15m or 1h).
- Windows installer update support; portable builds are updated manually.
- HLS and DASH playback with authorized ClearKey/Widevine EME license-server support, subject to the installed runtime and available DRM CDM.
- Player controls: play/pause, seek, mouse-wheel volume, quality, audio/subtitle selection, aspect fit, fullscreen and picture-in-picture.
- Channel zapping, mini-player mode and keyboard shortcuts (Space/K play, arrows seek or zap, M mute, F fullscreen, I PiP, Ctrl+K or / search).
- Lightweight interface using system fonts, simple surfaces and no animated transitions, decorative hero artwork or blur-heavy overlays.
- Local playback diagnostics and a Feedback action that prepares a GitHub issue for user review.

## Diagnostics and feedback

Playback errors and renderer failures are written locally to the Electron user-data `logs/diagnostics.log` file (rotated after approximately 2 MB). Buffering reports include media readiness, buffered seconds and dropped-frame counters, not stream URLs, cookies, license keys or credentials. Use **Settings → Feedback and diagnostics** or **Report problem** in the player to open a prefilled GitHub issue. The issue is not submitted until the user reviews and clicks Submit.

## Development

Requirements: Windows 10/11 x64, Node.js 22+ and npm 10+.

```powershell
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run dist:win
```

Windows installers are written to `release/`. The installer and portable executable are built for x64 Windows.

## Continuous integration and releases

Every feature-branch push runs dependency auditing, type-checking, unit tests, Electron production build, Windows packaging and a Windows smoke test on `windows-latest`.

To publish a Windows release, create a version tag such as `v2.0.2` after CI passes. The release workflow builds and smoke-tests the Windows x64 installer and portable executable, then attaches them to the GitHub release.

## Architecture

- Electron main process owns the desktop window and scoped stream request-header policy.
- The isolated preload exposes a narrow, typed IPC surface.
- React renderer owns navigation, channel library, EPG and player controls.
- Playlist parsing, token refresh, DRM conversion, playback and EPG are isolated under `src/core`.
- Shaka Player handles DASH; hls.js handles HLS; direct progressive streams use the native media element.

## Security and playback

Chromium web security remains enabled. The app does not disable CORS globally or bypass DRM. Custom request headers are scoped to the selected stream host. DRM playback uses Shaka Player for DASH and hls.js EME for encrypted HLS. Inline ClearKey keys are supported for DASH/MPD; HLS DRM requires a license-server URL. Widevine requires a compatible CDM in the installed Electron/Chromium runtime; proprietary CDM files are not bundled.

TG IPTV is a player only. Users must supply playlists and streams they are authorized to access.
