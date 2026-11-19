# TG IPTV — Cinema Edition

A cross-platform desktop IPTV player built with Electron, React 19, TypeScript, Shaka Player and hls.js.

## Features

- Import remote M3U/M3U8 and JSON playlists or open local playlist files.
- LiveTGTV playlist URL is prefilled in the Add Playlist dialog.
- Channel search, category filters, favorites and recently watched.
- Responsive virtualized channel grid for large playlists.
- XMLTV EPG now/next guide when the playlist declares an accessible EPG feed.
- Per-playlist automatic refresh (manual, 1m, 5m, 15m or 1h).
- HLS and DASH playback, including authorized ClearKey/Widevine configurations supported by the runtime.
- Player HUD: play/pause, seek, volume, quality, audio/subtitle selection, aspect fit, fullscreen and picture-in-picture.
- Channel zapping, mini-player mode and keyboard shortcuts.

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

Installers are written to `release/`.

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
