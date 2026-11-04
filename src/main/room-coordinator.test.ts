import { describe, expect, it } from "vitest"
import { canRenderLocally, RoomCoordinator } from "./room-coordinator.js"
import type { RoomClientCallbacks, RoomTransport } from "./room-client.js"
import type { RoomClientMessage, RoomConnectRequest, RoomServerMessage, RoomState } from "../shared/room-protocol.js"
import type { AppSettings } from "../shared/protocol.js"

class FakeRoomTransport implements RoomTransport {
  public connected: RoomConnectRequest | null = null
  public disconnected = false
  public readonly sent: RoomClientMessage[] = []

  public constructor(private readonly callbacks: RoomClientCallbacks) {}

  public connect(request: RoomConnectRequest): void {
    this.connected = request
  }

  public disconnect(): void {
    this.disconnected = true
    this.callbacks.onConnectionStatus("disconnected")
  }

  public dispose(): void {
    this.disconnect()
  }

  public sendFlash(message: Extract<RoomClientMessage, { readonly type: "flash" }>): void {
    this.sent.push(message)
  }

  public updateStatus(status: RoomState["status"]): void {
    this.callbacks.onConnectionStatus(status)
  }

  public receive(message: RoomServerMessage): void {
    this.callbacks.onMessage(message)
  }
}

describe("RoomCoordinator", () => {
  it("Given a connecting room with no server response, When a flash is requested, Then it remains available locally", () => {
    const state: RoomState = { status: "reconnecting", serverUrl: "ws://127.0.0.1:7331", roomCode: "room-a", role: null, memberCount: 0 }

    expect(canRenderLocally(state)).toBe(true)
  })

  it("Given a leader state and repeated flash identity, When the server broadcasts it, Then the overlay renders once without rebroadcasting", () => {
    const published: RoomState[] = []
    const rendered: AppSettings[] = []
    let transport: FakeRoomTransport | undefined
    const coordinator = new RoomCoordinator({
      publish: (state) => published.push(state),
      renderFlash: (settings) => rendered.push(settings),
      createClient: (callbacks) => {
        transport = new FakeRoomTransport(callbacks)
        return transport
      },
      eventId: () => "ad40410c-395d-454b-b0aa-43706a6f1b4a",
    })
    const request = { serverUrl: "ws://127.0.0.1:7331", roomCode: "room-a" }
    const settings = { minIntervalSeconds: 10, maxIntervalSeconds: 20, intensity: 0.8 }

    coordinator.connect(request)
    if (transport === undefined) {
      throw new Error("Expected a room transport.")
    }
    transport.receive({
      version: 2,
      type: "room-state",
      roomCode: "room-a",
      role: "leader",
      memberCount: 2,
      participantId: "ad40410c-395d-454b-b0aa-43706a6f1b4a",
      participants: [
        { id: "ad40410c-395d-454b-b0aa-43706a6f1b4a", label: "Participant 1", role: "leader" },
        { id: "c7f1c2bd-1ae1-47c4-b621-2a44525de73d", label: "Participant 2", role: "follower" },
      ],
    })
    const accepted = coordinator.requestFlash(settings)
    transport.receive({ version: 2, type: "flash", eventId: "ad40410c-395d-454b-b0aa-43706a6f1b4a", settings, target: { type: "everyone" } })
    transport.receive({ version: 2, type: "flash", eventId: "ad40410c-395d-454b-b0aa-43706a6f1b4a", settings, target: { type: "everyone" } })

    expect(accepted).toBe(true)
    expect(transport.sent).toHaveLength(1)
    expect(rendered).toEqual([settings])
    expect(published.at(-1)).toMatchObject({ status: "connected", role: "leader", memberCount: 2 })
  })

  it("Given a connected follower, When the follower selects a participant target and flashes, Then the flash is sent without leader authorization", () => {
    let transport: FakeRoomTransport | undefined
    const coordinator = new RoomCoordinator({
      publish: () => undefined,
      renderFlash: () => undefined,
      createClient: (callbacks) => {
        transport = new FakeRoomTransport(callbacks)
        return transport
      },
      eventId: () => "ad40410c-395d-454b-b0aa-43706a6f1b4a",
    })
    const settings = { minIntervalSeconds: 10, maxIntervalSeconds: 20, intensity: 0.8 }

    coordinator.connect({ serverUrl: "ws://127.0.0.1:7331", roomCode: "room-a" })
    if (transport === undefined) {
      throw new Error("Expected a room transport.")
    }
    transport.receive({
      version: 2,
      type: "room-state",
      roomCode: "room-a",
      role: "follower",
      memberCount: 2,
      participantId: "ad40410c-395d-454b-b0aa-43706a6f1b4a",
      participants: [
        { id: "ad40410c-395d-454b-b0aa-43706a6f1b4a", label: "Participant 1", role: "leader" },
        { id: "c7f1c2bd-1ae1-47c4-b621-2a44525de73d", label: "Participant 2", role: "follower" },
      ],
    })
    const selected = coordinator.selectTarget({ type: "participants", participantIds: ["ad40410c-395d-454b-b0aa-43706a6f1b4a"] })
    const accepted = coordinator.requestFlash(settings)

    expect(selected).toBe(true)
    expect(accepted).toBe(true)
    expect(transport.sent).toEqual([
      {
        version: 2,
        type: "flash",
        eventId: "ad40410c-395d-454b-b0aa-43706a6f1b4a",
        settings,
        target: { type: "participants", participantIds: ["ad40410c-395d-454b-b0aa-43706a6f1b4a"] },
      },
    ])
  })

  it("Given an active room connection, When disconnect is requested, Then reconnection is disabled and room state resets", () => {
    let transport: FakeRoomTransport | undefined
    const coordinator = new RoomCoordinator({
      publish: () => undefined,
      renderFlash: () => undefined,
      createClient: (callbacks) => {
        transport = new FakeRoomTransport(callbacks)
        return transport
      },
      eventId: () => "ad40410c-395d-454b-b0aa-43706a6f1b4a",
    })

    coordinator.connect({ serverUrl: "ws://127.0.0.1:7331", roomCode: "room-a" })
    coordinator.disconnect()

    if (transport === undefined) {
      throw new Error("Expected a room transport.")
    }
    expect(transport.disconnected).toBe(true)
    expect(coordinator.getState()).toMatchObject({ status: "disconnected", role: null, memberCount: 0 })
  })

  it("Given a selected participant, When membership no longer includes it or reconnecting begins, Then targeting resets safely", () => {
    let transport: FakeRoomTransport | undefined
    const coordinator = new RoomCoordinator({
      publish: () => undefined,
      renderFlash: () => undefined,
      createClient: (callbacks) => {
        transport = new FakeRoomTransport(callbacks)
        return transport
      },
    })

    coordinator.connect({ serverUrl: "ws://127.0.0.1:7331", roomCode: "room-a" })
    if (transport === undefined) {
      throw new Error("Expected a room transport.")
    }
    transport.receive({
      version: 2,
      type: "room-state",
      roomCode: "room-a",
      role: "leader",
      memberCount: 2,
      participantId: "ad40410c-395d-454b-b0aa-43706a6f1b4a",
      participants: [
        { id: "ad40410c-395d-454b-b0aa-43706a6f1b4a", label: "Participant 1", role: "leader" },
        { id: "c7f1c2bd-1ae1-47c4-b621-2a44525de73d", label: "Participant 2", role: "follower" },
      ],
    })
    coordinator.selectTarget({ type: "participants", participantIds: ["c7f1c2bd-1ae1-47c4-b621-2a44525de73d"] })
    transport.receive({
      version: 2,
      type: "room-state",
      roomCode: "room-a",
      role: "leader",
      memberCount: 1,
      participantId: "ad40410c-395d-454b-b0aa-43706a6f1b4a",
      participants: [{ id: "ad40410c-395d-454b-b0aa-43706a6f1b4a", label: "Participant 1", role: "leader" }],
    })

    expect(coordinator.getState().selectedTarget).toEqual({ type: "everyone" })
    transport.updateStatus("reconnecting")
    expect(coordinator.getState()).toMatchObject({ participantId: null, participants: [], selectedTarget: null })
  })
})
