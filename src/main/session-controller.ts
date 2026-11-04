import { type AppSettings, DEFAULT_SETTINGS, type SessionState, SessionStatus } from "../shared/protocol.js"
import { FLASH_SEQUENCE_MS } from "../shared/flash-timing.js"
import { RandomScheduler, type SchedulerStatus } from "../shared/scheduler.js"
import { OverlayWindow } from "./overlay-window.js"

export class SessionController {
  private settings: AppSettings = DEFAULT_SETTINGS
  private flashTimer: ReturnType<typeof setTimeout> | null = null
  private flashing = false
  private readonly scheduler: RandomScheduler<ReturnType<typeof setTimeout>>

  public constructor(
    private readonly overlay: OverlayWindow,
    private readonly publishState: (state: SessionState) => void,
    private readonly requestFlash: (settings: AppSettings) => void,
  ) {
    this.scheduler = new RandomScheduler({
      timers: { setTimeout, clearTimeout },
      randomUnit: Math.random,
      onElapsed: () => this.requestFlash(this.settings),
    })
  }

  public getState(): SessionState {
    return {
      status: this.flashing ? SessionStatus.flashing : this.toSessionStatus(this.scheduler.snapshot().status),
      settings: this.settings,
    }
  }

  public start(): SessionState {
    this.scheduler.start(this.settings)
    return this.publish()
  }

  public pause(): SessionState {
    this.scheduler.pause()
    return this.publish()
  }

  public resume(): SessionState {
    this.scheduler.resume()
    return this.publish()
  }

  public updateSettings(settings: AppSettings): SessionState {
    this.settings = settings
    if (this.scheduler.snapshot().status === "running") {
      this.scheduler.start(settings)
    }
    return this.publish()
  }

  public trigger(): SessionState {
    this.requestFlash(this.settings)
    return this.getState()
  }

  public renderFlash(settings: AppSettings): void {
    this.triggerFlash(settings)
  }

  public dispose(): void {
    this.scheduler.stop()
    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer)
    }
  }

  private triggerFlash(settings: AppSettings): void {
    this.flashing = true
    this.overlay.flash(settings)
    this.publish()

    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer)
    }

    this.flashTimer = setTimeout(() => {
      this.flashing = false
      this.flashTimer = null
      this.publish()
    }, FLASH_SEQUENCE_MS)
  }

  private publish(): SessionState {
    const state = this.getState()
    this.publishState(state)
    return state
  }

  private toSessionStatus(status: SchedulerStatus): SessionStatus {
    switch (status) {
      case "idle":
        return SessionStatus.idle
      case "running":
        return SessionStatus.running
      case "paused":
        return SessionStatus.paused
    }
  }
}
