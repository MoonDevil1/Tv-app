# LiveTGTV playlist — initial stream-format investigation

Date: 2026-11-28
Source: https://livetgtv.lovable.app/api/public/playlist.m3u
Scope: playlist syntax and player requirements only. No interface work.

## Retrieval status

A live fetch of the playlist succeeded once. A later refresh attempt failed with `target_unreachable`, and the generic web reader could not open the endpoint. The first extraction was very large and the tool truncated its displayed output. Therefore, the observations below are grounded in visible entries, but a complete machine-counted inventory (including confirmation of all 1,209 entries) is still outstanding. The 1,209 count is currently the user's reported count, not a count independently verified in this report.

Do not use the extracted markdown representation as a byte-exact parser fixture: it displays escaped underscores in URLs and values. Obtain and preserve the raw response bytes before deciding whether those backslashes exist in the origin response.

## Observed entry structure

The visible entries follow this pattern:

1. `#EXTINF` carries channel identity and display metadata: `tvg-id`, `tvg-name`, `tvg-logo`, `group-title`, and the display name after the comma.
2. Optional `#KODIPROP` directives describe adaptive-stream and DRM configuration. Visible examples include `inputstream.adaptive.manifest_type=mpd`, `license_type=clearkey`, and `license_key`.
3. `#EXTVLCOPT:http-user-agent=...` supplies a playback User-Agent. The visible playlist uses a PlayTV/ExoPlayer-style Android User-Agent.
4. `#EXTHTTP:{...}` supplies JSON-formatted HTTP headers; visible examples contain a `cookie` property.
5. The following URL is the actual media manifest/stream URL.

Observed protocol families:
- DASH: URLs ending in `.mpd`, with ClearKey metadata on many visible entries.
- HLS: URLs ending in `.m3u8`, including paths containing `HLSPartner`; some visible HLS URLs carry a signed `__hdnea__` query parameter.
- Do not infer that every HLS entry is clear or that every DASH entry has identical DRM configuration; inspect each channel entry.

## Authentication and request-context implications

Visible entries use Jio CDN hostnames and signed `__hdnea__` values. Those values appear in two forms:
- A cookie supplied through `#EXTHTTP`.
- A query parameter appended to an HLS URL.

Some cookie values visibly contain an ACL path pattern and expiry fields. This means the player must preserve the exact channel's request context and must not replace all cookies with one global cookie. The allowed path and expiry may differ by channel.

The playback request context needs to be applied to the relevant requests, not just the first manifest fetch:
- manifest;
- child playlists / representations;
- media segments and initialization segments;
- subtitle resources;
- DRM/license requests, where applicable.

The precise host/redirect scope still requires request tracing. Do not blindly forward cookies or Authorization headers to unrelated redirected hosts. Keep per-channel/per-origin policy, preserve provider-required headers only for permitted origins, and redact all credentials from logs.

## ClearKey representation

Visible DASH entries use Kodi's `inputstream.adaptive.license_key` directive with one or more comma-separated key-id:key pairs. This is not a license-server URL. The Windows player must parse the pairs, validate their hex/base64 representation as required by the target player API, and build the appropriate ClearKey configuration without losing multi-key entries.

Do not assume a single key per channel: several visible entries contain multiple pairs. Test parsing and playback using authorized fixtures. Never print or commit live key values in diagnostics, test snapshots, reports, or CI logs.

## Specific channel evidence

- **Zee Cinema HD** is visible in the retrieved playlist. Its entry uses an MPD URL, ClearKey metadata containing multiple key pairs, a PlayTV/ExoPlayer-style User-Agent, and an `#EXTHTTP` cookie. The cookie includes a channel-path ACL. This is a useful priority regression fixture, but the live credential values must not be copied into repository documentation.
- **& Pictures HD** has not yet been independently located in the visible portion of the truncated extraction. Its exact current URL, protocol, directives and request context remain unverified. Do not assume it matches Zee Cinema HD.

## Parser and playback requirements derived from this evidence

1. Parse each `#EXTINF` entry and retain all channel metadata.
2. Associate subsequent directives with the correct entry until its URL is read; reset all pending fields after finalizing an entry.
3. Parse `#EXTHTTP` as JSON, case-insensitively normalize HTTP header names, and retain cookie values without accidental URL decoding or quote corruption.
4. Parse `#EXTVLCOPT` options, including User-Agent and any other supported request-header options.
5. Parse `#KODIPROP` key/value pairs, preserving multi-key ClearKey data and manifest type.
6. Distinguish manifest URL query authentication from HTTP Cookie authentication; preserve both when an entry has both.
7. Keep playlist-download headers separate from per-stream playback headers.
8. Apply request context across the full playback request graph with safe origin/redirect controls.
9. Route MPD to a DASH-capable engine and HLS to an HLS-capable engine, then test actual segment and decryption behavior. File extension alone is not sufficient to claim successful playback.
10. Keep every channel, even if unsupported; surface a precise playback error instead of silently filtering entries.

## Test matrix to build

| Fixture | Required assertion |
|---|---|
| MPD + one ClearKey pair | Manifest type and key pair preserved |
| MPD + multiple ClearKey pairs | Every pair preserved, no truncation |
| MPD + per-channel Cookie | Cookie bound to that channel only |
| HLS + signed query parameter | Query preserved exactly |
| HLS + Cookie + User-Agent | Both request options applied |
| Two consecutive channels with different cookies | No header/state leakage |
| Entry with no DRM directives | No inherited DRM configuration |
| Expired or path-restricted cookie | Clear 401/403 diagnostic, no credential dump |
| Redirect to another host | Sensitive headers not leaked across origins |
| Zee Cinema HD | Exact current entry parsed and playback tested |
| & Pictures HD | Exact current entry first located, then parsed and playback tested |

## What is not yet proven

- Complete current channel count and group/protocol distribution.
- Exact raw bytes/escaping semantics of the playlist response.
- Current live reachability of every manifest and segment.
- Whether every signed cookie/query token is currently valid.
- The current exact & Pictures HD entry.
- Actual Windows playback success for any channel.
- Whether the source permits every requested playback method; do not bypass provider authentication or DRM.

## Next steps

1. Obtain a byte-exact raw playlist snapshot in a controlled environment and store only a redacted fixture in the repository.
2. Parse and inventory every channel locally: total count, duplicate IDs, groups, protocol, DRM type, header types and missing URLs.
3. Locate the exact Zee Cinema HD and & Pictures HD records and build redacted fixtures.
4. Inspect the existing Windows parser and request pipeline against those fixtures.
5. Only then modify the parser/player and run authorized playback tests. UI design is explicitly deferred until the user supplies the desired interface.
