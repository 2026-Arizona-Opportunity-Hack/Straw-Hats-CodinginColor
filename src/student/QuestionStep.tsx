// Owner: Jacky. Answer questions an instructor wrote: instant feedback and retry, like Khan Academy.
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import type { Activity, Question } from '../instructor/model.ts'
import { Button } from '../shared/ui/index.tsx'

type Answer = number | string | undefined

/** Pretests measure what a student already knows, so they never show right or wrong. */
const NO_FEEDBACK: Activity['type'][] = ['pretest']

const choicesOf = (q: Question) => q.choices.map((label, index) => ({ label, index })).filter((c) => c.label.trim())

export function QuestionStep({ activity, done, onDone }: {
  activity: Activity
  done: boolean
  /** score: share of graded questions right on the first try, or null when nothing is graded. */
  onDone: (score: number | null) => void
}) {
  const formId = useId()
  const questions = activity.questions.filter((q) => q.prompt.trim())
  const [answers, setAnswers] = useState<Answer[]>(() => questions.map(() => undefined))
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState('')
  const showFeedback = !NO_FEEDBACK.includes(activity.type)

  const isGraded = (q: Question) => showFeedback && q.answer != null && choicesOf(q).length > 0
  const isRight = (q: Question, a: Answer) => a === q.answer

  function check(e: FormEvent) {
    e.preventDefault()
    const missing = questions.findIndex((q, i) => (choicesOf(q).length ? answers[i] === undefined : !String(answers[i] ?? '').trim()))
    if (missing >= 0) {
      setError(questions.length > 1 ? `Answer question ${missing + 1} to continue.` : 'Choose or write an answer to continue.')
      return
    }
    setError('')
    const firstTry = !checked && !done
    setChecked(true)
    if (firstTry) {
      const graded = questions.filter(isGraded)
      const right = graded.filter((q) => isRight(q, answers[questions.indexOf(q)])).length
      onDone(graded.length ? right / graded.length : null)
    }
  }

  function retry(i: number) {
    setAnswers((prev) => prev.map((a, j) => (j === i ? undefined : a)))
    setChecked(false)
  }

  return (
    <form onSubmit={check} className="space-y-6" noValidate>
      {done && !checked && <p className="text-sm text-cic-muted">You already finished this step. Answer again to practice, or continue.</p>}
      {questions.map((q, i) => {
        const choices = choicesOf(q)
        const a = answers[i]
        const feedback = checked && isGraded(q) && a !== undefined
        const right = feedback && isRight(q, a)
        return (
          <fieldset key={i} className="space-y-3">
            <legend className="mb-2 text-lg font-semibold">
              {questions.length > 1 && <span className="mr-2 text-cic-muted">{i + 1}.</span>}{q.prompt}
            </legend>
            {choices.length ? (
              <div className="grid gap-2">
                {choices.map((c) => {
                  const selected = a === c.index
                  const showRight = feedback && c.index === q.answer && right
                  const showWrong = feedback && selected && !right
                  return (
                    <label
                      key={c.index}
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2 font-medium ${
                        showRight ? 'border-brand bg-brand-tint'
                          : showWrong ? 'border-danger bg-danger-soft'
                          : selected ? 'border-brand bg-brand-subtle'
                          : 'border-divider bg-white hover:border-brand-accent'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${formId}-${i}`}
                        checked={selected}
                        disabled={checked && (!feedback || right)}
                        onChange={() => { setAnswers((prev) => prev.map((x, j) => (j === i ? c.index : x))); setChecked(false) }}
                        className="size-5 accent-[#007a3d]"
                      />
                      <span className="flex-1">{c.label}</span>
                      {showRight && <CheckCircle2 aria-hidden="true" className="size-5 text-brand" />}
                      {showWrong && <XCircle aria-hidden="true" className="size-5 text-danger" />}
                    </label>
                  )
                })}
              </div>
            ) : (
              <textarea
                aria-label={q.prompt}
                rows={4}
                maxLength={2000}
                value={String(a ?? '')}
                onChange={(e) => { const v = e.target.value; setAnswers((prev) => prev.map((x, j) => (j === i ? v : x))) }}
                readOnly={checked}
                placeholder="Write your answer…"
                className="w-full rounded-xl border border-input bg-white p-3"
              />
            )}
            <div role="status" aria-live="polite">
              {feedback && right && <p className="flex items-center gap-2 font-semibold text-brand"><CheckCircle2 aria-hidden="true" className="size-5" /> Correct!</p>}
              {feedback && !right && (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="flex items-center gap-2 font-semibold text-danger"><XCircle aria-hidden="true" className="size-5" /> Not quite.</p>
                  <Button size="sm" variant="secondary" onClick={() => retry(i)}><RotateCcw aria-hidden="true" /> Try again</Button>
                </div>
              )}
            </div>
          </fieldset>
        )
      })}
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {!checked && <Button type="submit">{showFeedback && questions.some(isGraded) ? 'Check answer' : 'Save answer'}{questions.length > 1 ? 's' : ''}</Button>}
      {checked && !questions.some(isGraded) && <p role="status" className="font-semibold text-brand">Answer saved.</p>}
    </form>
  )
}
