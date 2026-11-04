import { contextBridge, ipcRenderer } from "electron"
import type { IpcRendererEvent } from "electron"
import { IPC, type AppSettings, type FlashOverlayApi, type SessionState } from "../shared/protocol.js"
import type { RoomConnectRequest, RoomFlashTarget, RoomState } from "../shared/room-protocol.js"

async function invokeState(channel: string, settings?: AppSettings): Promise<SessionState> {
  const state: SessionState = settings === undefined ? await ipcRenderer.invoke(channel) : await ipcRenderer.invoke(channel, settings)
  return state
}

async function invokeRoomState(channel: string, request?: RoomConnectRequest): Promise<RoomState> {
  const state: RoomState = request === undefined ? await ipcRenderer.invoke(channel) : await ipcRenderer.invoke(channel, request)
  return state
}

async function invokeRoomTarget(channel: string, target: RoomFlashTarget): Promise<RoomState> {
  const state: RoomState = await ipcRenderer.invoke(channel, target)
  return state
}

const api: FlashOverlayApi = {
  getState: () => invokeState(IPC.getState),
  start: () => invokeState(IPC.start),
  pause: () => invokeState(IPC.pause),
  resume: () => invokeState(IPC.resume),
  trigger: () => invokeState(IPC.trigger),
  updateSettings: (settings: AppSettings) => invokeState(IPC.updateSettings, settings),
  getRoomState: () => invokeRoomState(IPC.getRoomState),
  connectRoom: (request: RoomConnectRequest) => invokeRoomState(IPC.connectRoom, request),
  disconnectRoom: () => invokeRoomState(IPC.disconnectRoom),
  selectRoomTarget: (target: RoomFlashTarget) => invokeRoomTarget(IPC.selectRoomTarget, target),
  onStateChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, state: SessionState) => callback(state)
    ipcRenderer.on(IPC.stateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.stateChanged, listener)
  },
  onRoomStateChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, state: RoomState) => callback(state)
    ipcRenderer.on(IPC.roomStateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.roomStateChanged, listener)
  },
}

contextBridge.exposeInMainWorld("flashOverlay", api)
