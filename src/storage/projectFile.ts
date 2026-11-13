import type { ScoreLensProject } from '../models/project';
import { migrateProject } from '../models/factory';

function safeFileName(value: string): string { return value.replace(/[\\/:*?"<>|]/g, '_'); }

export function exportProjectFile(project: ScoreLensProject): void {
  const blob = new Blob([serializeProject(project)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileName(project.projectName)}.scorelens`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importProjectFile(file: File): Promise<ScoreLensProject> {
  if (!file.name.toLowerCase().endsWith('.scorelens')) throw new Error('请选择 .scorelens 项目备份文件。');
  try { return parseProjectFileText(await file.text()); }
  catch (error) { throw new Error(error instanceof Error ? `无法导入项目：${error.message}` : '无法导入项目文件。'); }
}

export function serializeProject(project: ScoreLensProject): string {
  return JSON.stringify(project);
}

export function parseProjectFileText(text: string): ScoreLensProject {
  return migrateProject(JSON.parse(text));
}
