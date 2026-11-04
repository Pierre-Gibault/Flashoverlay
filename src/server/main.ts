import { z } from "zod"
import { createRoomServer } from "./room-server.js"

const EnvironmentSchema = z.object({
  HOST: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65_535).optional(),
})

const environment = EnvironmentSchema.parse(process.env)
const server = createRoomServer({
  ...(environment.HOST === undefined ? {} : { host: environment.HOST }),
  ...(environment.PORT === undefined ? {} : { port: environment.PORT }),
})

void server.ready.then(() => {
  console.log(`Flashbang room server listening on ${environment.HOST ?? "0.0.0.0"}:${server.port}`)
})

const stop = (): void => {
  void server.close().then(() => process.exit(0))
}

process.once("SIGINT", stop)
process.once("SIGTERM", stop)
