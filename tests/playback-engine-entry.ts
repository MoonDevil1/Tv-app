import { StreamEngine } from "../src/core/player/StreamEngine";
import type { Channel } from "../src/core/types";
import { hexToBase64Url } from "../src/core/parser/clearKeyUtils";

declare global {
  interface Window {
    runStreamEngineTest: (url: string, manifestType: "hls" | "dash", encrypted?: boolean) => Promise<{ state: string; seconds: number; videoWidth?: number }>;
  }
}

window.runStreamEngineTest = async (url, manifestType, encrypted = false) => {
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
    drm: encrypted ? {
      scheme: "clearkey",
      clearKeys: {
        [hexToBase64Url("00112233445566778899aabbccddeeff")]: hexToBase64Url("ffeeddccbbaa99887766554433221100")
      }
    } : undefined,
    rawAttributes: {}
  };
  try {
    await engine.play(video, channel);
    const started = Date.now();
    while ((video.currentTime < 1.2 || (encrypted && video.videoWidth === 0)) && Date.now() - started < 10000) {
      if (state === "error") throw new Error("StreamEngine entered error state");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (state !== "playing") throw new Error("Expected playing state, received " + state);
    if (video.currentTime < 1.2) throw new Error("StreamEngine playback did not advance");
    if (encrypted && video.videoWidth !== 320) throw new Error("ClearKey playback did not decode video frames; width=" + video.videoWidth);
    const result: { state: string; seconds: number; videoWidth?: number; audioTracks?: number; subtitleTracks?: number; selectedAudio?: number; selectedSubtitle?: number } = {
      state, seconds: Number(video.currentTime.toFixed(2)), videoWidth: video.videoWidth
    };
    if (manifestType === "hls") {
      const audio = engine.getAudioOptions();
      const subtitles = engine.getSubtitleOptions();
      if (audio.length < 2) throw new Error("Expected two HLS audio tracks; found " + audio.length);
      if (subtitles.length < 1) throw new Error("Expected an HLS subtitle track");
      engine.selectAudio(audio[1].id);
      if (engine.getSelectedAudioId() !== audio[1].id) throw new Error("HLS audio track selection did not change");
      engine.selectSubtitle(subtitles[0].id);
      if (engine.getSelectedSubtitleId() !== subtitles[0].id) throw new Error("HLS subtitle selection did not change");
      let cueText = "";
      const subtitleDeadline = Date.now() + 5000;
      while (!cueText && Date.now() < subtitleDeadline) {
        for (const track of Array.from(video.textTracks)) {
          if (track.cues?.length) cueText = (track.cues[0] as VTTCue).text;
        }
        if (!cueText) await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (cueText !== "StreamEngine subtitle test") throw new Error("HLS subtitle cue was not rendered; received: " + cueText);
      result.audioTracks = audio.length;
      result.subtitleTracks = subtitles.length;
      result.selectedAudio = engine.getSelectedAudioId();
      result.selectedSubtitle = engine.getSelectedSubtitleId();
    }
    return result;
  } finally {
    await engine.destroy();
  }
};
