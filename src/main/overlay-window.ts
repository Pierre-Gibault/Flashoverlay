import { BrowserWindow, screen, type Display, type Event } from "electron"
import { fileURLToPath } from "node:url"
import { createFlashQueue, type FlashQueue } from "../shared/flash-delivery.js"
import { IPC, type AppSettings, type FlashEvent } from "../shared/protocol.js"

type OverlayEntry = {
  readonly window: BrowserWindow
  readonly flashQueue: FlashQueue<FlashEvent>
}

export class OverlayWindow {
  private readonly windows = new Map<number, OverlayEntry>()
  private readonly rendererUrl: string | undefined
  private readonly onDisplayAdded = (_event: Event, display: Display): void => this.createWindow(display)
  private readonly onDisplayRemoved = (_event: Event, display: Display): void => this.removeWindow(display.id)
  private readonly onDisplayMetricsChanged = (_event: Event, display: Display): void => this.updateBounds(display)

  public constructor(rendererUrl: string | undefined) {
    this.rendererUrl = rendererUrl
    for (const display of screen.getAllDisplays()) {
      this.createWindow(display)
    }

    screen.on("display-added", this.onDisplayAdded)
    screen.on("display-removed", this.onDisplayRemoved)
    screen.on("display-metrics-changed", this.onDisplayMetricsChanged)
  }

  public flash(settings: AppSettings): void {
    const entries = [...this.windows.entries()]
    const grenadeDisplayIndex = Math.floor(Math.random() * entries.length)

    entries.forEach(([_displayId, { flashQueue }], index) => {
      flashQueue.send({ settings, showGrenade: index === grenadeDisplayIndex })
    })
  }

  public destroy(): void {
    screen.removeListener("display-added", this.onDisplayAdded)
    screen.removeListener("display-removed", this.onDisplayRemoved)
    screen.removeListener("display-metrics-changed", this.onDisplayMetricsChanged)
    for (const { window } of this.windows.values()) {
      window.destroy()
    }
    this.windows.clear()
  }

  private createWindow(display: Display): void {
    if (this.windows.has(display.id)) {
      return
    }

    const window = new BrowserWindow({
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      show: false,
      hasShadow: false,
      webPreferences: {
        preload: fileURLToPath(new URL("../preload/overlay-preload.js", import.meta.url)),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    window.setAlwaysOnTop(true, "screen-saver")
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.setIgnoreMouseEvents(true)
    window.setBounds(display.bounds)
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    window.webContents.on("will-navigate", (event) => event.preventDefault())
    const flashQueue = createFlashQueue<FlashEvent>((event) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC.flash, event)
      }
    })
    window.webContents.once("did-finish-load", () => {
      flashQueue.markReady()
      window.show()
    })
    this.windows.set(display.id, { window, flashQueue })

    if (this.rendererUrl === undefined) {
      void window.loadFile(fileURLToPath(new URL("../../dist/overlay.html", import.meta.url)))
      return
    }

    void window.loadURL(`${this.rendererUrl}/overlay.html`)
  }

  private updateBounds(display: Display): void {
    const entry = this.windows.get(display.id)
    if (entry !== undefined && !entry.window.isDestroyed()) {
      entry.window.setBounds(display.bounds)
    }
  }

  private removeWindow(displayId: number): void {
    const entry = this.windows.get(displayId)
    if (entry === undefined) {
      return
    }

    entry.window.destroy()
    this.windows.delete(displayId)
  }
}
