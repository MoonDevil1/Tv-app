# TG IPTV — Windows Edition

A Windows desktop IPTV player rebuild. The application is being recreated in phases around the AuthoIPTV feature set and the LiveTGTV/Vega stream-resolution workflow.

## Rebuild plan

| Phase | Scope | Status |
|---|---|---|
| 1 | New application foundation, navigation, responsive Material-style shell, saved settings and Windows CI | In progress |
| 2 | Multi-playlist library, M3U/M3U8 and JSON import, custom playlist headers, edit/remove/refresh, LiveTGTV-compatible source resolution | Planned |
| 3 | Full-screen player, HLS/DASH playback, ClearKey handling, audio/subtitle/quality controls, channel switching and stream fallback | Planned |
| 4 | XMLTV and LiveTGTV EPG, current/next programme, channel guide and programme browsing | Planned |
| 5 | Preferences, diagnostics, Windows packaging, end-to-end playback verification and release | Planned |

## Target functionality

The rebuilt application is intended to provide the complete desktop-player workflow: multiple playlists, search and categories, channel logos, favourites, viewing history, playlist refresh, custom headers/User-Agent, EPG now/next, a full-screen player, channel zapping, audio/subtitle/quality controls, keyboard shortcuts, and configurable appearance.

LiveTGTV will be treated as a normal playlist source with a provider-specific adapter. The adapter will follow the same channel-detail API used by the Vega LiveTGTV provider, preserving the complete ClearKey map, per-channel headers and fresh media sources instead of reducing a channel to a single raw URL.

## Development

Requirements: Node.js 22+ and npm 10+.

```bash
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run dist:win
```

Windows installers are generated in `release/`. The project uses Electron, React, TypeScript, Shaka Player and hls.js. The desktop shell keeps context isolation, sandboxing, renderer navigation restrictions and a narrow IPC bridge enabled.

## Playback and DRM

The application will use Shaka Player for DASH and DRM-capable streams, hls.js for HLS, and the native media element for progressive files. It will not bypass DRM or disable Chromium web security. Playback requires a supported Windows runtime/CDM, valid provider authorization and valid stream/license data.
