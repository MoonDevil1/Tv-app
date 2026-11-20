import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { StreamRequestContext } from "./net/headerProxy";

contextBridge.exposeInMainWorld("tvApp", {
  platform: (): Promise<string> => ipcRenderer.invoke("app:get-platform"),
  fetchRemoteText: (url: string, headers?: Record<string, string>, requestId = globalThis.crypto.randomUUID()): Promise<{ text: string; url: string; status: number }> =>
    ipcRenderer.invoke("net:fetch-remote-text", url, headers, requestId),
  cancelRemoteText: (requestId: string): Promise<{ cancelled: boolean }> =>
    ipcRenderer.invoke("net:cancel-remote-text", requestId),
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
