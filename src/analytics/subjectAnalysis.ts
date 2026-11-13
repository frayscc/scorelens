import { GRADE_ORDER } from '../constants';
import type { Exam, MetricSet, ScoreLensProject, Student } from '../models/project';
import { calculateRankDifference, classifyRankDifference, type RankDifferenceClass } from './rankDifference';
import { compareStudentIds } from './studentOrder';

export type AnalysisFilter = 'all' | 'advantage' | 'weakness' | 'normal';
export type AnalysisSortKey = keyof typeof sortValues;
export type SortDirection = 'asc' | 'desc';

export interface SubjectAnalysisRow {
  student: Student;
  total: MetricSet | null;
  subject: MetricSet | null;
  difference: number | null;
  status: RankDifferenceClass;
}

export function analysisColumnLabels(subjectName: string): string[] {
  return analysisColumns(subjectName).map(([, label]) => label);
}

export function analysisColumns(subjectName: string): [AnalysisSortKey, string][] {
  return [
    ['studentId', '学号'], ['name', '姓名'], ['totalScore', '总分'], ['totalRank', '总排名'],
    ['totalRankChange', '总进退'], ['totalGrade', '总等级'], ['subjectScore', `${subjectName}分数`],
    ['subjectGrade', `${subjectName}等级`], ['subjectRank', `${subjectName}排名`],
    ['subjectRankChange', `${subjectName}进退`], ['difference', '排名差'],
  ];
}

export function buildSubjectAnalysisRows(
  project: ScoreLensProject,
  exam: Exam,
  subjectId: string,
  threshold: number,
): SubjectAnalysisRow[] {
  return project.students
    .filter((student) => student.status === 'active')
    .map((student) => {
      const data = exam.students[student.studentId];
      const subject = data?.subjects[subjectId] ?? null;
      const total = data?.total ?? null;
      const difference = calculateRankDifference(subject?.gradeRank, total?.gradeRank);
      return { student, total, subject, difference, status: classifyRankDifference(difference, threshold) };
    });
}

function gradeSortValue(grade: string | null | undefined): number | string | null {
  const normalized = grade?.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  if (!normalized) return null;
  const index = GRADE_ORDER.findIndex((value) => value === normalized);
  return index < 0 ? normalized : index;
}

const sortValues = {
  studentId: (row) => row.student.studentId,
  name: (row) => row.student.name,
  totalScore: (row) => row.total?.score,
  totalRank: (row) => row.total?.gradeRank,
  totalRankChange: (row) => row.total?.sourceRankChange,
  totalGrade: (row) => gradeSortValue(row.total?.grade),
  subjectScore: (row) => row.subject?.score,
  subjectGrade: (row) => gradeSortValue(row.subject?.grade),
  subjectRank: (row) => row.subject?.gradeRank,
  subjectRankChange: (row) => row.subject?.sourceRankChange,
  difference: (row) => row.difference,
} satisfies Record<string, (row: SubjectAnalysisRow) => string | number | null | undefined>;

const textCollator = new Intl.Collator('zh-CN');

export function filterAndSortAnalysisRows(
  rows: SubjectAnalysisRow[],
  filter: AnalysisFilter,
  query: string,
  sortKey: AnalysisSortKey,
  direction: SortDirection,
): SubjectAnalysisRow[] {
  const keyword = query.trim().toLowerCase();
  const getValue = sortValues[sortKey];
  return rows
    .filter((row) => filter === 'all' || row.status === filter)
    .filter((row) => !keyword || row.student.name.toLowerCase().includes(keyword) || row.student.studentId.toLowerCase().includes(keyword))
    .sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);
      if (left == null && right == null) return a.student.studentId.localeCompare(b.student.studentId);
      if (left == null) return 1;
      if (right == null) return -1;
      let result: number;
      if (typeof left === 'number') {
        if (typeof right !== 'number') return -1;
        result = left - right;
      } else {
        if (typeof right === 'number') return 1;
        result = sortKey === 'studentId' ? compareStudentIds(left, right) : textCollator.compare(left, right);
      }
      return direction === 'asc' ? result : -result;
    });
}

export function analysisCounts(rows: SubjectAnalysisRow[]): Record<Exclude<RankDifferenceClass, 'unavailable'> | 'unavailable', number> {
  return rows.reduce((counts, row) => ({ ...counts, [row.status]: counts[row.status] + 1 }), { advantage: 0, weakness: 0, normal: 0, unavailable: 0 });
}
