import { z } from "zod"

export const IPC = {
  getState: "flashoverlay:get-state",
  start: "flashoverlay:start",
  pause: "flashoverlay:pause",
  resume: "flashoverlay:resume",
  trigger: "flashoverlay:trigger",
  updateSettings: "flashoverlay:update-settings",
  stateChanged: "flashoverlay:state-changed",
  flash: "flashoverlay:flash",
} as const

export const SessionStatus = {
  idle: "idle",
  running: "running",
  paused: "paused",
  flashing: "flashing",
} as const

export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus]

export const AppSettingsSchema = z
  .object({
    minIntervalSeconds: z.number().int().min(10).max(3600),
    maxIntervalSeconds: z.number().int().min(10).max(3600),
    intensity: z.number().min(0.2).max(1),
  })
  .refine((settings) => settings.minIntervalSeconds <= settings.maxIntervalSeconds, {
    message: "Minimum interval cannot exceed maximum interval.",
    path: ["maxIntervalSeconds"],
  })

export type AppSettings = Readonly<z.output<typeof AppSettingsSchema>>

export const DEFAULT_SETTINGS: AppSettings = {
  minIntervalSeconds: 45,
  maxIntervalSeconds: 120,
  intensity: 1,
}

export type SessionState = {
  readonly status: SessionStatus
  readonly settings: AppSettings
}

export type FlashEvent = {
  readonly settings: AppSettings
  readonly showGrenade: boolean
}

export const SessionStateSchema = z.object({
  status: z.enum([SessionStatus.idle, SessionStatus.running, SessionStatus.paused, SessionStatus.flashing]),
  settings: AppSettingsSchema,
})

export type FlashOverlayApi = {
  readonly getState: () => Promise<SessionState>
  readonly start: () => Promise<SessionState>
  readonly pause: () => Promise<SessionState>
  readonly resume: () => Promise<SessionState>
  readonly trigger: () => Promise<SessionState>
  readonly updateSettings: (settings: AppSettings) => Promise<SessionState>
  readonly onStateChanged: (callback: (state: SessionState) => void) => () => void
}

export type OverlayApi = {
  readonly onFlash: (callback: (event: FlashEvent) => void) => () => void
}
