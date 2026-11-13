import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { utils, write } from 'xlsx';
import { DEFAULT_ALIASES, DEFAULT_SUBJECTS } from '../src/constants';
import { findMappingConflicts, matchField } from '../src/parser/fieldMatcher';
import { detectHeaderRows, flattenMultiLevelHeaders, headerStructureSignature } from '../src/parser/headerDetector';
import { calculateCapabilities, normalizeRows, parseWorkbookBytes, suggestExamName } from '../src/parser/workbookParser';
import { detectStudentChanges, mergeExamStudents } from '../src/parser/studentMerge';
import type { FieldMapping, Student } from '../src/models/project';

async function workbookBytes(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const scores = workbook.addWorksheet('Sheet1');
  scores.addRows([
    ['学号', '姓名', '语文', null, null],
    [null, null, '成绩', '等级', '级次'],
    [1, '张三', 98, 'A', 120],
  ]);
  scores.getCell('A3').numFmt = '000';
  scores.mergeCells('C1:E1');
  const hidden = workbook.addWorksheet('隐藏'); hidden.state = 'hidden'; hidden.addRow(['秘密']);
  workbook.addWorksheet('空表');
  return await workbook.xlsx.writeBuffer();
}

describe('workbook ingestion', () => {
  it('filters hidden and empty sheets, expands merges and names Sheet1 from file', async () => {
    const sheets = await parseWorkbookBytes(await workbookBytes(), '八上期中.xlsx');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].suggestedExamName).toBe('八上期中');
    expect(sheets[0].table[0].slice(2, 5)).toEqual(['语文', '语文', '语文']);
    expect(sheets[0].table[2][0]).toBe('001');
  });

  it('parses UTF-8 CSV locally', async () => {
    const bytes = new TextEncoder().encode('学号,姓名,总分\n001,张三,600');
    const sheets = await parseWorkbookBytes(bytes, '一模.csv');
    expect(sheets[0].suggestedExamName).toBe('一模');
    expect(sheets[0].table[1]).toEqual(['001', '张三', '600']);
  });

  it('imports binary XLS with merged headers, visible sheets and zero-padded student IDs', async () => {
    const workbook = utils.book_new();
    const scores = utils.aoa_to_sheet([
      ['学号', '姓名', '语文'],
      [null, null, '成绩', '校次'],
      [1, '张三', 98.5, 120],
    ]);
    scores.A3.z = '000';
    scores['!merges'] = [utils.decode_range('A1:A2'), utils.decode_range('B1:B2'), utils.decode_range('C1:D1')];
    utils.book_append_sheet(workbook, scores, 'Sheet1');
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([['隐藏内容']]), '隐藏');
    utils.book_set_sheet_visibility(workbook, '隐藏', 1);
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([['深度隐藏内容']]), '深度隐藏');
    utils.book_set_sheet_visibility(workbook, '深度隐藏', 2);
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([]), '空表');

    const bytes: ArrayBuffer = write(workbook, { bookType: 'biff8', type: 'array' });
    const sheets = await parseWorkbookBytes(bytes, '八上期中.XLS');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].suggestedExamName).toBe('八上期中');
    expect(sheets[0].table[0]).toEqual(['学号', '姓名', '语文', '语文']);
    const table = sheets[0].table;
    const { headerStartRow, headerDepth, dataStartRow } = detectHeaderRows(table, DEFAULT_SUBJECTS, DEFAULT_ALIASES);
    const mappings = flattenMultiLevelHeaders(table, headerStartRow, headerDepth).map((header, index) =>
      matchField(header, index, DEFAULT_SUBJECTS, DEFAULT_ALIASES));
    const normalized = normalizeRows(table, dataStartRow, mappings, DEFAULT_ALIASES);
    expect(normalized.names).toEqual({ '001': '张三' });
    expect(normalized.students['001'].subjects.chinese).toEqual({ score: 98.5, gradeRank: 120 });
  });

  it('uses sheet names unless they are generic', () => {
    expect(suggestExamName('九上期末', '成绩.xlsx', 1, 0)).toBe('九上期末');
    expect(suggestExamName('Sheet2', '成绩.xlsx', 3, 1)).toBe('成绩 2');
  });
});

describe('multi-level headers and mapping reuse', () => {
  it('detects and flattens three header levels', () => {
    const table = [
      ['学号', '姓名', '语文', '语文', '语文'],
      [null, null, '语文', '语文', '语文'],
      [null, null, '成绩', '等级', '级次'],
      ['001', '张三', 98, 'A', 120],
    ];
    const detected = detectHeaderRows(table, DEFAULT_SUBJECTS, DEFAULT_ALIASES);
    expect(detected).toEqual({ headerStartRow: 0, headerDepth: 3, dataStartRow: 3 });
    expect(flattenMultiLevelHeaders(table, 0, 3).slice(2)).toEqual(['语文 / 成绩', '语文 / 等级', '语文 / 级次']);
  });

  it('produces stable signatures for structurally equal headers', () => {
    expect(headerStructureSignature(['学号', '语文 / 成绩'])).toBe(headerStructureSignature([' 学号 ', '语文/成绩']));
  });

  it('maps identity, total, English and morality fields', () => {
    const headers = ['学号', '姓名', '总分', '总排名', '总等级', '外语', '外语等级', '外语级次', '政治', '政治等级', '政治级次'];
    const mappings = headers.map((header, index) => matchField(header, index, DEFAULT_SUBJECTS, structuredClone(DEFAULT_ALIASES)));
    expect(mappings.map((mapping) => mapping.target)).toEqual([
      { type: 'studentId' }, { type: 'studentName' },
      { type: 'total', metric: 'score' }, { type: 'total', metric: 'gradeRank' }, { type: 'total', metric: 'grade' },
      { type: 'subject', subjectId: 'english', metric: 'score' }, { type: 'subject', subjectId: 'english', metric: 'grade' }, { type: 'subject', subjectId: 'english', metric: 'gradeRank' },
      { type: 'subject', subjectId: 'morality', metric: 'score' }, { type: 'subject', subjectId: 'morality', metric: 'grade' }, { type: 'subject', subjectId: 'morality', metric: 'gradeRank' },
    ]);
  });

  it('reports duplicate target mappings', () => {
    const mappings = ['物理', '物理折算后'].map((header, index) => matchField(header, index, DEFAULT_SUBJECTS, structuredClone(DEFAULT_ALIASES)));
    expect(findMappingConflicts(mappings)).toEqual([[0, 1]]);
  });
});

describe('row normalization and student reconciliation', () => {
  const mappings: FieldMapping[] = [
    { sourceColumnIndex: 0, sourceHeader: '学号', target: { type: 'studentId' }, confidence: 1 },
    { sourceColumnIndex: 1, sourceHeader: '姓名', target: { type: 'studentName' }, confidence: 1 },
    { sourceColumnIndex: 2, sourceHeader: '总排名', target: { type: 'total', metric: 'gradeRank' }, confidence: 1 },
    { sourceColumnIndex: 3, sourceHeader: '语文', target: { type: 'subject', subjectId: 'chinese', metric: 'score' }, confidence: 1 },
    { sourceColumnIndex: 4, sourceHeader: '语文级次', target: { type: 'subject', subjectId: 'chinese', metric: 'gradeRank' }, confidence: 1 },
  ];

  it('keeps missing distinct from zero and reports invalid values', () => {
    const result = normalizeRows([
      ['学号', '姓名', '总排名', '语文', '语文级次'],
      ['001', '张三', 20, '缺考', 31],
      ['002', '李四', '错误', 0, '第18名'],
    ], 1, mappings, DEFAULT_ALIASES);
    expect(result.students['001'].subjects.chinese?.score).toBeNull();
    expect(result.students['002'].subjects.chinese?.score).toBe(0);
    expect(result.students['002'].subjects.chinese?.gradeRank).toBe(18);
    expect(result.diagnostics.emptyValues).toBe(1);
    expect(result.diagnostics.invalidValues).toBe(1);
    expect(calculateCapabilities(result.students).canAnalyzeRankDifference).toBe(true);
  });

  it('detects duplicates, additions and missing students by studentId', () => {
    const normalized = normalizeRows([
      ['学号', '姓名', '总排名', '语文', '语文级次'],
      ['002', '李四', 18, 90, 18], ['002', '李四', 18, 90, 18], ['003', '王五', 30, 80, 40],
    ], 1, mappings, DEFAULT_ALIASES);
    expect(normalized.diagnostics.duplicateStudentIds).toEqual(['002']);
    const existing: Student[] = [{ studentId: '001', name: '张三', status: 'active', createdAt: 'now' }, { studentId: '002', name: '李四', status: 'active', createdAt: 'now' }];
    expect(detectStudentChanges(existing, normalized.students)).toEqual({ added: ['003'], missing: ['001'] });
    expect(mergeExamStudents(existing, normalized.names, ['003']).map((student) => student.studentId)).toEqual(['001', '002', '003']);
  });

  const rankChangeHeaders = ['学号', '姓名', '总分级次进退步', '语文级次', '语文级次进退步'];
  const rankChangeMappings = rankChangeHeaders.map((header, index) => matchField(header, index, DEFAULT_SUBJECTS, DEFAULT_ALIASES));

  it('normalizes total rank progress from the school source', () => {
    const result = normalizeRows([rankChangeHeaders, ['001', '张三', '↑500', 120, '↑51']], 1, rankChangeMappings, DEFAULT_ALIASES);
    expect(result.students['001'].total?.sourceRankChange).toBe(500);
  });

  it('normalizes total rank decline from the school source', () => {
    const result = normalizeRows([rankChangeHeaders, ['001', '张三', '↓ 200', 120, '↑51']], 1, rankChangeMappings, DEFAULT_ALIASES);
    expect(result.students['001'].total?.sourceRankChange).toBe(-200);
  });

  it('normalizes a subject rank change independently', () => {
    const result = normalizeRows([rankChangeHeaders, ['001', '张三', '↑500', 120, '↑ 51']], 1, rankChangeMappings, DEFAULT_ALIASES);
    expect(result.students['001'].subjects.chinese?.sourceRankChange).toBe(51);
  });

  it('does not confuse subject grade rank with subject rank change', () => {
    expect(rankChangeMappings[3].target).toEqual({ type: 'subject', subjectId: 'chinese', metric: 'gradeRank' });
    expect(rankChangeMappings[4].target).toEqual({ type: 'subject', subjectId: 'chinese', metric: 'sourceRankChange' });
    const result = normalizeRows([rankChangeHeaders, ['001', '张三', 0, 120, '↑30']], 1, rankChangeMappings, DEFAULT_ALIASES);
    expect(result.students['001'].subjects.chinese).toMatchObject({ gradeRank: 120, sourceRankChange: 30 });
  });

  it('keeps missing rank change values as null', () => {
    const result = normalizeRows([rankChangeHeaders, ['001', '张三', '/', 120, '/']], 1, rankChangeMappings, DEFAULT_ALIASES);
    expect(result.students['001'].total?.sourceRankChange).toBeNull();
    expect(result.students['001'].subjects.chinese?.sourceRankChange).toBeNull();
  });
});
