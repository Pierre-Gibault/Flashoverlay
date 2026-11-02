import { describe, expect, it } from "vitest"
import { RandomScheduler } from "./scheduler.js"

type ScheduledCallback = {
  readonly callback: () => void
  readonly delayMilliseconds: number
}

function createFakeTimers(): {
  readonly timers: {
    readonly setTimeout: (callback: () => void, delayMilliseconds: number) => number
    readonly clearTimeout: (timerId: number) => void
  }
  readonly scheduled: Map<number, ScheduledCallback>
} {
  let nextTimerId = 1
  const scheduled = new Map<number, ScheduledCallback>()

  return {
    timers: {
      setTimeout: (callback, delayMilliseconds) => {
        const timerId = nextTimerId
        nextTimerId += 1
        scheduled.set(timerId, { callback, delayMilliseconds })
        return timerId
      },
      clearTimeout: (timerId) => {
        scheduled.delete(timerId)
      },
    },
    scheduled,
  }
}

describe("RandomScheduler", () => {
  it("schedules recursively with a bounded randomized delay", () => {
    const fake = createFakeTimers()
    let triggerCount = 0
    const scheduler = new RandomScheduler({
      timers: fake.timers,
      randomUnit: () => 0.5,
      onElapsed: () => {
        triggerCount += 1
      },
    })

    scheduler.start({ minIntervalSeconds: 10, maxIntervalSeconds: 20 })
    const firstEntry = [...fake.scheduled.entries()][0]

    expect(firstEntry).toBeDefined()
    const [firstTimerId, firstTimer] = firstEntry ?? [0, undefined]
    expect(firstTimer?.delayMilliseconds).toBe(15_000)

    fake.scheduled.delete(firstTimerId)
    firstTimer?.callback()

    expect(triggerCount).toBe(1)
    expect([...fake.scheduled.values()][0]?.delayMilliseconds).toBe(15_000)
  })

  it("cancels the pending recursive callback while paused", () => {
    const fake = createFakeTimers()
    const scheduler = new RandomScheduler({
      timers: fake.timers,
      randomUnit: () => 0,
      onElapsed: () => undefined,
    })

    scheduler.start({ minIntervalSeconds: 10, maxIntervalSeconds: 20 })
    scheduler.pause()

    expect(fake.scheduled.size).toBe(0)
    expect(scheduler.snapshot().status).toBe("paused")
  })
})
