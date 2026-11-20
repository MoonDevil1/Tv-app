# TG IPTV — Cinema Edition

A cross-platform desktop IPTV player built with Electron, React 19, TypeScript, Shaka Player and hls.js.

## Features

- Import remote M3U/M3U8 and JSON playlists or open local playlist files.
- LiveTGTV playlist URL is prefilled in the Add Playlist dialog.
- Channel search, category filters, favorites and recently watched.
- Responsive virtualized channel grid for large playlists.
- XMLTV EPG now/next guide when the playlist declares an accessible EPG feed.
- Per-playlist automatic refresh (manual, 1m, 5m, 15m or 1h).
- GitHub release updates: installed builds check for updates, download on request and restart to install. Draft releases are not offered until published.
- HLS and DASH playback, including authorized ClearKey/Widevine configurations supported by the runtime.
- Player HUD: play/pause, seek, volume, quality, audio/subtitle selection, aspect fit, fullscreen and picture-in-picture.
- Channel zapping, mini-player mode and keyboard shortcuts (Space/K play, arrows seek or zap, M mute, F fullscreen, I PiP, Ctrl/⌘+K or / search).
- Optional ambient backdrop that samples video colors when browser cross-origin rules allow it.

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

GitHub Actions can build Windows, macOS and Linux installers from **Actions → Desktop Release → Run workflow**. To publish a release, create a version tag such as `v2.0.1` only after the feature branch has passed the full CI matrix. The release workflow stamps the tag version into the app, builds and smoke-tests each platform, then publishes the GitHub release with all generated installers attached.

## Continuous integration

Every feature-branch push runs type-checking, the unit suite and the Electron production build on Windows, macOS and Linux. The Electron header proxy also has regression tests for host scoping and header-injection filtering.

## Architecture

- Electron main process owns the desktop window and scoped stream request-header policy.
- The isolated preload exposes a narrow, typed IPC surface.
- React renderer owns navigation, channel library, EPG and player controls.
- Playlist parsing, token refresh, DRM conversion, playback and EPG are isolated under `src/core`.
- Shaka Player handles DASH; hls.js handles HLS; direct progressive streams use the native media element.

## Security and playback

Chromium web security remains enabled. The app does not disable CORS globally or bypass DRM. Custom request headers are scoped to the selected stream host. DRM playback requires a compatible runtime, valid license/key material and authorization from the content provider. Some providers restrict cross-origin EPG or stream requests; those restrictions are surfaced as errors rather than bypassed.

## Playlist compatibility

The playlist engine supports M3U/M3U8 and JSON channel collections, EXTINF metadata, EPG URLs, per-stream headers, tokenized URLs, catch-up metadata and authorized ClearKey/Widevine metadata. LiveTGTV is preconfigured as a convenient source URL, but its live endpoint contents and availability depend on that service and are not bundled or guaranteed.

TG IPTV is a player only. Users must supply playlists and streams they are authorized to access.
