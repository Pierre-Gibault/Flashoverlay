import type { AppSettings, SessionState } from "../shared/protocol.js"
import type { RoomFlashTarget, RoomState } from "../shared/room-protocol.js"
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
const roomForm = requiredElement("room-form", HTMLFormElement)
const serverUrlInput = requiredElement("server-url", HTMLInputElement)
const roomCodeInput = requiredElement("room-code", HTMLInputElement)
const connectButton = requiredElement("connect-button", HTMLButtonElement)
const disconnectButton = requiredElement("disconnect-button", HTMLButtonElement)
const roomStatus = requiredElement("room-status", HTMLParagraphElement)
const roomRole = requiredElement("room-role", HTMLParagraphElement)
const flashTarget = requiredElement("flash-target", HTMLSelectElement)
const participantList = requiredElement("participant-list", HTMLUListElement)
let roomState: RoomState = {
  status: "disconnected",
  serverUrl: null,
  roomCode: null,
  role: null,
  memberCount: 0,
  participantId: null,
  participants: [],
  selectedTarget: null,
}

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
  const schedulerControlsAllowed = roomState.status !== "connected" || roomState.role === "leader"
  const flashControlAllowed = roomState.status !== "connected" || roomState.role !== null
  startButton.disabled = state.status !== "idle" || !schedulerControlsAllowed
  pauseButton.disabled = state.status === "idle" || state.status === "paused" || !schedulerControlsAllowed
  resumeButton.disabled = state.status !== "paused" || !schedulerControlsAllowed
  triggerButton.disabled = !flashControlAllowed
}

function formatRoomStatus(state: RoomState): string {
  switch (state.status) {
    case "disconnected":
      return "Disconnected. Local mode is enabled."
    case "connecting":
      return "Connecting to the room server."
    case "reconnecting":
      return "Connection lost. Reconnecting with bounded backoff."
    case "connected":
      return state.role === "leader"
        ? `Leader. You control scheduled and manual flashes for ${state.memberCount} members.`
        : `Follower. Waiting for the leader across ${state.memberCount} members.`
  }
}

function renderRoom(state: RoomState): void {
  roomState = state
  roomStatus.textContent = formatRoomStatus(state)
  roomRole.textContent = state.role === null ? "Local" : state.role === "leader" ? "Leader" : "Follower"
  document.documentElement.dataset["roomStatus"] = state.status
  const connected = state.status !== "disconnected"
  serverUrlInput.disabled = connected
  roomCodeInput.disabled = connected
  connectButton.disabled = connected
  disconnectButton.disabled = !connected
  renderTargeting(state)
  void window.flashOverlay.getState().then(render)
}

function renderTargeting(state: RoomState): void {
  const participants = state.participants ?? []
  const selected = state.selectedTarget?.type === "participants" && state.selectedTarget.participantIds.length === 1
    ? state.selectedTarget.participantIds[0] ?? "everyone"
    : "everyone"
  flashTarget.replaceChildren(new Option("Everyone", "everyone"))
  for (const participant of participants) {
    flashTarget.append(new Option(`${participant.label}${participant.id === state.participantId ? " (you)" : ""}`, participant.id))
  }
  flashTarget.value = participants.some((participant) => participant.id === selected) ? selected : "everyone"
  flashTarget.disabled = state.status !== "connected"

  participantList.replaceChildren()
  for (const participant of participants) {
    const item = document.createElement("li")
    item.textContent = `${participant.label}${participant.id === state.participantId ? " (you)" : ""} - ${participant.role}`
    participantList.append(item)
  }
  if (participants.length === 0) {
    const item = document.createElement("li")
    item.textContent = state.status === "disconnected" ? "No shared room connected." : "Waiting for room members..."
    participantList.append(item)
  }
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

roomForm.addEventListener("submit", (event) => {
  event.preventDefault()
  if (!roomForm.checkValidity()) {
    roomForm.reportValidity()
    return
  }
  void window.flashOverlay.connectRoom({ serverUrl: serverUrlInput.value, roomCode: roomCodeInput.value }).then(renderRoom).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    roomStatus.textContent = `Connection failed: ${message}`
  })
})
disconnectButton.addEventListener("click", () => void window.flashOverlay.disconnectRoom().then(renderRoom))
flashTarget.addEventListener("change", () => {
  const target: RoomFlashTarget = flashTarget.value === "everyone"
    ? { type: "everyone" }
    : { type: "participants", participantIds: [flashTarget.value] }
  void window.flashOverlay.selectRoomTarget(target).then(renderRoom).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    roomStatus.textContent = `Recipient selection failed: ${message}`
  })
})

window.flashOverlay.onStateChanged(render)
window.flashOverlay.onRoomStateChanged(renderRoom)
void window.flashOverlay.getState().then(render)
void window.flashOverlay.getRoomState().then(renderRoom)
