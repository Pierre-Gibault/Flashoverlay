import { randomUUID } from "node:crypto"
import {
  EVERYONE_TARGET,
  RoomConnectionStatus,
  ROOM_PROTOCOL_VERSION,
  type RoomClientMessage,
  type RoomConnectRequest,
  type RoomFlashTarget,
  type RoomParticipant,
  type RoomServerMessage,
  type RoomState,
} from "../shared/room-protocol.js"
import type { AppSettings } from "../shared/protocol.js"
import { RoomClient, type RoomClientCallbacks, type RoomTransport } from "./room-client.js"

const MAX_SEEN_EVENTS = 128

type RoomCoordinatorOptions = {
  readonly publish: (state: RoomState) => void
  readonly renderFlash: (settings: AppSettings) => void
  readonly createClient?: (callbacks: RoomClientCallbacks) => RoomTransport
  readonly eventId?: () => string
}

const DISCONNECTED_ROOM_STATE: RoomState = {
  status: RoomConnectionStatus.disconnected,
  serverUrl: null,
  roomCode: null,
  role: null,
  memberCount: 0,
  participantId: null,
  participants: [],
  selectedTarget: null,
}

export function canRenderLocally(state: RoomState): boolean {
  return state.status !== RoomConnectionStatus.connected
}

export class RoomCoordinator {
  private state: RoomState = DISCONNECTED_ROOM_STATE
  private readonly seenEventIds = new Set<string>()
  private readonly seenEventOrder: string[] = []
  private readonly client: RoomTransport
  private readonly createEventId: () => string

  public constructor(private readonly options: RoomCoordinatorOptions) {
    this.createEventId = options.eventId ?? randomUUID
    this.client = (options.createClient ?? ((callbacks) => new RoomClient(callbacks)))({
      onConnectionStatus: (status) => this.updateConnectionStatus(status),
      onMessage: (message) => this.handleMessage(message),
    })
  }

  public getState(): RoomState {
    return this.state
  }

  public connect(request: RoomConnectRequest): RoomState {
    this.seenEventIds.clear()
    this.seenEventOrder.length = 0
    this.publish({ ...DISCONNECTED_ROOM_STATE, status: RoomConnectionStatus.connecting, serverUrl: request.serverUrl, roomCode: request.roomCode })
    this.client.connect(request)
    return this.state
  }

  public disconnect(): RoomState {
    this.client.disconnect()
    this.publish(DISCONNECTED_ROOM_STATE)
    return this.state
  }

  public requestFlash(settings: AppSettings): boolean {
    const target = this.state.selectedTarget
    if (this.state.status !== RoomConnectionStatus.connected || target === null || target === undefined) {
      return false
    }
    this.client.sendFlash({ version: ROOM_PROTOCOL_VERSION, type: "flash", eventId: this.createEventId(), settings, target })
    return true
  }

  public selectTarget(target: RoomFlashTarget): boolean {
    const participants = this.state.participants ?? []
    if (this.state.status !== RoomConnectionStatus.connected || !hasAvailableTarget(target, participants)) {
      return false
    }
    this.publish({ ...this.state, selectedTarget: target })
    return true
  }

  public dispose(): void {
    this.client.dispose()
  }

  private updateConnectionStatus(status: RoomState["status"]): void {
    if (status === RoomConnectionStatus.connected) {
      return
    }
    if (status === RoomConnectionStatus.disconnected) {
      this.publish(DISCONNECTED_ROOM_STATE)
      return
    }
    this.publish({
      ...DISCONNECTED_ROOM_STATE,
      status,
      serverUrl: this.state.serverUrl,
      roomCode: this.state.roomCode,
    })
  }

  private handleMessage(message: RoomServerMessage): void {
    switch (message.type) {
      case "room-state":
        if (message.roomCode !== this.state.roomCode) {
          return
        }
        const selectedTarget = this.state.selectedTarget
        this.publish({
          status: RoomConnectionStatus.connected,
          serverUrl: this.state.serverUrl,
          roomCode: message.roomCode,
          role: message.role,
          memberCount: message.memberCount,
          participantId: message.participantId,
          participants: message.participants,
          selectedTarget: selectedTarget !== null && selectedTarget !== undefined && hasAvailableTarget(selectedTarget, message.participants) ? selectedTarget : EVERYONE_TARGET,
        })
        return
      case "flash":
        if (this.seenEventIds.has(message.eventId)) {
          return
        }
        this.seenEventIds.add(message.eventId)
        this.seenEventOrder.push(message.eventId)
        if (this.seenEventOrder.length > MAX_SEEN_EVENTS) {
          const oldestEventId = this.seenEventOrder.shift()
          if (oldestEventId !== undefined) {
            this.seenEventIds.delete(oldestEventId)
          }
        }
        this.options.renderFlash(message.settings)
        return
    }
  }

  private publish(state: RoomState): void {
    this.state = state
    this.options.publish(state)
  }
}

function hasAvailableTarget(target: RoomFlashTarget, participants: readonly RoomParticipant[]): boolean {
  if (target.type === "everyone") {
    return true
  }
  const participantIds = new Set(participants.map((participant) => participant.id))
  return target.participantIds.every((participantId) => participantIds.has(participantId))
}
