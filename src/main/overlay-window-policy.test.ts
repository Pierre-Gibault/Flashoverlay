import { describe, expect, it } from "vitest"
import { applyOverlayWindowPolicy, shouldUseX11 } from "./overlay-window-policy.js"

function createWindowSpy(): {
  readonly calls: string[]
  readonly window: {
    readonly setAlwaysOnTop: (enabled: boolean, level?: string) => void
    readonly setVisibleOnAllWorkspaces: (visible: boolean, options: { readonly visibleOnFullScreen: boolean }) => void
  }
} {
  const calls: string[] = []
  return {
    calls,
    window: {
      setAlwaysOnTop: (_enabled, level) => calls.push(level ?? "default"),
      setVisibleOnAllWorkspaces: () => calls.push("all-workspaces"),
    },
  }
}

describe("applyOverlayWindowPolicy", () => {
  it("Given Linux, When the overlay policy is applied, Then it requests the screen-saver level", () => {
    const spy = createWindowSpy()

    applyOverlayWindowPolicy(spy.window, "linux")

    expect(spy.calls).toEqual(["screen-saver", "all-workspaces"])
  })

  it("Given Windows, When the overlay policy is applied, Then it avoids the Linux-only window level", () => {
    const spy = createWindowSpy()

    applyOverlayWindowPolicy(spy.window, "win32")

    expect(spy.calls).toEqual(["default", "all-workspaces"])
  })
})

describe("shouldUseX11", () => {
  it("Given a Linux Wayland session with Xwayland available, When no backend is forced, Then it selects X11 for reliable display placement", () => {
    expect(shouldUseX11("linux", { DISPLAY: ":0", WAYLAND_DISPLAY: "wayland-0" }, ["electron"])).toBe(true)
  })

  it("Given an explicit ozone backend or Windows, When the launch policy is checked, Then it preserves the requested backend", () => {
    expect(shouldUseX11("linux", { DISPLAY: ":0" }, ["electron", "--ozone-platform=wayland"])).toBe(false)
    expect(shouldUseX11("win32", { DISPLAY: ":0" }, ["electron"])).toBe(false)
  })
})
