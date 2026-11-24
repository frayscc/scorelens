import { useEffect, useMemo, useState } from 'react';
import { FileText, Search, UserRound } from 'lucide-react';
import type { ScoreLensProject } from '../models/project';
import { compareStudentIds } from '../analytics/studentOrder';
import { buildRadarData, buildStudentSubjectRows } from '../analytics/studentProfile';
import { GradeRadar } from '../components/GradeRadar';
import { buildRankTrendSeries } from '../analytics/trend';
import { RankTrendChart } from '../components/RankTrendChart';
import { exportStudentProfilesPdf, profilePageCount, type ProfileDensity } from '../export/studentProfilePdf';
import { SelectedStudents } from '../components/SelectedStudents';

export function StudentProfilePage({ project }: { project: ScoreLensProject }) {
  const students = useMemo(() => [...project.students].sort((a, b) => compareStudentIds(a.studentId, b.studentId)), [project.students]);
  const activeStudents = useMemo(() => students.filter((student) => student.status === 'active'), [students]);
  const [studentId, setStudentId] = useState(activeStudents[0]?.studentId ?? students[0]?.studentId ?? '');
  const [examId, setExamId] = useState([...project.exams].sort((a,b)=>a.order-b.order).at(-1)?.examId ?? '');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('studentId');
  const [descending, setDescending] = useState(false);
  const [density, setDensity] = useState<ProfileDensity>(3);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [layoutError, setLayoutError] = useState('');
  const [trendMetrics, setTrendMetrics] = useState<string[]>(['total']);
  const [selectedStudents, setSelectedStudents] = useState<string[]>(activeStudents.slice(0,1).map((item)=>item.studentId));
  const [exportProgress, setExportProgress] = useState<{completed:number;total:number}|null>(null);
  const [exportError, setExportError] = useState('');
  const student = project.students.find((item) => item.studentId === studentId);
  const exam = project.exams.find((item) => item.examId === examId);
  const examData = exam?.students[studentId];
  const rows = useMemo(() => exam && student ? buildStudentSubjectRows(project, exam, student.studentId, project.settings.rankDifferenceThreshold) : [], [project, exam, student]);
  const radar = useMemo(() => buildRadarData(rows), [rows]);
  const matches = useMemo(() => students.filter((item) => !query.trim() || item.name.includes(query.trim()) || item.studentId.toLowerCase().includes(query.trim().toLowerCase())).sort((left, right) => {
    if (sort === 'studentId') return compareStudentIds(left.studentId, right.studentId) * (descending ? -1 : 1);
    if (sort === 'name') return left.name.localeCompare(right.name, 'zh-CN') * (descending ? -1 : 1);
    const a = exam?.students[left.studentId]?.total?.[sort === 'score' ? 'score' : 'gradeRank'];
    const b = exam?.students[right.studentId]?.total?.[sort === 'score' ? 'score' : 'gradeRank'];
    if (a == null && b == null) return compareStudentIds(left.studentId, right.studentId);
    if (a == null) return 1;
    if (b == null) return -1;
    return (a - b) * (descending ? -1 : 1);
  }), [students, query, sort, descending, exam]);
  const selected = useMemo(() => selectedStudents.flatMap(id => {
    const item = students.find(student => student.studentId === id);
    return item?.status === 'active' ? [item] : [];
  }), [students, selectedStudents]);
  const trendSubjects = useMemo(() => project.subjects.filter((subject) => project.exams.some((item) => Object.values(item.students).some(student => student.subjects[subject.id]?.gradeRank != null))), [project.subjects, project.exams]);
  const trendSeries = useMemo(() => buildRankTrendSeries(project, studentId, trendMetrics), [project, studentId, trendMetrics]);

  function toggleTrend(metric: string) {
    setTrendMetrics((current) => current.includes(metric) ? current.filter((item)=>item!==metric) : [...current,metric]);
  }

  function toggleStudent(id: string) {
    setSelectedStudents((current)=>current.includes(id)?current.filter((item)=>item!==id):[...current,id]);
  }

  async function exportProfiles() {
    if(!selectedStudents.length || !examId) return;
    setExportError(''); setExportProgress({completed:0,total:selectedStudents.length});
    try { await exportStudentProfilesPdf(project,selectedStudents,examId,trendMetrics,(completed,total)=>setExportProgress({completed,total}), density); }
    catch(error) { setExportError(error instanceof Error?`导出失败：${error.message}`:'学生画像 PDF 导出失败。'); }
    finally { setExportProgress(null); }
  }

  useEffect(() => {
    if (!studentId && activeStudents[0]) setStudentId(activeStudents[0].studentId);
  }, [activeStudents, studentId]);

  useEffect(() => {
    let cancelled = false;
    setPageCount(null); setLayoutError('');
    const timer = window.setTimeout(() => {
      profilePageCount(project, selectedStudents, examId, trendMetrics, density).then(count => { if (!cancelled) setPageCount(count); })
        .catch(error => { if (!cancelled) setLayoutError(error.message); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [project, selectedStudents, examId, trendMetrics, density]);

  return <><header className="page-head"><div><span className="eyebrow">个人视角</span><h1>学生画像</h1></div><div className="profile-head-actions"><label className="profile-exam">当前考试<select value={examId} onChange={(event)=>setExamId(event.target.value)}>{[...project.exams].sort((a,b)=>a.order-b.order).map((item)=><option key={item.examId} value={item.examId}>{item.name}</option>)}</select></label><label className="profile-exam">每页人数<select aria-label="每页人数" value={density} onChange={event => setDensity(Number(event.target.value) as ProfileDensity)}><option value={2}>2 人 · 宽松</option><option value={3}>3 人 · 标准</option><option value={4}>4 人 · 紧凑</option></select></label><button className="button primary" disabled={!selectedStudents.length||!examId||exportProgress!==null||!!layoutError} onClick={exportProfiles}><FileText size={16}/>{exportProgress?`生成 PDF ${exportProgress.completed}/${exportProgress.total}`:`导出画像 PDF（${selectedStudents.length}）`}</button></div></header>
    {project.students.length === 0 ? <section className="panel compact-empty"><p>导入考试后，学生会按学号自动建立档案。</p></section> : <div className="profile-layout"><aside className="panel student-browser"><label className="student-search"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜索姓名 / 学号"/></label><div className="student-sort"><label>学生排序<select aria-label="学生排序" value={sort} onChange={event => setSort(event.target.value)}><option value="studentId">学号</option><option value="name">姓名</option><option value="score">总分</option><option value="rank">总排名</option></select></label><button onClick={() => setDescending(!descending)}>{descending ? '降序 ↓' : '升序 ↑'}</button></div><div className="student-batch"><span>已选 {selectedStudents.length} 人</span><button onClick={()=>setSelectedStudents(current => [...new Set([...current, ...matches.filter(item => item.status === 'active').map(item => item.studentId)])])}>全选列表</button><button onClick={()=>setSelectedStudents([])}>清空</button></div><div className="student-results">{matches.map((item)=><div className={`student-result ${item.studentId===studentId?'active':''}`} key={item.studentId}><input type="checkbox" disabled={item.status==='inactive'} checked={selectedStudents.includes(item.studentId)} onChange={()=>toggleStudent(item.studentId)} aria-label={`选择 ${item.name}`}/><button onClick={()=>setStudentId(item.studentId)}><span className="avatar">{item.name.slice(-1)}</span><span><strong>{item.name}</strong><small>{item.studentId}</small></span>{item.status==='inactive'&&<em>休学</em>}</button></div>)}</div></aside><div className="profile-main"><div className="profile-pagination" role="status">{layoutError || (pageCount == null ? '正在计算分页…' : `已选 ${selected.length} 人 · 预计 ${pageCount} 页 · 每页最多 ${density} 人`)}<small>学科或趋势内容较多时自动减少每页人数。</small></div><SelectedStudents students={selected} exam={exam} currentId={studentId} onPreview={setStudentId} onChange={setSelectedStudents}/>
      <section className="panel student-hero"><div className="profile-identity"><div className="profile-avatar"><UserRound/></div><div><span className="eyebrow">STUDENT PROFILE</span><h2>{student?.name ?? '—'}</h2><p>学号 {student?.studentId ?? '—'} · {student?.status==='inactive'?'休学/停用':'在读'}</p></div></div><div className="profile-metrics"><Metric label="总分" value={examData?.total?.score}/><Metric label="总排名" value={examData?.total?.gradeRank} suffix={examData?.total?.gradeRank == null ? '' : '名'}/><Metric label="总等级" value={examData?.total?.grade}/></div></section>
      {!exam ? <section className="panel compact-empty"><p>暂无考试，请先在考试管理中导入成绩表。</p></section> : !examData ? <section className="panel compact-empty"><p>该学生在“{exam.name}”中没有考试数据。</p></section> : <div className="profile-panels"><section className="panel profile-table"><div className="section-title"><div><h2>学科表现</h2><p>排名差 = 学科排名 − 总排名</p></div><span className="pill">{rows.length} 门</span></div><div className="table-wrap"><table><thead><tr><th>学科</th><th>成绩</th><th>等级</th><th>年级排名</th><th>排名差</th></tr></thead><tbody>{rows.map((row)=><tr key={row.subject.id}><td><strong>{row.subject.name}</strong></td><td className={row.status}>{show(row.metrics.score)}</td><td className={row.status}>{show(row.metrics.grade)}</td><td className={row.status}>{show(row.metrics.gradeRank)}</td><td className={`${row.status} diff`}>{row.difference==null?'—':row.difference>0?`+${row.difference}`:row.difference}</td></tr>)}</tbody></table></div></section><section className="panel radar-panel"><div className="section-title"><div><h2>等级雷达图</h2><p>仅使用学校提供的等级</p></div><span className="pill">{radar.length} 门有效</span></div><GradeRadar data={radar}/></section></div>}
      <section className="panel trend-panel"><div className="section-title"><div><h2>排名趋势</h2><p>严格按照考试管理中的顺序展示</p></div><div className="trend-selectors"><label><input type="checkbox" checked={trendMetrics.includes('total')} onChange={()=>toggleTrend('total')}/>总排名</label>{trendSubjects.map((subject)=><label key={subject.id}><input type="checkbox" checked={trendMetrics.includes(subject.id)} onChange={()=>toggleTrend(subject.id)}/>{subject.name}</label>)}</div></div><RankTrendChart series={trendSeries}/></section>
    </div></div>}{exportError&&<div className="error-box export-error">{exportError}</div>}
  </>;
}

function Metric({label,value,suffix=''}:{label:string;value:unknown;suffix?:string}) { return <div><span>{label}</span><strong>{show(value)}{value==null?'':suffix}</strong></div>; }
function show(value: unknown) { return value == null || value === '' ? '—' : String(value); }
