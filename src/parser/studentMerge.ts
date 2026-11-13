import type { ExamStudentData, Student } from '../models/project';

export function detectStudentChanges(students: Student[], incoming: Record<string, ExamStudentData>) {
  const existing = new Set(students.map((student) => student.studentId));
  const incomingIds = new Set(Object.keys(incoming));
  return {
    added: [...incomingIds].filter((id) => !existing.has(id)),
    missing: students.filter((student) => student.status === 'active' && !incomingIds.has(student.studentId)).map((student) => student.studentId),
  };
}

export function mergeExamStudents(students: Student[], names: Record<string, string>, acceptedIds: string[]): Student[] {
  const now = new Date().toISOString();
  const byId = new Map(students.map((student) => [student.studentId, student]));
  for (const id of acceptedIds) {
    if (!byId.has(id)) byId.set(id, { studentId: id, name: names[id] ?? '', status: 'active', createdAt: now });
  }
  return [...byId.values()];
}
