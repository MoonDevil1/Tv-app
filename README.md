# LiveTGTV Player

A lightweight, responsive live-TV player for Windows desktop, mobile browsers, and tablets, powered by the LiveTGTV M3U playlist.

## Features
- Live playlist refresh every 15 minutes, plus manual refresh
- Search, dynamic categories, and channel sorting
- Persistent favourites, named favourite lists, and recently watched channels
- In-player channel switching, swipe left/right, and keyboard shortcuts
- Shaka playback for supported HLS/DASH streams
- Manual/automatic quality, audio language, subtitles, fullscreen, and picture-in-picture controls when supported
- Playlist-provided HTTP headers and DRM license metadata (no DRM bypass)
- Installable PWA shell for compatible mobile/tablet/desktop browsers
- Responsive phone, tablet, and desktop layouts
- Low-memory playback profile: 8-second forward buffer, 12-second buffer behind, reduced prefetching, and conservative initial bitrate
- Cached channel guide for reopening the app when the playlist endpoint is temporarily unavailable

## Windows desktop
Install Node.js 20+, then:
```bash
npm install
npm run dev
``
Create Windows NSIS and portable builds:
```bash
npm run dist
``

## Mobile and tablet
Build the static web app with `npm run build`, host the `dist` folder over HTTPS, then open it in Chrome/Edge and choose **Install app** or **Add to Home screen**. This is a responsive installable web app; a native Android APK is not included in this branch.

## Playback limitations
The channel list is not proof that every stream is playable. Streams may be offline, geo-restricted, blocked by CORS, require valid authentication, or use DRM unsupported by the current browser/device. Playback requires provider authorization and supported device DRM/CDM. The app does not bypass access controls. On mobile web, the playlist endpoint must allow browser CORS requests.
