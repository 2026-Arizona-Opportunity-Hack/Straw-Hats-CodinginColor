// Owner: Jacky (one-card stepper: Shivraj). Shows a module one card at a time, like a
// code.org lesson, so students never face a wall of questions. ?step=N (1-based) opens a card;
// the sidebar uses it. Next unlocks once the card is finished; readings can always continue.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { checkCatPhotoLab, getActivityResponse, getCheckAnswer, getClassmateNotes, getModule, listActivityStatus, recordAttempt } from '../api/student/index.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { isLocalDemo } from '../shared/supabase.ts'
import { Button } from '../shared/ui/index.tsx'
import { Celebration } from './Celebration.tsx'
import { ActivityBlock } from './LessonContent.tsx'
import { needsSubmission, stepTitle, STEP_LABEL } from './steps.ts'
import './stepper.css'

const CHEERS = ['Nice!', 'You got it!', 'Correct!', 'Great job!', 'Nailed it!']

export function ModulePlayer() {
  const { moduleId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const studentId = profile?.id
  const { data: mod, isLoading, isError } = useQuery({
    queryKey: ['module', studentId, moduleId], queryFn: () => getModule(moduleId),
  })
  const activityKey = ['moduleActivities', studentId, moduleId]
  const { data: progress = [], isLoading: progressLoading, isError: progressError } = useQuery({
    queryKey: activityKey, queryFn: () => listActivityStatus(moduleId), enabled: !!mod,
  })
  const [finishedHere, setFinishedHere] = useState<ReadonlySet<string>>(new Set())
  const [cheer, setCheer] = useState<{ text: string; key: number } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const steps = useMemo(() => mod?.lessons.flatMap((lesson) => lesson.activities.map((activity) => ({ lesson, activity }))) ?? [], [mod])
  const statuses = useMemo(() => new Map(progress.map((s) => [s.activity_id, s])), [progress])
  const isDone = (i: number) => {
    const a = steps[i]?.activity
    return !!a && (!needsSubmission(a) || !!statuses.get(a.id)?.submitted || finishedHere.has(a.id))
  }
  /** First required card not finished yet. Optional cards ("Skip for now") never block. */
  const firstOpen = steps.findIndex((s, i) => s.activity.counts_toward_unlock && !isDone(i))
  /** Furthest card the student may open: everything up to and including the first unfinished required one. */
  const reachable = firstOpen === -1 ? steps.length - 1 : firstOpen
  const asked = Number(params.get('step')) - 1
  const current = steps.length ? Math.min(Math.max(Number.isInteger(asked) && asked >= 0 ? asked : reachable, 0), reachable) : 0
  const allDone = steps.length > 0 && firstOpen === -1
  // A card answered on an earlier visit shows what the student wrote, so load their saved answer first.
  const currentId = steps[current]?.activity.id
  const answeredBefore = !!currentId && !!statuses.get(currentId)?.submitted
  const { data: savedAnswer, isLoading: savedLoading } = useQuery({
    queryKey: ['activityResponse', studentId, currentId], queryFn: () => getActivityResponse(currentId!), enabled: answeredBefore,
  })

  // Pin the opening card in the URL. Without this, "first unfinished card" would move as soon as
  // the student answers, jumping them ahead before they read the result. Only Next moves on.
  const hasStep = params.has('step')
  const progressReady = !!mod && !progressLoading
  useEffect(() => {
    if (!hasStep && steps.length && progressReady) setParams({ step: String(current + 1) }, { replace: true })
  }, [hasStep, steps.length, progressReady, current, setParams])
  useEffect(() => { heading.current?.focus() }, [current, moduleId])

  // The final check locks the student in until they submit it: every way out (Back, the step
  // bar, the sidebar, browser back) is blocked and a popup nudges them back, shaking each time.
  // The warm-up never locks. A final check submitted before (a retake) doesn't lock either.
  const testLocked = steps[current]?.activity.type === 'posttest' && !isDone(current)
  const [nudges, setNudges] = useState(0)
  const [nudgeOpen, setNudgeOpen] = useState(false)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const block = testLocked && new URLSearchParams(currentLocation.search).has('step')
      && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
    if (block) { setNudges((n) => n + 1); setNudgeOpen(true) }
    return block
  })
  useEffect(() => { if (blocker.state === 'blocked') blocker.reset() }, [blocker])
  useEffect(() => {
    if (!testLocked) return
    const stay = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', stay)
    return () => window.removeEventListener('beforeunload', stay)
  }, [testLocked])
  useEffect(() => {
    if (!cheer) return
    const t = setTimeout(() => setCheer(null), 1800)
    return () => clearTimeout(t)
  }, [cheer])

  if (isLoading || (mod && progressLoading)) return <p role="status">Loading lesson…</p>
  if (isError || progressError) return <p role="alert">Could not load this module. Try reloading the page.</p>
  if (!mod) return <p>This module is unavailable. <Link className="underline" to="/student">Back to my courses</Link></p>
  if (!steps.length) return <p>This module has no activities yet. <Link className="underline" to={`/student/course/${mod.course_id}`}>Back to the course</Link></p>

  const go = (i: number) => setParams({ step: String(i + 1) })
  const { lesson, activity } = steps[current]
  const done = isDone(current)
  const last = current === steps.length - 1
  const canSkip = !done && !activity.counts_toward_unlock
  // Themed CIC articles draw their own big title; everything else gets the card title here.
  const ownTitle = !(activity.type === 'content' && (activity.content as { presentation?: string }).presentation === 'cic-article')

  function refreshProgress() {
    void queryClient.invalidateQueries({ queryKey: activityKey })
    void queryClient.invalidateQueries({ queryKey: ['moduleStatus', studentId, mod?.course_id] })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to={`/student/course/${mod.course_id}`} className="text-sm font-semibold text-cic-muted hover:text-black">‹ Back to the course</Link>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="st-serif text-2xl">{mod.title}</p>
        <p className="text-sm text-cic-muted" aria-live="polite">Step {current + 1} of {steps.length}</p>
      </div>

      <nav aria-label="Steps in this module" className="mt-3 flex gap-1">
        {steps.map((s, i) => (
          <button key={s.activity.id} type="button" onClick={() => go(i)} disabled={i > reachable}
            className={`sp-seg ${i === current ? 'current' : isDone(i) ? 'done' : ''}`}
            aria-current={i === current ? 'step' : undefined}
            aria-label={`Step ${i + 1}: ${stepTitle(s.activity)}${isDone(i) ? ' (done)' : i > reachable ? ' (locked)' : ''}`} />
        ))}
      </nav>

      <article key={activity.id} className="sp-card relative mt-5 rounded-3xl bg-white p-5 shadow-[0_18px_40px_-28px_rgb(20_24_26/0.5)] sm:p-8">
        {cheer && <Celebration key={cheer.key} cheer={cheer.text} />}
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">{STEP_LABEL[activity.type] ?? 'Step'} · {lesson.title}</p>
        {testLocked && <p className="mt-3 rounded-xl bg-warn-soft px-4 py-2 text-sm font-semibold text-warn">🔒 Final check: finish and submit it before leaving this page.</p>}
        <h1 ref={heading} tabIndex={-1} className={ownTitle ? 'st-serif mb-5 mt-1 text-3xl focus:outline-none' : 'sr-only'}>{stepTitle(activity)}</h1>
        {answeredBefore && savedLoading ? <p role="status">Loading your answer…</p> :
        <ActivityBlock activity={activity} status={statuses.get(activity.id)} onAttempt={recordAttempt} hideTitle answerOnce
          previousResponse={savedAnswer} loadCheckAnswer={getCheckAnswer}
          onSaved={() => { setFinishedHere((s) => new Set(s).add(activity.id)); refreshProgress() }}
          onResult={(r) => { if (r.is_correct) setCheer({ text: CHEERS[Math.floor(Math.random() * CHEERS.length)], key: Date.now() }) }}
          allowScripts={isLocalDemo} studentId={studentId} loadDiscussion={getClassmateNotes}
          labStorageKey={studentId ? 'cic-learn.live-lab:' + studentId + ':' + activity.id : undefined}
          verifyLab={async (source, signal) => {
            const verified = await checkCatPhotoLab(activity.id, source, signal)
            if (verified.completed) { setFinishedHere((s) => new Set(s).add(activity.id)); refreshProgress() }
            return verified
          }} />}
      </article>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={() => go(current - 1)} disabled={current === 0}>‹ Back</Button>
        <div className="flex items-center gap-3">
          {canSkip && !last && <button type="button" className="text-sm font-semibold text-cic-muted underline-offset-2 hover:underline" onClick={() => go(current + 1)}>Skip for now</button>}
          {last
            ? <Button type="button" disabled={!allDone} onClick={() => navigate(`/student/course/${mod.course_id}`, { state: { finishedModule: mod.id } })}>Finish module</Button>
            : <Button type="button" disabled={!done} onClick={() => go(current + 1)}>{done ? 'Next ›' : 'Finish this step to continue'}</Button>}
        </div>
      </div>

      {nudgeOpen && testLocked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgb(11_61_35/0.45)] p-4 backdrop-blur-[2px]" onClick={() => setNudgeOpen(false)}>
          <div key={nudges} role="alertdialog" aria-modal="true" aria-labelledby="nudge-title" aria-describedby="nudge-text"
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl ${nudges > 1 ? 'sp-shake' : 'sp-nudge-in'}`}>
            <p className="text-4xl" aria-hidden="true">✋</p>
            <h2 id="nudge-title" className="mt-2 text-xl font-bold">Finish the final check first</h2>
            <p id="nudge-text" className="mt-1 text-cic-muted">
              {nudges > 2 ? 'Still here! Submit your answers, then you can go anywhere.' : 'You can leave once you submit your answers. It shows what you learned in this module.'}
            </p>
            <Button type="button" className="mt-5 w-full" autoFocus onClick={() => setNudgeOpen(false)}>Back to my test</Button>
          </div>
        </div>
      )}

      {allDone && last && (
        <p role="status" className="mt-6 flex items-center gap-3 rounded-2xl bg-brand-tint p-4 font-semibold text-brand">
          <span className="sp-trophy text-3xl" aria-hidden="true">🏆</span> Every step done. Finish the module to see what unlocks next!
        </p>
      )}
    </div>
  )
}
