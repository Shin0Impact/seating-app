// Reading a guest list from a CSV file or pasted spreadsheet cells. Everything here treats the
// input as untrusted: sizes are capped and text is cleaned before it becomes a guest.

import { Guest, LIMITS, TableEl, firstFreeSeat, newGuest, newTable } from './layout';
import { normalize } from './search';

export const IMPORT_LIMITS = { bytes: 2_000_000, rows: 5000, cols: 60, extraPeople: 20 };

/** Turns file bytes into text. Handles UTF-8, UTF-16 and the Arabic/Hebrew Windows code pages Excel uses. */
export function decodeBytes(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, '');
  } catch {
    const ar = new TextDecoder('windows-1256').decode(b);
    const he = new TextDecoder('windows-1255').decode(b);
    const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
    return count(he, /[֐-׿]/g) > count(ar, /[؀-ۿ]/g) ? he : ar;
  }
}

function countOutsideQuotes(line: string, d: string): number {
  let inQ = false;
  let n = 0;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === d && !inQ) n++;
  }
  return n;
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 6);
  let best = ',';
  let bestScore = 0;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const min = Math.min(...counts, Infinity);
    if (min > bestScore) {
      bestScore = min;
      best = d;
    }
  }
  return best;
}

/** Small CSV reader: quotes, doubled quotes, newlines inside quotes. Empty rows are dropped. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  const pushCell = () => {
    if (row.length < IMPORT_LIMITS.cols) row.push(cell.trim());
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    if (row.some((c) => c !== '') && rows.length < IMPORT_LIMITS.rows) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') inQ = true;
    else if (ch === delimiter) pushCell();
    else if (ch === '\n') pushRow();
    else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      pushRow();
    } else cell += ch;
    if (rows.length >= IMPORT_LIMITS.rows) break;
  }
  if (cell !== '' || row.length > 0) pushRow();
  return rows;
}

export type Mapping = { name: number; surname: number; group: number; count: number; table: number };
export const NO_COLUMN = -1;

const RE = {
  surname: /(last|sur ?name|family name|لقب|اسم العايله|اسم العائله|שם משפחה)/,
  name: /(name|guest|invit|اسم|مدعو|ضيف|שם|מוזמן)/,
  group: /(group|famil|side|relation|category|مجموعه|عايله|قرابه|فئه|קבוצה|משפחה|צד)/,
  count: /(count|number|people|persons|pax|qty|quantity|guests|عدد|כמות|מספר|אנשים)/,
  table: /(table|طاوله|שולחן)/,
};

/** Looks at the header row to guess which column holds what. */
export function guessMapping(headers: string[]): { mapping: Mapping; foundHeader: boolean } {
  const m: Mapping = { name: NO_COLUMN, surname: NO_COLUMN, group: NO_COLUMN, count: NO_COLUMN, table: NO_COLUMN };
  const h = headers.map(normalize);
  h.forEach((x, i) => {
    if (m.table === NO_COLUMN && RE.table.test(x)) m.table = i;
    else if (m.surname === NO_COLUMN && RE.surname.test(x)) m.surname = i;
    else if (m.count === NO_COLUMN && RE.count.test(x) && !/(name|اسم|שם)/.test(x)) m.count = i;
    else if (m.group === NO_COLUMN && RE.group.test(x) && !/(first|اول|פרטי)/.test(x) && !/name|اسم|שם/.test(x.replace(/family|عايله|משפחה/g, ''))) m.group = i;
    else if (m.name === NO_COLUMN && RE.name.test(x)) m.name = i;
  });
  const foundHeader = m.name !== NO_COLUMN || m.group !== NO_COLUMN || m.count !== NO_COLUMN || m.table !== NO_COLUMN;
  return { mapping: m, foundHeader };
}

/** Without a header: the first column that is mostly non-numeric text is the name. */
export function guessNameColumn(rows: string[][]): number {
  const cols = Math.max(0, ...rows.map((r) => r.length));
  for (let c = 0; c < cols; c++) {
    const vals = rows.slice(0, 20).map((r) => r[c] ?? '').filter(Boolean);
    if (vals.length && vals.filter((v) => !/^[\d\s+()\-.٠-٩]+$/.test(v)).length / vals.length > 0.8) return c;
  }
  return 0;
}

const clean = (s: string, max: number) =>
  Array.from(s.replace(/[\u0000-\u001f\u007f‎‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, max)
    .join('');

const toInt = (s: string): number => {
  const n = parseInt(normalize(s).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 1;
};

/** Chairs on a table made by the import when the file lists fewer people than this. */
export const DEFAULT_IMPORT_SEATS = 10;

const tableKey = (s: string) => normalize(s).replace(/(table|طاوله|שולחן)/g, '').trim();

export type ImportResult = {
  guests: Guest[];
  people: number;
  skippedDuplicates: number;
  skippedEmpty: number;
  tablesMatched: number;
  tablesUnmatched: number;
  /** Rectangular tables made for table names in the file that did not exist yet (only when asked to). */
  newTables: TableEl[];
  capped: boolean;
};

/** Turns table rows into guests. A count above 1 adds "Name +1", "Name +2" ... in the same group. */
export function buildGuests(rows: string[][], map: Mapping, existing: Guest[], tables: TableEl[], createTables = false): ImportResult {
  const cell = (r: string[], i: number) => (i === NO_COLUMN ? '' : r[i] ?? '');
  const seenNames = new Set(existing.map((g) => normalize(g.name)));
  const byKey = new Map<string, TableEl>();
  for (const tb of tables) {
    byKey.set(tableKey(tb.label), tb);
    const num = tb.label.match(/(\d+)\s*$/)?.[1];
    if (num && !byKey.has(num)) byKey.set(num, tb);
  }
  const out: Guest[] = [];
  const working = [...existing];
  const res: ImportResult = { guests: out, people: 0, skippedDuplicates: 0, skippedEmpty: 0, tablesMatched: 0, tablesUnmatched: 0, newTables: [], capped: false };
  // People per unknown table name, so a table made from the file gets enough chairs.
  const demand = new Map<string, number>();
  if (createTables && map.table !== NO_COLUMN) {
    for (const r of rows) {
      const tc = cell(r, map.table);
      const k = tableKey(tc);
      if (!tc || !k || byKey.has(k) || !clean([cell(r, map.name), cell(r, map.surname)].filter(Boolean).join(' '), LIMITS.nameMax)) continue;
      const n = map.count === NO_COLUMN ? 1 : Math.min(toInt(cell(r, map.count)), IMPORT_LIMITS.extraPeople + 1);
      demand.set(k, (demand.get(k) ?? 0) + Math.max(n, 1));
    }
  }
  for (const r of rows) {
    const base = clean([cell(r, map.name), cell(r, map.surname)].filter(Boolean).join(' '), LIMITS.nameMax);
    if (!base) {
      res.skippedEmpty++;
      continue;
    }
    const key = normalize(base);
    if (seenNames.has(key)) {
      res.skippedDuplicates++;
      continue;
    }
    seenNames.add(key);
    const group = clean(cell(r, map.group), LIMITS.groupMax);
    const extra = map.count === NO_COLUMN ? 0 : Math.min(Math.max(toInt(cell(r, map.count)) - 1, 0), IMPORT_LIMITS.extraPeople);
    const tableCell = cell(r, map.table);
    let tb = tableCell ? byKey.get(tableKey(tableCell)) : undefined;
    if (tableCell && !tb && createTables && tableKey(tableCell)) {
      const k = tableKey(tableCell);
      const seats = Math.min(Math.max(demand.get(k) ?? 0, DEFAULT_IMPORT_SEATS), LIMITS.seatsMax);
      const made = newTable(0, 0, 'rect', seats, 0);
      made.label = /^\d+$/.test(k) ? `Table ${k}` : clean(tableCell, LIMITS.labelMax);
      byKey.set(k, made);
      res.newTables.push(made);
      tb = made;
    }
    if (tableCell) tb ? res.tablesMatched++ : res.tablesUnmatched++;
    for (let k = 0; k <= extra; k++) {
      if (existing.length + out.length >= LIMITS.maxGuests) {
        res.capped = true;
        return res;
      }
      const name = k === 0 ? base : clean(`${base} +${k}`, LIMITS.nameMax);
      const seat = tb ? firstFreeSeat(tb, working) : null;
      const g = newGuest(name, group, tb && seat !== null ? tb.id : null, false, tb && seat !== null ? seat : null);
      out.push(g);
      working.push(g);
      res.people++;
    }
  }
  return res;
}
