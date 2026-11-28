# Phase 2 — AuthoIPTV 0.6.4-beta static reconstruction notes

Date: 2026-11-28
Input: user-uploaded `AuthoIPTV-Setup-0.6.4-beta-win (3).exe`
Target: `MoonDevil1/Tv-app`
Branch: `reverse-engineering/phase-1-tg-iptv`

## Extraction performed

- Identified the installer as a PE32 Nullsoft Scriptable Install System (NSIS) v3.04 self-extracting installer.
- Located and extracted its embedded 7-Zip payload.
- Recovered `resources/app.asar` (3,058,688 bytes) and unpacked its archive contents.
- Recovered React production bundle, Electron main-process bundle, CSS, icons and package metadata.
- The application is AuthoIPTV 0.6.4-beta, built with Electron and React. The frontend bundle is heavily minified/obfuscated; selected parser and network logic is still readable from its bundled code.

## Runtime architecture observed

### Electron main process

The recovered main bundle creates a BrowserWindow with:

- `nodeIntegration: true`
- `contextIsolation: false`
- `webSecurity: true`
- Developer tools disabled in packaged builds.

The main process registers a `webRequest.onBeforeSendHeaders` listener for `*://*/*`. It merges a mutable `currentHeaders` object into request headers, meaning the app applies its selected header set broadly across web requests rather than restricting it to one stream origin. It also modifies the Electron User-Agent.

An `onHeadersReceived` listener rewrites Set-Cookie values to add or normalize `SameSite=None`. This is an observable cookie-compatibility behavior, but changing SameSite policy globally has security/privacy implications and should not be copied without a specific compatibility need.

IPC messages observed include `update-headers`, `set-electron-user-agent`, and a fullscreen toggle.

### Renderer and playback library evidence

The renderer bundle includes a complete Shaka Player build and contains HLS MIME handling, DASH MIME handling and DRM implementation code for Widevine, PlayReady and ClearKey. It also includes hls.js-related code and MPEG-TS-related signatures. The presence of a bundled library alone does not prove that every code path is used for every stream.

Shaka's bundled DRM implementation includes ClearKey JWK generation/handling, license-server configuration and PlayReady challenge/header handling. The app parses DRM metadata into its own stream model before playback.

## Recovered M3U parser behavior

A custom parser is present in the production renderer bundle. It:

1. Fetches a playlist with `fetch(url, { cache: "no-store" })`.
2. Reads the response body as UTF-8 while optionally reporting download progress.
3. Recognizes M3U, XML/MPD and media-stream inputs; it also supports JSON playlist fallback.
4. Parses `#EXTINF` attributes including `group-title`, `tvg-id`, `tvg-name`, and `tvg-logo`.
5. Associates pending global metadata with the next channel and resets the pending metadata after starting a new `#EXTINF` entry.
6. Parses `#EXTHTTP:{...}` JSON into per-channel or pending HTTP headers.
7. Parses `#EXTVLCOPT:`, `#KODIPROP:`, and `#EXT-X-Property:` directives.
8. Recognizes Kodi adaptive-stream properties including:
   - `inputstream.adaptive.license_key`
   - `inputstream.adaptive.manifest_key`
   - `inputstream.adaptive.license_type`
   - `inputstream.adaptive.stream_headers`
9. Maps license types including Widevine, PlayReady, FairPlay and ClearKey.
10. Parses URL pipe-suffix metadata, including User-Agent, Cookie, Origin, Referer, DRM scheme and DRM license/key values.
11. Preserves stream headers and DRM metadata on each parsed stream.
12. Has a JSON-to-stream conversion path for fields such as `url` / `link`, User-Agent, Cookie, Origin, Referer, DRM scheme and DRM license.

The parser normalizes HTTP-prefixed header names, maps Referrer to Referer, and preserves arbitrary header key/value pairs from supported directives.

### Important parser behavior to reproduce

- Header/DRM directives before an `#EXTINF` are held as pending metadata and copied onto the next stream.
- Directives after an `#EXTINF` are attached to the current stream.
- A stream URL is finalized when the parser encounters a non-comment line.
- Header and DRM state must not leak accidentally from one channel to the next.
- Pipe suffix parsing must split the URL from its metadata before the metadata is interpreted.
- Unknown directives should not corrupt the next stream; preserve useful unknown metadata where possible.

### Parser limitations to test rather than copy blindly

- The inspected parser reads the entire response into memory before parsing.
- Its EXTINF attribute scanner is a compact regular-expression parser, not a full quoted-attribute grammar.
- Its pipe-suffix parsing has assumptions about separators and URL encoding.
- Some JSON/header mappings are case-sensitive in source fields before normalization.
- Playlist fetch and playback request-header behavior are separate code paths; successfully attaching headers to a parsed stream does not guarantee they reach every manifest, segment, subtitle or license request.

## Network / telemetry finding — do not reproduce

A bundled module references a third-party endpoint under `stevenspalding.github.io/ps/prsr`. Its code constructs requests containing the playlist URL and, depending on the stream, selected request-header fields (Referer, Cookie, User-Agent, Origin) and DRM metadata. This is a security-sensitive data flow. This analysis did not contact that endpoint.

The reconstruction must not copy this behavior. Do not transmit playlist URLs, cookies, authorization headers, DRM keys, license URLs or other private stream metadata to third parties. Diagnostics should remain local and redact secrets.

## Implementation guidance for Tv-app

The current Windows architecture already uses Electron, Shaka Player and hls.js. Do not replace the playback stack solely to imitate AuthoIPTV. Implement a dedicated, tested compatibility layer:

1. Parse playlist directives into a normalized `StreamSource` model:
   - `url`
   - `headers`
   - `drm.scheme`
   - `drm.licenseUrl`
   - `drm.licenseHeaders`
   - EPG and channel metadata
2. Maintain pending playlist-level metadata separately from current-entry metadata.
3. Normalize header names case-insensitively while preserving valid values.
4. Parse URL pipe options and Kodi adaptive properties with unit tests.
5. Apply media headers to manifest, segment, subtitle and key requests only for the intended stream host(s).
6. Apply DRM license headers only to license requests.
7. Keep playlist-fetch headers distinct from playback headers.
8. Handle redirects and cookies without globally rewriting cookie security attributes.
9. Use authorized DRM configuration only; never bypass license checks or extract protected content keys.
10. Keep logs local and redact URLs, cookies, tokens, license keys and authorization headers.

## Findings not established by static inspection

- Exact runtime player selection logic for every stream type.
- Whether the MPEG-TS code is used by the shipped application in normal playback.
- The exact HLS.js configuration and fallback ordering.
- Whether every DRM system advertised by the bundled Shaka build is enabled by the app UI.
- Actual network behavior on a running Windows machine.
- Whether AuthoIPTV can play any particular LiveTGTV channel today.

These require runtime instrumentation and controlled playback tests with streams the user is authorized to access.

## Phase 2 status

- [x] Identify NSIS installer and extract embedded Electron application.
- [x] Recover app.asar and application bundles.
- [x] Identify Electron main-process request-header and cookie behavior.
- [x] Recover M3U parser logic and supported directives.
- [x] Identify Shaka DRM implementation indicators.
- [x] Identify and document sensitive third-party telemetry behavior to avoid.
- [ ] Fully map app UI actions to player initialization and fallback logic.
- [ ] Runtime trace authorized test streams and compare request sequences.
- [ ] Compare against Media3 APK behavior on identical test vectors.

Phase 2 static inspection is complete at the evidence level described above; runtime validation remains outstanding.
