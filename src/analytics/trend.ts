import type { Exam, ScoreLensProject } from '../models/project';

export type TrendMetric = 'total' | string;

export interface TrendPoint {
  examId: string;
  examName: string;
  value: number | null;
}

export interface TrendSeries {
  metric: TrendMetric;
  label: string;
  points: TrendPoint[];
}

export function orderedExams(exams: Exam[]): Exam[] {
  return [...exams].sort((left, right) => left.order - right.order);
}

export function reorderExams(exams: Exam[], draggedId: string, targetId: string): Exam[] {
  if (draggedId === targetId) return orderedExams(exams);
  const ordered = orderedExams(exams);
  const from = ordered.findIndex((exam) => exam.examId === draggedId);
  const to = ordered.findIndex((exam) => exam.examId === targetId);
  if (from < 0 || to < 0) return ordered;
  const [dragged] = ordered.splice(from, 1);
  ordered.splice(to, 0, dragged);
  return ordered.map((exam, order) => ({ ...exam, order, updatedAt: new Date().toISOString() }));
}

export function renameExam(exams: Exam[], examId: string, name: string): Exam[] {
  const trimmed = name.trim();
  if (!trimmed) return exams;
  return exams.map((exam) => exam.examId === examId ? { ...exam, name: trimmed, updatedAt: new Date().toISOString() } : exam);
}

export function buildRankTrendSeries(project: ScoreLensProject, studentId: string, metrics: TrendMetric[]): TrendSeries[] {
  const exams = orderedExams(project.exams);
  return metrics.map((metric) => ({
    metric,
    label: metric === 'total' ? '总排名' : project.subjects.find((subject) => subject.id === metric)?.name ?? metric,
    points: exams.map((exam) => ({
      examId: exam.examId,
      examName: exam.name,
      value: metric === 'total'
        ? exam.students[studentId]?.total?.gradeRank ?? null
        : exam.students[studentId]?.subjects[metric]?.gradeRank ?? null,
    })),
  }));
}

export function splitTrendSegments<T extends { value: number | null }>(points: T[]): T[][] {
  const segments: T[][] = [];
  let current: T[] = [];
  for (const point of points) {
    if (point.value == null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

export function rankToY(rank: number, maxRank: number, top: number, height: number): number {
  const safeMaximum = Math.max(2, maxRank);
  const ratio = (Math.max(1, rank) - 1) / (safeMaximum - 1);
  return top + ratio * height;
}
