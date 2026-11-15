import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { CsvRosterMapping } from './CsvRosterMapping';
import { ManualRoster } from './ManualRoster';
import { delimiters, parseRoster, rosterLimit, rosterTemplate, sampleRoster, type CsvRecord, type Delimiter, type RosterRow } from './roster';

type RosterUploadProps = { rows: RosterRow[]; setRows: (rows: RosterRow[]) => void };
type Source = { text: string; version: number };

export function RosterUpload({ rows, setRows }: RosterUploadProps) {
  const [manual, setManual] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadVersion = useRef(0);

  function resetUpload() {
    setSource(null);
    setRows([]);
    setError('');
    return ++uploadVersion.current;
  }

  async function loadFile(file: File) {
    const version = resetUpload();
    setFilename(file.name);
    setBusy(true);
    try {
      if (file.size > 1_000_000) throw new Error('Choose a CSV under 1 MB.');
      const text = await file.text();
      if (version === uploadVersion.current) setSource({ text, version });
    } catch (error) {
      if (version === uploadVersion.current) {
        setError(error instanceof Error ? error.message : 'Could not read that file.');
      }
    } finally {
      if (version === uploadVersion.current) setBusy(false);
    }
  }

  function changeMethod(nextManual: boolean) {
    if (nextManual === manual) return;
    resetUpload();
    setFilename('');
    setBusy(false);
    setManual(nextManual);
  }

  return <div className="ic-stack ic-section-gap">
    <div className="ic-row" role="group" aria-label="How to add students">
      <button type="button" className={manual ? 'ic-button' : 'ic-button ic-primary'} aria-pressed={!manual} onClick={() => changeMethod(false)}>Upload CSV</button>
      <button type="button" className={manual ? 'ic-button ic-primary' : 'ic-button'} aria-pressed={manual} onClick={() => changeMethod(true)}>Enter names</button>
    </div>
    {manual ? <ManualRoster rows={rows} setRows={setRows} /> : <>
      <div className="ic-upload">
        <FileSpreadsheet size={25} aria-hidden="true" />
        <div><strong>{filename || 'Choose a roster CSV'}</strong><br />
          <a download="cic-roster-template.csv" href={'data:text/csv;charset=utf-8,' + encodeURIComponent(rosterTemplate)}>Download CSV template</a>
        </div>
        <div className="ic-row">
          <input type="file" ref={fileInput} aria-label="Roster CSV file" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void loadFile(file);
          }} />
          <button className="ic-button" type="button" onClick={() => fileInput.current?.click()}><Upload size={15} /> {busy ? 'Reading…' : 'Choose CSV'}</button>
          <button className="ic-link-button" type="button" onClick={() => {
            const version = resetUpload();
            setFilename('sample-roster.csv');
            setBusy(false);
            setSource({ text: sampleRoster, version });
          }}>Use sample roster</button>
        </div>
      </div>
      {error && <p className="ic-error" role="alert">{error}</p>}
      {source && <CsvRosterReview key={source.version} text={source.text} rows={rows} setRows={setRows} />}
    </>}
  </div>;
}

function CsvRosterReview({ text, rows, setRows }: { text: string } & RosterUploadProps) {
  const [delimiter, setDelimiter] = useState<Delimiter | undefined>();
  const [selectedRow, setSelectedRow] = useState<number | null>();
  const parsed = useMemo((): { records: CsvRecord[]; error?: string } => {
    try {
      const records = parseRoster(text, delimiter);
      return records.length ? { records } : { records, error: 'This file is empty.' };
    } catch (error) {
      return { records: [], error: error instanceof Error ? error.message : 'Could not read that CSV.' };
    }
  }, [text, delimiter]);
  const { records } = parsed;
  const headerRow = selectedRow === undefined ? records[0]?.row : selectedRow;
  const eligibleHeaders = records.slice(Math.max(1, records.length - rosterLimit - 1));
  const headerChoices = records.length ? [records[0], ...eligibleHeaders] : [];

  return <>
    <div className="ic-form-grid">
      <label>Delimiter<select value={delimiter ?? 'auto'} onChange={event => {
        const value = event.target.value;
        setDelimiter(value === 'auto' ? undefined : value as Delimiter);
        setSelectedRow(undefined);
        setRows([]);
      }}>
        <option value="auto">Auto-detect</option>
        {Object.entries(delimiters).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {!!records.length && <label>Header row<select value={headerRow ?? 'none'} onChange={event => {
        setSelectedRow(event.target.value === 'none' ? null : Number(event.target.value));
        setRows([]);
      }}>
        {headerChoices.map(record => <option key={record.row} value={record.row}>Row {record.row} · {record.cells.slice(0, 3).join(' / ').slice(0, 100)}</option>)}
        <option value="none">No headers</option>
      </select></label>}
    </div>
    {parsed.error && <p className="ic-error" role="alert">{parsed.error}</p>}
    {headerRow !== undefined && <CsvRosterMapping key={(delimiter ?? 'auto') + ':' + headerRow} records={records} headerRow={headerRow} confirmed={rows.length > 0} setRows={setRows} />}
  </>;
}
