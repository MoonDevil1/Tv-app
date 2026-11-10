# LiveTGTV Player

A lightweight, responsive live-TV player for Windows desktop, Android, mobile browsers, and tablets, powered by the LiveTGTV M3U playlist.

## Features
- Live playlist refresh every 15 minutes, plus manual refresh
- Search, dynamic categories, and channel sorting
- Persistent favourites, named favourite lists, and recently watched channels
- In-player channel switching, swipe left/right, and keyboard shortcuts
- Shaka playback for supported HLS/DASH streams
- Manual/automatic quality, audio language, subtitles, fullscreen, and picture-in-picture controls when supported
- Playlist-provided HTTP headers and DRM license metadata (no DRM bypass)
- Native Android wrapper built with Capacitor; Windows desktop uses Electron
- Installable PWA shell for compatible mobile/tablet/desktop browsers
- Responsive phone, tablet, and desktop layouts
- Low-memory playback profile: 8-second forward buffer, 12-second buffer behind, reduced prefetching, and conservative initial bitrate
- Cached channel guide for reopening the app when the playlist endpoint is temporarily unavailable

## Windows desktop
Install Node.js 20+, then:
```bash
npm install
npm run dev
```
Create Windows NSIS and portable builds:
```bash
npm run dist
```

## Android APK
The GitHub Actions workflow builds a debug APK for testing. Open the repository's **Actions** tab, select the latest **Build LiveTGTV Player** run, and download the **LiveTGTV-Android-APK** artifact. Extract the ZIP and install `app-debug.apk` on an Android device. You may need to allow installation from your browser or file manager.

For a local Android build:
```bash
npm install
npm run build
npx cap add android
npx cap sync android
```
Then open the `android` folder in Android Studio or run `./gradlew assembleDebug` from that folder.

## Mobile and tablet web app
Build the static web app with `npm run build`, host the `dist` folder over HTTPS, then open it in Chrome/Edge and choose **Install app** or **Add to Home screen**.

## Playback limitations
The channel list is not proof that every stream is playable. Streams may be offline, geo-restricted, require valid authentication, or use DRM unsupported by the current Android WebView/device. Playback requires provider authorization, license information, and supported device DRM/CDM. The app does not bypass access controls. Capacitor's native HTTP bridge is enabled for playlist requests; individual stream and DRM license servers still need to permit the device and app origin.
