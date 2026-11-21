export function describeShakaError(code?: number, data?: unknown[], original?: unknown): Error {
  if (code === 6001) {
    const keySystem = typeof data?.[0] === "string" ? data[0] : "";
    return new Error("The browser could not create a supported DRM configuration for this stream (Shaka 6001)" + (keySystem ? ": " + keySystem : "") + ". Widevine requires a compatible CDM in the installed Electron/Chromium runtime; the app cannot bundle Google's proprietary CDM. Also check the secure playback context and the device's DRM capabilities.");
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
