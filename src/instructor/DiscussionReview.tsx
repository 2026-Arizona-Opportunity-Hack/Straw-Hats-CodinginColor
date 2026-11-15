import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../shared/supabase'
import type { DiscussionNote } from '../shared/types/activities'
import { Dialog } from './ui'

type ReviewNote = DiscussionNote & { className: string }

async function review(activityId: string, hideId?: string): Promise<ReviewNote[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('review_discussion_notes', { p_activity_id: activityId, p_hide_id: hideId ?? null })
  if (error) throw error
  return data
}

export function DiscussionReview({ activityId, onClose }: { activityId: string; onClose: () => void }) {
  const client = useQueryClient()
  const queryKey = ['review-discussion', activityId]
  const notes = useQuery({ queryKey, queryFn: () => review(activityId) })
  const hide = useMutation({
    mutationFn: (id: string) => review(activityId, id),
    onSuccess: next => {
      client.setQueryData(queryKey, next)
      void client.invalidateQueries({ queryKey: ['classmate-notes'] })
    },
  })
  return <Dialog title="Review classmate notes" onClose={onClose}>
    {notes.isPending && <p role="status">Loading class notes…</p>}
    {notes.isError && <p className="ic-error" role="alert">Could not load class notes.</p>}
    {hide.isError && <p className="ic-error" role="alert">Could not hide that note. Try again.</p>}
    {notes.data?.length === 0 && <p>No shared class notes yet.</p>}
    {!!notes.data?.length && <ul className="ic-stack">{notes.data.map(note => <li key={note.id} className="cic-classmate-note">
      <strong>{note.className}</strong>
      {Object.entries(note.answers).map(([field, answer]) => <p className="ic-preserve" key={field}>{answer}</p>)}
      <button className="ic-button ic-fit" type="button" disabled={hide.isPending} onClick={() => hide.mutate(note.id)}>Hide note</button>
    </li>)}</ul>}
  </Dialog>
}
