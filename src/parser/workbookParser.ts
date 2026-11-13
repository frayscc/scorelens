import ExcelJS from 'exceljs';
import { readLegacyWorkbook } from './legacyWorkbook';
import type { AliasDictionary, ExamCapabilities, ExamStudentData, FieldMapping, MetricSet, SubjectDefinition } from '../models/project';
import { normalizeMetric } from './valueNormalizer';

export interface ParsedSheet {
  name: string;
  suggestedExamName: string;
  table: unknown[][];
}

function isMeaninglessSheetName(name: string): boolean {
  return /^sheet\s*\d+$/i.test(name.trim()) || /^工作表\s*\d+$/.test(name.trim());
}

export function suggestExamName(sheetName: string, fileName: string, sheetCount: number, index: number): string {
  if (!isMeaninglessSheetName(sheetName)) return sheetName.trim();
  const baseName = fileName.replace(/\.(xlsx?|csv)$/i, '').trim() || '未命名考试';
  return sheetCount === 1 ? baseName : `${baseName} ${index + 1}`;
}

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', '\t', ';'];
  const delimiter = candidates.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(value); value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += character;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function excelCellText(cell: ExcelJS.Cell): string | null {
  if (typeof cell.value === 'number' && /^0+$/.test(cell.numFmt)) return String(cell.value).padStart(cell.numFmt.length, '0');
  const value = cell.text;
  return value === '' ? null : value;
}

function workbookExtension(fileName: string): string {
  const extension = /\.(xlsx?|csv)$/i.exec(fileName)?.[1];
  if (!extension) throw new Error('请选择 .xlsx、.xls 或 .csv 文件。');
  return extension.toLowerCase();
}

async function readXlsxWorkbook(data: ArrayBuffer | Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  const buffer = data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  await workbook.xlsx.load(buffer);
  return workbook.worksheets.flatMap((sheet) => {
    if (sheet.state !== 'visible') return [];
    const table = Array.from({ length: sheet.rowCount }, (_, rowIndex) =>
      Array.from({ length: sheet.columnCount }, (_, columnIndex) => {
        return excelCellText(sheet.getCell(rowIndex + 1, columnIndex + 1));
      }));
    return [{ name: sheet.name, table }];
  });
}

export async function parseWorkbookBytes(data: ArrayBuffer | Uint8Array, fileName: string): Promise<ParsedSheet[]> {
  const extension = workbookExtension(fileName);
  if (extension === 'csv') {
    const table = parseCsv(new TextDecoder('utf-8').decode(data));
    if (!table.some((row) => row.some((cell) => cell.trim()))) return [];
    const name = fileName.replace(/\.csv$/i, '') || 'CSV';
    return [{ name, suggestedExamName: name, table }];
  }

  const sheets = extension === 'xls' ? readLegacyWorkbook(data) : await readXlsxWorkbook(data);
  const visibleNonEmpty = sheets.filter(({ table }) => table.some((row) => row.some((cell) => cell?.trim())));
  return visibleNonEmpty.map((sheet, index) => ({
    ...sheet,
    suggestedExamName: suggestExamName(sheet.name, fileName, visibleNonEmpty.length, index),
  }));
}

export async function parseWorkbook(file: File): Promise<ParsedSheet[]> {
  workbookExtension(file.name);
  try { return await parseWorkbookBytes(await file.arrayBuffer(), file.name); }
  catch (error) {
    throw new Error('无法读取该成绩文件，请检查文件是否损坏或格式是否正确。', { cause: error });
  }
}

export interface ImportDiagnostics {
  processedRows: number;
  skippedRows: number;
  emptyValues: number;
  invalidValues: number;
  duplicateStudentIds: string[];
}

export function normalizeRows(
  table: unknown[][],
  dataStartRow: number,
  mappings: FieldMapping[],
  aliases: AliasDictionary,
): { students: Record<string, ExamStudentData>; names: Record<string, string>; diagnostics: ImportDiagnostics } {
  const idMapping = mappings.find((mapping) => mapping.target.type === 'studentId');
  const nameMapping = mappings.find((mapping) => mapping.target.type === 'studentName');
  if (!idMapping || !nameMapping) throw new Error('必须映射学号和姓名字段。');
  const students: Record<string, ExamStudentData> = {};
  const names: Record<string, string> = {};
  const diagnostics: ImportDiagnostics = { processedRows: 0, skippedRows: 0, emptyValues: 0, invalidValues: 0, duplicateStudentIds: [] };
  for (const row of table.slice(dataStartRow)) {
    const studentId = String(row[idMapping.sourceColumnIndex] ?? '').trim();
    const name = String(row[nameMapping.sourceColumnIndex] ?? '').trim();
    if (!studentId || !name) { diagnostics.skippedRows += 1; continue; }
    if (students[studentId]) diagnostics.duplicateStudentIds.push(studentId);
    const student: ExamStudentData = { studentId, total: {}, subjects: {} };
    names[studentId] = name;
    diagnostics.processedRows += 1;
    for (const mapping of mappings) {
      const target = mapping.target;
      if (target.type !== 'total' && target.type !== 'subject') continue;
      const value = normalizeMetric(target.metric, row[mapping.sourceColumnIndex], aliases.nullTokens);
      if (value == null) {
        const raw = String(row[mapping.sourceColumnIndex] ?? '').trim();
        if (aliases.nullTokens.includes(raw)) diagnostics.emptyValues += 1;
        else diagnostics.invalidValues += 1;
      }
      const metricSet: MetricSet = target.type === 'total'
        ? (student.total ??= {})
        : (student.subjects[target.subjectId] ??= {});
      if (target.metric === 'grade') metricSet.grade = value as string | null;
      else metricSet[target.metric] = value as number | null;
    }
    students[studentId] = student;
  }
  diagnostics.duplicateStudentIds = [...new Set(diagnostics.duplicateStudentIds)];
  return { students, names, diagnostics };
}

export function calculateCapabilities(students: Record<string, ExamStudentData>): ExamCapabilities {
  const values = Object.values(students);
  const hasScore = values.some((student) => student.total?.score != null || Object.values(student.subjects).some((subject) => subject?.score != null));
  const hasTotalRank = values.some((student) => student.total?.gradeRank != null);
  const hasSubjectRank = values.some((student) => Object.values(student.subjects).some((subject) => subject?.gradeRank != null));
  const hasGrade = values.some((student) => Object.values(student.subjects).some((subject) => subject?.grade != null));
  return {
    canViewScores: hasScore,
    canAnalyzeRankDifference: hasTotalRank && hasSubjectRank,
    canRenderRadar: hasGrade,
    canAnalyzeTotalRankTrend: hasTotalRank,
  };
}

export function selectedSubjectNames(mappings: FieldMapping[], subjects: SubjectDefinition[]): string[] {
  const ids = new Set(mappings.flatMap((mapping) => mapping.target.type === 'subject' ? [mapping.target.subjectId] : []));
  return subjects.filter((subject) => ids.has(subject.id)).map((subject) => subject.name);
}
