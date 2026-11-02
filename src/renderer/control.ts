import type { AppSettings, SessionState } from "../shared/protocol.js"
import "./control.css"

function requiredElement<T extends Element>(id: string, elementType: { new (): T }): T {
  const element = document.getElementById(id)
  if (!(element instanceof elementType)) {
    throw new Error(`Expected ${id} to be a ${elementType.name}.`)
  }
  return element
}

const form = requiredElement("settings-form", HTMLFormElement)
const minimumInput = requiredElement("min-interval", HTMLInputElement)
const maximumInput = requiredElement("max-interval", HTMLInputElement)
const intensityInput = requiredElement("intensity", HTMLInputElement)
const intensityOutput = requiredElement("intensity-output", HTMLOutputElement)
const errorMessage = requiredElement("settings-error", HTMLParagraphElement)
const statusMessage = requiredElement("status-message", HTMLParagraphElement)
const startButton = requiredElement("start-button", HTMLButtonElement)
const pauseButton = requiredElement("pause-button", HTMLButtonElement)
const resumeButton = requiredElement("resume-button", HTMLButtonElement)
const triggerButton = requiredElement("trigger-button", HTMLButtonElement)

function settingsFromInputs(): AppSettings {
  return {
    minIntervalSeconds: Number(minimumInput.value),
    maxIntervalSeconds: Number(maximumInput.value),
    intensity: Number(intensityInput.value),
  }
}

function validateInputs(): boolean {
  const settings = settingsFromInputs()
  const isRangeValid = settings.minIntervalSeconds <= settings.maxIntervalSeconds
  maximumInput.setCustomValidity(isRangeValid ? "" : "Maximum interval must be at least the minimum interval.")
  errorMessage.textContent = isRangeValid ? "" : maximumInput.validationMessage
  return form.checkValidity() && isRangeValid
}

function formatStatus(state: SessionState): string {
  switch (state.status) {
    case "idle":
      return "Idle. Configure a cadence, then start."
    case "running":
      return "Running. The next interval is selected at random."
    case "paused":
      return "Paused. No future flash is scheduled."
    case "flashing":
      return "Flash active. The overlay will return to normal shortly."
  }
}

function render(state: SessionState): void {
  statusMessage.textContent = formatStatus(state)
  document.documentElement.dataset["status"] = state.status
  minimumInput.value = String(state.settings.minIntervalSeconds)
  maximumInput.value = String(state.settings.maxIntervalSeconds)
  intensityInput.value = String(state.settings.intensity)
  intensityOutput.value = `${Math.round(state.settings.intensity * 100)}%`
  startButton.disabled = state.status !== "idle"
  pauseButton.disabled = state.status === "idle" || state.status === "paused"
  resumeButton.disabled = state.status !== "paused"
  triggerButton.disabled = false
}

function updateIntensityOutput(): void {
  intensityOutput.value = `${Math.round(Number(intensityInput.value) * 100)}%`
}

form.addEventListener("submit", (event) => {
  event.preventDefault()
  if (!validateInputs()) {
    form.reportValidity()
    return
  }

  void window.flashOverlay.updateSettings(settingsFromInputs()).then(render)
})

minimumInput.addEventListener("input", validateInputs)
maximumInput.addEventListener("input", validateInputs)
intensityInput.addEventListener("input", updateIntensityOutput)
startButton.addEventListener("click", () => void window.flashOverlay.start().then(render))
pauseButton.addEventListener("click", () => void window.flashOverlay.pause().then(render))
resumeButton.addEventListener("click", () => void window.flashOverlay.resume().then(render))
triggerButton.addEventListener("click", () => {
  void window.flashOverlay.trigger().then(render).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    statusMessage.textContent = `Trigger failed: ${message}`
    console.error("Flash trigger failed", error)
  })
})

window.flashOverlay.onStateChanged(render)
void window.flashOverlay.getState().then(render)
