import type { AliasDictionary, SubjectDefinition } from './models/project';

export const SCHEMA_VERSION = 1 as const;
export const DEFAULT_RANK_THRESHOLD = 100;
export const GRADE_ORDER = ['C', 'C+', 'B', 'B+', 'A', 'A+'] as const;
export const DEFAULT_SUBJECTS: SubjectDefinition[] = [
  ['chinese', '语文', ['语文']], ['math', '数学', ['数学']],
  ['english', '英语', ['英语', '外语', '英文']], ['physics', '物理', ['物理']],
  ['chemistry', '化学', ['化学']], ['history', '历史', ['历史']],
  ['morality', '道法', ['道法', '道德与法治', '政治', '思想政治']],
  ['pe', '体育', ['体育']], ['biology', '生物', ['生物']],
  ['geography', '地理', ['地理']],
].map(([id, name, aliases]) => ({ id: id as string, name: name as string, builtIn: true, aliases: aliases as string[] }));

export const DEFAULT_ALIASES: AliasDictionary = {
  metrics: {
    score: ['成绩', '分数', '得分'],
    grade: ['等级', '等第'],
    gradeRank: ['排名', '名次', '级次', '年级排名', '年级名次', '级排', '校次'],
    sourceRankChange: ['级次进退步', '年级排名进退步', '排名变化', '进退步'],
  },
  nullTokens: ['', '-', '/', '缺考', '未考', '缺', '免考'],
};
