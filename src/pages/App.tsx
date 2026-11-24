import { useRef, useState } from 'react';
import { BarChart3, BookOpenCheck, Download, FilePlus2, GraduationCap, LayoutDashboard, LogOut, Plus, RotateCcw, Settings, Trash2, Upload } from 'lucide-react';
import { ImportWizard } from '../components/ImportWizard';
import { createProject } from '../models/factory';
import type { ScoreLensProject } from '../models/project';
import { useProject } from '../state/useProject';
import { exportProjectFile, importProjectFile } from '../storage/projectFile';
import { DEFAULT_ALIASES, DEFAULT_SUBJECTS } from '../constants';
import type { MetricType } from '../models/project';
import { AnalysisPage } from './AnalysisPage';
import { StudentProfilePage } from './StudentProfilePage';
import { ExamList } from '../components/ExamList';
import { ClassManager } from './ClassManager';
import { hasProject } from '../storage/indexedDb';

type Page = 'exams' | 'analysis' | 'students' | 'settings';
const navigation = [
  { id: 'exams' as const, label: '考试管理', icon: LayoutDashboard },
  { id: 'analysis' as const, label: '学科分析', icon: BarChart3 },
  { id: 'students' as const, label: '学生画像', icon: GraduationCap },
  { id: 'settings' as const, label: '设置', icon: Settings },
];

export function App() {
  const { project, setProject, selectProject, exitProject, ready, savedAt, loadError } = useProject();
  if (!ready) return <div className="boot">正在打开班级数据…</div>;

  async function importBackup(file: File) {
    const restored = await importProjectFile(file);
    if (await hasProject(restored.projectId) && !window.confirm(`用备份覆盖班级「${restored.projectName}」吗？\n\n该班级当前的学生、考试和设置将被备份中的记录替换。`)) return;
    await setProject(restored, true);
  }

  if (!project) return <ClassManager loadError={loadError} onCreate={(name) => setProject(createProject(name), true)} onOpen={selectProject} onImport={importBackup}/>;

  return <ClassWorkspace key={project.projectId} project={project} savedAt={savedAt} onSave={setProject}
    onExit={() => exitProject(project.projectId)} onImport={importBackup}/>;
}

interface WorkspaceProps {
  project: ScoreLensProject;
  savedAt: string | null;
  onSave(project: ScoreLensProject): Promise<void>;
  onExit(): Promise<void>;
  onImport(file: File): Promise<void>;
}

function ClassWorkspace({ project, savedAt, onSave, onExit, onImport }: WorkspaceProps) {
  const [page, setPage] = useState<Page>('exams');
  const [wizard, setWizard] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const projectFileRef = useRef<HTMLInputElement>(null);

  async function run(action: () => Promise<void>) {
    setError('');
    try { await action(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '操作失败，请重试。'); }
  }

  function save(next: ScoreLensProject) { void run(() => onSave(next)); }

  return <div className="app-shell">
    <aside className="sidebar"><div className="logo"><div className="brand-mark small"><BookOpenCheck/></div><div><strong>ScoreLens</strong><span>成绩洞察</span></div></div><div className="project-chip"><small>当前项目</small><strong>{project.projectName}</strong><span>{project.students.filter((s) => s.status === 'active').length} 名在读学生 · {project.exams.length} 场考试</span></div><nav>{navigation.map(({ id, label, icon: Icon }) => <button className={page === id ? 'active' : ''} onClick={() => setPage(id)} key={id}><Icon size={19}/>{label}</button>)}</nav><div className="sidebar-foot"><button className="leave-class" disabled={leaving} onClick={async () => { setLeaving(true); await run(onExit); setLeaving(false); }}><LogOut size={16}/>退出班级</button><span className="save-dot"/> {savedAt ? '已自动保存' : '数据已就绪'}</div></aside>
    <main className="content">{error && <div className="error-box" role="alert">{error}</div>}{page === 'exams' && <ExamPage project={project} onChange={save} onImport={() => setWizard(true)}/>} {page === 'analysis' && <AnalysisPage project={project} onProjectChange={save}/>} {page === 'students' && <StudentProfilePage project={project}/>} {page === 'settings' && <SettingsPage project={project} onChange={save} onImportBackup={() => projectFileRef.current?.click()}/>}</main>
    <input ref={projectFileRef} hidden type="file" accept=".scorelens" onChange={(event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void run(() => onImport(file));
    }}/>
    {wizard && <ImportWizard project={project} onCancel={() => setWizard(false)} onComplete={async (next) => { await onSave(next); setWizard(false); }}/>}
  </div>;
}

function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) { return <header className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div><div>{children}</div></header>; }

function ExamPage({ project, onChange, onImport }: { project: ScoreLensProject; onChange(project: ScoreLensProject): void; onImport(): void }) {
  return <><PageHead eyebrow="数据中心" title="考试管理"><button className="button primary" onClick={onImport}><FilePlus2 size={17}/>导入成绩表</button></PageHead>{project.exams.length === 0 ? <section className="empty-state panel"><div className="empty-icon"><FilePlus2/></div><h2>导入第一场考试</h2><p>支持 .xlsx、.xls 和 .csv。系统会自动识别工作表、表头、学科与指标，您只需检查少量字段。</p><button className="button primary" onClick={onImport}>选择成绩文件</button></section> : <section className="panel"><div className="section-title"><div><h2>考试列表</h2><p>拖拽调整顺序；所有学生趋势图将立即同步。</p></div><span className="pill">{project.exams.length} 场</span></div><ExamList project={project} onChange={onChange}/></section>}</>;
}

function SettingsPage({ project, onChange, onImportBackup }: { project: ScoreLensProject; onChange(value: ScoreLensProject): void; onImportBackup(): void }) { return <><PageHead eyebrow="项目与数据" title="设置"/><section className="settings-grid"><div className="panel setting-card"><h2>项目设置</h2><label>项目名称<input value={project.projectName} onChange={(e) => onChange({...project, projectName:e.target.value})}/></label><label>默认排名差阈值<input type="number" min="1" value={project.settings.rankDifferenceThreshold} onChange={(e) => onChange({...project, settings:{...project.settings, rankDifferenceThreshold:Math.max(1,Number(e.target.value))}})}/></label></div><div className="panel setting-card"><h2>项目数据</h2><p>备份包含原始二维表、字段映射、标准化成绩和全部设置。</p><button className="button secondary" onClick={() => exportProjectFile(project)}><Download size={17}/>导出 .scorelens</button><button className="button ghost" onClick={onImportBackup}><Upload size={17}/>导入项目备份</button></div><AliasEditor project={project} onChange={onChange}/></section></>; }

const metricLabels: Record<MetricType, string> = { score: '成绩', grade: '等级', gradeRank: '年级排名', sourceRankChange: '级次进退步' };

function AliasEditor({ project, onChange }: { project: ScoreLensProject; onChange(value: ScoreLensProject): void }) {
  const [target, setTarget] = useState('metric:gradeRank');
  const [alias, setAlias] = useState('');
  const [subjectName, setSubjectName] = useState('');
  function addAlias() {
    const value = alias.trim(); if (!value) return;
    const [type, id] = target.split(':');
    if (type === 'metric') {
      const metric = id as MetricType; if (project.aliases.metrics[metric].includes(value)) return;
      onChange({...project, aliases:{...project.aliases, metrics:{...project.aliases.metrics,[metric]:[...project.aliases.metrics[metric],value]}}});
    } else {
      onChange({...project, subjects:project.subjects.map((subject)=>subject.id===id && !subject.aliases.includes(value)?{...subject,aliases:[...subject.aliases,value]}:subject)});
    }
    setAlias('');
  }
  function removeAlias(type: 'metric' | 'subject', id: string, value: string) {
    if (type === 'metric') {
      const metric=id as MetricType; if (DEFAULT_ALIASES.metrics[metric].includes(value)) return;
      onChange({...project,aliases:{...project.aliases,metrics:{...project.aliases.metrics,[metric]:project.aliases.metrics[metric].filter((item)=>item!==value)}}});
    } else {
      const defaults=DEFAULT_SUBJECTS.find((subject)=>subject.id===id)?.aliases ?? []; if(defaults.includes(value)) return;
      onChange({...project,subjects:project.subjects.map((subject)=>subject.id===id?{...subject,aliases:subject.aliases.filter((item)=>item!==value)}:subject)});
    }
  }
  function addSubject() {
    const name=subjectName.trim(); if(!name || project.subjects.some((subject)=>subject.name===name)) return;
    const id=`custom-${crypto.randomUUID()}`;
    onChange({...project,subjects:[...project.subjects,{id,name,builtIn:false,aliases:[name]}]}); setSubjectName('');
  }
  function restoreDefaults() {
    const custom=project.subjects.filter((subject)=>!subject.builtIn);
    onChange({...project,aliases:structuredClone(DEFAULT_ALIASES),subjects:[...structuredClone(DEFAULT_SUBJECTS),...custom]});
  }
  return <div className="panel setting-card wide-card"><div className="setting-title-row"><div><h2>字段识别与别名词典</h2><p>内置别名不可删除；您添加的学校自定义叫法可以随时移除。</p></div><button className="button ghost" onClick={restoreDefaults}><RotateCcw size={15}/>恢复默认词典</button></div><div className="alias-add"><select value={target} onChange={(e)=>setTarget(e.target.value)}>{(Object.keys(metricLabels) as MetricType[]).map((metric)=><option key={metric} value={`metric:${metric}`}>指标 / {metricLabels[metric]}</option>)}{project.subjects.map((subject)=><option key={subject.id} value={`subject:${subject.id}`}>学科 / {subject.name}</option>)}</select><input value={alias} onChange={(e)=>setAlias(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&addAlias()} placeholder="输入学校使用的字段叫法"/><button className="button secondary" onClick={addAlias}><Plus size={15}/>添加别名</button></div><div className="alias-groups">{(Object.keys(metricLabels) as MetricType[]).map((metric)=><AliasGroup key={metric} title={metricLabels[metric]} values={project.aliases.metrics[metric]} removable={(value)=>!DEFAULT_ALIASES.metrics[metric].includes(value)} onRemove={(value)=>removeAlias('metric',metric,value)}/>)}{project.subjects.map((subject)=><AliasGroup key={subject.id} title={subject.name} values={subject.aliases} removable={(value)=>!subject.builtIn || !(DEFAULT_SUBJECTS.find((item)=>item.id===subject.id)?.aliases ?? []).includes(value)} onRemove={(value)=>removeAlias('subject',subject.id,value)}/>)}</div><details className="advanced"><summary>高级：自定义学科</summary><div className="alias-add"><input value={subjectName} onChange={(e)=>setSubjectName(e.target.value)} placeholder="学科名称"/><button className="button secondary" onClick={addSubject}><Plus size={15}/>添加学科</button></div></details></div>;
}

function AliasGroup({title,values,removable,onRemove}:{title:string;values:string[];removable(value:string):boolean;onRemove(value:string):void}) { return <div className="alias-group"><strong>{title}</strong><div>{values.map((value)=><span key={value}>{value}{removable(value)&&<button aria-label={`删除 ${value}`} onClick={()=>onRemove(value)}><Trash2 size={11}/></button>}</span>)}</div></div>; }
