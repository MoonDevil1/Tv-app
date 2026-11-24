# TG IPTV

A Windows 11 live-TV playlist player built with Electron, React, Shaka Player and hls.js.

## Getting started

1. Open **Playlists** from the home screen.
2. Select **+ Add playlist**.
3. The LiveTGTV test playlist is prefilled:
   `https://livetgtv.lovable.app/api/public/playlist.m3u`
4. Import it, then click the playlist card to load its complete channel list.
5. Select a channel to open the built-in player.

You can also add another HTTP(S) M3U/M3U8 or JSON playlist, or import a local playlist file. Playlists are stored locally on this device.

## Playback

- M3U/M3U8 parsing keeps valid HTTP(S) channel entries, including URLs without file extensions and duplicate channel IDs.
- Per-channel `#EXTHTTP`, `#EXTVLCOPT`, `#KODIPROP`, manifest type, EPG, and tokenized stream metadata are retained.
- LiveTGTV channel details are resolved from its public channel API. All returned stream URLs are kept as ordered candidates; a failed candidate does not remove the channel.
- Shaka Player handles DASH and authorized ClearKey, Widevine and PlayReady configurations. hls.js handles HLS; progressive media uses Chromium's media element.
- Stream and license headers are scoped to their relevant origins. The app does not disable Chromium web security or bypass DRM.
- Player controls include channel switching, volume, quality, audio and subtitles, fullscreen, picture-in-picture and keyboard shortcuts.

Playback depends on the playlist provider's current stream URLs, authorization, DRM configuration and service availability. Only use streams you are authorized to access.

## Library and settings

- Search and filter channels by group.
- Open a playlist from the Playlists home screen.
- Manage multiple playlists, refresh them and remove them from this device.
- Save favorites and recently watched channels.
- Choose dark or light appearance in **Settings**.
- Configure automatic playlist refresh.
- Load XMLTV EPG data when the playlist provides an accessible feed.

## Windows downloads

The project builds Windows x64 NSIS installers and portable executables:

```powershell
npm run dist:win
```

The output is written to `release/`. Only Windows desktop packaging is configured.

## Development

Requirements: Node.js 22+ and npm 10+.

```powershell
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

## Architecture

- `electron/main.ts`: Windows desktop window, safe navigation, remote playlist fetch and scoped stream headers.
- `electron/preload.ts`: isolated, typed IPC bridge.
- `src/core/parser`: M3U/JSON parsing, ClearKey conversion, LiveTGTV API normalization and playlist refresh.
- `src/core/player`: Shaka/hls.js playback, DRM request configuration and ordered source fallback.
- `src/components/Player.tsx`: built-in live player and controls.
- `src/App.tsx`: playlist library, channel browsing, settings and EPG.

## Credits

The interface direction follows the principles in [unslop](https://github.com/MoonDevil1/unslop) by Damir Sokolovsky (CC BY 4.0). Implementation follows the minimal-diff and test-first guidance in [Ponytail](https://github.com/DietrichGebert/ponytail) (MIT).
