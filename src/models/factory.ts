import { DEFAULT_ALIASES, DEFAULT_RANK_THRESHOLD, DEFAULT_SUBJECTS, SCHEMA_VERSION } from '../constants';
import type { ScoreLensProject } from './project';

export function createProject(projectName: string): ScoreLensProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: crypto.randomUUID(),
    projectName: projectName.trim() || '未命名班级',
    createdAt: now,
    updatedAt: now,
    students: [],
    exams: [],
    subjects: structuredClone(DEFAULT_SUBJECTS),
    aliases: structuredClone(DEFAULT_ALIASES),
    settings: { rankDifferenceThreshold: DEFAULT_RANK_THRESHOLD },
  };
}

export function migrateProject(input: unknown): ScoreLensProject {
  if (!input || typeof input !== 'object') throw new Error('项目文件内容无效。');
  const project = input as Partial<ScoreLensProject>;
  if (project.schemaVersion !== 1) throw new Error(`暂不支持 schemaVersion ${String(project.schemaVersion)}。`);
  if (!project.projectId || !project.projectName || !Array.isArray(project.students) || !Array.isArray(project.exams)) {
    throw new Error('项目文件缺少必要字段。');
  }
  const aliases = project.aliases;
  return {
    ...(project as ScoreLensProject),
    aliases: {
      metrics: {
        ...structuredClone(DEFAULT_ALIASES.metrics),
        ...(aliases?.metrics ?? {}),
        gradeRank: [...new Set([...DEFAULT_ALIASES.metrics.gradeRank, ...(aliases?.metrics?.gradeRank ?? [])])],
      },
      nullTokens: aliases?.nullTokens ?? structuredClone(DEFAULT_ALIASES.nullTokens),
    },
  };
}
