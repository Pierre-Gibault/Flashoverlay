import { z } from "zod"
import { AppSettingsSchema } from "./protocol.js"

export const ROOM_PROTOCOL_VERSION = 2
export const RoomRole = { leader: "leader", follower: "follower" } as const
export type RoomRole = (typeof RoomRole)[keyof typeof RoomRole]

export const RoomConnectionStatus = {
  disconnected: "disconnected",
  connecting: "connecting",
  connected: "connected",
  reconnecting: "reconnecting",
} as const
export type RoomConnectionStatus = (typeof RoomConnectionStatus)[keyof typeof RoomConnectionStatus]

const WebSocketUrlSchema = z.string().url().refine((value) => value.startsWith("ws://") || value.startsWith("wss://"), {
  message: "Server URL must use ws:// or wss://.",
})

export const RoomConnectRequestSchema = z.object({
  serverUrl: WebSocketUrlSchema,
  roomCode: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
})
export type RoomConnectRequest = Readonly<z.output<typeof RoomConnectRequestSchema>>

const VersionSchema = z.literal(ROOM_PROTOCOL_VERSION)
const ParticipantIdSchema = z.string().uuid()

export const RoomParticipantSchema = z.object({
  id: ParticipantIdSchema,
  label: z.string().min(1).max(64),
  role: z.enum([RoomRole.leader, RoomRole.follower]),
})
export type RoomParticipant = Readonly<z.output<typeof RoomParticipantSchema>>

const ParticipantIdsSchema = z
  .array(ParticipantIdSchema)
  .min(1)
  .max(100)
  .refine((participantIds) => new Set(participantIds).size === participantIds.length, {
    message: "Participant targets must be unique.",
  })

export const RoomFlashTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("everyone") }),
  z.object({ type: z.literal("participants"), participantIds: ParticipantIdsSchema }),
])
export type RoomFlashTarget = Readonly<z.output<typeof RoomFlashTargetSchema>>
export const EVERYONE_TARGET: RoomFlashTarget = { type: "everyone" }

const FlashMessageSchema = z.object({
  version: VersionSchema,
  type: z.literal("flash"),
  eventId: z.string().uuid(),
  settings: AppSettingsSchema,
  target: RoomFlashTargetSchema,
})

export const RoomClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ version: VersionSchema, type: z.literal("join"), roomCode: RoomConnectRequestSchema.shape.roomCode }),
  FlashMessageSchema,
])
export type RoomClientMessage = Readonly<z.output<typeof RoomClientMessageSchema>>

export const RoomServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    version: VersionSchema,
    type: z.literal("room-state"),
    roomCode: RoomConnectRequestSchema.shape.roomCode,
    role: z.enum([RoomRole.leader, RoomRole.follower]),
    memberCount: z.number().int().min(1).max(100),
    participantId: ParticipantIdSchema,
    participants: z.array(RoomParticipantSchema).min(1).max(100),
  }),
  FlashMessageSchema,
])
export type RoomServerMessage = Readonly<z.output<typeof RoomServerMessageSchema>>

export const RoomStateSchema = z.object({
  status: z.enum([
    RoomConnectionStatus.disconnected,
    RoomConnectionStatus.connecting,
    RoomConnectionStatus.connected,
    RoomConnectionStatus.reconnecting,
  ]),
  serverUrl: WebSocketUrlSchema.nullable(),
  roomCode: RoomConnectRequestSchema.shape.roomCode.nullable(),
  role: z.enum([RoomRole.leader, RoomRole.follower]).nullable(),
  memberCount: z.number().int().min(0).max(100),
  participantId: ParticipantIdSchema.nullable().optional(),
  participants: z.array(RoomParticipantSchema).max(100).optional(),
  selectedTarget: RoomFlashTargetSchema.nullable().optional(),
})
export type RoomState = Readonly<z.output<typeof RoomStateSchema>>
