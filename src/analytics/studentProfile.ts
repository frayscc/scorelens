import { GRADE_ORDER } from '../constants';
import type { Exam, MetricSet, ScoreLensProject, SubjectDefinition } from '../models/project';
import { calculateRankDifference, classifyRankDifference, type RankDifferenceClass } from './rankDifference';

export interface StudentSubjectRow {
  subject: SubjectDefinition;
  metrics: MetricSet;
  difference: number | null;
  status: RankDifferenceClass;
}

export interface RadarDatum {
  subjectId: string;
  subjectName: string;
  grade: string;
  value: number;
}

export function gradeToRadarValue(grade: string | null | undefined): number | null {
  if (!grade) return null;
  const normalized = grade.normalize('NFKC').replace(/\s+/g, '').toUpperCase();
  const index = GRADE_ORDER.indexOf(normalized as (typeof GRADE_ORDER)[number]);
  return index < 0 ? null : index + 1;
}

export function buildStudentSubjectRows(
  project: ScoreLensProject,
  exam: Exam,
  studentId: string,
  threshold: number,
): StudentSubjectRow[] {
  const data = exam.students[studentId];
  if (!data) return [];
  return project.subjects.flatMap((subject) => {
    const metrics = data.subjects[subject.id];
    if (!metrics || [metrics.score, metrics.grade, metrics.gradeRank].every((value) => value == null)) return [];
    const difference = calculateRankDifference(metrics.gradeRank, data.total?.gradeRank);
    return [{ subject, metrics, difference, status: classifyRankDifference(difference, threshold) }];
  });
}

export function buildRadarData(rows: StudentSubjectRow[]): RadarDatum[] {
  return rows.flatMap((row) => {
    const value = gradeToRadarValue(row.metrics.grade);
    return value == null ? [] : [{ subjectId: row.subject.id, subjectName: row.subject.name, grade: row.metrics.grade!, value }];
  });
}
