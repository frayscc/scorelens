import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createProject } from '../src/models/factory';
import type { Exam, Student } from '../src/models/project';
import { buildSubjectAnalysisRows, filterAndSortAnalysisRows } from '../src/analytics/subjectAnalysis';
import { createSubjectAnalysisPdfBytes } from '../src/export/pdfExport';
import { createStudentProfilesPdfBytes } from '../src/export/studentProfilePdf';

const project = createProject('初三15班');
const names = ['张晨曦','李思源','王若涵','赵子墨','陈雨桐','刘浩然','杨诗琪','黄宇轩','周欣怡','吴嘉诚'];
const students: Student[] = Array.from({ length: 48 }, (_, index) => ({
  studentId: `2024-${String(1501 + index)}`,
  name: index < names.length ? names[index] : `学生${String(index + 1).padStart(2, '0')}`,
  status: 'active', createdAt: '2026-09-01T00:00:00.000Z',
}));
const grades = ['A+','A','B+','B','C+','C'];
const examNames = ['八上期中','八上期末','九上期中','一模'];
const exams: Exam[] = examNames.map((name, examIndex) => ({
  examId: `exam-${examIndex}`, name, order: examIndex, source: {}, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  capabilities: { canViewScores: true, canAnalyzeRankDifference: true, canRenderRadar: true, canAnalyzeTotalRankTrend: true },
  students: Object.fromEntries(students.map((student, index) => {
    const totalRank = Math.max(1, 55 + index * 11 - examIndex * (index % 4) * 8);
    const subjects = Object.fromEntries(project.subjects.slice(0, 8).map((subject, subjectIndex) => {
      const offset = ((index * 37 + subjectIndex * 71) % 330) - 165;
      return [subject.id, { score: Math.max(45, 118 - subjectIndex * 3 - index % 15), grade: grades[(index + subjectIndex + examIndex) % grades.length], gradeRank: Math.max(1, totalRank + offset), sourceRankChange: ((index + subjectIndex) % 3 === 0 ? 1 : -1) * (12 + (index * 7 + subjectIndex * 5) % 90) }];
    }));
    if (examIndex === 1 && index === 3) subjects.math = { score: null, grade: null, gradeRank: null };
    return [student.studentId, { studentId: student.studentId, total: { score: 690 - index * 4 + examIndex * 3, grade: grades[index % grades.length], gradeRank: totalRank, sourceRankChange: index % 2 === 0 ? 18 + index * 3 : -(9 + index * 2) }, subjects }];
  })),
}));
project.students = students; project.exams = exams;
const font = await readFile('node_modules/@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf');
const classRows = filterAndSortAnalysisRows(buildSubjectAnalysisRows(project, exams[3], 'chinese', 100), 'all', '', 'totalRank', 'asc');
const classPdf = await createSubjectAnalysisPdfBytes('初三15班 一模 语文学科分析', '语文', 100, classRows, font);
await mkdir('output/pdf', { recursive: true });
await writeFile('output/pdf/ScoreLens_班级学科分析_验收样例.pdf', classPdf);
for (const count of [2, 5, 10]) {
  const profilePdf = await createStudentProfilesPdfBytes(project, students.slice(0, count).map((student) => student.studentId), exams[3].examId, ['total','math','physics'], undefined, font);
  await writeFile(`output/pdf/ScoreLens_学生画像_${count}人_验收样例.pdf`, profilePdf);
}
