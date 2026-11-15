import type { DiscussionNote } from '../shared/types/activities'

export function DiscussionNotes({ notes, fields }: { notes: DiscussionNote[]; fields: { id: string; prompt: string }[] }) {
  const visible = notes.slice(0, 15)
  return <section className="space-y-2">
    <h4 className="font-semibold text-brand">Classmate answers</h4>
    {visible.length ? <ul className="cic-classmate-notes" aria-label="Anonymous classmate answers" tabIndex={0}>
      {visible.map(note => <li key={note.id} className="cic-classmate-note">
        {fields.map(field => note.answers[field.id] && <div key={field.id}>
          {fields.length > 1 && <p className="text-sm font-semibold">{field.prompt}</p>}
          <p className="whitespace-pre-wrap break-words">{note.answers[field.id]}</p>
        </div>)}
      </li>)}
    </ul> : <p className="text-sm">Classmate answers will appear here as students submit.</p>}
  </section>
}
