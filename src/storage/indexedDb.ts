import type { ScoreLensProject } from '../models/project';
import { migrateProject } from '../models/factory';
import * as local from './localDb';
export type { ClassSummary } from './localDb';

export const serverMode = location.protocol !== 'file:';
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-ScoreLens-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (response.status === 401 && path !== '/login' && path !== '/register') window.dispatchEvent(new Event('scorelens-session-expired'));
  if (!response.ok) throw new Error(data.error ?? '服务器请求失败。');
  return data;
}
type Stored = { project: ScoreLensProject; revision: number };
const revisions = new Map<string, number>();
let currentId: string | null = null;
let pendingSave: Promise<unknown> = Promise.resolve();
export function resetSession() { currentId = null; revisions.clear(); }
export async function saveProject(project: ScoreLensProject, activate: boolean) {
  if (!serverMode) return local.saveProject(project, activate);
  const operation = pendingSave.then(() => saveRemoteProject(project, activate));
  pendingSave = operation.catch(() => {});
  return operation;
}
async function saveRemoteProject(project: ScoreLensProject, activate: boolean) {
  if (!activate && currentId !== project.projectId) throw new Error('请重新进入班级后保存。');
  const result = await api<Stored>('/projects/' + encodeURIComponent(project.projectId), 'PUT', { project, revision: revisions.get(project.projectId) ?? null });
  revisions.set(project.projectId, result.revision);
  if (activate) currentId = project.projectId;
  return migrateProject(result.project);
}
export async function loadCurrentProject() {
  return serverMode ? null : local.loadCurrentProject();
}
export async function listClasses(): Promise<local.ClassSummary[]> {
  return serverMode ? api('/projects') : local.listClasses();
}
export async function hasProject(id: string) {
  if (!serverMode) return local.hasProject(id);
  const exists = (await listClasses()).some(p => p.projectId === id);
  if (exists) {
    const stored = await api<Stored>('/projects/' + encodeURIComponent(id));
    revisions.set(id, stored.revision);
  }
  return exists;
}
export async function openProject(id: string) {
  if (!serverMode) return local.openProject(id);
  const result = await api<Stored>('/projects/' + encodeURIComponent(id));
  currentId = id;
  revisions.set(id, result.revision);
  return migrateProject(result.project);
}
export async function leaveProject(id: string) {
  if (!serverMode) return local.leaveProject(id);
  await pendingSave;
  if (currentId === id) currentId = null;
}
export async function deleteProject(id: string) {
  if (!serverMode) return local.deleteProject(id);
  await api('/projects/' + encodeURIComponent(id), 'DELETE');
  revisions.delete(id);
  if (currentId === id) currentId = null;
}
