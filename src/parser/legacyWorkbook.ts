import { read, set_cptable, utils, type CellObject, type WorkSheet } from 'xlsx';
import * as codepages from 'xlsx/dist/cpexcel.full.mjs';

set_cptable(codepages);

function cellText(cell?: CellObject): string | null {
  if (!cell || cell.v == null || cell.v === '') return null;
  if (typeof cell.v === 'number' && typeof cell.z === 'string' && /^0+$/.test(cell.z)) {
    return String(cell.v).padStart(cell.z.length, '0');
  }
  return String(cell.v);
}

function readTable(sheet: WorkSheet): (string | null)[][] {
  const reference = sheet['!ref'];
  if (!reference) return [];
  const { e: end } = utils.decode_range(reference);
  const table = Array.from({ length: end.r + 1 }, (_, r) =>
    Array.from({ length: end.c + 1 }, (_, c) => cellText(sheet[utils.encode_cell({ r, c })])));
  for (const { s: start, e: end } of sheet['!merges'] ?? []) {
    const value = table[start.r]?.[start.c];
    if (value == null) continue;
    for (let row = start.r; row <= end.r; row += 1) {
      table[row] ??= [];
      for (let col = start.c; col <= end.c; col += 1) table[row][col] = value;
    }
  }
  return table;
}

export function readLegacyWorkbook(data: ArrayBuffer | Uint8Array) {
  const workbook = read(data, { type: 'array', cellNF: true, cellText: false, cellHTML: false });
  return workbook.SheetNames.flatMap((name, index) =>
    workbook.Workbook?.Sheets?.[index]?.Hidden ? [] : [{ name, table: readTable(workbook.Sheets[name]) }]);
}
