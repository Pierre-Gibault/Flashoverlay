import { describe, expect, it } from "vitest"
import { createFlashQueue } from "./flash-delivery.js"

describe("createFlashQueue", () => {
  it("delivers a manual flash requested before the overlay renderer is ready", () => {
    const delivered: string[] = []
    const queue = createFlashQueue((value: string) => delivered.push(value))

    queue.send("manual-trigger")

    expect(delivered).toEqual([])

    queue.markReady()

    expect(delivered).toEqual(["manual-trigger"])
  })

  it("delivers the latest queued flash when several requests arrive before readiness", () => {
    const delivered: string[] = []
    const queue = createFlashQueue((value: string) => delivered.push(value))

    queue.send("first")
    queue.send("latest")
    queue.markReady()
    queue.send("after-ready")

    expect(delivered).toEqual(["latest", "after-ready"])
  })
})
