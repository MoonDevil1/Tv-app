import { StreamEngine } from "../src/core/player/StreamEngine";
import type { Channel } from "../src/core/types";

declare global {
  interface Window {
    runStreamEngineTest: (url: string, manifestType: "hls" | "dash") => Promise<{ state: string; seconds: number }>;
  }
}

window.runStreamEngineTest = async (url, manifestType) => {
  const video = document.querySelector("video");
  if (!video) throw new Error("Test video element is missing");
  let state = "idle";
  const engine = new StreamEngine({ onState: next => { state = next; } });
  const channel: Channel = {
    id: "ci-" + manifestType,
    name: "CI " + manifestType.toUpperCase(),
    url,
    group: "CI",
    headers: {},
    manifestType,
    rawAttributes: {}
  };
  try {
    await engine.play(video, channel);
    const started = Date.now();
    while (video.currentTime < 1.2 && Date.now() - started < 10000) {
      if (state === "error") throw new Error("StreamEngine entered error state");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (state !== "playing") throw new Error("Expected playing state, received " + state);
    if (video.currentTime < 1.2) throw new Error("StreamEngine playback did not advance");
    return { state, seconds: Number(video.currentTime.toFixed(2)) };
  } finally {
    await engine.destroy();
  }
};
