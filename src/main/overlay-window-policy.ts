type OverlayPolicyWindow = {
  readonly setAlwaysOnTop: (enabled: boolean, level?: "screen-saver") => void
  readonly setVisibleOnAllWorkspaces: (visible: boolean, options: { readonly visibleOnFullScreen: boolean }) => void
}

export function shouldUseX11(
  platform: NodeJS.Platform,
  environment: Readonly<Record<string, string | undefined>>,
  argumentsList: readonly string[],
): boolean {
  if (platform !== "linux" || environment["DISPLAY"] === undefined) {
    return false
  }

  return !argumentsList.some((argument) => argument.startsWith("--ozone-platform="))
}

export function applyOverlayWindowPolicy(window: OverlayPolicyWindow, platform: NodeJS.Platform): void {
  if (platform === "linux") {
    window.setAlwaysOnTop(true, "screen-saver")
  } else {
    window.setAlwaysOnTop(true)
  }
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
}
