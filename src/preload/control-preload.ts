import { contextBridge, ipcRenderer } from "electron"
import type { IpcRendererEvent } from "electron"
import { IPC, type AppSettings, type FlashOverlayApi, type SessionState } from "../shared/protocol.js"

async function invokeState(channel: string, settings?: AppSettings): Promise<SessionState> {
  const state: unknown = settings === undefined ? await ipcRenderer.invoke(channel) : await ipcRenderer.invoke(channel, settings)
  return state as SessionState
}

const api: FlashOverlayApi = {
  getState: () => invokeState(IPC.getState),
  start: () => invokeState(IPC.start),
  pause: () => invokeState(IPC.pause),
  resume: () => invokeState(IPC.resume),
  trigger: () => invokeState(IPC.trigger),
  updateSettings: (settings: AppSettings) => invokeState(IPC.updateSettings, settings),
  onStateChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, state: unknown) => callback(state as SessionState)
    ipcRenderer.on(IPC.stateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.stateChanged, listener)
  },
}

contextBridge.exposeInMainWorld("flashOverlay", api)
