import { useEffect, useState } from 'react'
import { generationStages, type GenerationStage } from '../shared/curriculum/progress'

export function GenerationStatus({ stage, title }: { stage: GenerationStage; title: string }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])
  const elapsed = String(Math.floor(seconds / 60)) + ':' + String(seconds % 60).padStart(2, '0')
  return <div className="ic-generation">
    <p role="status"><strong>{title}</strong> {generationStages[stage]}</p>
    <div className="ic-row">
      <progress aria-label={title} />
      <span aria-hidden="true">{elapsed}</span>
    </div>
  </div>
}
