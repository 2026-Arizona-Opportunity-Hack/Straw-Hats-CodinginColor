import { useEffect, useRef, useState } from 'react';
import { suggestRosterMapping, type RosterSuggestions } from '../api/instructor/rosterMapping';
import { rosterDefaults, rosterLimit, rosterRow, type CsvRecord, type NameField, type RosterRow } from './roster';

const fieldLabels: Record<NameField, string> = { full: 'Full name', first: 'First name', last: 'Last name' };
const splitFields = ['first', 'last'] as const;
type NameFormat = 'full' | 'split';

export function CsvRosterMapping({ records, headerRow, confirmed, setRows }: {
  records: CsvRecord[];
  headerRow: number | null;
  confirmed: boolean;
  setRows: (rows: RosterRow[]) => void;
}) {
  const header = records.find(record => record.row === headerRow);
  const headers = header?.cells ?? [];
  const data = header ? records.filter(record => record.row > header.row) : records;
  const columnCount = data.reduce((count, record) => Math.max(count, record.cells.length), headers.length);
  const [columns, setColumns] = useState(() => rosterDefaults(headers));
  const [format, setFormat] = useState<NameFormat>(() => columns.full !== null || columnCount < 2 ? 'full' : 'split');
  const [suggestions, setSuggestions] = useState<RosterSuggestions | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const pending = useRef<AbortController | null>(null);
  const edits = useRef(0);
  useEffect(() => () => pending.current?.abort(), []);

  const fields = format === 'full' ? ['full' as const] : splitFields;
  const complete = fields.every(field => columns[field] !== null);
  const validSize = data.length > 0 && data.length <= rosterLimit;
  const preview = complete && validSize ? data.map(record => rosterRow(record.row, ...fields.map(field => record.cells[columns[field]!] ?? ''))) : [];
  const ready = preview.filter(row => !row.issue).length;
  const label = (column: number) => (headers[column] || 'Unnamed column') + ' · column ' + (column + 1);
  const examples = (column: number) => {
    const values = data.map(record => record.cells[column]).filter(Boolean).slice(0, 3);
    return values.length ? values.join(' · ') : 'No sample values';
  };

  function invalidate() {
    edits.current++;
    setRows([]);
  }

  function pick(field: NameField, column: number | null) {
    if (columns[field] === column) return;
    const next = { ...columns, [field]: column };
    if (next.first === next.last && column !== null) {
      if (field === 'first') next.last = null;
      if (field === 'last') next.first = null;
    }
    setColumns(next);
    invalidate();
  }

  async function suggest() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const previousEdits = edits.current;
    const previouslyConfirmed = confirmed;
    setBusy(true);
    setStatus('');
    try {
      const ranked = await suggestRosterMapping(headers, AbortSignal.any([controller.signal, AbortSignal.timeout(8500)]));
      if (controller.signal.aborted) return;
      setSuggestions(ranked);
      if (previousEdits === 0 && edits.current === previousEdits && !previouslyConfirmed) {
        const first = columns.first ?? ranked.first.find(column => column !== columns.last) ?? null;
        const next = {
          full: columns.full ?? ranked.full[0] ?? null,
          first,
          last: columns.last ?? ranked.last.find(column => column !== first) ?? null,
        };
        setColumns(next);
        if (!complete && next.full !== null && (next.first === null || next.last === null)) setFormat('full');
        if (!complete && next.first !== null && next.last !== null && format === 'full' && next.full === null) setFormat('split');
      }
      setStatus(Object.values(ranked).some(list => list.length) ? 'Review the suggestions before confirming.' : 'No clear matches. Choose the columns below.');
    } catch {
      if (!controller.signal.aborted) setStatus('Suggestions are unavailable. Choose the columns below.');
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  if (!validSize) {
    return <p className="ic-error" role="alert">{data.length ? 'Import up to 500 rows at a time.' : 'Choose a header row with data below it, or select No headers.'}</p>;
  }

  return <div className="ic-stack">
    {header && <div className="ic-stack">
      <details className="ic-roster-headers" open={!complete ? true : undefined}>
        <summary>Detected headers</summary>
        <ul>{headers.map((_, column) => <li key={column}>{label(column)}</li>)}</ul>
        {headers.some(Boolean) && !suggestions && <div className="ic-row">
          <button className="ic-button" type="button" disabled={busy} onClick={() => void suggest()}>{busy ? 'Finding matches…' : 'Suggest matches'}</button>
          <span className="ic-note">Check these labels before sending them to Jev. Sample values stay in your browser.</span>
        </div>}
      </details>
      {status && <p className="ic-note" role="status">{status}</p>}
    </div>}
    <label>Name format<select value={format} onChange={event => {
      setFormat(event.target.value as NameFormat);
      invalidate();
    }}>
      <option value="full">Full name</option>
      <option value="split">First and last name</option>
    </select></label>
    <div className={format === 'split' ? 'ic-form-grid' : ''}>
      {fields.map(field => {
        const selected = columns[field];
        const title = fieldLabels[field];
        const alternatives = (suggestions?.[field] ?? []).filter(column => column !== selected);
        return <div className="ic-roster-column ic-stack" key={field}>
          <strong>{title}</strong>
          {selected === null ? <p className="ic-note">Choose a column</p> : <>
            <span>{label(selected)}</span>
            <p className="ic-note">{examples(selected)}</p>
          </>}
          <details open={selected === null ? true : undefined}>
            <summary>{selected === null ? 'Choose column' : 'Change column'}</summary>
            {alternatives.map(column => <button key={column} type="button" className="ic-roster-alternative" onClick={() => pick(field, column)}>
              {label(column)}<span className="ic-note">{examples(column)}</span>
            </button>)}
            <label>Pick {title.toLowerCase()} column<select value={selected ?? ''} onChange={event => pick(field, event.target.value === '' ? null : Number(event.target.value))}>
              <option value="">Choose a column</option>
              {Array.from({ length: columnCount }, (_, column) => <option key={column} value={column}>{label(column)}</option>)}
            </select></label>
          </details>
        </div>;
      })}
    </div>
    {!!preview.length && <>
      <div className="ic-import-summary" role="status"><strong>Import preview</strong><span>{ready} ready{ready !== preview.length && ` · ${preview.length - ready} to fix`}</span></div>
      <div className="ic-table-wrap" tabIndex={0} role="region" aria-label="CSV preview">
        <table><thead><tr><th scope="col">Row</th><th scope="col">Student name</th><th scope="col">Status</th></tr></thead>
          <tbody>{preview.slice(0, 15).map(row => <tr key={row.row} className={row.issue ? 'ic-warning-row' : ''}>
            <td>{row.row}</td><td>{row.name || '—'}</td><td>{row.issue || 'Ready'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {preview.length > 15 && <p className="ic-note">Showing 15 of {preview.length} rows.</p>}
      {ready !== preview.length && <p className="ic-note">Rows with errors will be skipped. To include them, fix the CSV and upload it again.</p>}
      <div className="ic-row"><button type="button" className="ic-button" disabled={confirmed || !ready || busy} onClick={() => setRows(preview)}>{confirmed ? 'Columns confirmed' : 'Confirm columns'}</button></div>
    </>}
  </div>;
}
