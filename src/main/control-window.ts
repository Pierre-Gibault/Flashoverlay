import { BrowserWindow } from "electron"
import { fileURLToPath } from "node:url"

export function createControlWindow(rendererUrl: string | undefined): BrowserWindow {
  const window = new BrowserWindow({
    width: 780,
    minWidth: 480,
    minHeight: 660,
    backgroundColor: "#0c1015",
    show: false,
    title: "Flashbang Overlay",
    webPreferences: {
      preload: fileURLToPath(new URL("../preload/control-preload.mjs", import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())
  window.once("ready-to-show", () => window.show())

  if (rendererUrl === undefined) {
    void window.loadFile(fileURLToPath(new URL("../../dist/index.html", import.meta.url)))
  } else {
    void window.loadURL(rendererUrl)
  }

  return window
}
