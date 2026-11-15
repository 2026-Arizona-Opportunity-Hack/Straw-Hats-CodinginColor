import type { Attempt } from './model';

export function AttemptResponse({ attempt }: { attempt?: Attempt }) {
  if (!attempt?.response || (Array.isArray(attempt.response) && !attempt.response.length)) return null;
  return <section aria-label="Saved response">
    <p className="ic-note">Latest saved response{attempt.responseAttempt !== undefined ? ` · attempt ${attempt.responseAttempt}` : ''}
      {attempt.scoreAttempt !== undefined && attempt.scoreAttempt !== attempt.responseAttempt && ` · Score counts attempt ${attempt.scoreAttempt}`}</p>
    {typeof attempt.response === 'string' ? <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{attempt.response}</pre>
      : <dl>{attempt.response.map((answer, index) => <div key={index}>
        <dt><strong>{answer.prompt}</strong></dt>
        <dd style={{ margin: '0.4rem 0 1rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {answer.code ? <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><code>{answer.value}</code></pre> : answer.value || 'No answer'}
        </dd>
      </div>)}</dl>}
  </section>;
}
