export type RosterRow = { row: number; name: string; issue: string };

export const rosterTemplate = 'name\nSofía Rivera\nMateo Hill\nAmina Brooks\n';
export const sampleRoster = 'name,notes\nSofía Rivera,\nMateo Hill,\n,Missing name\nAmina Brooks,\nJordan Vega,\n';

export function readRoster(text: string): RosterRow[] {
  const csv = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const records: { row: number; cells: string[] }[] = [{ row: 1, cells: [] }];
  const cells = /(?:^|([,\n]))(?:"((?:[^"]|"")*)"|([^,"\n]*))/g;
  let offset = 0;
  let line = 1;
  for (const match of csv.matchAll(cells)) {
    if (match.index !== offset || (offset > 0 && !match[1])) throw new Error('The CSV has a broken row or unclosed quote.');
    if (match[1] === '\n') records.push({ row: line + 1, cells: [] });
    records.at(-1)!.cells.push((match[2]?.replace(/""/g, '"') ?? match[3]).trim());
    offset += match[0].length;
    line += match[0].split('\n').length - 1;
  }
  if (offset !== csv.length) throw new Error('The CSV has a broken row or unclosed quote.');
  const headers = records.shift()!.cells.map(value => value.toLowerCase().replace(/[ _-]/g, ''));
  const full = headers.findIndex(value => ['name', 'fullname', 'studentname'].includes(value));
  const first = headers.indexOf('firstname');
  const last = headers.indexOf('lastname');
  if (full < 0 && (first < 0 || last < 0)) throw new Error('Include a name column or both first_name and last_name.');
  const rows = records.filter(record => record.cells.some(Boolean)).map(record => {
    const name = full >= 0 ? record.cells[full] || '' : [record.cells[first], record.cells[last]].filter(Boolean).join(' ');
    const issue = !name ? 'Missing name' : name.length > 100 ? 'Name is over 100 characters' : '';
    return { row: record.row, name, issue };
  });
  if (!rows.length) throw new Error('Add at least one student row.');
  if (rows.length > 500) throw new Error('Import up to 500 rows at a time.');
  return rows;
}
