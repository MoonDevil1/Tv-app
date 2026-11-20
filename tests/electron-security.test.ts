import test from "node:test";
import assert from "node:assert/strict";
import { registerHeaderProxy, setActiveStreamContext } from "../electron/net/headerProxy";

test("Electron stream headers are limited to the active stream host", () => {
  let listener: ((details: { url: string; requestHeaders: Record<string, string> }, callback: (result: { requestHeaders: Record<string, string> }) => void) => void) | undefined;
  const mockSession = {
    webRequest: {
      onBeforeSendHeaders: (_filter: unknown, callback: typeof listener) => { listener = callback; }
    }
  };
  registerHeaderProxy(mockSession as never);
  assert.ok(listener);

  setActiveStreamContext({
    originUrl: "https://stream.example/live.m3u8",
    headers: {
      Authorization: "Bearer test",
      Referer: "https://provider.example/",
      Host: "attacker.example",
      "X-Test": "safe"
    }
  });

  let sameHost: Record<string, string> = {};
  listener!({ url: "https://stream.example/segment.ts", requestHeaders: { Accept: "*/*" } }, result => { sameHost = result.requestHeaders; });
  assert.equal(sameHost.Authorization, "Bearer test");
  assert.equal(sameHost.Referer, "https://provider.example/");
  assert.equal(sameHost["X-Test"], "safe");
  assert.equal(sameHost.Host, undefined);

  let otherHost: Record<string, string> = {};
  listener!({ url: "https://unrelated.example/track.m3u8", requestHeaders: { Accept: "video/*" } }, result => { otherHost = result.requestHeaders; });
  assert.deepEqual(otherHost, { Accept: "video/*" });

  setActiveStreamContext(null);
  let cleared: Record<string, string> = {};
  listener!({ url: "https://stream.example/segment.ts", requestHeaders: { Accept: "*/*" } }, result => { cleared = result.requestHeaders; });
  assert.deepEqual(cleared, { Accept: "*/*" });
});

test("Electron stream context rejects non-HTTP origins and sanitizes header injection", () => {
  assert.throws(() => setActiveStreamContext({ originUrl: "file:///tmp/video.m3u8", headers: {} }), /HTTP or HTTPS/);
  setActiveStreamContext({
    originUrl: "https://stream.example/live.m3u8",
    headers: { ["Bad" + String.fromCharCode(13, 10) + "Header"]: "x", "X-Unsafe": "safe" + String.fromCharCode(13, 10) + "Injected: yes", Cookie: "sid=1" }
  });
  let sanitized: Record<string, string> = {};
  const mockSession = {
    webRequest: {
      onBeforeSendHeaders: (_filter: unknown, callback: (details: { url: string; requestHeaders: Record<string, string> }, done: (result: { requestHeaders: Record<string, string> }) => void) => void) => {
        callback({ url: "https://stream.example/segment.ts", requestHeaders: {} }, result => { sanitized = result.requestHeaders; });
      }
    }
  };
  registerHeaderProxy(mockSession as never);
  assert.deepEqual(sanitized, { Cookie: "sid=1" });
  setActiveStreamContext(null);
});


import { fetchRemoteText } from "../electron/net/remoteFetch";

test("remote fetch accepts HTTP(S), follows safe redirects and strips credentials across origins", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const result = await fetchRemoteText("https://provider.example/list.m3u", {
    headers: { Authorization: "Bearer private", Referer: "https://provider.example/" }
  }, async (url, init) => {
    const headers = new Headers(init.headers);
    requests.push({ url, authorization: headers.get("authorization") });
    if (requests.length === 1) return new Response(null, { status: 302, headers: { location: "https://cdn.example/final.m3u" } });
    return new Response("#EXTM3U\\n#EXTINF:-1,News\\nhttps://cdn.example/news.m3u8", { status: 200 });
  });
  assert.equal(result.url, "https://cdn.example/final.m3u");
  assert.match(result.text, /News/);
  assert.equal(requests[0].authorization, "Bearer private");
  assert.equal(requests[1].authorization, null);
});

test("remote fetch rejects unsafe schemes, excessive redirects and oversized responses", async () => {
  await assert.rejects(fetchRemoteText("file:///etc/passwd"), /HTTP or HTTPS/);
  await assert.rejects(fetchRemoteText("https://provider.example/start", {}, async () =>
    new Response(null, { status: 302, headers: { location: "file:///etc/passwd" } })
  ), /HTTP or HTTPS/);
  await assert.rejects(fetchRemoteText("https://provider.example/large", { maxBytes: 4 }, async () =>
    new Response("12345", { status: 200 })
  ), /too large/);
});

test("remote fetch enforces redirect count and sanitizes dangerous headers", async () => {
  let calls = 0;
  await assert.rejects(fetchRemoteText("https://provider.example/0", {
    headers: { Host: "evil.example", ["X-Bad" + String.fromCharCode(13, 10) + "Injected"]: "x", "X-Safe": "ok" }
  }, async (_url, init) => {
    calls++;
    const headers = new Headers(init.headers);
    assert.equal(headers.get("host"), null);
    assert.equal(headers.get("x-safe"), "ok");
    return new Response(null, { status: 302, headers: { location: `/next-${calls}` } });
  }), /too many times/);
  assert.equal(calls, 6);
});
