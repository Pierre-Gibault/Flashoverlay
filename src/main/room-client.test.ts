import { describe, expect, it } from "vitest"
import { RoomClient } from "./room-client.js"
import { createRoomServer } from "../server/room-server.js"
import type { RoomConnectionStatus } from "../shared/room-protocol.js"

describe("RoomClient", () => {
  it("Given an unexpected closed server, When the client loses its socket, Then it schedules reconnecting until explicitly disconnected", async () => {
    const server = createRoomServer({ port: 0 })
    await server.ready
    const port = server.port
    await server.close()
    const statuses: RoomConnectionStatus[] = []
    let resolveReconnecting: (() => void) | undefined
    const reconnecting = new Promise<void>((resolve) => {
      resolveReconnecting = resolve
    })
    const client = new RoomClient({
      onConnectionStatus: (status) => {
        statuses.push(status)
        if (status === "reconnecting") {
          resolveReconnecting?.()
        }
      },
      onMessage: () => undefined,
    })

    client.connect({ serverUrl: `ws://127.0.0.1:${port}`, roomCode: "room-a" })
    await reconnecting
    client.disconnect()

    expect(statuses).toContain("connecting")
    expect(statuses).toContain("reconnecting")
    expect(statuses.at(-1)).toBe("disconnected")
  })
})
