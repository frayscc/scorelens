import { describe, expect, it } from 'vitest';
import { buildRadarData, buildStudentSubjectRows, gradeToRadarValue } from '../src/analytics/studentProfile';
import { createProject } from '../src/models/factory';
import type { Exam } from '../src/models/project';

describe('grade radar mapping', () => {
  it('maps the six school grades in the required order', () => {
    expect(['C', 'C+', 'B', 'B+', 'A', 'A+'].map(gradeToRadarValue)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(gradeToRadarValue(' ｂ＋ ')).toBe(4);
  });

  it('never treats a missing or unknown grade as C', () => {
    expect(gradeToRadarValue(null)).toBeNull();
    expect(gradeToRadarValue('')).toBeNull();
    expect(gradeToRadarValue('优秀')).toBeNull();
  });
});

describe('student profile analytics', () => {
  const project = createProject('初三15班');
  project.students = [{ studentId: '001', name: '张三', status: 'active', createdAt: 'now' }];
  const exam: Exam = {
    examId: 'exam', name: '期中', order: 0, source: {}, createdAt: 'now', updatedAt: 'now',
    capabilities: { canViewScores: true, canAnalyzeRankDifference: true, canRenderRadar: true, canAnalyzeTotalRankTrend: true },
    students: { '001': { studentId: '001', total: { score: 620, grade: 'A', gradeRank: 200 }, subjects: {
      chinese: { score: 98, grade: 'A', gradeRank: 80 },
      math: { score: 110, grade: null, gradeRank: 350 },
      english: { score: 105, grade: 'B+', gradeRank: null },
    } } },
  };
  project.exams = [exam];

  it('builds the subject table and applies the shared rank-difference rule', () => {
    const rows = buildStudentSubjectRows(project, exam, '001', 100);
    expect(rows.map((row) => [row.subject.id, row.difference, row.status])).toEqual([
      ['chinese', -120, 'advantage'], ['math', 150, 'weakness'], ['english', null, 'unavailable'],
    ]);
  });

  it('omits null grades from radar data while retaining them in the subject table', () => {
    const rows = buildStudentSubjectRows(project, exam, '001', 100);
    expect(rows).toHaveLength(3);
    expect(buildRadarData(rows).map((item) => [item.subjectId, item.value])).toEqual([
      ['chinese', 5], ['english', 4],
    ]);
  });

  it('returns no fabricated rows for a missing exam record', () => {
    expect(buildStudentSubjectRows(project, exam, '999', 100)).toEqual([]);
  });
});
