import { describe, expect, it } from 'vitest';
import { parseRoster, rosterDefaults, rosterRow } from './roster';

describe('CSV roster parsing', () => {
  it('handles BOM, CRLF, quoted commas, escaped quotes, and physical row numbers', () => {
    expect(parseRoster('\uFEFFStudent Name,Class\r\n"Rivera, Sofía",A\r\n"Sage ""Sam""\nChen",B\n\nLee,C')).toEqual([
      { row: 1, cells: ['Student Name', 'Class'] },
      { row: 2, cells: ['Rivera, Sofía', 'A'] },
      { row: 3, cells: ['Sage "Sam"\nChen', 'B'] },
      { row: 6, cells: ['Lee', 'C'] },
    ]);
  });

  it.each([
    [';', 'Roster export\nPupil Forename;Learner Surname\nJo;Park\nKai;Flores'],
    ['\t', 'Pupil Forename\tLearner Surname\nJo\tPark\nKai\tFlores'],
  ] as const)('detects %j without requiring a header in the first row', (delimiter, text) => {
    const parsed = parseRoster(text);
    expect(parsed).toEqual(parseRoster(text, delimiter));
    expect(parsed.at(-1)?.cells).toEqual(['Kai', 'Flores']);
  });

  it('supports explicit delimiters and headerless input', () => {
    expect(parseRoster('Rivera; Sofía\nHill; Mateo', ',')).toEqual([
      { row: 1, cells: ['Rivera; Sofía'] },
      { row: 2, cells: ['Hill; Mateo'] },
    ]);
  });

  it('flags unclosed quotes and retains blank name cells for the row preview', () => {
    expect(() => parseRoster('name,class\n"Jo Park,A')).toThrow(/quotes/);
    expect(parseRoster('name,class\n,A')).toEqual([
      { row: 1, cells: ['name', 'class'] },
      { row: 2, cells: ['', 'A'] },
    ]);
  });
});

describe('roster defaults and row validation', () => {
  it('preselects recognizable unique headers, skipping guardian fields and duplicates', () => {
    expect(rosterDefaults(['Parent Given Name', 'student-name', 'first_name', 'Last Name'])).toEqual({ full: 1, first: 2, last: 3 });
    expect(rosterDefaults(['Name', 'Name', 'last_name'])).toEqual({ full: null, first: null, last: 2 });
  });

  it('combines supplied parts and flags missing or overlong names', () => {
    expect(rosterRow(2, ' Sofía ', 'Rivera')).toEqual({ row: 2, name: 'Sofía Rivera', issue: '' });
    expect(rosterRow(3, '', 'Park').name).toBe('Park');
    expect(rosterRow(4, ' ').issue).toBe('Missing name');
    expect(rosterRow(5, 'A'.repeat(101)).issue).toBe('Name is over 100 characters');
  });
});
