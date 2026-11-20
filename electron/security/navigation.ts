export function isAllowedNavigation(targetUrl: string, rendererUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const renderer = new URL(rendererUrl);
    if (renderer.protocol === "file:") {
      return target.protocol === "file:" && target.host === renderer.host && target.pathname === renderer.pathname;
    }
    return target.origin === renderer.origin;
  } catch {
    return false;
  }
}