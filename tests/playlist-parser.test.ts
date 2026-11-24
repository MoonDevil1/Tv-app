import test from "node:test";
import assert from "node:assert/strict";
import { addLiveTgTvFallbacks, parsePlaylistText } from "../src/core/playlist/parser";

test("parses LiveTGTV M3U entries, IDs, groups, logos, EPG and per-channel headers", () => {
  const input = `#EXTM3U url-tvg="https://guide.example/epg.xml"
#EXTINF:-1 tvg-id="165" tvg-name="Zee Cinema HD" tvg-logo="https://img.example/zee.png" group-title="Movies",Zee Cinema HD
#EXTVLCOPT:http-user-agent=Vega-Test
#EXTHTTP:{"cookie":"sid=abc"}
https://live.example/player?liveid=165&url=https%3A%2F%2Fcdn.example%2Fmovie.mpd
#EXTINF:-1 tvg-id="1839" group-title="Movies",&Pictures HD
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=0123456789abcdef0123456789abcdef:abcdef0123456789abcdef0123456789,1123456789abcdef0123456789abcdef:bcdef0123456789abcdef0123456789a,2123456789abcdef0123456789abcdef:cdef0123456789abcdef0123456789ab,3123456789abcdef0123456789abcdef:def0123456789abcdef0123456789abc,4123456789abcdef0123456789abcdef:ef0123456789abcdef0123456789abcd
https://cdn.example/pictures.mpd`;
  const playlist = parsePlaylistText(input, "https://livetgtv.lovable.app/api/public/playlist.m3u");
  assert.equal(playlist.channels.length, 2);
  assert.equal(playlist.channels[0].id, "liveid:165");
  assert.equal(playlist.channels[0].sources[0].type, "dash");
  assert.equal(playlist.channels[0].sources[0].headers["User-Agent"], "Vega-Test");
  assert.equal(playlist.channels[0].sources[0].headers.Cookie, "sid=abc");
  assert.equal(playlist.channels[1].sources[0].drm?.scheme, "clearkey");
  assert.equal(Object.keys(playlist.channels[1].sources[0].drm?.clearKeys ?? {}).length, 5);
  assert.equal(playlist.channels[1].requiresDrm, true);
  assert.equal(playlist.epgUrls[0], "https://guide.example/epg.xml");
  assert.deepEqual(playlist.groups, ["Movies"]);
});

test("parses JSON playlists and skips invalid or unsupported entries", () => {
  const playlist = parsePlaylistText(JSON.stringify({ epgUrl: "https://guide.example/epg.xml", channels: [
    { id: "a", name: "News", url: "https://cdn.example/news.m3u8", group: "News", headers: { Referer: "https://site.example/" } },
    { name: "Invalid", url: "file:///tmp/stream" }
  ] }), "local.json");
  assert.equal(playlist.channels.length, 1);
  assert.equal(playlist.channels[0].sources[0].type, "hls");
  assert.equal(playlist.channels[0].sources[0].headers.Referer, "https://site.example/");
});

test("keeps valid HTTP channels even when stream URLs have no recognizable extension", () => {
  const playlist = parsePlaylistText("#EXTM3U\n#EXTINF:-1 tvg-id=\"same\",Channel One\nhttps://example.com/live?id=1\n#EXTINF:-1 tvg-id=\"same\",Channel Two\nhttps://example.com/live?id=2", "unknown.m3u");
  assert.equal(playlist.channels.length, 2);
  assert.equal(playlist.channels[0].sources[0].type, "unknown");
  assert.equal(playlist.channels[1].sources[0].type, "unknown");
  assert.notEqual(playlist.channels[0].id, playlist.channels[1].id);
  assert.equal(playlist.channels[1].number, 2);
});

test("rejects empty playlists and playlists without valid HTTP channels", () => {
  assert.throws(() => parsePlaylistText("", "empty.m3u"), /empty/i);
  assert.throws(() => parsePlaylistText("#EXTM3U\n#EXTINF:-1,Invalid\nfile:///tmp/stream", "bad.m3u"), /No supported/);
});

test("adds the optional LiveTGTV backup stream only when a channel match is unique", async () => {
  const backupText = `#EXTM3U
#EXTINF:-1 tvg-id="165" tvg-name="Zee Cinema HD" group-title="Movies",Zee Cinema HD
https://backup.example/zee.m3u8`;
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    tvApp: { fetchRemoteText: async () => ({ text: backupText, url: "https://hjh-545.pages.dev/", status: 200 }) }
  } });
  try {
    const primary = parsePlaylistText(`#EXTM3U
#EXTINF:-1 tvg-id="165" tvg-name="Zee Cinema HD" group-title="Movies",Zee Cinema HD
https://live.example/zee.mpd`, "https://livetgtv.lovable.app/api/public/playlist.m3u");
    const result = await addLiveTgTvFallbacks(primary);
    assert.equal(result.channels[0].sources.length, 2);
    assert.equal(result.channels[0].sources[1].label, "LiveTGTV backup");
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
