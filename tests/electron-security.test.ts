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
      "X-Test": "safe",
      Cookie: "session=abc",
      "User-Agent": "IPTV Player"
    }
  });

  let sameHost: Record<string, string> = {};
  listener!({ url: "https://stream.example/segment.ts", requestHeaders: { Accept: "*/*" } }, result => { sameHost = result.requestHeaders; });
  assert.equal(sameHost.Authorization, "Bearer test");
  assert.equal(sameHost.Referer, "https://provider.example/");
  assert.equal(sameHost["X-Test"], "safe");
  assert.equal(sameHost.Cookie, "session=abc");
  assert.equal(sameHost["User-Agent"], "IPTV Player");
  assert.equal(sameHost.Host, undefined);

  let otherHost: Record<string, string> = {};
  listener!({ url: "https://unrelated.example/track.m3u8", requestHeaders: { Accept: "video/*" } }, result => { otherHost = result.requestHeaders; });
  assert.deepEqual(otherHost, { Accept: "video/*" });

  let otherPort: Record<string, string> = {};
  listener!({ url: "https://stream.example:8443/segment.ts", requestHeaders: { Accept: "*/*" } }, result => { otherPort = result.requestHeaders; });
  assert.deepEqual(otherPort, { Accept: "*/*" });

  let downgraded: Record<string, string> = {};
  listener!({ url: "http://stream.example/segment.ts", requestHeaders: { Accept: "*/*" } }, result => { downgraded = result.requestHeaders; });
  assert.deepEqual(downgraded, { Accept: "*/*" });

  setActiveStreamContext(null);
  let cleared: Record<string, string> = {};
  listener!({ url: "https://stream.example/segment.ts", requestHeaders: { Accept: "*/*" } }, result => { cleared = result.requestHeaders; });
  assert.deepEqual(cleared, { Accept: "*/*" });
});

test("Electron adds CORS response headers only for the active stream origin", () => {
  let beforeSend: ((details: { url: string; requestHeaders: Record<string, string> }, callback: (result: { requestHeaders: Record<string, string> }) => void) => void) | undefined;
  let headersReceived: ((details: { url: string; responseHeaders?: Record<string, string[]> }, callback: (result: { responseHeaders?: Record<string, string[]> }) => void) => void) | undefined;
  const mockSession = {
    webRequest: {
      onBeforeSendHeaders: (_filter: unknown, callback: typeof beforeSend) => { beforeSend = callback; },
      onHeadersReceived: (_filter: unknown, callback: typeof headersReceived) => { headersReceived = callback; }
    }
  };
  registerHeaderProxy(mockSession as never);
  assert.ok(headersReceived);
  setActiveStreamContext({ originUrl: "https://stream.example/live.mpd", headers: { Cookie: "sid=secret" } });

  let streamResponse: Record<string, string[]> = {};
  headersReceived!({ url: "https://stream.example/live.mpd", responseHeaders: { "Content-Type": ["application/dash+xml"] } }, result => {
    streamResponse = result.responseHeaders ?? {};
  });
  assert.deepEqual(streamResponse["Access-Control-Allow-Origin"], ["*"]);
  assert.deepEqual(streamResponse["Access-Control-Allow-Methods"], ["GET, HEAD, OPTIONS"]);
  assert.match(streamResponse["Access-Control-Allow-Headers"]?.[0] ?? "", /Authorization/);
  assert.match(streamResponse["Access-Control-Expose-Headers"]?.[0] ?? "", /Content-Range/);
  assert.deepEqual(streamResponse["Content-Type"], ["application/dash+xml"]);

  let unrelatedResponse: Record<string, string[]> = {};
  headersReceived!({ url: "https://unrelated.example/manifest.mpd", responseHeaders: { "Content-Type": ["application/dash+xml"] } }, result => {
    unrelatedResponse = result.responseHeaders ?? {};
  });
  assert.deepEqual(unrelatedResponse, { "Content-Type": ["application/dash+xml"] });
  setActiveStreamContext(null);
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
import { isAllowedNavigation } from "../electron/security/navigation";

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


test("remote fetch propagates caller cancellation and reports AbortError", async () => {
  const controller = new AbortController();
  let started = false;
  const pending = fetchRemoteText("https://provider.example/slow", { signal: controller.signal }, async (_url, init) => {
    started = true;
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started, true);
  controller.abort();
  await assert.rejects(pending, error => error instanceof Error && error.name === "AbortError");
});


test("navigation policy blocks arbitrary file URLs and external origins", () => {
  const renderer = "file:///opt/tg-iptv/renderer/index.html";
  assert.equal(isAllowedNavigation("file:///opt/tg-iptv/renderer/index.html#settings", renderer), true);
  assert.equal(isAllowedNavigation("file:///etc/passwd", renderer), false);
  assert.equal(isAllowedNavigation("https://attacker.example/", renderer), false);
  assert.equal(isAllowedNavigation("http://127.0.0.1:5173/settings", "http://127.0.0.1:5173/"), true);
  assert.equal(isAllowedNavigation("http://127.0.0.1:5174/", "http://127.0.0.1:5173/"), false);
});
