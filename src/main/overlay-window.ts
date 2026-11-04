import { BrowserWindow, screen, type BrowserWindowConstructorOptions, type Event } from "electron"
import { fileURLToPath } from "node:url"
import { createFlashQueue, type FlashQueue } from "../shared/flash-delivery.js"
import { FLASH_SEQUENCE_MS } from "../shared/flash-timing.js"
import { IPC, type AppSettings, type FlashEvent } from "../shared/protocol.js"
import { overlayBoundsFor, type DisplayWithBounds } from "./overlay-display-bounds.js"
import { applyOverlayWindowPolicy } from "./overlay-window-policy.js"

export type { OverlayBounds } from "./overlay-display-bounds.js"

type DisplayEventName = "display-removed" | "display-metrics-changed"
type DisplayEventListener = (event: Event, display: OverlayDisplay) => void

export type OverlayDisplay = DisplayWithBounds & {
  readonly id: number
}

type OverlayWebContents = {
  readonly send: (channel: string, event: FlashEvent) => void
  readonly once: (event: "did-finish-load", listener: () => void) => void
  readonly on: (event: "will-navigate", listener: (event: { readonly preventDefault: () => void }) => void) => void
  readonly setWindowOpenHandler: (handler: () => { readonly action: "deny" }) => void
}

export type OverlayNativeWindow = {
  readonly webContents: OverlayWebContents
  readonly setAlwaysOnTop: (enabled: boolean, level?: "screen-saver") => void
  readonly setVisibleOnAllWorkspaces: (visible: boolean, options: { readonly visibleOnFullScreen: boolean }) => void
  readonly setIgnoreMouseEvents: (ignore: boolean) => void
  readonly setBounds: (bounds: DisplayWithBounds["bounds"]) => void
  readonly show: () => void
  readonly destroy: () => void
  readonly isDestroyed: () => boolean
  readonly loadFile: (filePath: string) => Promise<void>
  readonly loadURL: (url: string) => Promise<void>
}

export type OverlayWindowDependencies = {
  readonly getAllDisplays: () => readonly OverlayDisplay[]
  readonly createWindow: (options: BrowserWindowConstructorOptions) => OverlayNativeWindow
  readonly onDisplayEvent: (event: DisplayEventName, listener: DisplayEventListener) => void
  readonly removeDisplayEventListener: (event: DisplayEventName, listener: DisplayEventListener) => void
  readonly platform: NodeJS.Platform
  readonly randomUnit: () => number
}

type OverlayEntry = {
  readonly window: OverlayNativeWindow
  readonly flashQueue: FlashQueue<FlashEvent>
}

const electronDependencies: OverlayWindowDependencies = {
  getAllDisplays: () => screen.getAllDisplays(),
  createWindow: (options) => new BrowserWindow(options),
  onDisplayEvent: (event, listener) => {
    switch (event) {
      case "display-removed":
        screen.on("display-removed", listener)
        return
      case "display-metrics-changed":
        screen.on("display-metrics-changed", listener)
        return
    }
  },
  removeDisplayEventListener: (event, listener) => {
    switch (event) {
      case "display-removed":
        screen.removeListener("display-removed", listener)
        return
      case "display-metrics-changed":
        screen.removeListener("display-metrics-changed", listener)
        return
    }
  },
  platform: process.platform,
  randomUnit: Math.random,
}

export class OverlayWindow {
  private readonly windows = new Map<number, OverlayEntry>()
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null
  private trackingDisplays = false
  private destroyed = false
  private readonly onDisplayRemoved: DisplayEventListener = (_event, display): void => this.removeWindow(display.id)
  private readonly onDisplayMetricsChanged: DisplayEventListener = (_event, display): void => this.updateBounds(display)

  public constructor(
    private readonly rendererUrl: string | undefined,
    private readonly dependencies: OverlayWindowDependencies = electronDependencies,
  ) {}

  public flash(settings: AppSettings): void {
    if (this.destroyed) {
      return
    }

    this.cleanup()
    const displays = this.dependencies.getAllDisplays()
    if (displays.length === 0) {
      return
    }

    const grenadeDisplayIndex = Math.floor(this.dependencies.randomUnit() * displays.length)
    this.startDisplayTracking()
    displays.forEach((display, index) => {
      this.createWindow(display, { settings, showGrenade: index === grenadeDisplayIndex })
    })
    this.cleanupTimer = setTimeout(() => this.cleanup(), FLASH_SEQUENCE_MS)
  }

  public destroy(): void {
    this.destroyed = true
    this.cleanup()
  }

  private createWindow(display: OverlayDisplay, event: FlashEvent): void {
    const bounds = overlayBoundsFor(display)
    const window = this.dependencies.createWindow({
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      show: false,
      hasShadow: false,
      webPreferences: {
        preload: fileURLToPath(new URL("../preload/overlay-preload.mjs", import.meta.url)),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    applyOverlayWindowPolicy(window, this.dependencies.platform)
    window.setIgnoreMouseEvents(true)
    window.setBounds(bounds)
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    window.webContents.on("will-navigate", (navigationEvent) => navigationEvent.preventDefault())
    const flashQueue = createFlashQueue<FlashEvent>((flashEvent) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC.flash, flashEvent)
      }
    })
    window.webContents.once("did-finish-load", () => {
      if (this.windows.get(display.id)?.window !== window || window.isDestroyed()) {
        return
      }

      flashQueue.markReady()
      window.show()
    })
    this.windows.set(display.id, { window, flashQueue })
    flashQueue.send(event)
    this.loadWindow(window)
  }

  private loadWindow(window: OverlayNativeWindow): void {
    if (this.rendererUrl === undefined) {
      void window.loadFile(fileURLToPath(new URL("../../dist/overlay.html", import.meta.url)))
      return
    }

    void window.loadURL(`${this.rendererUrl}/overlay.html`)
  }

  private startDisplayTracking(): void {
    if (this.trackingDisplays) {
      return
    }

    this.dependencies.onDisplayEvent("display-removed", this.onDisplayRemoved)
    this.dependencies.onDisplayEvent("display-metrics-changed", this.onDisplayMetricsChanged)
    this.trackingDisplays = true
  }

  private stopDisplayTracking(): void {
    if (!this.trackingDisplays) {
      return
    }

    this.dependencies.removeDisplayEventListener("display-removed", this.onDisplayRemoved)
    this.dependencies.removeDisplayEventListener("display-metrics-changed", this.onDisplayMetricsChanged)
    this.trackingDisplays = false
  }

  private updateBounds(display: OverlayDisplay): void {
    const entry = this.windows.get(display.id)
    if (entry !== undefined && !entry.window.isDestroyed()) {
      entry.window.setBounds(overlayBoundsFor(display))
    }
  }

  private removeWindow(displayId: number): void {
    const entry = this.windows.get(displayId)
    if (entry === undefined) {
      return
    }

    if (!entry.window.isDestroyed()) {
      entry.window.destroy()
    }
    this.windows.delete(displayId)
  }

  private cleanup(): void {
    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer)
      this.cleanupTimer = null
    }

    this.stopDisplayTracking()
    for (const { window } of this.windows.values()) {
      if (!window.isDestroyed()) {
        window.destroy()
      }
    }
    this.windows.clear()
  }
}
