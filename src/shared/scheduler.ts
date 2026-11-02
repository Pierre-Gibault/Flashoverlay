export type SchedulerStatus = "idle" | "running" | "paused"

export type SchedulerSettings = {
  readonly minIntervalSeconds: number
  readonly maxIntervalSeconds: number
}

export type SchedulerSnapshot = {
  readonly status: SchedulerStatus
}

export type TimerApi<TTimer> = {
  readonly setTimeout: (callback: () => void, delayMilliseconds: number) => TTimer
  readonly clearTimeout: (timer: TTimer) => void
}

export type SchedulerDependencies<TTimer> = {
  readonly timers: TimerApi<TTimer>
  readonly randomUnit: () => number
  readonly onElapsed: () => void
}

export function randomDelayMilliseconds(
  randomUnit: number,
  settings: SchedulerSettings,
): number {
  const boundedUnit = Math.min(Math.max(randomUnit, 0), 0.999_999_999)
  const minimumMilliseconds = settings.minIntervalSeconds * 1000
  const maximumMilliseconds = settings.maxIntervalSeconds * 1000
  return Math.floor(minimumMilliseconds + boundedUnit * (maximumMilliseconds - minimumMilliseconds))
}

export class RandomScheduler<TTimer> {
  private timer: TTimer | null = null
  private status: SchedulerStatus = "idle"
  private settings: SchedulerSettings | null = null

  public constructor(private readonly dependencies: SchedulerDependencies<TTimer>) {}

  public start(settings: SchedulerSettings): void {
    this.clearPendingTimer()
    this.settings = settings
    this.status = "running"
    this.scheduleNext()
  }

  public pause(): void {
    if (this.status !== "running") {
      return
    }

    this.clearPendingTimer()
    this.status = "paused"
  }

  public resume(): void {
    if (this.status !== "paused") {
      return
    }

    this.status = "running"
    this.scheduleNext()
  }

  public stop(): void {
    this.clearPendingTimer()
    this.status = "idle"
  }

  public snapshot(): SchedulerSnapshot {
    return { status: this.status }
  }

  private scheduleNext(): void {
    if (this.settings === null || this.status !== "running") {
      return
    }

    const delayMilliseconds = randomDelayMilliseconds(this.dependencies.randomUnit(), this.settings)
    this.timer = this.dependencies.timers.setTimeout(() => {
      this.timer = null
      if (this.status !== "running") {
        return
      }

      this.dependencies.onElapsed()
      this.scheduleNext()
    }, delayMilliseconds)
  }

  private clearPendingTimer(): void {
    if (this.timer === null) {
      return
    }

    this.dependencies.timers.clearTimeout(this.timer)
    this.timer = null
  }
}
