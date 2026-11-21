import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isAllowedNavigation } from "./security/navigation";
import { writeFileSync, appendFile, mkdir, stat, rename } from "node:fs/promises";
import { registerHeaderProxy, setActiveStreamContext, type StreamRequestContext } from "./net/headerProxy";
import { registerAutoUpdates } from "./updater";
import { fetchRemoteText } from "./net/remoteFetch";


const MAX_DIAGNOSTIC_BYTES = 2 * 1024 * 1024;
function sanitizeDiagnostic(input: unknown): string {
  let value = JSON.stringify(input ?? {});
  value = value.slice(0, 12000)
    .replace(/https?:\\/\\/[^\\s"'<>]+/gi, "[redacted-url]")
    .replace(/(authorization|cookie|token|secret|key)\\s*[:=]\\s*[^,\\s}]+/gi, "$1=[redacted]");
  return value;
}
async function saveDiagnostic(input: unknown): Promise<void> {
  const folder = join(app.getPath("userData"), "logs");
  const file = join(folder, "diagnostics.log");
  await mkdir(folder, { recursive: true });
  try {
    const info = await stat(file);
    if (info.size > MAX_DIAGNOSTIC_BYTES) await rename(file, file + ".1").catch(() => undefined);
  } catch { /* First diagnostic entry. */ }
  await appendFile(file, JSON.stringify({ timestamp: new Date().toISOString(), report: sanitizeDiagnostic(input) }) + "\\n", "utf8");
}

let mainWindow: BrowserWindow | null = null;
const remoteRequests = new Map<string, AbortController>();
const smokeTest = process.argv.includes("--smoke-test");

function finishSmokeTest(ok: boolean, detail = ""): void {
  const marker = join(app.getPath("temp"), `tg-iptv-smoke-${process.pid}.txt`);
  try { writeFileSync(marker, ok ? "ok" : `error: ${detail}`); }
  finally { app.exit(ok ? 0 : 1); }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#090b10",
    title: "TG IPTV",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("render-process-gone", (_event, details) => { void saveDiagnostic({ type: "renderer-crash", details }); });
  if (smokeTest) {
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
      if (isMainFrame) finishSmokeTest(false, `Renderer load failed (${errorCode}): ${errorDescription}`);
    });
    mainWindow.webContents.on("did-finish-load", () => {
      void mainWindow?.webContents.executeJavaScript(
        "new Promise(resolve => { const start = Date.now(); const check = () => { const ready = Boolean(document.getElementById('root')?.childElementCount && window.tvApp && typeof window.tvApp.platform === 'function' && typeof window.tvApp.fetchRemoteText === 'function'); if (ready || Date.now() - start > 10000) resolve(ready); else setTimeout(check, 100); }; check(); })"
      ).then((ready: boolean) => finishSmokeTest(ready, "Renderer root or preload bridge is unavailable."))
        .catch((error: unknown) => finishSmokeTest(false, error instanceof Error ? error.message : String(error)));
    });
  }
  const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(join(__dirname, "../renderer/index.html")).href;
  const blockExternalNavigation = (event: Electron.Event, url: string) => {
    if (!isAllowedNavigation(url, rendererUrl)) event.preventDefault();
  };
  mainWindow.webContents.on("will-navigate", blockExternalNavigation);
  mainWindow.webContents.on("will-redirect", blockExternalNavigation);

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
  mainWindow.on("closed", () => { mainWindow = null; });
}

process.on("uncaughtExceptionMonitor", error => { void saveDiagnostic({ type: "main-process-exception", name: error.name, message: error.message, stack: error.stack }); });
process.on("unhandledRejection", reason => { void saveDiagnostic({ type: "main-process-unhandled-rejection", message: reason instanceof Error ? reason.message : String(reason) }); });

app.whenReady().then(() => {
  registerHeaderProxy(session.defaultSession);
  registerAutoUpdates();
  ipcMain.handle("stream:set-request-context", (event, context: StreamRequestContext | null) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error("Stream context is only available to the main application frame.");
    setActiveStreamContext(context);
    return { active: context !== null };
  });
  ipcMain.handle("app:get-platform", () => process.platform);
  ipcMain.handle("app:report-diagnostic", async (event, report: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error("Diagnostics are only accepted from the main application frame.");
    if (!report || typeof report !== "object" || Array.isArray(report)) throw new TypeError("Invalid diagnostic report.");
    await saveDiagnostic(report);
    return { saved: true };
  });
  ipcMain.handle("app:open-feedback-report", async (event, report: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error("Feedback is only available to the main application frame.");
    const body = "TG IPTV playback report\\n\\n" + sanitizeDiagnostic(report);
    const url = "https://github.com/MoonDevil1/Tv-app/issues/new?title=" + encodeURIComponent("Playback problem report") + "&body=" + encodeURIComponent(body);
    await shell.openExternal(url);
    return { opened: true };
  });
  ipcMain.handle("net:fetch-remote-text", async (event, input: unknown, headers?: unknown, requestId?: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error("Remote downloads are only available to the main application frame.");
    if (typeof input !== "string" || input.length > 8192) throw new TypeError("Invalid remote URL.");
    if (headers !== undefined && (typeof headers !== "object" || headers === null || Array.isArray(headers))) {
      throw new TypeError("Invalid remote request headers.");
    }
    if (headers && Object.entries(headers).length > 30) throw new TypeError("Too many remote request headers.");
    if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new TypeError("Invalid remote request ID.");
    if (remoteRequests.has(requestId)) throw new Error("Duplicate remote request ID.");
    const controller = new AbortController();
    remoteRequests.set(requestId, controller);
    try {
      return await fetchRemoteText(input, { headers: headers as Record<string, string> | undefined, signal: controller.signal });
    } finally {
      if (remoteRequests.get(requestId) === controller) remoteRequests.delete(requestId);
    }
  });
  ipcMain.handle("net:cancel-remote-text", (event, requestId: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error("Remote cancellation is only available to the main application frame.");
    if (typeof requestId !== "string") return { cancelled: false };
    const controller = remoteRequests.get(requestId);
    if (!controller) return { cancelled: false };
    controller.abort();
    return { cancelled: true };
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
