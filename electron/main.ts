import { app, BrowserWindow, ipcMain, session } from "electron";
import { join } from "node:path";
import { registerHeaderProxy, setActiveStreamContext, type StreamRequestContext } from "./net/headerProxy";
import { registerAutoUpdates } from "./updater";
import { fetchRemoteText } from "./net/remoteFetch";

let mainWindow: BrowserWindow | null = null;

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
