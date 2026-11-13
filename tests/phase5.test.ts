import { describe, expect, it } from 'vitest';
import { buildRankTrendSeries, rankToY, renameExam, reorderExams, splitTrendSegments } from '../src/analytics/trend';
import { createProject } from '../src/models/factory';
import type { Exam } from '../src/models/project';

function exam(examId: string, name: string, order: number, totalRank: number | null, mathRank: number | null): Exam {
  return {
    examId, name, order, source: {}, createdAt: 'now', updatedAt: 'now',
    capabilities: { canViewScores: true, canAnalyzeRankDifference: true, canRenderRadar: false, canAnalyzeTotalRankTrend: totalRank != null },
    students: totalRank == null && mathRank == null ? {} : {
      '001': { studentId: '001', total: { gradeRank: totalRank }, subjects: { math: { gradeRank: mathRank } } },
    },
  };
}

describe('exam management', () => {
  const exams = [exam('b','八上期末',1,270,240),exam('a','八上期中',0,320,300),exam('c','九上期中',2,190,180)];

  it('reorders exams and rewrites contiguous order values', () => {
    const reordered = reorderExams(exams, 'c', 'a');
    expect(reordered.map((item)=>[item.examId,item.order])).toEqual([['c',0],['a',1],['b',2]]);
  });

  it('renames only the target exam and rejects an empty name', () => {
    expect(renameExam(exams,'b','  九上期末  ').find((item)=>item.examId==='b')?.name).toBe('九上期末');
    expect(renameExam(exams,'b','   ')).toBe(exams);
  });
});

describe('rank trends', () => {
  it('uses explicit exam order rather than array position', () => {
    const project=createProject('测试班'); project.exams=[exam('third','九上期中',2,190,180),exam('first','八上期中',0,320,300),exam('second','八上期末',1,270,240)];
    const series=buildRankTrendSeries(project,'001',['total','math']);
    expect(series[0].points.map((point)=>[point.examName,point.value])).toEqual([['八上期中',320],['八上期末',270],['九上期中',190]]);
    expect(series[1].label).toBe('数学');
  });

  it('keeps a missing exam as null and splits the line at that point', () => {
    const project=createProject('测试班'); project.exams=[exam('a','期中',0,320,300),exam('b','期末',1,null,null),exam('c','一模',2,190,180)];
    const points=buildRankTrendSeries(project,'001',['total'])[0].points;
    expect(points.map((point)=>point.value)).toEqual([320,null,190]);
    expect(splitTrendSegments(points).map((segment)=>segment.map((point)=>point.value))).toEqual([[320],[190]]);
  });

  it('places a better rank higher on the reversed Y axis', () => {
    expect(rankToY(1,500,20,300)).toBe(20);
    expect(rankToY(100,500,20,300)).toBeLessThan(rankToY(400,500,20,300));
  });
});
