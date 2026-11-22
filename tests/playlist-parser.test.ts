import test from "node:test";
import assert from "node:assert/strict";
import { parsePlaylistText } from "../src/core/playlist/parser";

test("parses LiveTGTV M3U entries, IDs, groups, logos, EPG and per-channel headers", () => {
  const input = `#EXTM3U url-tvg="https://guide.example/epg.xml"
#EXTINF:-1 tvg-id="165" tvg-name="Zee Cinema HD" tvg-logo="https://img.example/zee.png" group-title="Movies",Zee Cinema HD
#EXTVLCOPT:http-user-agent=Vega-Test
#EXTHTTP:{"cookie":"sid=abc"}
https://live.example/player?liveid=165&url=https%3A%2F%2Fcdn.example%2Fmovie.mpd
#EXTINF:-1 tvg-id="1839" group-title="Movies",&Pictures HD
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=0123456789abcdef0123456789abcdef:abcdef0123456789abcdef0123456789
https://cdn.example/pictures.mpd`;
  const playlist = parsePlaylistText(input, "https://livetgtv.lovable.app/api/public/playlist.m3u");
  assert.equal(playlist.channels.length, 2);
  assert.equal(playlist.channels[0].id, "liveid:165");
  assert.equal(playlist.channels[0].sources[0].type, "dash");
  assert.equal(playlist.channels[0].sources[0].headers["User-Agent"], "Vega-Test");
  assert.equal(playlist.channels[0].sources[0].headers.Cookie, "sid=abc");
  assert.equal(playlist.channels[1].sources[0].drm?.scheme, "clearkey");
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

test("rejects empty and unsupported playlists", () => {
  assert.throws(() => parsePlaylistText("", "empty.m3u"), /empty/i);
  assert.throws(() => parsePlaylistText("#EXTM3U\n#EXTINF:-1,Unsupported\nhttps://example.com/no-extension", "bad.m3u"), /No supported/);
});
