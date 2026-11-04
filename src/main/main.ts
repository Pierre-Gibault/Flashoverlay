import { app, ipcMain, type IpcMainInvokeEvent } from "electron"
import { AppSettingsSchema, IPC } from "../shared/protocol.js"
import { RoomConnectRequestSchema, RoomConnectionStatus, RoomFlashTargetSchema, type RoomState } from "../shared/room-protocol.js"
import { createControlWindow } from "./control-window.js"
import { OverlayWindow } from "./overlay-window.js"
import { SessionController } from "./session-controller.js"
import { canRenderLocally, RoomCoordinator } from "./room-coordinator.js"
import { shouldUseX11 } from "./overlay-window-policy.js"

class IpcAccessError extends Error {
  public constructor() {
    super("Control commands are only accepted from the control window.")
  }
}

function assertControlSender(event: IpcMainInvokeEvent, controlWebContentsId: number): void {
  if (event.sender.id !== controlWebContentsId) {
    throw new IpcAccessError()
  }
}

function developmentRendererUrl(): string | undefined {
  const value = process.env["VITE_DEV_SERVER_URL"]
  return value === undefined || value.length === 0 ? undefined : value
}

if (shouldUseX11(process.platform, process.env, process.argv)) {
  app.commandLine.appendSwitch("ozone-platform", "x11")
}

void app.whenReady().then(() => {
  const rendererUrl = developmentRendererUrl()
  const controlWindow = createControlWindow(rendererUrl)
  const overlayWindow = new OverlayWindow(rendererUrl)
  let room: RoomCoordinator | null = null
  const session = new SessionController(overlayWindow, (state) => {
    if (!controlWindow.isDestroyed()) {
      controlWindow.webContents.send(IPC.stateChanged, state)
    }
  }, (settings) => {
      if (room === null || !room.requestFlash(settings)) {
        if (room === null || canRenderLocally(room.getState())) {
          session.renderFlash(settings)
        }
    }
  })
  room = new RoomCoordinator({
    publish: (state) => {
      if (state.status === RoomConnectionStatus.connected && state.role === "follower" && session.getState().status === "running") {
        session.pause()
      }
      if (!controlWindow.isDestroyed()) {
        controlWindow.webContents.send(IPC.roomStateChanged, state)
      }
    },
    renderFlash: (settings) => session.renderFlash(settings),
  })
  const controlWebContentsId = controlWindow.webContents.id
  const assertRoomControl = (): void => {
    const state = room?.getState()
    const mayControl = state !== undefined && (canRenderLocally(state) || (state.status === RoomConnectionStatus.connected && state.role === "leader"))
    if (!mayControl) {
      throw new IpcAccessError()
    }
  }
  const assertFlashControl = (): void => {
    const state = room?.getState()
    const mayControl = state !== undefined && canRenderLocally(state) || state?.status === RoomConnectionStatus.connected
    if (!mayControl) {
      throw new IpcAccessError()
    }
  }

  ipcMain.handle(IPC.getState, (event) => {
    assertControlSender(event, controlWebContentsId)
    return session.getState()
  })
  ipcMain.handle(IPC.start, (event) => {
    assertControlSender(event, controlWebContentsId)
    assertRoomControl()
    return session.start()
  })
  ipcMain.handle(IPC.pause, (event) => {
    assertControlSender(event, controlWebContentsId)
    assertRoomControl()
    return session.pause()
  })
  ipcMain.handle(IPC.resume, (event) => {
    assertControlSender(event, controlWebContentsId)
    assertRoomControl()
    return session.resume()
  })
  ipcMain.handle(IPC.trigger, (event) => {
    assertControlSender(event, controlWebContentsId)
    assertFlashControl()
    return session.trigger()
  })
  ipcMain.handle(IPC.updateSettings, (event, settings: unknown) => {
    assertControlSender(event, controlWebContentsId)
    return session.updateSettings(AppSettingsSchema.parse(settings))
  })
  ipcMain.handle(IPC.getRoomState, (event): RoomState => {
    assertControlSender(event, controlWebContentsId)
    return room?.getState() ?? {
      status: RoomConnectionStatus.disconnected,
      serverUrl: null,
      roomCode: null,
      role: null,
      memberCount: 0,
      participantId: null,
      participants: [],
      selectedTarget: null,
    }
  })
  ipcMain.handle(IPC.connectRoom, (event, request: unknown): RoomState => {
    assertControlSender(event, controlWebContentsId)
    if (room === null) {
      throw new IpcAccessError()
    }
    return room.connect(RoomConnectRequestSchema.parse(request))
  })
  ipcMain.handle(IPC.disconnectRoom, (event): RoomState => {
    assertControlSender(event, controlWebContentsId)
    if (room === null) {
      throw new IpcAccessError()
    }
    return room.disconnect()
  })
  ipcMain.handle(IPC.selectRoomTarget, (event, target: unknown): RoomState => {
    assertControlSender(event, controlWebContentsId)
    if (room === null || room.getState().status !== RoomConnectionStatus.connected) {
      throw new IpcAccessError()
    }
    const parsedTarget = RoomFlashTargetSchema.parse(target)
    if (!room.selectTarget(parsedTarget)) {
      throw new IpcAccessError()
    }
    return room.getState()
  })

  controlWindow.on("close", () => app.quit())
  app.on("before-quit", () => {
    session.dispose()
    room?.dispose()
    overlayWindow.destroy()
  })
})
