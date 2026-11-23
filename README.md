# TG IPTV — Windows Edition

A Windows desktop IPTV player rebuild. The application is being recreated in phases around the AuthoIPTV feature set and the LiveTGTV/Vega stream-resolution workflow.

## Rebuild plan

| Phase | Scope | Status |
|---|---|---|
| 1 | New application foundation, navigation, responsive Material-style shell, saved settings and Windows CI | In progress |
| 2 | Multi-playlist library, M3U/M3U8 and JSON import, custom playlist headers, edit/remove/refresh, LiveTGTV-compatible source resolution | Planned |
| 3 | Screenshot-matched player: video left, channel list right, Now/Next overlays, settings popover, mouse-wheel volume, HLS/DASH/DRM and channel switching | Next |
| 4 | XMLTV and LiveTGTV EPG, current/next programme, channel guide and programme browsing | Planned |
| 5 | Preferences, diagnostics, Windows packaging, end-to-end playback verification and release | Planned |

## Target functionality

Phase 2 implements multiple M3U/M3U8 and JSON playlists, local file and URL import, paste import, channel groups/search/logos, favorites, saved playlists, custom per-playlist request headers and manual refresh. The LiveTGTV adapter follows the Vega provider's M3U parsing and channel-detail API flow, retaining all API ClearKey pairs and request headers and matching optional backup playlist sources. The screenshot-matched player and mouse-wheel volume are scheduled for Phase 3.

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


## Interface design credit

The visual refinement in this project adapts design guidance from [unslop](https://github.com/heydamir/unslop) by Damir Sokolovsky, used under the [Creative Commons Attribution 4.0 International licence](https://creativecommons.org/licenses/by/4.0/). Changes include a restrained broadcast-console direction, neutral light/dark surfaces, clearer type hierarchy, consistent spacing and reduced decorative effects.
