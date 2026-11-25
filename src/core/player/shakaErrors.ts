export function describeShakaError(code?: number, data?: unknown[], original?: unknown): Error {
  if (code === 6001) {
    const keySystem = typeof data?.[0] === "string" ? data[0] : "";
    return new Error("The browser could not create a supported DRM configuration for this stream (Shaka 6001)" + (keySystem ? ": " + keySystem : "") + ". Common causes are an insecure playback origin, an unsupported key system, or DRM requirements the installed browser runtime cannot satisfy. Check the player secure-context and Encrypted Media Extensions support; this is not a stream URL or ClearKey parsing error.");
  }
  if (code === 6020) {
    return new Error("This channel requires Encrypted Media Extensions (EME), which are not available in this player runtime (Shaka 6020). A compatible DRM-enabled runtime is required.");
  }
  if (code === 6000) {
    return new Error("The manifest marks this channel as encrypted, but does not identify a DRM system Shaka can use (Shaka 6000). Check the provider's manifest and DRM metadata.");
  }
  // Shaka HTTP/network errors include the response object at data[1].
  // Preserve the status so StreamEngine can refresh expired LiveTGTV URLs.
  const response = data?.[1] && typeof data[1] === "object"
    ? data[1] as { status?: unknown }
    : undefined;
  const status = Number(response?.status);
  const httpStatus = [401, 403, 410].includes(status) ? status : undefined;
  const detail = original instanceof Error ? original.message : data?.length ? data.map(String).join(", ") : "";
  const message = code ? `Shaka playback error ${code}${detail ? `: ${detail}` : ""}` : detail || "Unknown Shaka playback error.";
  return new Error(httpStatus ? `HTTP ${httpStatus}: ${message}` : message);
}
