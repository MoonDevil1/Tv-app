# Phase 4 — LiveTGTV playlist and stream-format investigation

Date: 2026-11-28
Source inspected live: https://livetgtv.lovable.app/api/public/playlist.m3u
Target: `MoonDevil1/Tv-app`
Branch: `rebuild/windows-from-tg-iptv`

## Current playlist snapshot

The live playlist was fetched and structurally counted without copying signed cookies or key material into this report.

| Measurement | Observed |
|---|---:|
| Channel entries (`#EXTINF`) | 1,209 |
| DASH MPD URLs | 1,076 |
| HLS M3U8 URLs | 133 |
| Other / unclassified URLs | 0 |
| Entries with `#EXTVLCOPT` | 1,209 |
| Entries with `#EXTHTTP` | 1,207 |
| `#KODIPROP` directive lines | 3,056 |
| Distinct stream hostnames | 15 |

The playlist therefore is **not a single-format M3U**. About 89% of its current entries are DASH manifests and about 11% are HLS. A player that only treats every entry as HLS, or only hands the URL to an HTML video element, will fail for a large part of this list.

The most common groups include English, News, Tamil, Unknown, Telugu, Bengali, Sports, Malayalam, Entertainment, Gujarati, Devotional, Kannada, Punjabi, Movies, Marathi and Infotainment.

## Playlist entry structure observed

Entries use standard channel metadata:

- `#EXTINF` with `tvg-id`, `tvg-name`, `tvg-logo`, `group-title`, and display name.
- `#KODIPROP` for adaptive manifest and DRM metadata.
- `#EXTVLCOPT:http-user-agent=...` for a per-stream User-Agent.
- `#EXTHTTP:{...}` for JSON-encoded HTTP headers, most importantly a signed CDN cookie.
- The following URL is the media manifest.

The playlist escapes underscores as `\\_` in metadata and URLs. This is significant: the parser must unescape VLC-style escaped underscores before URL validation, path matching and manifest requests. Do not percent-encode the backslash or leave it in the CDN path.

## Two target channels confirmed in the current playlist

| Channel | Stream type | CDN host | Manifest path |
|---|---|---|---|
| Zee Cinema HD | DASH | `jiotvpllive.cdn.jio.com` | `/bpk-tv/ZeeCinemaHD_BTS/WDVLive/index.mpd` |
| &Pictures HD | DASH | `jiotvpllive.cdn.jio.com` | `/bpk-tv/AndPicturesHD_BTS/WDVLive/index.mpd` |

Both are DASH, not HLS. Both must be parsed as DASH with their own per-channel request metadata. Their playlist entries contain adaptive-stream directives, a per-stream User-Agent and a signed cookie. The playlist also supplies ClearKey-style key metadata for many DASH entries; key values are deliberately omitted from this report.

## Authentication and expiry model

The `#EXTHTTP` values contain a signed `__hdnea__` cookie with start/expiry and path-scope information. These are time-sensitive CDN authorization values, not static headers. A stale playlist or cached channel object can therefore fail even when its manifest URL and DRM metadata are otherwise correct.

Implementation implications:

1. Fetch the playlist freshly when importing/refreshing; do not cache signed cookies indefinitely.
2. Preserve the cookie as a cookie header exactly as supplied after parsing/unescaping.
3. Keep the cookie attached to the channel that supplied it; never share one channel's cookie with another.
4. Respect its path and host scope. Do not send it to unrelated domains or third-party telemetry.
5. Treat 401/403/410 as authorization/expiry diagnostics; refresh playlist/channel metadata through the legitimate source rather than attempting to bypass authorization.
6. Do not log or include cookie values, DRM keys, full signed URLs or license material in issue reports.

## Comparison with the current Windows implementation

### Parser

The current `src/core/parser/m3uParser.ts` already has handlers for `#EXTINF`, `#KODIPROP`, `#EXTVLCOPT` and `#EXTHTTP`. It also has a ClearKey parser that accepts multiple `keyId:key` pairs and normalizes 128-bit hex values into base64url form. This is a useful foundation.

However, a playlist-specific test suite is required for the actual source syntax:

- Escaped underscores in attribute values and manifest URLs.
- JSON `#EXTHTTP` cookie directive with escaped underscores.
- Multiple ClearKey pairs in one `license_key` property.
- `manifest_type=mpd` and `license_type=clearkey` normalization.
- Isolation of cookies/keys between adjacent channels.
- Both directive ordering and channel boundary cases.
- All 1,209 entries parsed with no silent channel loss.

### Request headers — a likely compatibility gap

The current renderer `streamPolicy.ts` explicitly excludes Cookie, User-Agent, Referer and Origin from its generic safe-header helper. The Electron `headerProxy.ts` separately injects the active channel headers only for the **exact manifest origin**, and its blocked-header set also excludes Origin.

That means the current app has only partial request-context propagation:

- Cookie, User-Agent and Referer can be injected by the Electron proxy for the manifest's exact origin.
- Origin is currently discarded by the proxy.
- The active context is not expanded to other CDN origins used by redirects or manifest BaseURL/segment URLs.
- Renderer-side Shaka/hls.js request filters alone do not guarantee that the Electron network layer forwards the required metadata to every media request.

Do not solve this by forwarding credentials to every URL. The correct fix is a per-channel, per-origin allowlist derived from the actual manifest/redirect/segment host relationships, with cookie domain/path rules respected and separate license-request handling.

### DASH and ClearKey

The current player sends DASH to Shaka and configures ClearKey from parsed key pairs. This is the right general Windows/browser architecture to investigate. The following still need to be proven with a controlled test stream:

- Whether Shaka in the packaged Electron runtime accepts the playlist's exact ClearKey configuration.
- Whether MPD and segment requests receive the expected cookie and User-Agent.
- Whether segment URLs use the same host as the MPD or a different host.
- Whether the CDN returns a valid MPD to the Windows app.
- Whether the manifest's KIDs match the playlist's supplied ClearKey IDs.
- Whether audio/video codecs in the MPD are supported by the packaged Windows Chromium runtime.

A successful parser result is not a successful playback result. Each of these stages must be logged separately with secrets redacted.

## What is established vs not yet tested

### Established from the live playlist and source inspection

- Current live playlist contains exactly 1,209 entries.
- It contains 1,076 DASH and 133 HLS stream URLs.
- The two named problem channels are present and both are DASH.
- The entries use per-channel User-Agent and signed-cookie directives.
- The current Windows parser has handlers for the main directive types.
- The current Windows request-header policy has exact-origin limitations.

### Not established yet

- Whether a fresh MPD request for either target channel succeeds from the Windows runtime.
- Whether the current signed cookie is valid at playback time.
- Whether all MPD segment requests succeed.
- Whether KIDs in each target MPD match the playlist key metadata.
- Whether the packaged Windows CDM/decoder can play the resulting authorized stream.
- Whether a specific target channel plays end-to-end in the APK or in the Windows app during this investigation.

No DRM bypass, credential extraction, or third-party forwarding is part of this work.

## Next playlist-first implementation/test sequence

1. Build a sanitized fixture from representative entries: one DASH ClearKey, one HLS, one entry with a path-scoped cookie, one without DRM, and the two target channel structures with secrets replaced by placeholders.
2. Run the existing parser against the full current playlist and assert 1,209 entries and exact target metadata.
3. Inspect a fresh, authorized target MPD response and record only sanitized host/path, response status, BaseURL/segment hostnames, KIDs and codec identifiers.
4. Validate the request-context policy for manifest, segment, subtitle and license requests, including redirects and cookie scope.
5. Only after these checks pass, run playback tests in the packaged Windows runtime.

The interface redesign is intentionally deferred until the user supplies the desired application interface reference.
