export function describeShakaError(code?: number, data?: unknown[], original?: unknown): Error {
  if (code === 6001) {
    return new Error("This channel is DRM-protected, but this Windows player runtime cannot access the required DRM key system (Shaka 6001). The required Widevine/PlayReady component may be unavailable, or the playback origin may not meet the browser's secure-origin requirements. Try a supported browser/runtime or a clear (non-DRM) stream. DRM protection cannot be bypassed.");
  }
  if (code === 6020) {
    return new Error("This channel requires Encrypted Media Extensions (EME), which are not available in this player runtime (Shaka 6020). A compatible DRM-enabled runtime is required.");
  }
  if (code === 6000) {
    return new Error("The manifest marks this channel as encrypted, but does not identify a DRM system Shaka can use (Shaka 6000). Check the provider's manifest and DRM metadata.");
  }
  const detail = original instanceof Error ? original.message : data?.length ? data.map(String).join(", ") : "";
  return new Error(code ? `Shaka playback error ${code}${detail ? `: ${detail}` : ""}` : detail || "Unknown Shaka playback error.");
}
