# Phase 3 — TG IPTV APK behavior reconstruction for Windows

Date: 2026-11-28
Reference: user-supplied `TG IPTV.apk` (22,605,596 bytes; 11 DEX files)
Target: `MoonDevil1/Tv-app`
Working branch: `rebuild/windows-from-tg-iptv`

## What was inspected

The APK was re-opened from the uploaded file and its DEX files extracted for symbol/string and Kotlin debug-metadata inspection. This is stronger than a filename/library guess, but it is still static inspection: this environment does not currently have JADX/baksmali installed and outbound package downloads are unavailable. The app-owned method bodies have therefore not yet been fully decompiled, and no Android runtime session or network capture has been performed.

## Confirmed app-owned components

- `com.example.player.Media3PlayerManager` — central playback controller.
- `com.example.player.DrmHelper` — DRM metadata parsing and scheme handling.
- `com.example.data.parser.M3uParser` — M3U parser.
- `com.example.data.parser.JsonPlaylistParser` — JSON playlist parser.
- `com.example.data.repository.ChannelRepository` — playlist/channel data operations.
- `com.example.data.local.ChannelDao` — persisted channel storage.
- `com.example.ui.MainViewModel` — UI state and playback coordination.
- `GoogleDriveResolver` — a separate stream resolver path.

## What the player actually contains

The APK is not just a WebView around a stream URL. Its playback layer is built around AndroidX Media3 / ExoPlayer 1.5.1 and app-owned request and resolution logic.

DEX references associated with `Media3PlayerManager` include:

- `initializePlayer`
- `createMediaSource`
- `playChannel` and `playInternal`
- `resolveDynamicStream`
- `resolveClearKeyHttpLicense`
- `retry` and `stopPlayback`
- `selectQuality` and `selectAudioTrack`
- `setResizeOption`, `setPlaybackSpeed`, `setVolume`
- PiP state, sleep timer, progress updates, statistics and audio-boost state.

The app-owned player code references Media3's `DefaultHttpDataSource.Factory`, `setDefaultRequestProperties`, `DefaultMediaSourceFactory`, `MediaItem.Builder`, `MediaItem.DrmConfiguration.Builder`, `setDrmConfiguration`, `setLicenseUri`, `setMultiSession`, and `setLoadErrorHandlingPolicy`. It also contains a `java.net.CookieManager` and a cookie-related initialization lambda.

Observed strings include the `__hdnea__` cookie marker, `Cookie`, `Authorization`, `Referer`, `Origin`, `User-Agent`, multiple browser/device user-agent presets (including Apple TV / iOS Safari / Jio), and explicit stream/license error messages. These indicate that request identity, cookies and authorization are first-class playback inputs, not incidental UI fields.

### DRM evidence and limits

The APK contains Media3 DRM configuration references and Widevine, ClearKey and PlayReady identifiers. A separate app-owned `resolveClearKeyHttpLicense` method is present. The DEX includes ClearKey JWK-related data and license URI/key fields.

This proves the APK has code paths for configuring these DRM schemes and resolving a ClearKey HTTP license. It does **not** prove that it can decrypt arbitrary protected content or that every scheme is available on every Android device. DRM still depends on legitimate provider authorization, valid license/key material, stream packaging and platform support.

### Dynamic stream resolution

A separate `resolveDynamicStream` path and a `GoogleDriveResolver` component are present. DEX strings include Google Drive download/stream messages and URL patterns. This means the app has a resolver layer between the playlist URL and the final playable media URL. The Windows app must not assume every playlist URL is already a direct HLS/DASH manifest.

The exact resolver decision tree and HTTP exchange still need method-body decompilation or runtime tracing. Do not hard-code guessed Google Drive URL rewrites.

## Observable playback capabilities

The APK exposes internal state/option names for:

- stream protocol and live status
- current position, duration, buffered position/percentage and buffer health
- download speed
- available video qualities and selected quality
- available audio tracks and selected audio track
- playback speed, volume and resize mode
- playback retry count and timestamped error details
- picture-in-picture state
- sleep timer
- statistics overlay ("stats for nerds")
- audio boost mode.

Track changes are driven by Media3's track-selection model; the quality list includes Auto and named resolution tiers (for example 720p HD, 1080p FHD and 4K UHD). These are observable product behaviors to reproduce on Windows, not reasons to copy the APK's artwork or proprietary source.

## Existing Windows repository: what must change

The current `Tv-app` branch is an Electron + React + TypeScript project. It already includes Shaka Player, hls.js, a playlist parser, ClearKey helpers, a player component, an Electron request-header proxy and tests. The current implementation is therefore not a blank project, but its playback model is not yet equivalent to the APK.

Important differences/gaps visible in the current source:

1. The current parser's `#EXTVLCOPT`, `#EXTHTTP` and `#KODIPROP` handling is tied to an already-open `#EXTINF` entry. It needs explicit tests and support for pending playlist-level directives and correct state reset if the APK's full parser confirms them.
2. The current player routes DASH/DRM to Shaka, HLS to hls.js and progressive files to the HTML media element. It does not yet have a proven resolver pipeline equivalent to `resolveDynamicStream`.
3. The current app has an HTTP-header proxy, but it scopes the global active context to only the initial origin. Redirected manifests/CDN segment hosts and cookie behavior need controlled tests; blindly forwarding credentials to every redirect host is unsafe.
4. The current stream engine has a ClearKey/Widevine/PlayReady-shaped Shaka configuration path, but the Windows runtime's available CDM must be checked independently. Android MediaDrm/Widevine behavior cannot be copied one-to-one into Windows Chromium.
5. The current player exposes basic quality/audio/subtitle selection but does not yet match the APK's complete playback state/options (retry telemetry, speed, sleep timer, PiP, statistics, resize modes and audio boost).
6. The current UI and application source are the old TG IPTV design. The rebuild should replace the old application UI and app-specific modules rather than layering another preview or demo screen on top.

## Windows implementation decision

Keep the existing lightweight Electron/React/TypeScript packaging foundation for the Windows-only deliverable, but rebuild the product implementation around explicit layers:

1. **Playlist ingestion** — M3U and JSON parsing, metadata preservation, EPG, channel persistence and refresh.
2. **Stream resolver** — resolve supported dynamic links to final media sources; resolver plugins must be deterministic and testable.
3. **Request context** — per-stream headers/cookies, per-origin policy, redirect handling, and separate DRM license headers. Never leak cookies, bearer tokens, keys or license data to diagnostics.
4. **Playback adapters** — Shaka for supported DASH/DRM and HLS cases; hls.js for compatible clear HLS; a dedicated MPEG-TS adapter for raw TS where browser-native playback is insufficient; progressive fallback only for formats the runtime supports.
5. **Track/control model** — quality, audio, subtitles, speed, volume, resize, retry, PiP, sleep timer and diagnostics.
6. **Windows UI** — a new complete application UI, not a static preview. Keep the experience responsive and lightweight for low-memory PCs.

A Media3-based Android player cannot simply be embedded as the Windows playback engine. The Windows adapters must use Windows/browser-supported media pipelines and must report unsupported DRM/CDM cases honestly rather than pretending a stream is playable.

## Cleanup scope for the rebuild branch

The user asked to remove the previous application implementation and rebuild from the APK's behavior. This branch is the isolated replacement branch; `main` is not modified.

- Replace the old renderer/UI and app-specific playback/parser modules.
- Remove unused preview/demo-only screens and obsolete assets after checking imports.
- Keep Windows build/release workflows, package metadata, security boundaries, and useful test infrastructure.
- Keep the reverse-engineering reports and evidence.
- Do not remove the user's playlist source or filter out channels to make tests pass.
- Do not copy proprietary APK source, private keys, credentials, license tokens, or third-party telemetry.

## Validation plan (not yet passed)

- Parser fixtures for all supported directives, ordering, escaped values, cookies and metadata isolation.
- Resolver fixtures for direct links and supported dynamic links.
- Request tests for manifest, segment, subtitle, key and license URLs, including redirects and host-scoped headers.
- Playback tests for clear HLS, DASH, raw MPEG-TS, progressive and authorized DRM test fixtures.
- Regression checks for the full LiveTGTV playlist count (expected 1,209 per the user), especially Zee Cinema HD and & Pictures HD.
- Windows CI build and installer artifact verification.

## Status

- [x] Re-open uploaded APK and extract its DEX files.
- [x] Confirm app-owned player/parser/resolver class names and player method names from DEX metadata.
- [x] Confirm Media3 data-source, media-source and DRM configuration APIs referenced by app code.
- [x] Identify dynamic stream resolution and Google Drive resolver components.
- [x] Identify playback controls/state that must be reproduced.
- [x] Compare findings with the existing Windows source tree.
- [ ] Full app-owned Kotlin decompilation (JADX unavailable in this environment).
- [ ] Runtime trace on Android and controlled network capture.
- [ ] Implement clean Windows replacement.
- [ ] Build and run Windows tests; verify actual authorized channel playback.

No claim is made that the Windows rebuild or any channel playback test is complete.
