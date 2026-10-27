/** Reads the first sheet of an .xlsx file and returns it as tab-separated text the CSV importer understands. */
export async function xlsxToText(buf: ArrayBuffer): Promise<string> {
  const { readSheet } = await import('read-excel-file/browser');
  const rows = (await readSheet(new Blob([buf]))) as unknown[][];
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    return /["\t\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join('\t')).join('\n');
}

/** True when the bytes are a zip container (every .xlsx is one). */
export const looksLikeXlsx = (buf: ArrayBuffer): boolean => {
  const b = new Uint8Array(buf, 0, 4);
  return b[0] === 0x50 && b[1] === 0x4b;
};
