import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { RosterNameMatch } from '../api/instructor/rosterMatches';
import { Dialog, Empty } from './ui';

export type RosterMatchActions = {
  list: (classId: string) => Promise<RosterNameMatch[]>;
  confirm: (classId: string, match: RosterNameMatch) => Promise<void>;
  refreshRoster: () => void;
};

export function RosterMatches({ classId, actions, onClose }: {
  classId: string; actions: RosterMatchActions; onClose: () => void;
}) {
  const [message, setMessage] = useState('');
  const feedback = useRef<HTMLParagraphElement>(null);
  const queryClient = useQueryClient();
  const queryKey = ['roster-name-matches', classId];
  const matches = useQuery({ queryKey, queryFn: () => actions.list(classId), refetchOnMount: 'always' });
  const confirm = useMutation({
    mutationFn: (match: RosterNameMatch) => actions.confirm(classId, match),
    onMutate: () => setMessage(''),
    onSuccess: (_, match) => {
      queryClient.setQueryData<RosterNameMatch[]>(queryKey, current =>
        current?.filter(row => row.imported_id !== match.imported_id));
      setMessage(`Matched ${match.imported_name} to the student account.`);
      feedback.current?.focus();
    },
  });

  function refresh() {
    setMessage('');
    confirm.reset();
    void matches.refetch();
  }

  return <Dialog wide title="Review roster name matches" closeDisabled={confirm.isPending} onClose={() => {
    onClose();
    actions.refreshRoster();
  }}>
    <p className="ic-note">Confirm that each pair is the same student. Confirming removes the duplicate imported entry and keeps the student’s account and saved work.</p>
    <p className="ic-note ic-section-gap">Names that appear more than once on either side stay on the roster for separate review.</p>
    {matches.isPending ? <p className="ic-note ic-section-gap" role="status">Looking for matches…</p>
      : matches.isError ? <p className="ic-error" role="alert">{matches.error.message}</p>
      : matches.data.length === 0 ? <Empty>No name matches to confirm. Refresh after students have joined the class.</Empty>
      : <div className="ic-table-wrap ic-section-gap" tabIndex={0} role="region" aria-label="Suggested roster matches">
        <table className="ic-data-table">
          <thead><tr>
            <th scope="col">Imported name</th>
            <th scope="col">Student account</th>
            <th scope="col"><span className="ic-sr-only">Action</span></th>
          </tr></thead>
          <tbody>{matches.data.map(match => <tr key={match.imported_id}>
            <td>{match.imported_name}</td>
            <td>{match.account_name}{match.username && <div className="ic-note">@{match.username}</div>}</td>
            <td><button type="button" className="ic-button ic-primary"
              aria-label={`Confirm match for ${match.imported_name}`}
              disabled={confirm.isPending || matches.isFetching}
              onClick={() => confirm.mutate(match)}>Confirm match</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
    {confirm.error && <p className="ic-error" role="alert">{confirm.error.message}</p>}
    <div className="ic-form-footer">
      <p className="ic-note" role="status" ref={feedback} tabIndex={-1}>{message}</p>
      <button type="button" className="ic-button" disabled={confirm.isPending || matches.isFetching}
        onClick={refresh}>Refresh matches</button>
    </div>
  </Dialog>;
}
