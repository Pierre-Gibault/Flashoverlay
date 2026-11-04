import WebSocket, { type RawData } from "ws"
import {
  RoomClientMessageSchema,
  RoomConnectionStatus,
  RoomServerMessageSchema,
  ROOM_PROTOCOL_VERSION,
  type RoomClientMessage,
  type RoomConnectRequest,
  type RoomConnectionStatus as RoomConnectionStatusValue,
  type RoomServerMessage,
} from "../shared/room-protocol.js"

const MAX_MESSAGE_BYTES = 8_192
const RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 5_000] as const

export type RoomClientCallbacks = {
  readonly onConnectionStatus: (status: RoomConnectionStatusValue) => void
  readonly onMessage: (message: RoomServerMessage) => void
}

export interface RoomTransport {
  connect(request: RoomConnectRequest): void
  disconnect(): void
  dispose(): void
  sendFlash(message: Extract<RoomClientMessage, { readonly type: "flash" }>): void
}

export class RoomClient implements RoomTransport {
  private request: RoomConnectRequest | null = null
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private reconnectEnabled = false

  public constructor(private readonly callbacks: RoomClientCallbacks) {}

  public connect(request: RoomConnectRequest): void {
    this.disconnectSocket()
    this.request = request
    this.reconnectEnabled = true
    this.reconnectAttempts = 0
    this.callbacks.onConnectionStatus(RoomConnectionStatus.connecting)
    this.open()
  }

  public disconnect(): void {
    this.reconnectEnabled = false
    this.request = null
    this.disconnectSocket()
    this.callbacks.onConnectionStatus(RoomConnectionStatus.disconnected)
  }

  public dispose(): void {
    this.disconnect()
  }

  public sendFlash(message: Extract<RoomClientMessage, { readonly type: "flash" }>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(RoomClientMessageSchema.parse(message)))
    }
  }

  private open(): void {
    if (this.request === null) {
      return
    }
    const socket = new WebSocket(this.request.serverUrl)
    this.socket = socket
    socket.once("open", () => {
      if (this.socket !== socket || this.request === null) {
        return
      }
      this.reconnectAttempts = 0
      socket.send(JSON.stringify({ version: ROOM_PROTOCOL_VERSION, type: "join", roomCode: this.request.roomCode }))
    })
    socket.on("message", (data, isBinary) => this.handleMessage(socket, data, isBinary))
    socket.once("error", () => undefined)
    socket.once("close", () => this.handleClose(socket))
  }

  private handleMessage(socket: WebSocket, data: RawData, isBinary: boolean): void {
    if (socket !== this.socket || isBinary || !Buffer.isBuffer(data) || data.length > MAX_MESSAGE_BYTES) {
      socket.close(1008, "Invalid server message")
      return
    }
    let candidate: unknown
    try {
      candidate = JSON.parse(data.toString("utf8"))
    } catch (error) {
      if (error instanceof SyntaxError) {
        socket.close(1008, "Invalid server message")
        return
      }
      throw error
    }
    const result = RoomServerMessageSchema.safeParse(candidate)
    if (result.success) {
      this.callbacks.onMessage(result.data)
      return
    }
    socket.close(1008, "Invalid server message")
  }

  private handleClose(socket: WebSocket): void {
    if (socket !== this.socket) {
      return
    }
    this.socket = null
    if (!this.reconnectEnabled || this.request === null) {
      this.callbacks.onConnectionStatus(RoomConnectionStatus.disconnected)
      return
    }
    this.callbacks.onConnectionStatus(RoomConnectionStatus.reconnecting)
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)]
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  private disconnectSocket(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const socket = this.socket
    this.socket = null
    if (socket !== null) {
      socket.close()
    }
  }
}
