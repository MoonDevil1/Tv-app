# LiveTGTV Desktop

Windows desktop LiveTGTV player built with Electron, React, Shaka Player, and the LiveTGTV public M3U playlist.

## Features
- Playlist refresh, channel search, categories, and sorting
- Persistent favourites, named lists, and recently watched channels
- HLS/DASH playback with quality, audio, and subtitle selection where supported
- Playlist-provided HTTP headers and DRM metadata support where valid license configuration is available
- Keyboard shortcuts, picture-in-picture, fullscreen, and in-player channel switching
- Mouse-wheel volume control and audio boost up to 200% where Web Audio is supported
- Low-memory playback settings

## Development
Install Node.js 20+, then run `npm install` and `npm run dev`.

## Windows installer
Run `npm run dist` to create the Windows installer and portable build in `release/`. GitHub Actions also builds and uploads Windows installers.

## Android
The separate native Android phone and tablet application is maintained in [MoonDevil1/Tv-android-](https://github.com/MoonDevil1/Tv-android-).

## DRM limitations
DRM playback requires a compatible license server, valid authorization, and a supported DRM system/device. The app does not bypass DRM or extract protected keys.
