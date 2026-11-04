import WebSocket from "ws"

const port = process.env.PORT ?? "7331"
const socket = new WebSocket(`ws://127.0.0.1:${port}`)
const timeout = setTimeout(() => {
  socket.terminate()
  process.exit(1)
}, 4_000)

socket.once("open", () => {
  clearTimeout(timeout)
  socket.close()
  process.exit(0)
})

socket.once("error", () => {
  clearTimeout(timeout)
  process.exit(1)
})
