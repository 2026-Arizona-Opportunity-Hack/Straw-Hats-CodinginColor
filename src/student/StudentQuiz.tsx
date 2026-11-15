import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getClassQuiz, submitClassQuiz, type ClassQuiz, type LearnerQuizBlock, type QuizResponses } from '../api/student/classQuizzes.ts'
import { formatDue } from '../instructor/assignments/display.ts'
import { isHttpsUrl, linkEmbed, questionKinds } from '../instructor/assignments/model.ts'
import { useAuth } from '../shared/auth/AuthContext.tsx'
import { Button, FormStatus, Input } from '../shared/ui/index.tsx'
import { InteractiveHtmlFrame } from '../shared/ui/InteractiveHtmlFrame.tsx'
import './student.css'

export function StudentQuiz() {
  const { quizId = '' } = useParams()
  const { profile } = useAuth()
  const queryKey = ['classQuiz', profile?.id, quizId]
  const quiz = useQuery({ queryKey, queryFn: () => getClassQuiz(quizId), retry: false })
  const qc = useQueryClient()
  const submission = useMutation({
    mutationFn: (responses: QuizResponses) => submitClassQuiz(quizId, responses, quiz.data?.attemptCount ?? 0),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: ['classQuizzes', profile?.id] }),
      ])
    },
  })

  return <section className="mx-auto max-w-3xl space-y-6">
    <Link to="/student/classroom" className="font-semibold text-brand hover:underline">‹ My classroom</Link>
    {quiz.isPending && <p role="status">Loading quiz…</p>}
    {quiz.isError && <p role="alert">Could not load this quiz. Try reloading.</p>}
    {quiz.isSuccess && !quiz.data && <p role="status">This quiz isn’t available.</p>}
    {quiz.data && <QuizForm key={quiz.data.id + ':' + quiz.data.attemptCount} quiz={quiz.data}
      saving={submission.isPending} error={submission.error?.message} saved={submission.isSuccess} onSubmit={submission.mutate} />}
  </section>
}

function QuizForm({ quiz, saving, error, saved, onSubmit }: {
  quiz: ClassQuiz; saving: boolean; error?: string; saved: boolean; onSubmit: (responses: QuizResponses) => void
}) {
  const [responses, setResponses] = useState(quiz.responses)
  const set = (id: string, value: QuizResponses[string]) => setResponses(current => ({ ...current, [id]: value }))
  const readOnly = !quiz.canSubmit || saving
  return <>
    <header className="space-y-2 border-b border-divider pb-4">
      <p className="text-sm text-cic-muted">{quiz.className}</p>
      <h1 className="st-serif text-4xl">{quiz.title}</h1>
      <p className="text-sm text-cic-muted">{quiz.dueAt ? 'Due ' + formatDue(quiz.dueAt) : 'No due date'}
        {quiz.maxAttempts !== null && ' · ' + quiz.attemptCount + ' of ' + quiz.maxAttempts + ' attempts used'}</p>
    </header>
    {quiz.instructions && <p className="whitespace-pre-wrap">{quiz.instructions}</p>}
    {quiz.submittedAt && <p role="status" className="font-semibold text-brand">
      {quiz.gradedAt ? 'Graded' : 'Submitted'} · {new Date(quiz.submittedAt).toLocaleString()}
    </p>}
    {quiz.gradedAt && quiz.feedback && <section className="rounded-lg border border-divider bg-white p-4">
      <h2 className="font-semibold">Teacher feedback</h2>
      <p className="whitespace-pre-wrap">{quiz.feedback}</p>
    </section>}
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!readOnly) onSubmit(responses) }}>
      <fieldset disabled={readOnly} className="space-y-5">
        <legend className="sr-only">Quiz content</legend>
        {quiz.blocks.map((block, index) => <QuizBlock key={block.id} block={block} response={responses[block.id]}
          number={quiz.blocks.slice(0, index + 1).filter(item => item.type === 'question').length}
          onRespond={value => set(block.id, value)} />)}
      </fieldset>
      {quiz.canSubmit && quiz.blocks.length > 0 && <Button type="submit" disabled={saving}>
        {saving ? 'Submitting…' : quiz.submittedAt ? 'Submit another attempt' : 'Submit quiz'}
      </Button>}
      <FormStatus error={error} success={saved && !quiz.submittedAt ? 'Your quiz was submitted.' : undefined} />
    </form>
  </>
}

const panel = 'space-y-3 rounded-lg border border-divider bg-white p-4'

function QuizBlock({ block, number, response, onRespond }: {
  block: LearnerQuizBlock; number: number; response: QuizResponses[string] | undefined; onRespond: (value: QuizResponses[string]) => void
}) {
  if (block.type === 'text') return <p className="whitespace-pre-wrap">{block.text}</p>
  if (block.type === 'link') {
    if (!isHttpsUrl(block.url)) return null
    const embed = linkEmbed(block.url)
    return embed ? <iframe className="aspect-video w-full rounded-lg" src={embed}
      title={block.caption || 'Quiz resource'} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      : <a className="font-semibold text-brand underline" href={block.url} target="_blank" rel="noopener noreferrer">
        {block.caption || new URL(block.url).hostname}
      </a>
  }
  if (block.type === 'html') return <InteractiveHtmlFrame html={block.html} title="Quiz resource" />
  if (block.type === 'completion') return <p>{block.title} · Complete this in the linked lesson.</p>
  if (block.type === 'file') return <p className="whitespace-pre-wrap">{block.prompt} Ask your teacher how to turn in your file.</p>
  if (block.type === 'written' || block.type === 'code') return <label className={'block ' + panel}>
    <span className="block whitespace-pre-wrap font-semibold">{block.prompt}</span>
    <textarea rows={block.type === 'code' ? 6 : 4}
      className={'block w-full rounded-lg border border-divider p-3 ' + (block.type === 'code' ? 'font-mono' : '')}
      value={typeof response === 'string' ? response : block.starter ?? ''} onChange={event => onRespond(event.target.value)} />
  </label>
  if (block.type !== 'question') return null
  const { question } = block
  const selected = Array.isArray(response) ? response : []
  return <fieldset className={panel}>
    <legend className="px-1 text-sm font-semibold">Question {number} · {questionKinds[question.kind]} · {question.points} {question.points === 1 ? 'point' : 'points'}</legend>
    <p className="whitespace-pre-wrap font-semibold">{question.prompt}</p>
    {question.kind === 'short' || question.kind === 'numeric'
      ? <label className="block">Your answer<Input type={question.kind === 'numeric' ? 'number' : 'text'} step="any"
        value={typeof response === 'string' ? response : ''} onChange={event => onRespond(event.target.value)} /></label>
      : (question.choices ?? []).map((choice, index) => choice.trim() && <label key={index} className="flex items-center gap-2">
        <input type={question.kind === 'multiple' ? 'checkbox' : 'radio'} name={'choice-' + block.id}
          checked={selected.includes(index)} onChange={event => onRespond(question.kind === 'multiple'
            ? event.target.checked ? [...selected, index] : selected.filter(value => value !== index) : [index])} />
        {choice}
      </label>)}
  </fieldset>
}
