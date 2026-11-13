import type { AliasDictionary, SubjectDefinition } from '../models/project';

function cellText(value: unknown): string { return String(value ?? '').trim(); }

export function detectHeaderRows(
  table: unknown[][],
  subjects: SubjectDefinition[],
  aliases: AliasDictionary,
): { headerStartRow: number; headerDepth: 1 | 2 | 3; dataStartRow: number } {
  const identityKeywords = ['学号', '姓名', '学生编号', '学生姓名'];
  const subjectKeywords = subjects.flatMap((subject) => [subject.name, ...subject.aliases]);
  const metricKeywords = Object.values(aliases.metrics).flat();
  const scored = table.slice(0, 20).map((row, index) => {
    const cells = row.map(cellText).filter(Boolean);
    const identityHits = cells.reduce((sum, cell) => sum + identityKeywords.filter((key) => cell.includes(key)).length, 0);
    const subjectHits = cells.reduce((sum, cell) => sum + subjectKeywords.filter((key) => cell.includes(key)).length, 0);
    const metricHits = cells.reduce((sum, cell) => sum + metricKeywords.filter((key) => cell.includes(key)).length, 0);
    return { index, score: identityHits * 12 + subjectHits * 4 + metricHits * 2 + Math.min(cells.length, 12) * 0.1 };
  });
  const best = scored.sort((a, b) => b.score - a.score || a.index - b.index)[0];
  const headerStartRow = best?.score ? best.index : 0;
  let headerDepth: 1 | 2 | 3 = 1;
  for (let offset = 1; offset < 3; offset += 1) {
    const row = table[headerStartRow + offset] ?? [];
    const populated = row.map(cellText).filter(Boolean);
    const headerHits = populated.filter((cell) => [...identityKeywords, ...subjectKeywords, ...metricKeywords].some((word) => cell.includes(word))).length;
    const numericCells = populated.filter((cell) => /^[-+]?\d+(?:\.\d+)?$/.test(cell)).length;
    const looksLikeHeader = headerHits >= 2 && numericCells < Math.max(2, populated.length / 2);
    if (!looksLikeHeader) break;
    headerDepth = (offset + 1) as 2 | 3;
  }
  return { headerStartRow, headerDepth, dataStartRow: headerStartRow + headerDepth };
}

export function headerStructureSignature(headers: string[]): string {
  return headers.map((header) => header.normalize('NFKC').replace(/\s+/g, '').toLowerCase()).join('\u001f');
}

export function flattenMultiLevelHeaders(
  table: unknown[][],
  headerStartRow: number,
  headerDepth: number,
): string[] {
  const rows = table.slice(headerStartRow, headerStartRow + Math.min(3, Math.max(1, headerDepth)));
  const width = Math.max(0, ...rows.map((row) => row.length));
  const propagated = rows.map((row) => {
    let last = '';
    return Array.from({ length: width }, (_, column) => {
      const value = cellText(row[column]);
      if (value) last = value;
      return value || last;
    });
  });
  return Array.from({ length: width }, (_, column) => {
    const parts = propagated.map((row) => row[column]).filter(Boolean);
    return [...new Set(parts)].join(' / ') || `第${column + 1}列`;
  });
}
