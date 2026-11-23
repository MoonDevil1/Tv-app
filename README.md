# TG IPTV — Cinema Edition

A Windows desktop IPTV player built with Electron, React 19, TypeScript, Shaka Player and hls.js.

## Download for Windows — v2.0.3

<badge>Latest Windows release</badge>

| Package | Download | Notes |
|---|---|---|
| Windows Installer (x64) | [Download TG IPTV Setup (.exe)](https://github.com/MoonDevil1/Tv-app/releases/download/v2.0.3/TG.IPTV.Setup.2.0.3.exe) | Recommended; installs the app and supports the configured updater |
| Portable (x64) | [Download portable app (.exe)](https://github.com/MoonDevil1/Tv-app/releases/download/v2.0.3/TG.IPTV.2.0.3.exe) | Run without installation; update manually |

[View all release files and version history](https://github.com/MoonDevil1/Tv-app/releases).

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

## Windows packaging

```bash
npm run dist:win
```

The Windows installer and portable executable are written to `release/`. Published GitHub releases provide update metadata and binaries; the updater intentionally ignores draft releases. The NSIS-installed build supports in-app update checks; the portable executable must be updated manually.

GitHub Actions builds and smoke-tests the Windows app through **Actions → Desktop Release**. A version tag such as `v2.0.3` publishes the Windows installer and portable executable after dependency audit, type-checking, unit tests, production build and packaged-app smoke test.

## Continuous integration

Feature-branch pushes run type-checking, the unit suite and the Electron production build on Windows, macOS and Linux. The Electron header proxy also has regression tests for host scoping and header-injection filtering.

## Architecture

- Electron main process owns the desktop window and scoped stream request-header policy.
- The isolated preload exposes a narrow, typed IPC surface.
- React renderer owns navigation, channel library, EPG and player controls.
- Playlist parsing, token refresh, DRM conversion, playback and EPG are isolated under `src/core`.
- Shaka Player handles DASH and DRM-protected HLS; hls.js handles non-DRM HLS; direct progressive streams use the native media element.

## Security and playback

Chromium web security remains enabled. The app does not disable CORS globally or bypass DRM. Custom request headers are scoped to the selected stream host. DRM playback requires a compatible runtime, valid license/key material and authorization from the content provider. Some providers restrict cross-origin EPG or stream requests; those restrictions are surfaced as errors rather than bypassed.

## Playlist compatibility

The playlist engine supports M3U/M3U8 and JSON channel collections, EXTINF metadata, EPG URLs, per-stream headers, tokenized URLs, catch-up metadata and authorized ClearKey/Widevine/PlayReady metadata. LiveTGTV is preconfigured as a convenient source URL, but its live endpoint contents and availability depend on that service and are not bundled or guaranteed.

TG IPTV is a player only. Users must supply playlists and streams they are authorized to access.
