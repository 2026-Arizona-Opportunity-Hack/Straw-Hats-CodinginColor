import { describe, expect, it } from 'vitest'
import { createActivityClock } from './activityTime'

function setup() {
  let now = 0
  const clock = createActivityClock(() => now)
  return { clock, advance: (ms: number) => { now += ms } }
}

describe('activity time', () => {
  it('caps idle time and starts counting again on interaction', () => {
    const { clock, advance } = setup()
    clock.setForeground(true)
    advance(95_000)
    clock.recordInteraction()
    advance(5_000)

    expect(clock.beginAttempt()?.milliseconds).toBe(65_000)
  })

  it('renews the idle window after an interaction during active work', () => {
    const { clock, advance } = setup()
    clock.setForeground(true)
    advance(40_000)
    clock.recordInteraction()
    advance(40_000)

    expect(clock.beginAttempt()?.milliseconds).toBe(80_000)
  })

  it('stops while unfocused or hidden and resumes with a fresh window', () => {
    const { clock, advance } = setup()
    clock.setForeground(true)
    advance(12_000)
    clock.setForeground(false)
    advance(90_000)
    clock.recordInteraction()
    advance(15_000)
    clock.setForeground(true)
    advance(30_000)
    clock.setForeground(true) // A duplicate focus or visibility event doesn't renew the window.
    advance(35_000)

    expect(clock.beginAttempt()?.milliseconds).toBe(72_000)
  })

  it('retries elapsed time on failure and consumes only the successful sample', () => {
    const { clock, advance } = setup()
    clock.setForeground(true)
    advance(10_000)
    const first = clock.beginAttempt()!
    expect(first.milliseconds).toBe(10_000)
    expect(clock.beginAttempt()).toBeUndefined()

    advance(3_000)
    first.finish(false)
    const second = clock.beginAttempt()!
    expect(second.milliseconds).toBe(13_000)

    advance(4_000)
    second.finish(true)
    second.finish(true)
    first.finish(true)
    expect(clock.beginAttempt()?.milliseconds).toBe(4_000)
  })

  it('leaves the prior activity clock behind when starting a new activity', () => {
    const { clock: first, advance } = setup()
    first.setForeground(true)
    advance(25_000)
    const oldSample = first.beginAttempt()!
    const second = createActivityClock(() => 25_000)
    second.setForeground(true)
    oldSample.finish(true)

    expect(second.beginAttempt()?.milliseconds).toBe(0)
  })
})
