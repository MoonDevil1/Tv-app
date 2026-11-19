import { contextBridge, ipcRenderer } from "electron";
import type { StreamRequestContext } from "./net/headerProxy";

contextBridge.exposeInMainWorld("tvApp", {
  platform: (): Promise<string> => ipcRenderer.invoke("app:get-platform"),
  setStreamRequestContext: (context: StreamRequestContext | null): Promise<{ active: boolean }> =>
    ipcRenderer.invoke("stream:set-request-context", context)
});
