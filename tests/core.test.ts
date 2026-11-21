import test from "node:test";
import assert from "node:assert/strict";
import { parseM3U, parseJsonPlaylist, parsePlaylist } from "../src/core/parser/m3uParser";
import { clearKeyJwk, hexToBase64Url, parseClearKeys, createClearKeyDrm } from "../src/core/parser/clearKeyUtils";
import { PlaylistManager } from "../src/core/parser/playlistManager";
import { parseXmltvDate, currentAndNext, parseLiveTgGuide } from "../src/core/epg/xmltv";
import { waitForMediaEvent } from "../src/core/player/mediaEvents";
import { describeShakaError } from "../src/core/player/shakaErrors";

const KID = "00112233445566778899aabbccddeeff";
const KEY = "ffeeddccbbaa99887766554433221100";
const sample = `#EXTM3U url-tvg="https://epg.example/guide.xml"
#EXTINF:-1 tvg-id="news.1" tvg-name="News HD" tvg-logo="https://img.example/news.png" group-title="News",News HD
#EXTVLCOPT:http-user-agent=Test Player/1.0
#EXTHTTP:{"cookie":"session=abc"}
#KODIPROP:inputstream.adaptive.manifest_type=mpd
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=${KID}:${KEY},11223344556677889900aabbccddeeff:00112233445566778899aabbccddeeff
https://cdn.example/live/index.mpd
#EXTINF:-1 tvg-name="Radio" group-title="Audio",Radio
https://cdn.example/radio/index.m3u8|Referer=https://provider.example`;

test("parses channel metadata, DASH, multiple ClearKeys and per-channel headers", () => {
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

test("converts 128-bit hex values and round-trips ClearKey JWK", () => {
  assert.equal(hexToBase64Url(KID), "ABEiM0RVZneImaq7zN3u_w");
  const keys = parseClearKeys(`${KID}:${KEY}`);
  assert.equal(Object.keys(keys).length, 1);
  const hexMap = parseClearKeys({ [KID]: KEY });
  assert.equal(hexMap[hexToBase64Url(KID)], hexToBase64Url(KEY));
  const uuidMap = parseClearKeys({ "00112233-4455-6677-8899-aabbccddeeff": "ffeeddcc-bbaa-9988-7766-554433221100" });
  assert.equal(uuidMap[hexToBase64Url(KID)], hexToBase64Url(KEY));
  assert.throws(() => parseClearKeys({ [KID]: "short" }));
  assert.throws(() => parseClearKeys(`${hexToBase64Url(KID)}:short`));
  const jwk = clearKeyJwk(keys);
  assert.equal(parseClearKeys(jwk)[Object.keys(keys)[0]], Object.values(keys)[0]);
});

test("accepts standard JWK data URIs, remote license URLs and Widevine metadata", () => {
  const jwk = JSON.stringify({ keys: [{ kty: "oct", kid: "ABEiM0RVZneImaq7zN3u_w", k: "ABEiM0RVZneImaq7zN3u_w" }] });
  assert.equal(Object.keys(parseClearKeys(jwk)).length, 1);
  assert.equal(Object.keys(parseClearKeys(`data:application/json,${encodeURIComponent(jwk)}`)).length, 1);
  assert.equal(createClearKeyDrm("clearkey", "https://license.example/key")?.licenseUrl, "https://license.example/key");
  assert.equal(createClearKeyDrm("widevine", "https://license.example/wv")?.scheme, "widevine");
  assert.equal(createClearKeyDrm("playready", "https://license.example/pr"), undefined);
});

test("parses JSON playlist envelopes, IPTV aliases, headers and relative stream URLs", () => {
  const channels = parseJsonPlaylist({ data: [
    { id: 10, title: "JSON TV", url: "/live.m3u8", "group-title": "JSON", headers: { Authorization: "Bearer x" } },
    { title: "DASH", stream_url: "https://cdn.example/movie.mpd", category: "Movies", drm: { scheme: "clearkey", clearKeys: { "ABEiM0RVZneImaq7zN3u_w": "ABEiM0RVZneImaq7zN3u_w" } } },
    { title: "bad", url: "javascript:alert(1)" }
  ] }, "https://provider.example/list.json");
  assert.equal(channels.length, 2);
  assert.equal(channels[0].url, "https://provider.example/live.m3u8");
  assert.equal(channels[0].manifestType, "hls");
  assert.equal(channels[0].headers.Authorization, "Bearer x");
  assert.equal(channels[0].drm, undefined);
  assert.equal(channels[1].manifestType, "dash");
  assert.equal(channels[1].drm?.clearKeys?.ABEiM0RVZneImaq7zN3u_w, "ABEiM0RVZneImaq7zN3u_w");
});

test("accepts JWK arrays nested inside JSON DRM objects", () => {
  const channels = parseJsonPlaylist({ channels: [{
    name: "JWK", url: "https://cdn.example/jwk.mpd",
    drm: { scheme: "clearkey", keys: [{ kty: "oct", kid: "ABEiM0RVZneImaq7zN3u_w", k: "ABEiM0RVZneImaq7zN3u_w" }] }
  }] });
  assert.equal(Object.keys(channels[0].drm?.clearKeys ?? {}).length, 1);
});

test("auto-detects JSON and rejects unsupported or malformed input", () => {
  assert.equal(parsePlaylist(sample).length, 2);
  assert.equal(parsePlaylist(JSON.stringify([{ name: "one", url: "https://x.test/a.m3u8" }])).length, 1);
  assert.throws(() => parsePlaylist("<html>not a playlist</html>"), /Unsupported playlist/);
  assert.throws(() => parsePlaylist('{"items":[]}'), /no valid HTTP/);
});

test("supports Kodi EXTGRP, quoted commas and escaped CDN underscores", () => {
  const source = `#EXTM3U
#EXTGRP:Documentary
#EXTINF:-1 tvg-name="One" description="A, B",One, HD
#KODIPROP:inputstream.adaptive.manifest\\_type=mpd
#KODIPROP:inputstream.adaptive.license\\_type=clearkey
#KODIPROP:inputstream.adaptive.license\\_key=${KID}:${KEY}
#EXTHTTP:{"cookie":"\\_\\_hdnea\\_\\_=token"}
https://cdn.example/channel\\_one/index.mpd`;
  const [channel] = parseM3U(source);
  assert.equal(channel.name, "One, HD");
  assert.equal(channel.group, "Documentary");
  assert.equal(channel.url, "https://cdn.example/channel_one/index.mpd");
  assert.equal(channel.headers.cookie, "__hdnea__=token");
  assert.equal(channel.manifestType, "dash");
});

test("resolves relative M3U stream URLs against playlist URL", () => {
  const [channel] = parseM3U("#EXTM3U\n#EXTINF:-1,Relative\n../live/channel.mpd", "https://provider.example/lists/channels.m3u");
  assert.equal(channel.url, "https://provider.example/live/channel.mpd");
});

test("PlaylistManager loads, stores and refreshes a remote playlist", async () => {
  let calls = 0;
  const manager = new PlaylistManager(async () => {
    calls++;
    return new Response("#EXTM3U\n#EXTINF:-1,Test\nhttps://cdn.example/test.m3u8", {
      status: 200, headers: { "content-type": "application/x-mpegURL" }
    });
  });
  const playlist = await manager.load("https://provider.example/list.m3u", { id: "live", name: "LiveTGTV" });
  assert.equal(playlist.channels.length, 1);
  assert.equal(manager.get("live")?.channels[0].name, "Test");
  const refreshed = await manager.refresh("live");
  assert.equal(refreshed.channels.length, 1);
  assert.equal(calls, 2);
  assert.equal(manager.remove("live"), true);
  manager.dispose();
});

test("rejects malformed ClearKey values and ignores unsafe stream schemes", () => {
  assert.throws(() => parseClearKeys("not-a-key"));
  assert.throws(() => parseJsonPlaylist({ channels: [{ name: "bad", url: "file:///etc/passwd" }] }), /no valid HTTP/);
});


test("parses XMLTV timestamps with timezone offsets and selects now/next programmes", () => {
  const start = parseXmltvDate("20261119120000 +0530");
  assert.equal(new Date(start).toISOString(), "2026-11-19T06:30:00.000Z");
  const programs = [
    { channelId: "news", title: "Current", start: 1000, stop: 2000 },
    { channelId: "news", title: "Next", start: 2000, stop: 3000 }
  ];
  const result = currentAndNext(programs, 1500);
  assert.equal(result.current?.title, "Current");
  assert.equal(result.next?.title, "Next");
});


import { headersForRequestUris, licenseHeadersForRequest, shakaDrmConfiguration, streamHeadersForRequest } from "../src/core/player/streamPolicy";

test("playback request policy scopes stream headers to the manifest origin", () => {
  const channel = {
    id: "one", name: "One", url: "https://origin.example/live/master.m3u8", group: "Live",
    headers: { Authorization: "Bearer stream", Referer: "https://origin.example/", "X-Token": "abc", Cookie: "sid=secret" },
    rawAttributes: {}
  };
  assert.deepEqual(streamHeadersForRequest(channel, "https://origin.example/live/segment.ts"), {
    Authorization: "Bearer stream", "X-Token": "abc"
  });
  assert.deepEqual(streamHeadersForRequest(channel, "https://cdn.example/segment.ts"), {});
  assert.deepEqual(streamHeadersForRequest(channel, "http://origin.example/segment.ts"), {});
  assert.deepEqual(streamHeadersForRequest(channel, "file:///tmp/segment.ts"), {});
});

test("request headers are not leaked across Shaka fallback origins", () => {
  const channel = {
    id: "one", name: "One", url: "https://origin.example/live.mpd", group: "Live",
    headers: { Authorization: "Bearer private" }, rawAttributes: {}
  };
  assert.deepEqual(headersForRequestUris(
    ["https://origin.example/live.mpd", "https://origin.example/fallback.mpd"],
    uri => streamHeadersForRequest(channel, uri)
  ), { Authorization: "Bearer private" });
  assert.deepEqual(headersForRequestUris(
    ["https://origin.example/live.mpd", "https://cdn.example/fallback.mpd"],
    uri => streamHeadersForRequest(channel, uri)
  ), {});
});

test("license headers are sent only to the configured license server", () => {
  const drm = {
    scheme: "widevine" as const, licenseUrl: "https://license.example/wv",
    licenseHeaders: { Authorization: "Bearer license", "X-License": "yes" }
  };
  assert.deepEqual(licenseHeadersForRequest(drm, "https://license.example/wv"), {
    Authorization: "Bearer license", "X-License": "yes"
  });
  assert.deepEqual(licenseHeadersForRequest(drm, "https://cdn.example/wv"), {});
  assert.deepEqual(licenseHeadersForRequest(drm, "https://license.example.evil.test/wv"), {});
});

test("builds ClearKey and Widevine Shaka DRM configurations", () => {
  const keys = { "ABEiM0RVZneImaq7zN3u_w": "ABEiM0RVZneImaq7zN3u_w" };
  assert.deepEqual(shakaDrmConfiguration({ scheme: "clearkey", clearKeys: keys }), { drm: { clearKeys: keys } });
  assert.deepEqual(shakaDrmConfiguration({ scheme: "clearkey", licenseUrl: "https://license.example/ck" }), {
    drm: { servers: { "org.w3.clearkey": "https://license.example/ck" } }
  });
  assert.deepEqual(shakaDrmConfiguration({ scheme: "widevine", licenseUrl: "https://license.example/wv" }), {
    drm: { servers: { "com.widevine.alpha": "https://license.example/wv" } }
  });
  assert.deepEqual(shakaDrmConfiguration(undefined), {});
});



test("media event waits resolve, reject, time out and cancel with listener cleanup", async () => {
  const successTarget = new EventTarget();
  const success = waitForMediaEvent(successTarget, "ready", "error", 100, "media failed");
  successTarget.dispatchEvent(new Event("ready"));
  await success;

  const errorTarget = new EventTarget();
  const failed = waitForMediaEvent(errorTarget, "ready", "error", 100, "media failed");
  errorTarget.dispatchEvent(new Event("error"));
  await assert.rejects(failed, /media failed/);

  await assert.rejects(
    waitForMediaEvent(new EventTarget(), "ready", "error", 5, "media timed out"),
    /media timed out/
  );

  const controller = new AbortController();
  const pending = waitForMediaEvent(new EventTarget(), "ready", "error", 1000, "media failed", controller.signal);
  controller.abort();
  await assert.rejects(pending, error => error instanceof Error && error.name === "AbortError");
});


test("JSON playlist EPG URLs resolve relative to their source", async () => {
  const manager = new PlaylistManager(async () => new Response(JSON.stringify({
    epg: ["guide.xml", "https://epg.example/extra.xml"],
    channels: [{ name: "News", url: "https://stream.example/news.m3u8" }]
  }), { status: 200 }));
  const playlist = await manager.load("https://provider.example/playlists/main.json");
  assert.deepEqual(playlist.epgUrls, [
    "https://provider.example/playlists/guide.xml",
    "https://epg.example/extra.xml"
  ]);
  manager.dispose();
});

test("JSON DRM metadata preserves Widevine and ignores unsupported PlayReady", () => {
  const widevine = parseJsonPlaylist({ channels: [{
    name: "Widevine", url: "https://stream.example/wv.mpd",
    drm: { scheme: "com.widevine.alpha", licenseUrl: "https://license.example/wv" }
  }] })[0];
  assert.equal(widevine.drm?.scheme, "widevine");
  assert.equal(widevine.drm?.licenseUrl, "https://license.example/wv");
  const playready = parseJsonPlaylist({ channels: [{
    name: "PlayReady", url: "https://stream.example/pr.mpd",
    drm: { scheme: "playready", licenseUrl: "https://license.example/pr" }
  }] })[0];
  assert.equal(playready.drm, undefined);
});

test("XMLTV date parser rejects impossible dates and offsets", () => {
  assert.ok(Number.isNaN(parseXmltvDate("20241301120000 +0530")));
  assert.ok(Number.isNaN(parseXmltvDate("20240230120000 +0530")));
  assert.ok(Number.isNaN(parseXmltvDate("20240101120000 +9999")));
});


test("explains Shaka DRM key-system failures with actionable guidance", () => {
  assert.match(describeShakaError(6001).message, /secure-context/i);
  assert.match(describeShakaError(6001, ["org.w3.clearkey"]).message, /org.w3.clearkey/);
  assert.match(describeShakaError(6001).message, /Widevine\/PlayReady/i);
  assert.match(describeShakaError(6020).message, /Encrypted Media Extensions/i);
  assert.match(describeShakaError(6000).message, /does not identify a DRM system/i);
  assert.match(describeShakaError(7000).message, /Shaka playback error 7000/i);
});


test("parses LiveTGTV current, next and upcoming guide data with Unix-second timestamps", () => {
  const programs = parseLiveTgGuide({
    nowPlaying: { title: "Current", start: 1_800_000_000, stop: 1_800_000_600, desc: "On now" },
    upNext: { title: "Next", start: 1_800_000_600, stop: 1_800_001_200 },
    upcoming: [{ title: "Later", start: 1_800_001_200, stop: 1_800_001_800 }]
  }, "144");
  assert.equal(programs.length, 3);
  assert.equal(programs[0].channelId, "144");
  assert.equal(programs[0].start, 1_800_000_000_000);
  assert.equal(programs[0].description, "On now");
  assert.equal(programs[2].title, "Later");
  assert.equal(parseLiveTgGuide({ error: "Channel guide unavailable" }, "144").length, 0);
});
