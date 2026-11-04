import { describe, expect, it } from "vitest"
import { ROOM_PROTOCOL_VERSION, RoomClientMessageSchema, RoomConnectRequestSchema, RoomServerMessageSchema } from "./room-protocol.js"

describe("room protocol", () => {
  it("Given a WebSocket URL and room code, When a client connects, Then the request is accepted", () => {
    const result = RoomConnectRequestSchema.safeParse({ serverUrl: "ws://127.0.0.1:7331", roomCode: "training-a" })

    expect(result.success).toBe(true)
  })

  it("Given an unsupported URL scheme, When a client connects, Then the request is rejected", () => {
    const result = RoomConnectRequestSchema.safeParse({ serverUrl: "https://example.test", roomCode: "training-a" })

    expect(result.success).toBe(false)
  })

  it("Given a versioned flash event for everyone, When the server message is parsed, Then its identity, settings, and target are retained", () => {
    const result = RoomServerMessageSchema.safeParse({
      version: ROOM_PROTOCOL_VERSION,
      type: "flash",
      eventId: "ad40410c-395d-454b-b0aa-43706a6f1b4a",
      settings: { minIntervalSeconds: 10, maxIntervalSeconds: 20, intensity: 0.8 },
      target: { type: "everyone" },
    })

    expect(result.success).toBe(true)
    if (result.success && result.data.type === "flash") {
      expect(result.data.eventId).toBe("ad40410c-395d-454b-b0aa-43706a6f1b4a")
    }
  })

  it("Given empty, duplicate, or unknown message shapes, When a client flash is parsed, Then invalid targets are rejected at the network boundary", () => {
    const emptyTarget = RoomClientMessageSchema.safeParse({
      version: ROOM_PROTOCOL_VERSION,
      type: "flash",
      eventId: "ad40410c-395d-454b-b0aa-43706a6f1b4a",
      settings: { minIntervalSeconds: 10, maxIntervalSeconds: 20, intensity: 0.8 },
      target: { type: "participants", participantIds: [] },
    })
    const duplicateTarget = RoomClientMessageSchema.safeParse({
      version: ROOM_PROTOCOL_VERSION,
      type: "flash",
      eventId: "ad40410c-395d-454b-b0aa-43706a6f1b4a",
      settings: { minIntervalSeconds: 10, maxIntervalSeconds: 20, intensity: 0.8 },
      target: {
        type: "participants",
        participantIds: ["ad40410c-395d-454b-b0aa-43706a6f1b4a", "ad40410c-395d-454b-b0aa-43706a6f1b4a"],
      },
    })
    const unknownTarget = RoomClientMessageSchema.safeParse({
      version: ROOM_PROTOCOL_VERSION,
      type: "flash",
      eventId: "ad40410c-395d-454b-b0aa-43706a6f1b4a",
      settings: { minIntervalSeconds: 10, maxIntervalSeconds: 20, intensity: 0.8 },
      target: { type: "selected-members", participantIds: ["ad40410c-395d-454b-b0aa-43706a6f1b4a"] },
    })
    const unsupportedMessage = RoomClientMessageSchema.safeParse({ version: ROOM_PROTOCOL_VERSION, type: "room-state", roomCode: "training-a" })

    expect(emptyTarget.success).toBe(false)
    expect(duplicateTarget.success).toBe(false)
    expect(unknownTarget.success).toBe(false)
    expect(unsupportedMessage.success).toBe(false)
  })
})
