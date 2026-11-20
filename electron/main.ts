import { app, BrowserWindow, ipcMain, session } from "electron";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { registerHeaderProxy, setActiveStreamContext, type StreamRequestContext } from "./net/headerProxy";
import { registerAutoUpdates } from "./updater";
import { fetchRemoteText } from "./net/remoteFetch";

let mainWindow: BrowserWindow | null = null;
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
      preload: join(__dirname, "../preload/index.js"),
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
        "Boolean(document.getElementById('root') && window.tvApp && typeof window.tvApp.platform === 'function' && typeof window.tvApp.fetchRemoteText === 'function')"
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
  ipcMain.handle("net:fetch-remote-text", async (event, input: unknown, headers?: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error("Remote downloads are only available to the main application frame.");
    if (typeof input !== "string" || input.length > 8192) throw new TypeError("Invalid remote URL.");
    if (headers !== undefined && (typeof headers !== "object" || headers === null || Array.isArray(headers))) {
      throw new TypeError("Invalid remote request headers.");
    }
    if (headers && Object.entries(headers).length > 30) throw new TypeError("Too many remote request headers.");
    return fetchRemoteText(input, { headers: headers as Record<string, string> | undefined });
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
