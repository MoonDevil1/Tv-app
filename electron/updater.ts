import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";

export type UpdateState = {
  status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "unsupported";
  version?: string;
  percent?: number;
  message?: string;
};

let registered = false;
let latestState: UpdateState = { status: "idle", message: "Update check has not started." };

function publish(state: UpdateState): void {
  latestState = state;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("app:update-state", state);
  }
}

function canAutoUpdate(): boolean {\n  return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR;\n}\n\nfunction errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerAutoUpdates(): void {
  if (registered) return;
  registered = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => publish({ status: "checking", message: "Checking GitHub releases…" }));
  autoUpdater.on("update-available", info => publish({
    status: "available",
    version: info.version,
    message: `Version ${info.version} is available.`
  }));
  autoUpdater.on("update-not-available", info => publish({
    status: "not-available",
    version: info.version,
    message: "You are using the latest version."
  }));
  autoUpdater.on("download-progress", progress => publish({
    status: "downloading",
    percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
    message: `Downloading update… ${Math.round(progress.percent)}%`
  }));
  autoUpdater.on("update-downloaded", info => publish({
    status: "downloaded",
    version: info.version,
    message: `Version ${info.version} is ready to install.`
  }));
  autoUpdater.on("error", error => publish({ status: "error", message: errorMessage(error) }));

  ipcMain.handle("app:update-state", () => latestState);
  ipcMain.handle("app:update-check", async () => {
    if (!app.isPackaged) {
      publish({ status: "unsupported", message: process.env.PORTABLE_EXECUTABLE_DIR ? "Automatic updates are unavailable in the portable Windows build. Use the installer build." : "Updates are available in an installed desktop build." });
      return { accepted: false };
    }
    try {
      publish({ status: "checking", message: "Checking GitHub releases…" });
      await autoUpdater.checkForUpdates();
      return { accepted: true };
    } catch (error) {
      publish({ status: "error", message: errorMessage(error) });
      return { accepted: false };
    }
  });
  ipcMain.handle("app:update-download", async () => {
    if (!canAutoUpdate()) return { accepted: false };
    try {
      await autoUpdater.downloadUpdate();
      return { accepted: true };
    } catch (error) {
      publish({ status: "error", message: errorMessage(error) });
      return { accepted: false };
    }
  });
  ipcMain.handle("app:update-install", () => {
    if (!canAutoUpdate() || latestState.status !== "downloaded") return { accepted: false };
    autoUpdater.quitAndInstall();
    return { accepted: true };
  });

  if (canAutoUpdate()) {
    setTimeout(() => {
      if (app.isReady()) void autoUpdater.checkForUpdates().catch(error => {
        publish({ status: "error", message: errorMessage(error) });
      });
    }, 12000);
  } else {
    publish({ status: "unsupported", message: "Updates are available in an installed desktop build." });
  }
}
