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
