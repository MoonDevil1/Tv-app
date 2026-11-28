# Phase 1 — TG IPTV APK static inventory

Date: 2026-11-28
Reference: user-supplied `TG IPTV.apk`
Target implementation: `MoonDevil1/Tv-app`
Branch: `reverse-engineering/phase-1-tg-iptv`

## Scope and confidence

This is an initial static inventory from the APK archive and printable DEX strings. It is not a complete decompilation, runtime trace, packet capture, or proof that every detected code path is enabled in production. No private keys, credentials, license tokens, or provider secrets are extracted or reproduced.

## APK facts

- File size: approximately 22 MiB.
- Contains 11 DEX files (`classes.dex` through `classes11.dex`).
- Native libraries observed: AndroidX graphics path and datastore shared-counter libraries for arm64-v8a, armeabi-v7a, x86, and x86_64.
- Application code contains Kotlin/Jetpack Compose naming and AndroidX Media3 1.5.1 strings.

## Application components identified from DEX symbols

| Component | Observed role |
|---|---|
| `com.example.player.Media3PlayerManager` | Player lifecycle, media source creation, channel switching, track/quality/audio selection, playback errors, retries, volume, resize, PiP and playback speed |
| `com.example.player.DrmHelper` | DRM metadata parsing and DRM scheme identification |
| `com.example.data.parser.M3uParser` | M3U parsing and HTTP-header extraction |
| `com.example.data.parser.JsonPlaylistParser` | JSON playlist parsing |
| `com.example.data.repository.ChannelRepository` | Add/import/refresh playlist and persist channels |
| `com.example.data.local.ChannelDao` | Channel persistence |
| `com.example.ui.MainViewModel` | Playlist and channel state, selection and playback coordination |

## Detected playback and DRM indicators

- AndroidX Media3 / ExoPlayer 1.5.1.
- HLS and DASH media-source support.
- Widevine, ClearKey and PlayReady UUID/scheme identifiers.
- Custom DRM license URL and license request headers.
- ClearKey JWK construction and an HTTP ClearKey license-resolution path.
- Cookie manager and response-cookie extraction.
- Dynamic stream resolution before playback.
- Track discovery and selection for video quality and audio language.
- Playback listener handling for state changes, track changes, video size and player errors.

Important boundary: detecting Widevine/PlayReady/ClearKey support does not mean the app can decrypt arbitrary protected streams. Successful playback still depends on valid provider authorization, license/key material, device/runtime support and compatible stream packaging.

## Detected playlist/header indicators

DEX strings include the following M3U directives and metadata:

```text
#EXTM3U
#EXTINF
#EXTHTTP:
#EXTVLCOPT:http-user-agent=
#EXTVLCOPT:http-referrer=
#EXTVLCOPT:http-origin=
#EXTVLCOPT:http-cookie=
```

The parser also contains a method named `extractHeadersFromJson`, and the channel data model/database includes fields for stream URL, channel name, logo, group/category, DRM flag, DRM scheme, DRM license URL, DRM headers, HTTP headers and cookie-related data.

This suggests the parser's job is not merely to collect URLs: it must preserve per-stream metadata and pass it through to the player and (where appropriate) the license request.

## Implications for the Windows player

The current Windows repository README describes an Electron + React + TypeScript application using Shaka Player for DASH and DRM-protected HLS, hls.js for non-DRM HLS, and a native media element for progressive streams. The implementation should preserve that platform architecture while matching the reference application's observable behavior.

Priority compatibility work for later phases:

1. Parse and preserve per-entry HTTP headers, cookies, User-Agent, Referer and Origin.
2. Normalize M3U metadata without dropping unknown attributes or stream directives.
3. Keep media-request headers separate from DRM license-request headers.
4. Apply headers to manifest, segment, key and license requests only within the intended host/scope.
5. Parse DRM scheme, license URL and authorized license headers as structured metadata.
6. Ensure ClearKey key/JWK formats are normalized correctly; do not treat an arbitrary key string as a license URL.
7. Test HLS and DASH independently, including redirect and cookie behavior.
8. Record structured diagnostics without logging stream URLs, cookies, keys or authorization headers.

## Current limitations / work still required

- AndroidManifest.xml is binary XML and has not yet been decoded into a full permission/component report.
- The DEX files have not yet been fully decompiled to Kotlin-equivalent source.
- No live device session, runtime instrumentation or network capture has been performed.
- No stream/license request was replayed.
- No channel in the 1,209-entry LiveTGTV playlist has yet been tested against this APK in this phase.
- The AuthoIPTV Windows executable is a separate reference and requires its own static/runtime analysis; its earlier upload is not part of this current file inspection.

## Phase 1 exit criteria

- [x] Confirm APK archive and DEX structure.
- [x] Identify player, DRM, parser, repository and view-model symbols.
- [x] Identify Media3 version and HLS/DASH/DRM indicators.
- [x] Identify M3U header/directive indicators.
- [ ] Decode manifest and dependencies completely.
- [ ] Decompile app-owned classes and document exact parser/player logic.
- [ ] Validate findings through runtime playback and request traces.

Phase 1 is therefore an initial static inventory, not a claim of complete reverse engineering.
