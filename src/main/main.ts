import { app, ipcMain, type IpcMainInvokeEvent } from "electron"
import { AppSettingsSchema, IPC } from "../shared/protocol.js"
import { createControlWindow } from "./control-window.js"
import { OverlayWindow } from "./overlay-window.js"
import { SessionController } from "./session-controller.js"

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

void app.whenReady().then(() => {
  const rendererUrl = developmentRendererUrl()
  const controlWindow = createControlWindow(rendererUrl)
  const overlayWindow = new OverlayWindow(rendererUrl)
  const session = new SessionController(overlayWindow, (state) => {
    if (!controlWindow.isDestroyed()) {
      controlWindow.webContents.send(IPC.stateChanged, state)
    }
  })
  const controlWebContentsId = controlWindow.webContents.id

  ipcMain.handle(IPC.getState, (event) => {
    assertControlSender(event, controlWebContentsId)
    return session.getState()
  })
  ipcMain.handle(IPC.start, (event) => {
    assertControlSender(event, controlWebContentsId)
    return session.start()
  })
  ipcMain.handle(IPC.pause, (event) => {
    assertControlSender(event, controlWebContentsId)
    return session.pause()
  })
  ipcMain.handle(IPC.resume, (event) => {
    assertControlSender(event, controlWebContentsId)
    return session.resume()
  })
  ipcMain.handle(IPC.trigger, (event) => {
    assertControlSender(event, controlWebContentsId)
    return session.trigger()
  })
  ipcMain.handle(IPC.updateSettings, (event, settings: unknown) => {
    assertControlSender(event, controlWebContentsId)
    return session.updateSettings(AppSettingsSchema.parse(settings))
  })

  controlWindow.on("close", () => app.quit())
  app.on("before-quit", () => {
    session.dispose()
    overlayWindow.destroy()
  })
})
