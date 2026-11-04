import { once } from "node:events"
import WebSocket from "ws"
import { describe, expect, it } from "vitest"
import { RoomServerMessageSchema, type RoomServerMessage } from "../shared/room-protocol.js"
import { createRoomServer } from "./room-server.js"

function connect(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url)
  return once(socket, "open").then(() => socket)
}

function nextMessage(socket: WebSocket): Promise<RoomServerMessage> {
  return new Promise((resolve) => {
    socket.once("message", (data) => resolve(RoomServerMessageSchema.parse(JSON.parse(data.toString()))))
  })
}

function roomState(message: RoomServerMessage): Extract<RoomServerMessage, { readonly type: "room-state" }> {
  if (message.type === "room-state") {
    return message
  }
  throw new Error("Expected a room state message.")
}

function closeSocket(socket: WebSocket): Promise<void> {
  socket.close()
  return once(socket, "close").then(() => undefined)
}

describe("room server", () => {
  it("Given no explicit host, When the standalone server starts, Then it accepts a LAN-addressable connection", async () => {
    const server = createRoomServer({ port: 0 })
    await server.ready
    const socket = await connect(`ws://0.0.0.0:${server.port}`)

    await closeSocket(socket)
    await server.close()
  })

  it("Given room members with participant snapshots, When any member selects recipients, Then only connected selected room members receive the flash", async () => {
    const server = createRoomServer({ port: 0 })
    await server.ready
    const url = `ws://127.0.0.1:${server.port}`
    const leader = await connect(url)
    const leaderJoined = nextMessage(leader)
    leader.send(JSON.stringify({ version: 2, type: "join", roomCode: "room-a" }))
    const leaderState = roomState(await leaderJoined)

    const follower = await connect(url)
    const leaderUpdated = nextMessage(leader)
    const followerJoined = nextMessage(follower)
    follower.send(JSON.stringify({ version: 2, type: "join", roomCode: "room-a" }))
    const leaderUpdatedState = roomState(await leaderUpdated)
    const followerState = roomState(await followerJoined)

    expect(leaderUpdatedState.participants).toHaveLength(2)
    expect(followerState.participantId).not.toBe(leaderState.participantId)
    expect(followerState.participants).toContainEqual(expect.objectContaining({ id: followerState.participantId, role: "follower" }))

    const otherRoomMember = await connect(url)
    const otherRoomJoined = nextMessage(otherRoomMember)
    otherRoomMember.send(JSON.stringify({ version: 2, type: "join", roomCode: "room-b" }))
    await otherRoomJoined

    let followerReceivedTargetedFlash = false
    let otherRoomReceivedFlash = false
    const recordFollowerTargetedFlash = (): void => {
      followerReceivedTargetedFlash = true
    }
    follower.once("message", recordFollowerTargetedFlash)
    otherRoomMember.once("message", () => {
      otherRoomReceivedFlash = true
    })
    const leaderTargetedFlash = nextMessage(leader)
    follower.send(
      JSON.stringify({
        version: 2,
        type: "flash",
        eventId: "ad40410c-395d-454b-b0aa-43706a6f1b4a",
        settings: { minIntervalSeconds: 10, maxIntervalSeconds: 20, intensity: 0.8 },
        target: { type: "participants", participantIds: [leaderState.participantId] },
      }),
    )
    expect((await leaderTargetedFlash).type).toBe("flash")
    expect(followerReceivedTargetedFlash).toBe(false)
    expect(otherRoomReceivedFlash).toBe(false)
    follower.off("message", recordFollowerTargetedFlash)

    let leaderReceivedFollowerSelfFlash = false
    const recordLeaderFollowerSelfFlash = (): void => {
      leaderReceivedFollowerSelfFlash = true
    }
    leader.once("message", recordLeaderFollowerSelfFlash)
    const followerSelfFlash = nextMessage(follower)
    follower.send(
      JSON.stringify({
        version: 2,
        type: "flash",
        eventId: "c7f1c2bd-1ae1-47c4-b621-2a44525de73d",
        settings: { minIntervalSeconds: 10, maxIntervalSeconds: 20, intensity: 0.8 },
        target: { type: "participants", participantIds: [followerState.participantId] },
      }),
    )
    expect((await followerSelfFlash).type).toBe("flash")
    expect(leaderReceivedFollowerSelfFlash).toBe(false)
    leader.off("message", recordLeaderFollowerSelfFlash)

    const leaderEveryoneFlash = nextMessage(leader)
    const followerEveryoneFlash = nextMessage(follower)
    leader.send(
      JSON.stringify({
        version: 2,
        type: "flash",
        eventId: "26efa027-01b6-4922-9f8a-60ab19d089e4",
        settings: { minIntervalSeconds: 10, maxIntervalSeconds: 20, intensity: 0.8 },
        target: { type: "everyone" },
      }),
    )
    expect((await leaderEveryoneFlash).type).toBe("flash")
    expect((await followerEveryoneFlash).type).toBe("flash")
    expect(otherRoomReceivedFlash).toBe(false)

    const promotedFollower = nextMessage(follower)
    await closeSocket(leader)
    expect(roomState(await promotedFollower)).toMatchObject({ role: "leader", memberCount: 1 })
    await closeSocket(follower)
    await closeSocket(otherRoomMember)
    await server.close()
  })

  it("Given a joined member, When it targets a stale participant, Then the server rejects the sender", async () => {
    const server = createRoomServer({ port: 0 })
    await server.ready
    const socket = await connect(`ws://127.0.0.1:${server.port}`)
    const joined = nextMessage(socket)
    socket.send(JSON.stringify({ version: 2, type: "join", roomCode: "room-a" }))
    await joined
    const closed = once(socket, "close")
    socket.send(
      JSON.stringify({
        version: 2,
        type: "flash",
        eventId: "ad40410c-395d-454b-b0aa-43706a6f1b4a",
        settings: { minIntervalSeconds: 10, maxIntervalSeconds: 20, intensity: 0.8 },
        target: { type: "participants", participantIds: ["c7f1c2bd-1ae1-47c4-b621-2a44525de73d"] },
      }),
    )

    const [code] = await closed
    expect(code).toBe(1008)
    await server.close()
  })

  it("Given a member sends malformed data, When the server receives it, Then the member is rejected", async () => {
    const server = createRoomServer({ port: 0 })
    await server.ready
    const socket = await connect(`ws://127.0.0.1:${server.port}`)
    const closed = once(socket, "close")
    socket.send("not-json")

    const [code] = await closed
    expect(code).toBe(1008)
    await server.close()
  })
})
