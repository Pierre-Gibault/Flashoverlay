import { afterEach, describe, expect, it, vi } from "vitest"
import type { BrowserWindowConstructorOptions, Event } from "electron"
import type { AppSettings, FlashEvent } from "../shared/protocol.js"
import { FLASH_SEQUENCE_MS } from "../shared/flash-timing.js"
import {
  OverlayWindow,
  type OverlayBounds,
  type OverlayDisplay,
  type OverlayNativeWindow,
  type OverlayWindowDependencies,
} from "./overlay-window.js"

const settings: AppSettings = { minIntervalSeconds: 10, maxIntervalSeconds: 20, intensity: 0.8 }
type DisplayEventListener = (event: Event, display: OverlayDisplay) => void
const displayEvent: Event = { preventDefault: (): void => undefined, defaultPrevented: false }

class FakeOverlayNativeWindow implements OverlayNativeWindow {
  public destroyed = false
  public shown = false
  public readonly ignoreMouseEvents: boolean[] = []
  public readonly bounds: OverlayBounds[] = []
  public readonly received: FlashEvent[] = []
  private didFinishLoad: (() => void) | null = null

  public readonly webContents = {
    send: (_channel: string, event: FlashEvent): void => {
      this.received.push(event)
    },
    once: (_event: "did-finish-load", listener: () => void): void => {
      this.didFinishLoad = listener
    },
    on: (_event: "will-navigate", _listener: (event: { readonly preventDefault: () => void }) => void): void => undefined,
    setWindowOpenHandler: (_handler: () => { readonly action: "deny" }): void => undefined,
  }

  public setAlwaysOnTop(_enabled: boolean, _level?: "screen-saver"): void {}

  public setVisibleOnAllWorkspaces(_visible: boolean, _options: { readonly visibleOnFullScreen: boolean }): void {}

  public setIgnoreMouseEvents(ignore: boolean): void {
    this.ignoreMouseEvents.push(ignore)
  }

  public setBounds(bounds: OverlayBounds): void {
    this.bounds.push(bounds)
  }

  public show(): void {
    this.shown = true
  }

  public destroy(): void {
    this.destroyed = true
  }

  public isDestroyed(): boolean {
    return this.destroyed
  }

  public loadFile(_filePath: string): Promise<void> {
    return Promise.resolve()
  }

  public loadURL(_url: string): Promise<void> {
    return Promise.resolve()
  }

  public finishLoading(): void {
    this.didFinishLoad?.()
  }
}

function createDependencies(displays: readonly OverlayDisplay[]): {
  readonly dependencies: OverlayWindowDependencies
  readonly created: FakeOverlayNativeWindow[]
  readonly options: BrowserWindowConstructorOptions[]
  readonly listeners: Map<string, DisplayEventListener>
} {
  const created: FakeOverlayNativeWindow[] = []
  const options: BrowserWindowConstructorOptions[] = []
  const listeners = new Map<string, DisplayEventListener>()

  return {
    dependencies: {
      getAllDisplays: () => displays,
      createWindow: (windowOptions) => {
        const window = new FakeOverlayNativeWindow()
        options.push(windowOptions)
        created.push(window)
        return window
      },
      onDisplayEvent: (event, listener) => listeners.set(event, listener),
      removeDisplayEventListener: (event, listener) => {
        if (listeners.get(event) === listener) {
          listeners.delete(event)
        }
      },
      platform: "linux",
      randomUnit: () => 0,
    },
    created,
    options,
    listeners,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("OverlayWindow", () => {
  it("Given idle displays, When the overlay is constructed, Then no native windows or display listeners exist", () => {
    const fake = createDependencies([{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }])

    new OverlayWindow(undefined, fake.dependencies)

    expect(fake.created).toHaveLength(0)
    expect(fake.listeners.size).toBe(0)
  })

  it("Given two displays, When a flash is requested and renderers become ready, Then one click-through window per exact display bounds shows one grenade", () => {
    const fake = createDependencies([
      { id: 1, bounds: { x: -1280, y: 0, width: 1280, height: 1024 } },
      { id: 2, bounds: { x: 0, y: -900, width: 1920, height: 900 } },
    ])
    const overlay = new OverlayWindow(undefined, fake.dependencies)

    overlay.flash(settings)

    expect(fake.created).toHaveLength(2)
    expect(fake.options).toMatchObject([
      { x: -1280, y: 0, width: 1280, height: 1024, show: false, skipTaskbar: true, focusable: false },
      { x: 0, y: -900, width: 1920, height: 900, show: false, skipTaskbar: true, focusable: false },
    ])
    expect(fake.created.map((window) => window.bounds[0])).toEqual([
      { x: -1280, y: 0, width: 1280, height: 1024 },
      { x: 0, y: -900, width: 1920, height: 900 },
    ])
    expect(fake.created.every((window) => window.ignoreMouseEvents[0] === true && !window.shown)).toBe(true)

    fake.created.forEach((window) => window.finishLoading())

    expect(fake.created.map((window) => window.received[0]?.showGrenade)).toEqual([true, false])
    expect(fake.created.every((window) => window.shown)).toBe(true)
  })

  it("Given active overlays, When a display changes or a flash expires, Then current bounds update and every transient window is destroyed", () => {
    vi.useFakeTimers()
    const fake = createDependencies([{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }])
    const overlay = new OverlayWindow(undefined, fake.dependencies)

    overlay.flash(settings)
    const metricsChanged = fake.listeners.get("display-metrics-changed")
    const displayRemoved = fake.listeners.get("display-removed")
    metricsChanged?.(displayEvent, { id: 1, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } })
    displayRemoved?.(displayEvent, { id: 1, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } })
    vi.advanceTimersByTime(FLASH_SEQUENCE_MS)

    expect(fake.created[0]?.bounds).toEqual([
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 2560, height: 1440 },
    ])
    expect(fake.created[0]?.destroyed).toBe(true)
    expect(fake.listeners.size).toBe(0)
  })

  it("Given a previous flash still loading, When a new flash arrives, Then the stale window cannot show and the replacement owns the sequence", () => {
    vi.useFakeTimers()
    const fake = createDependencies([{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }])
    const overlay = new OverlayWindow(undefined, fake.dependencies)

    overlay.flash(settings)
    const staleWindow = fake.created[0]
    overlay.flash(settings)
    staleWindow?.finishLoading()
    fake.created[1]?.finishLoading()

    expect(staleWindow?.destroyed).toBe(true)
    expect(staleWindow?.shown).toBe(false)
    expect(fake.created[1]?.shown).toBe(true)
    vi.advanceTimersByTime(FLASH_SEQUENCE_MS)
    expect(fake.created[1]?.destroyed).toBe(true)
  })

  it("Given no connected displays, When a flash is requested, Then it is safe and creates no overlay", () => {
    const fake = createDependencies([])
    const overlay = new OverlayWindow(undefined, fake.dependencies)

    overlay.flash(settings)

    expect(fake.created).toHaveLength(0)
    expect(fake.listeners.size).toBe(0)
  })

  it("Given an active overlay, When shutdown destroys it repeatedly, Then the window and listeners are released without recreating overlays", () => {
    const fake = createDependencies([{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }])
    const overlay = new OverlayWindow(undefined, fake.dependencies)

    overlay.flash(settings)
    overlay.destroy()
    overlay.destroy()
    overlay.flash(settings)

    expect(fake.created[0]?.destroyed).toBe(true)
    expect(fake.created).toHaveLength(1)
    expect(fake.listeners.size).toBe(0)
  })
})
