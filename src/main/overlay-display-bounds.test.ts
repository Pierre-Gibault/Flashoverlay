import { describe, expect, it } from "vitest"
import { overlayBoundsFor } from "./overlay-display-bounds.js"

describe("overlayBoundsFor", () => {
  it("Given primary and positioned secondary displays with mixed scale factors, When overlay bounds are selected, Then the global display bounds are preserved exactly", () => {
    const primary = {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    }
    const right = {
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      scaleFactor: 1.5,
      workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
    }
    const left = {
      bounds: { x: -1280, y: 160, width: 1280, height: 1024 },
      scaleFactor: 1.25,
      workArea: { x: -1280, y: 160, width: 1280, height: 984 },
    }
    const above = {
      bounds: { x: 320, y: -900, width: 1600, height: 900 },
      scaleFactor: 2,
      workArea: { x: 320, y: -900, width: 1600, height: 860 },
    }

    expect(overlayBoundsFor(primary)).toEqual(primary.bounds)
    expect(overlayBoundsFor(right)).toEqual(right.bounds)
    expect(overlayBoundsFor(left)).toEqual(left.bounds)
    expect(overlayBoundsFor(above)).toEqual(above.bounds)
  })
})
