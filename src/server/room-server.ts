import { randomUUID } from "node:crypto"
import WebSocket, { WebSocketServer, type RawData } from "ws"
import {
  RoomClientMessageSchema,
  ROOM_PROTOCOL_VERSION,
  type RoomClientMessage,
  type RoomParticipant,
  type RoomRole,
} from "../shared/room-protocol.js"

const MAX_MESSAGE_BYTES = 8_192
const MAX_ROOM_MEMBERS = 100

type RoomMembership = {
  readonly roomCode: string
  readonly role: RoomRole
  readonly participantId: string
  readonly label: string
}

type RoomServerOptions = {
  readonly host?: string
  readonly port?: number
}

type RoomServerInstance = {
  readonly ready: Promise<void>
  readonly port: number
  readonly close: () => Promise<void>
}

export function createRoomServer(options: RoomServerOptions = {}): RoomServerInstance {
  const rooms = new Map<string, Set<WebSocket>>()
  const memberships = new Map<WebSocket, RoomMembership>()
  let nextParticipantLabel = 1
  const server = new WebSocketServer({
    host: options.host ?? "0.0.0.0",
    port: options.port ?? 7331,
    maxPayload: MAX_MESSAGE_BYTES,
  })
  const ready = new Promise<void>((resolve) => server.once("listening", resolve))

  const snapshotParticipants = (members: ReadonlySet<WebSocket>): readonly RoomParticipant[] => {
    const participants: RoomParticipant[] = []
    for (const member of members) {
      const membership = memberships.get(member)
      if (membership !== undefined) {
        participants.push({ id: membership.participantId, label: membership.label, role: membership.role })
      }
    }
    return participants
  }

  const broadcastState = (roomCode: string): void => {
    const members = rooms.get(roomCode)
    if (members === undefined) {
      return
    }
    const participants = snapshotParticipants(members)
    for (const member of members) {
      const membership = memberships.get(member)
      if (membership !== undefined && member.readyState === WebSocket.OPEN) {
        member.send(
          JSON.stringify({
            version: ROOM_PROTOCOL_VERSION,
            type: "room-state",
            roomCode,
            role: membership.role,
            memberCount: members.size,
            participantId: membership.participantId,
            participants,
          }),
        )
      }
    }
  }

  const removeMember = (socket: WebSocket): void => {
    const membership = memberships.get(socket)
    if (membership === undefined) {
      return
    }
    memberships.delete(socket)
    const members = rooms.get(membership.roomCode)
    if (members === undefined) {
      return
    }
    members.delete(socket)
    if (members.size === 0) {
      rooms.delete(membership.roomCode)
      return
    }
    const promoted = [...members][0]
    if (promoted !== undefined) {
      const promotedMembership = memberships.get(promoted)
      if (promotedMembership !== undefined && promotedMembership.role !== "leader") {
        memberships.set(promoted, { ...promotedMembership, role: "leader" })
      }
    }
    broadcastState(membership.roomCode)
  }

  const reject = (socket: WebSocket): void => socket.close(1008, "Invalid room message")

  const parseMessage = (data: RawData, isBinary: boolean): RoomClientMessage | undefined => {
    if (isBinary || !Buffer.isBuffer(data) || data.length > MAX_MESSAGE_BYTES) {
      return undefined
    }
    let candidate: unknown
    try {
      candidate = JSON.parse(data.toString("utf8"))
    } catch (error) {
      if (error instanceof SyntaxError) {
        return undefined
      }
      throw error
    }
    const result = RoomClientMessageSchema.safeParse(candidate)
    if (!result.success) {
      return undefined
    }
    return result.data
  }

  const handleMessage = (socket: WebSocket, data: RawData, isBinary: boolean): void => {
    const message = parseMessage(data, isBinary)
    if (message === undefined) {
      reject(socket)
      return
    }
    switch (message.type) {
      case "join": {
        if (memberships.has(socket)) {
          reject(socket)
          return
        }
        const members = rooms.get(message.roomCode) ?? new Set<WebSocket>()
        if (members.size >= MAX_ROOM_MEMBERS) {
          reject(socket)
          return
        }
        const role: RoomRole = members.size === 0 ? "leader" : "follower"
        members.add(socket)
        rooms.set(message.roomCode, members)
        memberships.set(socket, {
          roomCode: message.roomCode,
          role,
          participantId: randomUUID(),
          label: `Participant ${nextParticipantLabel}`,
        })
        nextParticipantLabel += 1
        broadcastState(message.roomCode)
        return
      }
      case "flash": {
        const membership = memberships.get(socket)
        if (membership === undefined) {
          reject(socket)
          return
        }
        const members = rooms.get(membership.roomCode)
        if (members !== undefined) {
          const membersByParticipantId = new Map<string, WebSocket>()
          for (const member of members) {
            const memberMembership = memberships.get(member)
            if (memberMembership !== undefined && member.readyState === WebSocket.OPEN) {
              membersByParticipantId.set(memberMembership.participantId, member)
            }
          }
          const recipients: WebSocket[] = []
          switch (message.target.type) {
            case "everyone":
              recipients.push(...membersByParticipantId.values())
              break
            case "participants":
              for (const participantId of message.target.participantIds) {
                const recipient = membersByParticipantId.get(participantId)
                if (recipient === undefined) {
                  reject(socket)
                  return
                }
                recipients.push(recipient)
              }
              break
          }
          for (const member of recipients) {
            if (member.readyState === WebSocket.OPEN) {
              member.send(JSON.stringify(message))
            }
          }
        }
        return
      }
    }
  }

  server.on("connection", (socket) => {
    socket.on("message", (data, isBinary) => handleMessage(socket, data, isBinary))
    socket.once("close", () => removeMember(socket))
  })

  return {
    ready,
    get port(): number {
      const address = server.address()
      if (address === null || typeof address === "string") {
        throw new Error("Room server is not listening.")
      }
      return address.port
    },
    close: async () => {
      for (const client of server.clients) {
        client.terminate()
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)))
      })
    },
  }
}
