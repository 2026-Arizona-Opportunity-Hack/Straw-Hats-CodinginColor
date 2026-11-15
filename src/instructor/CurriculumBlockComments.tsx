import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { supabase } from '../shared/supabase';
import type { CurriculumBlockComment } from '../shared/types/db';
import { Dialog } from './ui';

type BlockScope = { activityId: string; classId?: string };
type CommentProps = BlockScope & { viewerId: string; viewerName?: string; activityTitle?: string };

const limit = 2000;
const fields = 'id, activity_id, class_id, author_id, author_name, body, created_at';
const demoKey = ({ activityId, classId }: BlockScope) => `cic-learn.curriculum-comments.v1:${classId ?? 'global'}:${activityId}`;

function readDemoComments(scope: BlockScope): CurriculumBlockComment[] {
  try {
    const stored = JSON.parse(localStorage.getItem(demoKey(scope)) ?? '[]');
    return Array.isArray(stored) ? stored : [];
  }
  catch { return []; }
}

async function readComments(scope: BlockScope): Promise<CurriculumBlockComment[]> {
  if (!supabase) return readDemoComments(scope);
  const query = supabase.from('curriculum_block_comments').select(fields).eq('activity_id', scope.activityId);
  const { data, error } = await (scope.classId ? query.eq('class_id', scope.classId) : query.is('class_id', null))
    .order('created_at', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  return data;
}

async function postComment(scope: CommentProps, body: string): Promise<CurriculumBlockComment> {
  const values = { activity_id: scope.activityId, class_id: scope.classId ?? null, body };
  if (!supabase) {
    const comment = {
      ...values,
      id: crypto.randomUUID(),
      author_id: scope.viewerId,
      author_name: scope.viewerName || 'Demo staff',
      created_at: new Date().toISOString(),
    };
    localStorage.setItem(demoKey(scope), JSON.stringify([comment, ...readDemoComments(scope)]));
    return comment;
  }
  const { error, data } = await supabase.from('curriculum_block_comments').insert(values).select(fields).single();
  if (error) throw error;
  return data;
}

export function CurriculumBlockComments(props: CommentProps) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="ic-button ic-fit" onClick={() => setOpen(true)}
      aria-label={props.activityTitle ? `Comments on ${props.activityTitle}` : 'Block comments'}>
      <MessageSquare size={16} aria-hidden="true" /> Comments
    </button>
    {open && <CommentThread {...props} onClose={() => setOpen(false)} />}
  </>;
}

function CommentThread({ onClose, ...scope }: CommentProps & { onClose: () => void }) {
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();
  const queryKey = ['curriculum-block-comments', scope.viewerId, scope.classId ?? null, scope.activityId];
  const comments = useQuery({ queryKey, queryFn: () => readComments(scope) });
  const post = useMutation({
    mutationFn: (body: string) => postComment(scope, body),
    onSuccess: saved => {
      setDraft('');
      queryClient.setQueryData<CurriculumBlockComment[]>(queryKey, current => [saved, ...(current ?? []).filter(comment => comment.id !== saved.id)]);
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const body = draft.trim();

  return <Dialog title={scope.activityTitle ? `Comments on ${scope.activityTitle}` : 'Block comments'} onClose={onClose}>
    <div className="ic-stack">
      <p className="ic-note">{scope.classId ? 'Visible to staff who manage this class.' : 'Visible to staff with access to this curriculum.'}</p>
      {comments.isPending && <p role="status">Loading comments…</p>}
      {comments.isError && <div className="ic-row">
        <p className="ic-error" role="alert">Could not load comments.</p>
        <button type="button" className="ic-button" onClick={() => void comments.refetch()}>Try again</button>
      </div>}
      {comments.data?.length === 0 && <p>No comments yet.</p>}
      {!!comments.data?.length && <ul className="ic-stack" aria-label="Staff comments">
        {comments.data.map(comment => <li className="cic-classmate-note" key={comment.id}>
          <div className="ic-row">
            <strong>{comment.author_name}</strong>
            <time dateTime={comment.created_at} className="ic-note">{new Date(comment.created_at).toLocaleDateString()}</time>
          </div>
          <p className="ic-preserve" style={{ overflowWrap: 'anywhere' }}>{comment.body}</p>
        </li>)}
      </ul>}
      <form className="ic-stack" onSubmit={event => {
        event.preventDefault();
        if (body && body.length <= limit && !post.isPending) post.mutate(body);
      }}>
        <label>Write a comment
          <textarea rows={3} value={draft} maxLength={limit} disabled={post.isPending} onChange={event => setDraft(event.target.value)} />
        </label>
        {post.isError && <p className="ic-error" role="alert">Could not post your comment. Try again.</p>}
        <button type="submit" className="ic-button ic-primary ic-fit" disabled={!body || post.isPending}>
          {post.isPending ? 'Posting…' : 'Post comment'}
        </button>
      </form>
    </div>
  </Dialog>;
}
