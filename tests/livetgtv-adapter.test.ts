import test from "node:test";
import assert from "node:assert/strict";
import { resolveLiveTgTvChannel } from "../src/core/playlist/livetgtv";
import type { TvChannel } from "../src/app/models";

async function withLiveTgTvResponse<T>(response: unknown, run: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    tvApp: { fetchRemoteText: async () => ({ text: JSON.stringify(response), url: "https://livetgtv.lovable.app/api/public/channels/165", status: 200 }) }
  } });
  try { return await run(); }
  finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("LiveTGTV adapter loads all API sources, every ClearKey pair and playlist headers", async () => {
  const pairs = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [
    (i + 1).toString(16).padStart(32, "0"),
    (i + 101).toString(16).padStart(32, "0")
  ]));
  const response = {
    sources: ["https://cdn.example/zee-primary.mpd", "https://backup.example/stream?token=sample"],
    headers: { "X-Channel": "api-header" },
    drm: { type: "clearkey", clearKeys: pairs }
  };
  const channel: TvChannel = {
    id: "liveid:165", name: "Zee Cinema HD", group: "Movies", tvgId: "165",
    sources: [{ url: "https://playlist.example/stream.mpd", type: "dash", headers: { Cookie: "sid=playlist", "User-Agent": "Vega-UA" } }],
    rawAttributes: {}
  };
  const resolved = await withLiveTgTvResponse(response, () => resolveLiveTgTvChannel(channel));
  assert.equal(resolved.sources.length, 2);
  assert.equal(resolved.sources[0].type, "dash");
  assert.equal(resolved.sources[1].type, "dash");
  assert.equal(resolved.sources[0].headers.Cookie, "sid=playlist");
  assert.equal(resolved.sources[0].headers["User-Agent"], "Vega-UA");
  assert.equal(resolved.sources[0].headers["X-Channel"], "api-header");
  assert.equal(Object.keys(resolved.sources[0].drm?.clearKeys ?? {}).length, 5);
});

test("LiveTGTV detects API manifest types when the playlist source type is unknown", async () => {
  const response = {
    sources: [
      "https://cdn.example/zee-primary.mpd?token=abc",
      "https://backup.example/live/master.m3u8?session=xyz",
      "https://media.example/movie.mp4?auth=123"
    ]
  };
  const channel: TvChannel = {
    id: "liveid:165", name: "Zee Cinema HD", group: "Movies", tvgId: "165",
    sources: [{ url: "https://livetgtv.lovable.app/player/165", type: "unknown", headers: {} }],
    rawAttributes: {}
  };
  const resolved = await withLiveTgTvResponse(response, () => resolveLiveTgTvChannel(channel));
  assert.deepEqual(resolved.sources.map(source => source.type), ["dash", "hls", "progressive"]);
});
