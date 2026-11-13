import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import type { ScoreLensProject } from '../models/project';
import { migrateProject } from '../models/factory';

export interface ClassSummary {
  projectId: string;
  projectName: string;
  updatedAt: string;
  studentCount: number;
  examCount: number;
}

interface ScoreLensDB extends DBSchema {
  projects: { key: string; value: ScoreLensProject; indexes: { 'by-updated': string } };
  meta: { key: string; value: string };
}

const dbPromise = openDB<ScoreLensDB>('scorelens-v1', 1, {
  upgrade(db) {
    const projects = db.createObjectStore('projects', { keyPath: 'projectId' });
    projects.createIndex('by-updated', 'updatedAt');
    db.createObjectStore('meta');
  },
});

export async function saveProject(project: ScoreLensProject, activate: boolean): Promise<ScoreLensProject> {
  const saved = { ...project, updatedAt: new Date().toISOString() };
  const db = await dbPromise;
  const tx = db.transaction(['projects', 'meta'], 'readwrite');
  const meta = tx.objectStore('meta');
  if (!activate && await meta.get('currentProjectId') !== project.projectId) {
    throw new Error('当前班级已切换，请重新进入班级后再保存。');
  }
  await tx.objectStore('projects').put(saved);
  if (activate) await meta.put(saved.projectId, 'currentProjectId');
  await tx.done;
  return saved;
}

export async function loadCurrentProject(): Promise<ScoreLensProject | null> {
  const db = await dbPromise;
  const tx = db.transaction(['projects', 'meta']);
  const id = await tx.objectStore('meta').get('currentProjectId');
  const project = id ? await tx.objectStore('projects').get(id) : undefined;
  return project ? migrateProject(project) : null;
}

export async function listClasses(): Promise<ClassSummary[]> {
  const db = await dbPromise;
  const classes: ClassSummary[] = [];
  let cursor = await db.transaction('projects').store.index('by-updated').openCursor(null, 'prev');
  while (cursor) {
    const { projectId, projectName, updatedAt, students, exams } = cursor.value;
    classes.push({ projectId, projectName, updatedAt, studentCount: students.length, examCount: exams.length });
    cursor = await cursor.continue();
  }
  return classes;
}

export async function hasProject(projectId: string): Promise<boolean> {
  const db = await dbPromise;
  return (await db.getKey('projects', projectId)) !== undefined;
}

export async function openProject(projectId: string): Promise<ScoreLensProject> {
  const db = await dbPromise;
  const tx = db.transaction(['projects', 'meta'], 'readwrite');
  const stored = await tx.objectStore('projects').get(projectId);
  if (!stored) throw new Error('该班级已删除，请刷新班级列表。');
  const project = migrateProject(stored);
  await tx.objectStore('meta').put(projectId, 'currentProjectId');
  await tx.done;
  return project;
}

export async function leaveProject(projectId: string): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction('meta', 'readwrite');
  if (await tx.store.get('currentProjectId') === projectId) await tx.store.delete('currentProjectId');
  await tx.done;
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction(['projects', 'meta'], 'readwrite');
  const meta = tx.objectStore('meta');
  await tx.objectStore('projects').delete(projectId);
  if (await meta.get('currentProjectId') === projectId) await meta.delete('currentProjectId');
  await tx.done;
}
