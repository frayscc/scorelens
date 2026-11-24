import { useEffect, useRef, useState } from 'react';
import { BookOpenCheck, FolderOpen, Plus, Trash2, Upload } from 'lucide-react';
import { deleteProject, listClasses, type ClassSummary } from '../storage/indexedDb';

interface Props {
  loadError: string;
  onCreate(name: string): Promise<void>;
  onOpen(projectId: string): Promise<void>;
  onImport(file: File): Promise<void>;
}

export function ClassManager({ loadError, onCreate, onOpen, onImport }: Props) {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listClasses().then(setClasses).catch(() => setError('无法读取班级列表。'));
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '操作失败，请重试。'); }
    finally { setBusy(false); }
  }

  function remove(item: ClassSummary) {
    if (!window.confirm(`确定删除「${item.projectName}」吗？\n\n该班级的学生和考试记录将被永久删除。没有 .scorelens 备份时将无法恢复。`)) return;
    void run(async () => {
      await deleteProject(item.projectId);
      setClasses((current) => current?.filter((entry) => entry.projectId !== item.projectId) ?? []);
    });
  }

  return <main className="class-manager">
    <header className="class-heading">
      <div className="brand-mark"><BookOpenCheck/></div>
      <div><span className="eyebrow">SCORELENS · 成绩洞察</span><h1>班级管理</h1></div>
    </header>
    <div className="class-layout">
      <section className="panel class-list">
        <div className="section-title"><div><h2>班级列表</h2><p>选择一个班级继续记录考试成绩。</p></div></div>
        {classes === null && !error && <p className="class-empty" role="status">正在读取班级…</p>}
        {classes?.length === 0 && <p className="class-empty">暂无班级。可以新建班级或导入备份。</p>}
        {classes?.map((item) => <article className="class-row" key={item.projectId}>
          <div className="class-info">
            <strong>{item.projectName}</strong>
            <small>{item.studentCount} 名学生 · {item.examCount} 场考试 · 更新于 {new Date(item.updatedAt).toLocaleDateString('zh-CN')}</small>
          </div>
          <div className="class-actions">
            <button className="button secondary" disabled={busy} onClick={() => run(() => onOpen(item.projectId))}><FolderOpen size={16}/>进入</button>
            <button className="button ghost class-delete" disabled={busy} aria-label={`删除 ${item.projectName}`} onClick={() => remove(item)}><Trash2 size={16}/>删除</button>
          </div>
        </article>)}
      </section>
      <section className="panel welcome-card class-create">
        <form onSubmit={(event) => { event.preventDefault(); void run(() => onCreate(name.trim())); }}>
          <h2>新建班级</h2>
          <label>班级名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：初三15班" required/></label>
          <button className="button primary wide" disabled={busy || !name.trim()}><Plus size={17}/>新建班级</button>
        </form>
        <div className="or"><span>或</span></div>
        <button className="button ghost wide" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={17}/>导入 .scorelens 备份</button>
        <input ref={fileRef} hidden type="file" accept=".scorelens" onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void run(() => onImport(file));
        }}/>
      </section>
    </div>
    {(error || loadError) && <div className="error-box" role="alert">{error || loadError}</div>}
  </main>;
}
