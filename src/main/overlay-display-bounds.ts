export type OverlayBounds = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type DisplayWithBounds = {
  readonly bounds: OverlayBounds
}

export function overlayBoundsFor(display: DisplayWithBounds): OverlayBounds {
  return { ...display.bounds }
}
