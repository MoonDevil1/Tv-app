import test from "node:test";
import assert from "node:assert/strict";
import { parseM3U, parseJsonPlaylist, parsePlaylist } from "../src/core/parser/m3uParser";
import { hexToBase64Url, parseClearKeys } from "../src/core/parser/clearKeyUtils";
import { PlaylistManager } from "../src/core/parser/playlistManager";

const sample = `#EXTM3U url-tvg="https://epg.example/guide.xml"
#EXTINF:-1 tvg-id="news.1" tvg-name="News HD" tvg-logo="https://img.example/news.png" group-title="News",News HD
#EXTVLCOPT:http-user-agent=Test Player/1.0
#EXTHTTP:{"cookie":"session=abc"}
#KODIPROP:inputstream.adaptive.manifest_type=mpd
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=00112233445566778899aabbccddeeff:ffeeddccbbaa99887766554433221100,11223344556677889900aabbccddeeff:00112233445566778899aabbccddeeff
https://cdn.example/live/index.mpd
#EXTINF:-1 tvg-name="Radio" group-title="Audio",Radio
https://cdn.example/radio/index.m3u8|Referer=https://provider.example
`;

test("parses channel metadata, DASH, multiple ClearKeys and request headers", () => {
  const channels = parseM3U(sample);
  assert.equal(channels.length, 2);
  assert.equal(channels[0].name, "News HD");
  assert.equal(channels[0].group, "News");
  assert.equal(channels[0].manifestType, "dash");
  assert.equal(channels[0].headers["User-Agent"], "Test Player/1.0");
  assert.equal(channels[0].headers.cookie, "session=abc");
  assert.equal(Object.keys(channels[0].drm?.clearKeys ?? {}).length, 2);
  assert.equal(channels[1].manifestType, "hls");
  assert.equal(channels[1].headers.Referer, "https://provider.example");
});

test("normalizes hex and standard base64 ClearKey values", () => {
  assert.equal(hexToBase64Url("000102"), "AAEC");
  const keys = parseClearKeys("00112233445566778899aabbccddeeff:ffeeddccbbaa99887766554433221100");
  assert.equal(Object.keys(keys).length, 1);
  assert.equal(parseClearKeys({ "AAEC": "AQID" }).AAEC, "AQID");
});

test("parses JSON playlist variants and filters unsafe URLs", () => {
  const channels = parseJsonPlaylist({ streams: [
    { id: 10, title: "JSON TV", url: "https://cdn.example/live.m3u8", group: "JSON", headers: { Authorization: "Bearer x" } },
    { title: "bad", url: "javascript:alert(1)" }
  ] });
  assert.equal(channels.length, 1);
  assert.equal(channels[0].id, "10");
  assert.equal(channels[0].headers.Authorization, "Bearer x");
});

test("detects M3U and JSON and rejects unsupported documents", () => {
  assert.equal(parsePlaylist(sample).length, 2);
  assert.equal(parsePlaylist(JSON.stringify([{ name: "one", url: "https://x.test/a.m3u8" }])).length, 1);
  assert.throws(() => parsePlaylist("<html>not a playlist</html>"), /Unsupported playlist/);
});

test("parses escaped Kodi keys and escaped CDN underscores", () => {
  const escaped = `#EXTM3U
#EXTINF:-1 tvg-name="Escaped",Escaped
#KODIPROP:inputstream.adaptive.manifest\\_type=mpd
#KODIPROP:inputstream.adaptive.license\\_type=clearkey
#KODIPROP:inputstream.adaptive.license\\_key=00112233445566778899aabbccddeeff:ffeeddccbbaa99887766554433221100
#EXTHTTP:{"cookie":"\\_\\_hdnea\\_\\_=token"}
https://cdn.example/channel\\_one/index.mpd
`;
  const [channel] = parseM3U(escaped);
  assert.equal(channel.manifestType, "dash");
  assert.equal(channel.url, "https://cdn.example/channel_one/index.mpd");
  assert.equal(Object.keys(channel.drm?.clearKeys ?? {}).length, 1);
  assert.equal(channel.headers.cookie, "__hdnea__=token");
});

test("loads a local playlist and preserves EPG and category metadata", async () => {
  const manager = new PlaylistManager();
  const playlist = await manager.load(sample, { name: "Fixture" });
  assert.equal(playlist.name, "Fixture");
  assert.deepEqual(playlist.groups, ["News", "Audio"]);
  assert.deepEqual(playlist.epgUrls, ["https://epg.example/guide.xml"]);
  manager.dispose();
});

test("supports JSON data envelopes, IPTV field names and JWK ClearKey", () => {
  const channels = parseJsonPlaylist({ data: [{
    "tvg-id": "json.1", "tvg-name": "JSON DRM", "tvg-logo": "https://img.test/logo.png",
    "group-title": "Premium", url: "https://cdn.test/live.mpd",
    drm: { scheme: "clearkey", clearKeys: { "AAEC": "AQID" } },
    request_headers: { Referer: "https://provider.test/" }
  }] });
  assert.equal(channels[0].tvgId, "json.1");
  assert.equal(channels[0].group, "Premium");
  assert.equal(channels[0].drm?.clearKeys?.AAEC, "AQID");
  assert.equal(channels[0].headers.Referer, "https://provider.test/");
});
