export type RosterRow = { row: number; name: string; issue: string };
export type CsvRecord = { row: number; cells: string[] };
export type Delimiter = ',' | ';' | '\t';
export type NameField = 'full' | 'first' | 'last';
export type NameColumns = Record<NameField, number | null>;

export const rosterLimit = 500;
export const rosterTemplate = 'name\nSofía Rivera\nMateo Hill\nAmina Brooks\n';
export const sampleRoster = 'name,notes\nSofía Rivera,\nMateo Hill,\n,Missing name\nAmina Brooks,\nJordan Vega,\n';
export const delimiters = { ',': 'Comma', ';': 'Semicolon', '\t': 'Tab' } as const;

const aliases: Record<NameField, string[]> = {
  full: ['name', 'fullname', 'studentname', 'studentfullname'],
  first: ['firstname', 'studentfirstname', 'givenname'],
  last: ['lastname', 'studentlastname', 'surname', 'familyname'],
};

function parseRecords(csv: string, delimiter: Delimiter): CsvRecord[] {
  const records: CsvRecord[] = [{ row: 1, cells: [] }];
  const cells = new RegExp(`(?:^|([${delimiter}\\n]))(?:"((?:[^"]|"")*)"|([^${delimiter}"\\n]*))`, 'g');
  let offset = 0;
  let line = 1;
  for (const match of csv.matchAll(cells)) {
    if (match.index !== offset || (offset > 0 && !match[1])) throw new Error(`Check the quotes on line ${line}.`);
    if (match[1] === '\n') records.push({ row: line + 1, cells: [] });
    records.at(-1)!.cells.push((match[2]?.replace(/""/g, '"') ?? match[3]).trim());
    offset += match[0].length;
    line += match[0].split('\n').length - 1;
  }
  if (offset !== csv.length) throw new Error(`Check the quotes on line ${line}.`);
  return records.filter(record => record.cells.some(Boolean));
}

export function parseRoster(text: string, delimiter?: Delimiter): CsvRecord[] {
  const csv = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (delimiter) return parseRecords(csv, delimiter);

  let best: { records: CsvRecord[]; score: number } | undefined;
  let parseError: unknown;
  for (const separator of Object.keys(delimiters) as Delimiter[]) {
    try {
      const records = parseRecords(csv, separator);
      const widths = new Map<number, number>();
      for (const { cells } of records.slice(0, 12)) {
        if (cells.length > 1) widths.set(cells.length, (widths.get(cells.length) ?? 0) + 1);
      }
      const score = Math.max(0, ...widths.values());
      if (!best || score > best.score) best = { records, score };
    } catch (error) {
      parseError ??= error;
    }
  }
  if (best) return best.records;
  throw parseError;
}

export function rosterDefaults(headers: string[]): NameColumns {
  const normalized = headers.map(value => value.toLowerCase().replace(/[ _-]/g, ''));
  function unique(field: NameField) {
    const matches = normalized.flatMap((header, index) => aliases[field].includes(header) ? [index] : []);
    return matches.length === 1 ? matches[0] : null;
  }
  return { full: unique('full'), first: unique('first'), last: unique('last') };
}

export function rosterRow(row: number, ...parts: string[]): RosterRow {
  const name = parts.map(part => part.trim()).filter(Boolean).join(' ');
  const issue = !name ? 'Missing name' : name.length > 100 ? 'Name is over 100 characters' : '';
  return { row, name, issue };
}
