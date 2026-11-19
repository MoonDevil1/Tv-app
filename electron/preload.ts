import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { StreamRequestContext } from "./net/headerProxy";

contextBridge.exposeInMainWorld("tvApp", {
  platform: (): Promise<string> => ipcRenderer.invoke("app:get-platform"),
  setStreamRequestContext: (context: StreamRequestContext | null): Promise<{ active: boolean }> =>
    ipcRenderer.invoke("stream:set-request-context", context),
  getUpdateState: () => ipcRenderer.invoke("app:update-state"),
  checkForUpdates: () => ipcRenderer.invoke("app:update-check"),
  downloadUpdate: () => ipcRenderer.invoke("app:update-download"),
  installUpdate: () => ipcRenderer.invoke("app:update-install"),
  onUpdateState: (listener: (state: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, state: unknown) => listener(state);
    ipcRenderer.on("app:update-state", handler);
    return () => ipcRenderer.removeListener("app:update-state", handler);
  }
});
