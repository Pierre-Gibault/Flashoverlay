export type FlashQueue<T> = {
  readonly markReady: () => void
  readonly send: (value: T) => void
}

export function createFlashQueue<T>(deliver: (value: T) => void): FlashQueue<T> {
  let ready = false
  let pending: T | null = null

  return {
    markReady: () => {
      ready = true
      if (pending !== null) {
        deliver(pending)
        pending = null
      }
    },
    send: (value) => {
      if (ready) {
        deliver(value)
        return
      }

      pending = value
    },
  }
}
