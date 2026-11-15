// Owner: Shivraj. Confetti burst plus a short cheer, used by the module player and the course page.
import type { CSSProperties } from 'react'
import './stepper.css'

const CONFETTI = ['#00a850', '#007a3d', '#ffc83d', '#2b5b9e', '#ff7a59', '#9fe0bd']

/** 18 confetti pieces flying out in a circle; positions are fixed so renders stay stable. */
export function Celebration({ cheer }: { cheer: string }) {
  return (
    <>
      <div className="sp-party" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => {
          const angle = (i / 18) * Math.PI * 2
          const dist = 140 + (i % 3) * 50
          return <i key={i} style={{
            '--c': CONFETTI[i % CONFETTI.length], '--d': `${(i % 4) * 40}ms`, '--r': `${(i % 2 ? 1 : -1) * (200 + i * 20)}deg`,
            '--x': `${Math.round(Math.cos(angle) * dist)}px`, '--y': `${Math.round(Math.sin(angle) * dist * 0.7)}px`,
          } as CSSProperties} />
        })}
      </div>
      <p className="sp-badge" role="status">{cheer}</p>
    </>
  )
}
