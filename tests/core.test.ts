import { describe, expect, it } from 'vitest';
import { DEFAULT_ALIASES, DEFAULT_SUBJECTS } from '../src/constants';
import { calculateRankDifference, classifyRankDifference } from '../src/analytics/rankDifference';
import { detectSubject, matchField } from '../src/parser/fieldMatcher';
import { detectHeaderRows, flattenMultiLevelHeaders } from '../src/parser/headerDetector';
import { normalizeGrade, normalizeRank, normalizeRankChange, normalizeScore } from '../src/parser/valueNormalizer';
import { createProject, migrateProject } from '../src/models/factory';
import { formatRankChange, rankChangeTone } from '../src/format/rankChange';
import { parseProjectFileText, serializeProject } from '../src/storage/projectFile';

describe('value normalization', () => {
  it('normalizes score and missing tokens', () => {
    expect(normalizeScore('95.5 ', DEFAULT_ALIASES.nullTokens)).toBe(95.5);
    expect(normalizeScore('缺考', DEFAULT_ALIASES.nullTokens)).toBeNull();
  });
  it('normalizes grades, ranks and rank changes', () => {
    expect(normalizeGrade(' ｂ＋ ', DEFAULT_ALIASES.nullTokens)).toBe('B+');
    expect(normalizeRank('第15名', DEFAULT_ALIASES.nullTokens)).toBe(15);
    expect(normalizeRank('↑500', DEFAULT_ALIASES.nullTokens)).toBeNull();
    expect(normalizeRankChange('↑500', DEFAULT_ALIASES.nullTokens)).toBe(500);
    expect(normalizeRankChange('↓200', DEFAULT_ALIASES.nullTokens)).toBe(-200);
    expect(normalizeRankChange('↑ 500', DEFAULT_ALIASES.nullTokens)).toBe(500);
    expect(normalizeRankChange('／', DEFAULT_ALIASES.nullTokens)).toBeNull();
  });

  it('formats rank changes for users with independent progress colors', () => {
    expect([formatRankChange(51), formatRankChange(-20), formatRankChange(0), formatRankChange(null)]).toEqual(['↑ 51', '↓ 20', '0', '—']);
    expect([rankChangeTone(51), rankChangeTone(-20), rankChangeTone(0), rankChangeTone(null)]).toEqual(['progress', 'decline', 'neutral', 'neutral']);
  });
});

describe('header and field matching', () => {
  it('automatically maps standalone grade rank and subject names at high confidence', () => {
    const rank = matchField('级次', 0, DEFAULT_SUBJECTS, DEFAULT_ALIASES);
    expect(rank.target).toEqual({ type: 'total', metric: 'gradeRank' });
    expect(rank.confidence).toBeGreaterThanOrEqual(.85);
    for (const name of ['语文', '数学', '英语', '物理', '政治', '外语']) {
      const field = matchField(name, 1, DEFAULT_SUBJECTS, DEFAULT_ALIASES);
      expect(field.target).toEqual({ type: 'subject', subjectId: detectSubject(name, DEFAULT_SUBJECTS)?.subjectId, metric: 'score' });
      expect(field.confidence).toBeGreaterThanOrEqual(.85);
    }
    expect(matchField('班次', 2, DEFAULT_SUBJECTS, DEFAULT_ALIASES).target).toEqual({ type: 'ignore' });
  });
  it('detects a header after title rows', () => {
    const table = [['2026期中考试'], ['初三15班'], [], ['学号', '姓名', '总分', '总排名', '语文成绩']];
    expect(detectHeaderRows(table, DEFAULT_SUBJECTS, DEFAULT_ALIASES).headerStartRow).toBe(3);
  });
  it('flattens merged two-level headers', () => {
    const table = [['学号', '姓名', '语文', null, null], [null, null, '成绩', '等级', '级次']];
    expect(flattenMultiLevelHeaders(table, 0, 2).slice(2)).toEqual(['语文 / 成绩', '语文 / 等级', '语文 / 级次']);
  });
  it('recognizes English and morality aliases', () => {
    expect(detectSubject('外语级次', DEFAULT_SUBJECTS)?.subjectId).toBe('english');
    expect((matchField('政治等级', 0, DEFAULT_SUBJECTS, DEFAULT_ALIASES).target as { subjectId: string }).subjectId).toBe('morality');
  });
  it('recognizes school rank in standalone, total, and subject headers', () => {
    const targets = ['校次', '总分 / 校次', '外语 / 校次', '语文校次进退步'].map((header, index) =>
      matchField(header, index, DEFAULT_SUBJECTS, DEFAULT_ALIASES).target);
    expect(targets).toEqual([
      { type: 'total', metric: 'gradeRank' },
      { type: 'total', metric: 'gradeRank' },
      { type: 'subject', subjectId: 'english', metric: 'gradeRank' },
      { type: 'subject', subjectId: 'chinese', metric: 'sourceRankChange' },
    ]);
  });
  it('recognizes total and subject rank-change variants', () => {
    const headers = ['总分级次进退步', '总级次进退步', '总排名进退步', '级次进退步', '语文排名进退步', '外语级次进退步', '物理级次进退步'];
    expect(headers.map((header, index) => matchField(header, index, DEFAULT_SUBJECTS, DEFAULT_ALIASES).target)).toEqual([
      { type: 'total', metric: 'sourceRankChange' },
      { type: 'total', metric: 'sourceRankChange' },
      { type: 'total', metric: 'sourceRankChange' },
      { type: 'total', metric: 'sourceRankChange' },
      { type: 'subject', subjectId: 'chinese', metric: 'sourceRankChange' },
      { type: 'subject', subjectId: 'english', metric: 'sourceRankChange' },
      { type: 'subject', subjectId: 'physics', metric: 'sourceRankChange' },
    ]);
  });
});

describe('rank difference', () => {
  it('classifies advantage and weakness at the threshold', () => {
    expect(calculateRankDifference(350, 200)).toBe(150);
    expect(classifyRankDifference(150, 100)).toBe('weakness');
    expect(classifyRankDifference(-120, 100)).toBe('advantage');
    expect(classifyRankDifference(null, 100)).toBe('unavailable');
  });
});

describe('project migration', () => {
  it('accepts schema version 1 and rejects unknown versions', () => {
    const project = createProject('初三15班');
    expect(migrateProject(project).projectName).toBe('初三15班');
    expect(() => migrateProject({ ...project, schemaVersion: 2 })).toThrow();
  });
  it('preserves rank-change metrics through project export and restore', () => {
    const project = createProject('初三15班');
    project.exams = [{ examId: 'exam', name: '一模', order: 0, source: {}, createdAt: 'now', updatedAt: 'now', capabilities: { canViewScores: true, canAnalyzeRankDifference: true, canRenderRadar: true, canAnalyzeTotalRankTrend: true }, students: { '001': { studentId: '001', total: { sourceRankChange: 500 }, subjects: { chinese: { sourceRankChange: -20 } } } } }];
    const restored = parseProjectFileText(serializeProject(project));
    expect(restored.exams[0].students['001'].total?.sourceRankChange).toBe(500);
    expect(restored.exams[0].students['001'].subjects.chinese?.sourceRankChange).toBe(-20);
  });
  it('backfills rank-change aliases when an older version-1 project omitted them', () => {
    const project = createProject('旧项目');
    const legacy = { ...project, aliases: { ...project.aliases, metrics: { score: project.aliases.metrics.score, grade: project.aliases.metrics.grade, gradeRank: project.aliases.metrics.gradeRank } } };
    const restored = migrateProject(legacy);
    expect(restored.schemaVersion).toBe(1);
    expect(restored.aliases.metrics.sourceRankChange).toContain('级次进退步');
  });
  it('adds the school-rank alias to existing classes with custom aliases', () => {
    const legacy = createProject('旧班级');
    legacy.aliases.metrics.gradeRank = ['级次', '学校自定义叫法'];
    expect(migrateProject(legacy).aliases.metrics.gradeRank).toEqual(expect.arrayContaining(['校次', '学校自定义叫法']));
  });
});
