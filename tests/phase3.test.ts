import { describe, expect, it } from 'vitest';
import { analysisColumnLabels, buildSubjectAnalysisRows, filterAndSortAnalysisRows, type AnalysisSortKey } from '../src/analytics/subjectAnalysis';
import { createProject } from '../src/models/factory';
import type { Exam, ScoreLensProject, Student } from '../src/models/project';
import { createSubjectAnalysisWorkbook } from '../src/export/excelExport';
import { createSubjectAnalysisPdfBytes, paginateAnalysisRows } from '../src/export/pdfExport';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';

function fixture(): { project: ScoreLensProject; exam: Exam } {
  const project = createProject('初三15班');
  const students: Student[] = [
    { studentId: '001', name: '张三', status: 'active', createdAt: 'now' },
    { studentId: '002', name: '李四', status: 'active', createdAt: 'now' },
    { studentId: '003', name: '王五', status: 'active', createdAt: 'now' },
    { studentId: '004', name: '赵六', status: 'inactive', createdAt: 'now' },
  ];
  const exam: Exam = {
    examId: 'exam-1', name: '八上期中', order: 0, source: {}, createdAt: 'now', updatedAt: 'now',
    capabilities: { canViewScores: true, canAnalyzeRankDifference: true, canRenderRadar: false, canAnalyzeTotalRankTrend: true },
    students: {
      '001': { studentId: '001', total: { score: 600, gradeRank: 200, grade: 'A', sourceRankChange: -20 }, subjects: { chinese: { score: 98, gradeRank: 350, grade: 'B+', sourceRankChange: 51 } } },
      '002': { studentId: '002', total: { score: 650, gradeRank: 50, grade: 'A+', sourceRankChange: 500 }, subjects: { chinese: { score: 120, gradeRank: 20, grade: 'A+', sourceRankChange: -30 } } },
      '003': { studentId: '003', total: { score: 580, gradeRank: 300, grade: 'B+', sourceRankChange: null }, subjects: { chinese: { score: 90, gradeRank: 330, grade: 'B', sourceRankChange: 0 } } },
      '004': { studentId: '004', total: { score: 700, gradeRank: 1 }, subjects: { chinese: { score: 140, gradeRank: 1 } } },
    },
  };
  project.students = students; project.exams = [exam];
  return { project, exam };
}

describe('subject analysis table', () => {
  it('includes total and subject rank-change columns', () => {
    expect(analysisColumnLabels('语文')).toEqual(['学号', '姓名', '总分', '总排名', '总进退', '总等级', '语文分数', '语文等级', '语文排名', '语文进退', '排名差']);
  });
  it('classifies active students and excludes inactive students', () => {
    const { project, exam } = fixture();
    const rows = buildSubjectAnalysisRows(project, exam, 'chinese', 100);
    expect(rows.map((row) => [row.student.studentId, row.difference, row.status])).toEqual([
      ['001', 150, 'weakness'], ['002', -30, 'normal'], ['003', 30, 'normal'],
    ]);
  });

  it('sorts by official total rank by default and supports temporary sorts', () => {
    const { project, exam } = fixture();
    const rows = buildSubjectAnalysisRows(project, exam, 'chinese', 100);
    expect(filterAndSortAnalysisRows(rows, 'all', '', 'totalRank', 'asc').map((row) => row.student.studentId)).toEqual(['002', '001', '003']);
    expect(filterAndSortAnalysisRows(rows, 'all', '', 'difference', 'desc').map((row) => row.student.studentId)).toEqual(['001', '003', '002']);
  });

  const columnOrders: [AnalysisSortKey, string[], string[]][] = [
    ['studentId', ['001', '002', '003'], ['003', '002', '001']],
    ['name', ['002', '003', '001'], ['001', '003', '002']],
    ['totalScore', ['003', '001', '002'], ['002', '001', '003']],
    ['totalRank', ['002', '001', '003'], ['003', '001', '002']],
    ['totalRankChange', ['001', '002', '003'], ['002', '001', '003']],
    ['totalGrade', ['003', '001', '002'], ['002', '001', '003']],
    ['subjectScore', ['003', '001', '002'], ['002', '001', '003']],
    ['subjectGrade', ['003', '001', '002'], ['002', '001', '003']],
    ['subjectRank', ['002', '003', '001'], ['001', '003', '002']],
    ['subjectRankChange', ['002', '003', '001'], ['001', '003', '002']],
    ['difference', ['002', '003', '001'], ['001', '003', '002']],
  ];
  it.each(columnOrders)('sorts %s in both directions', (field, ascending, descending) => {
    const { project, exam } = fixture();
    const rows = buildSubjectAnalysisRows(project, exam, 'chinese', 100);
    const ids = (direction: 'asc' | 'desc') =>
      filterAndSortAnalysisRows(rows, 'all', '', field, direction).map((row) => row.student.studentId);
    expect(ids('asc')).toEqual(ascending);
    expect(ids('desc')).toEqual(descending);
  });

  it('filters by classification and searches by name or studentId', () => {
    const { project, exam } = fixture();
    const rows = buildSubjectAnalysisRows(project, exam, 'chinese', 100);
    expect(filterAndSortAnalysisRows(rows, 'weakness', '', 'totalRank', 'asc').map((row) => row.student.name)).toEqual(['张三']);
    expect(filterAndSortAnalysisRows(rows, 'all', '002', 'totalRank', 'asc').map((row) => row.student.name)).toEqual(['李四']);
  });
});

describe('Phase 3 exports', () => {
  it('creates a styled XLSX with text student IDs and numeric metrics', async () => {
    const { project, exam } = fixture();
    const rows = filterAndSortAnalysisRows(buildSubjectAnalysisRows(project, exam, 'chinese', 100), 'all', '', 'totalRank', 'asc');
    const workbook = createSubjectAnalysisWorkbook('初三15班 八上期中 语文学科分析', '语文', rows);
    const data = await workbook.xlsx.writeBuffer();
    const loaded = await new ExcelJS.Workbook().xlsx.load(data);
    const sheet = loaded.getWorksheet('学科分析')!;
    expect(sheet.getCell('A3').value).toBe('002');
    expect(sheet.getCell('C3').value).toBe(650);
    expect(sheet.getCell('A4').value).toBe('001');
    expect(sheet.getCell('E3').value).toBe('↑ 500');
    expect(sheet.getCell('J3').value).toBe('↓ 30');
    expect(sheet.getCell('E3').fill).toMatchObject({ type: 'pattern', fgColor: { argb: 'E1F3ED' } });
    expect(sheet.getCell('J3').fill).toMatchObject({ type: 'pattern', fgColor: { argb: 'FFF4DC' } });
    expect(sheet.getCell('G4').fill).toMatchObject({ type: 'pattern', fgColor: { argb: 'FFF0E8' } });
  });

  it('keeps the complete class analysis on one portrait page', () => {
    expect(paginateAnalysisRows(Array.from({ length: 60 }, (_, index) => index)).map((page) => page.length)).toEqual([60]);
    expect(paginateAnalysisRows([])).toEqual([[]]);
  });

  it('generates a real one-page PDF with an embedded Chinese font', async () => {
    const { project, exam } = fixture();
    const rows = filterAndSortAnalysisRows(buildSubjectAnalysisRows(project, exam, 'chinese', 100), 'all', '', 'totalRank', 'asc');
    const font = readFileSync('node_modules/@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf');
    const bytes = await createSubjectAnalysisPdfBytes('初三15班 八上期中 语文学科分析', '语文', 100, rows, font);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('%PDF');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
