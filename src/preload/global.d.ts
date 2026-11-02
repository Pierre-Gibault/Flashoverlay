import type { FlashOverlayApi, OverlayApi } from "../shared/protocol.js"

declare global {
  interface Window {
    readonly flashOverlay: FlashOverlayApi
    readonly flashOverlayScene: OverlayApi
  }
}

export {}
