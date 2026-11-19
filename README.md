# TG IPTV — Cinema Edition

A cross-platform desktop IPTV player built with Electron, React 19, TypeScript and a dedicated streaming engine.

## Development

- Node.js 22+
- npm 10+

```bash
npm install
npm run dev
npm run typecheck
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
- React renderer owns navigation and the streaming UI.
- Playlist parsing, token refresh, DRM conversion, playback and EPG are isolated under `src/core`.

## Security and playback

The application keeps Chromium web security enabled and does not disable CORS globally or bypass DRM. Custom request headers are scoped to the explicitly selected stream host. DRM playback requires a compatible runtime, valid license/key material and authorization from the content provider.

## Playlist compatibility

The planned playlist engine supports M3U/M3U8, JSON channel collections and TG TV-compatible channel APIs, including metadata, request headers, token refresh and authorized ClearKey playback. See the project phases and implementation status in the repository.

TG IPTV is a player only. Users must supply playlists and streams they are authorized to access.
