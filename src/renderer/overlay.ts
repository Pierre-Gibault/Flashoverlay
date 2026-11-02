import type { FlashEvent } from "../shared/protocol.js"
import { FLASH_FADE_MS, FLASH_SEQUENCE_MS, GRENADE_TRAVEL_MS } from "../shared/flash-timing.js"
import "./overlay.css"

const sceneElement = document.getElementById("scene")

if (!(sceneElement instanceof HTMLDivElement)) {
  throw new Error("Overlay scene is unavailable.")
}

const scene: HTMLDivElement = sceneElement
scene.style.setProperty("--grenade-travel-duration", `${GRENADE_TRAVEL_MS}ms`)
scene.style.setProperty("--flash-delay", `${GRENADE_TRAVEL_MS}ms`)
scene.style.setProperty("--flash-fade-duration", `${FLASH_FADE_MS}ms`)
let resetTimer: ReturnType<typeof setTimeout> | null = null

function triggerFlash(event: FlashEvent): void {
  if (resetTimer !== null) {
    clearTimeout(resetTimer)
  }

  scene.style.setProperty("--flash-intensity", String(event.settings.intensity))
  scene.classList.toggle("scene--flash-only", !event.showGrenade)
  scene.classList.remove("scene--active")
  void scene.offsetWidth
  scene.classList.add("scene--active")
  resetTimer = setTimeout(() => {
    scene.classList.remove("scene--active")
    resetTimer = null
  }, FLASH_SEQUENCE_MS)
}

window.flashOverlayScene.onFlash(triggerFlash)
