import { app, BrowserWindow, ipcMain, session } from "electron";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { registerHeaderProxy, setActiveStreamContext, type StreamRequestContext } from "./net/headerProxy";
import { registerAutoUpdates } from "./updater";
import { fetchRemoteText } from "./net/remoteFetch";

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
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (current && new URL(url).origin !== new URL(current).origin) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  registerHeaderProxy(session.defaultSession);
  registerAutoUpdates();
  ipcMain.handle("stream:set-request-context", (_event, context: StreamRequestContext | null) => {
    setActiveStreamContext(context);
    return { active: context !== null };
  });
  ipcMain.handle("app:get-platform", () => process.platform);
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
