# LiveTGTV Player

A Windows desktop live-TV player powered by the live playlist at `https://livetgtv.lovable.app/api/public/playlist.m3u`.

## Features
- Refreshable M3U playlist with automatic 15-minute refresh
- Channel search and dynamic group/category filters
- Favourite channels and named favourite playlists
- In-player channel switching and touch-swipe next/previous
- Shaka Player playback for supported HLS/DASH streams
- Available variant quality and audio-language selection
- Passes playlist-provided HTTP request headers to media requests
- Uses playlist-provided DRM license metadata when present; does not bypass DRM or obtain keys

## Run on Windows
Install Node.js 20+, then run:
```bash
npm install
npm run dev
```
For a production web build: `npm run build`. Windows installers are configured through `npm run dist`.

## Playback notes
Only streams that the source makes available to your device/account and that Shaka/Electron support can play. DRM systems may require a valid license server, browser/device CDM support, and provider authorization. Some playlist channels may not work in a desktop browser engine; a populated channel guide is not proof that every stream is playable.
