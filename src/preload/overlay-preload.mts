import { contextBridge, ipcRenderer } from "electron"
import type { IpcRendererEvent } from "electron"
import { IPC, type FlashEvent, type OverlayApi } from "../shared/protocol.js"

const api: OverlayApi = {
  onFlash: (callback) => {
    const listener = (_event: IpcRendererEvent, event: FlashEvent) => callback(event)
    ipcRenderer.on(IPC.flash, listener)
    return () => ipcRenderer.removeListener(IPC.flash, listener)
  },
}

contextBridge.exposeInMainWorld("flashOverlayScene", api)
