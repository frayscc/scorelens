import { useCallback, useEffect, useState } from 'react';
import type { ScoreLensProject } from '../models/project';
import { leaveProject, loadCurrentProject, openProject, saveProject } from '../storage/indexedDb';

export function useProject() {
  const [project, setProjectState] = useState<ScoreLensProject | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  useEffect(() => {
    loadCurrentProject().then(setProjectState)
      .catch(() => setLoadError('无法打开本地班级数据。'))
      .finally(() => setReady(true));
  }, []);
  const setProject = useCallback(async (next: ScoreLensProject, activate = false) => {
    const saved = await saveProject(next, activate);
    setProjectState(saved);
    setSavedAt(saved.updatedAt);
  }, []);
  async function selectProject(projectId: string) {
    setProjectState(await openProject(projectId));
    setSavedAt(null);
    setLoadError('');
  }
  async function exitProject(projectId: string) {
    await leaveProject(projectId);
    setProjectState(null);
    setSavedAt(null);
    setLoadError('');
  }
  return { project, setProject, selectProject, exitProject, ready, savedAt, loadError };
}
