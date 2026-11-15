const IDLE_LIMIT_MS = 60_000

export type ActivityTimeSample = {
  milliseconds: number
  finish: (saved: boolean) => void
}

/** Estimates foreground work time. Interaction renews the window without storing any input. */
export function createActivityClock(now = () => performance.now()) {
  let lastMeasured = now()
  let activeThrough: number | null = null
  let elapsed = 0
  let pending: ActivityTimeSample | undefined

  function measure(time: number) {
    if (activeThrough !== null) {
      elapsed += Math.max(0, Math.min(activeThrough, time) - lastMeasured)
    }
    lastMeasured = time
  }

  return {
    setForeground(foreground: boolean) {
      if (foreground === (activeThrough !== null)) return
      const time = now()
      measure(time)
      activeThrough = foreground ? time + IDLE_LIMIT_MS : null
    },
    recordInteraction() {
      if (activeThrough === null) return
      const time = now()
      measure(time)
      activeThrough = time + IDLE_LIMIT_MS
    },
    beginAttempt(): ActivityTimeSample | undefined {
      if (pending) return
      measure(now())
      // Carry a fractional millisecond forward so repeated saves don't round it twice.
      const milliseconds = Math.floor(elapsed)
      const sample: ActivityTimeSample = {
        milliseconds,
        finish(saved) {
          if (pending !== sample) return
          if (saved) elapsed -= milliseconds
          pending = undefined
        },
      }
      pending = sample
      return sample
    },
  }
}
