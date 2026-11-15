import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { rosterLimit, rosterRow, type RosterRow } from './roster';

type Draft = { id: number; first: string; last: string };
type NamePart = 'first' | 'last';

export function ManualRoster({ rows, setRows }: {
  rows: RosterRow[];
  setRows: (rows: RosterRow[]) => void;
}) {
  const prefix = useId();
  const nextId = useRef(1);
  const pendingFocus = useRef<number | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([{ id: 0, first: '', last: '' }]);
  const preview = drafts.map(({ first, last }, index) => rosterRow(index + 1, first, last));
  const roster = preview.filter(row => row.name);
  const validCount = roster.filter(row => !row.issue).length;
  const atLimit = drafts.length >= rosterLimit;

  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    document.getElementById(`${prefix}-${pendingFocus.current}-first`)?.focus();
    pendingFocus.current = null;
  }, [drafts, prefix]);

  function updateDrafts(next: Draft[]) {
    setDrafts(next);
    setRows([]);
  }

  function insertRow(after: number) {
    if (atLimit) return;
    const id = nextId.current++;
    pendingFocus.current = id;
    updateDrafts(drafts.toSpliced(after + 1, 0, { id, first: '', last: '' }));
  }

  function removeRow(index: number) {
    pendingFocus.current = (drafts[index + 1] ?? drafts[index - 1]).id;
    updateDrafts(drafts.toSpliced(index, 1));
  }

  function handleEnter(event: KeyboardEvent<HTMLInputElement>, index: number, part: NamePart) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (event.repeat) return;
    if (part === 'first') {
      document.getElementById(`${prefix}-${drafts[index].id}-last`)?.focus();
      return;
    }
    insertRow(index);
  }

  return <div className="ic-stack ic-section-gap">
    <p className="ic-note">Press Enter to move to the next name field or start a new row.</p>
    <div className="ic-table-wrap">
      <table aria-label="Enter student names">
        <thead>
          <tr><th scope="col">First name</th><th scope="col">Last name</th><th scope="col">Actions</th></tr>
        </thead>
        <tbody>
          {drafts.map((draft, index) => {
            const { name, issue } = preview[index];
            const warning = name ? issue : '';
            const issueId = `${prefix}-${draft.id}-issue`;

            return <tr key={draft.id} className={warning ? 'ic-warning-row' : undefined}>
              {(['first', 'last'] as const).map(part => <td key={part}>
                <label>
                  <input
                    id={`${prefix}-${draft.id}-${part}`}
                    aria-label={`${part === 'first' ? 'First' : 'Last'} name for student ${index + 1}`}
                    aria-invalid={warning ? true : undefined}
                    aria-describedby={warning ? issueId : undefined}
                    autoComplete="off"
                    value={draft[part]}
                    onChange={event => updateDrafts(drafts.map(entry => entry.id === draft.id
                      ? { ...entry, [part]: event.target.value }
                      : entry))}
                    onKeyDown={event => handleEnter(event, index, part)}
                  />
                </label>
              </td>)}
              <td>
                <button type="button" className="ic-icon" disabled={drafts.length <= 1}
                  aria-label={`Remove student row ${index + 1}`} onClick={() => removeRow(index)}>
                  <X size={16} aria-hidden="true" />
                </button>
                {warning && <p className="ic-note" id={issueId}>{warning}</p>}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <div className="ic-row">
      <button type="button" className="ic-button" disabled={atLimit} onClick={() => insertRow(drafts.length - 1)}>
        <Plus size={16} aria-hidden="true" /> Add row
      </button>
      <button type="button" className="ic-button" disabled={!validCount || !!rows.length} onClick={() => setRows(roster)}>
        Confirm students
      </button>
      <span className="ic-note" role="status">
        {rows.length ? `${validCount} confirmed` : `${validCount} ready`}
        {roster.length > validCount && ` · ${roster.length - validCount} to fix`}
        {atLimit && ` · Limit of ${rosterLimit} rows reached`}
      </span>
    </div>
  </div>;
}
