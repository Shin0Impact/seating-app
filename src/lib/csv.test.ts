import { describe, expect, it } from 'vitest';
import { buildGuests, decodeBytes, detectDelimiter, guessMapping, guessNameColumn, parseCsv } from './csv';
import { newGuest, newTable } from './layout';

describe('csv', () => {
  it('parses quotes, commas, doubled quotes and newlines inside quotes', () => {
    const r = parseCsv('name,group\n"Smith, John","He said ""hi"""\n"Two\nLines",x\n');
    expect(r).toEqual([
      ['name', 'group'],
      ['Smith, John', 'He said "hi"'],
      ['Two\nLines', 'x'],
    ]);
  });
  it('detects semicolon and tab delimiters, skips empty rows, handles CRLF', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(parseCsv('a;b\r\n\r\n1;2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('decodes UTF-8 with BOM and Windows-1256 Arabic', () => {
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('محمد')]);
    expect(decodeBytes(utf8.buffer)).toBe('محمد');
    // "محمد" in windows-1256: e3 cd e3 cf
    expect(decodeBytes(new Uint8Array([0xe3, 0xcd, 0xe3, 0xcf]).buffer)).toBe('محمد');
  });
  it('guesses columns from English and Arabic headers', () => {
    expect(guessMapping(['Full Name', 'Group', 'Guests', 'Phone']).mapping).toMatchObject({
      name: 0,
      group: 1,
      count: 2,
      table: -1,
    });
    expect(guessMapping(['الاسم', 'العائلة', 'العدد', 'الطاولة']).mapping).toMatchObject({
      name: 0,
      group: 1,
      count: 2,
      table: 3,
    });
    expect(guessMapping(['First name', 'Last name']).mapping).toMatchObject({ name: 0, surname: 1 });
    expect(guessMapping(['Ahmad', 'Sara']).foundHeader).toBe(false);
  });
  it('guesses the name column when there is no header', () => {
    expect(
      guessNameColumn([
        ['1', 'Ahmad'],
        ['2', 'Sara'],
      ]),
    ).toBe(1);
  });
  it('builds guests: joins surname, expands counts, skips duplicates and empties', () => {
    const rows = [
      ['Ali', 'Haddad', 'Haddad', '3'],
      ['', '', 'x', '1'],
      ['ali', 'haddad', 'dup', '1'],
      ['Sara', '', 'Friends', '٢'],
    ];
    const r = buildGuests(rows, { name: 0, surname: 1, group: 2, count: 3, table: -1 }, [], []);
    expect(r.guests.map((g) => g.name)).toEqual(['Ali Haddad', 'Ali Haddad +1', 'Ali Haddad +2', 'Sara', 'Sara +1']);
    expect(r.guests[0].group).toBe('Haddad');
    expect(r.skippedEmpty).toBe(1);
    expect(r.skippedDuplicates).toBe(1);
  });
  it('skips names already in the list (Arabic spelling variants) and seats matched tables', () => {
    const t1 = { ...newTable(0, 0, 'round', 2, 1), label: 'Table 1' };
    const existing = [newGuest('أحمد')];
    const rows = [
      ['احمد', '1'],
      ['Lea', '1'],
      ['Mo', 'table 1'],
      ['Zed', '9'],
    ];
    const r = buildGuests(rows, { name: 0, surname: -1, group: -1, count: -1, table: 1 }, existing, [t1]);
    expect(r.skippedDuplicates).toBe(1);
    expect(r.guests.map((g) => [g.name, g.seat])).toEqual([
      ['Lea', 0],
      ['Mo', 1],
      ['Zed', null],
    ]);
    expect(r.tablesMatched).toBe(2);
    expect(r.tablesUnmatched).toBe(1);
  });
  it('cleans control characters and long text', () => {
    const r = buildGuests(
      [['A\u0000B‮C' + 'x'.repeat(200)]],
      { name: 0, surname: -1, group: -1, count: -1, table: -1 },
      [],
      [],
    );
    expect(r.guests[0].name.length).toBeLessThanOrEqual(60);
    expect(/[\u0000‮]/.test(r.guests[0].name)).toBe(false);
  });
  it('creates rectangular tables for unknown table names and seats people there', () => {
    const rows = [
      ['Ali', 'A', '3', '5'],
      ['Sara', 'B', '1', 'Table 5'],
      ['Omar', 'B', '2', 'VIP'],
    ];
    const r = buildGuests(rows, { name: 0, surname: -1, group: 1, count: 2, table: 3 }, [], [], true);
    expect(r.newTables.map((x) => x.label).sort()).toEqual(['Table 5', 'VIP']);
    expect(r.newTables.every((x) => x.shape === 'rect' && x.seats >= 10)).toBe(true);
    const t5 = r.newTables.find((x) => x.label === 'Table 5')!;
    expect(r.guests.filter((g) => g.tableId === t5.id).length).toBe(4);
    expect(new Set(r.guests.filter((g) => g.tableId === t5.id).map((g) => g.seat)).size).toBe(4);
    const off = buildGuests(rows, { name: 0, surname: -1, group: 1, count: 2, table: 3 }, [], [], false);
    expect(off.newTables.length).toBe(0);
    expect(off.guests.every((g) => g.tableId === null)).toBe(true);
  });
});
