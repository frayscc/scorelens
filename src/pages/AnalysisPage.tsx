import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, FileText, Search } from 'lucide-react';
import type { ScoreLensProject } from '../models/project';
import { analysisColumns, analysisCounts, buildSubjectAnalysisRows, filterAndSortAnalysisRows, type AnalysisFilter, type AnalysisSortKey, type SortDirection } from '../analytics/subjectAnalysis';
import { exportSubjectAnalysisXlsx } from '../export/excelExport';
import { exportSubjectAnalysisPdf } from '../export/pdfExport';
import { formatRankChange, rankChangeTone } from '../format/rankChange';

interface Props { project: ScoreLensProject; onProjectChange(project: ScoreLensProject): void; }
type ExportState = 'idle' | 'xlsx' | 'pdf';

export function AnalysisPage({ project, onProjectChange }: Props) {
  const firstExam = project.exams.find((exam) => exam.capabilities.canAnalyzeRankDifference) ?? project.exams[0];
  const [examId, setExamId] = useState(firstExam?.examId ?? '');
  const [subjectId, setSubjectId] = useState(project.subjects[0]?.id ?? '');
  const [threshold, setThreshold] = useState(project.settings.rankDifferenceThreshold);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AnalysisFilter>('all');
  const [sortKey, setSortKey] = useState<AnalysisSortKey>('totalRank');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [exporting, setExporting] = useState<ExportState>('idle');
  const [exportError, setExportError] = useState('');
  const exam = project.exams.find((item) => item.examId === examId);
  const subject = project.subjects.find((item) => item.id === subjectId);
  const availableSubjects = useMemo(() => project.subjects.filter((item) => exam && Object.values(exam.students).some((student) => student.subjects[item.id])), [project.subjects, exam]);

  useEffect(() => {
    if (exam && !Object.values(exam.students).some((student) => student.subjects[subjectId])) {
      const available = availableSubjects[0];
      if (available) setSubjectId(available.id);
    }
  }, [exam, availableSubjects, subjectId]);

  const baseRows = useMemo(() => exam ? buildSubjectAnalysisRows(project, exam, subjectId, threshold) : [], [project, exam, subjectId, threshold]);
  const counts = useMemo(() => analysisCounts(baseRows), [baseRows]);
  const rows = useMemo(() => filterAndSortAnalysisRows(baseRows, filter, query, sortKey, direction), [baseRows, filter, query, sortKey, direction]);
  const pdfRows = useMemo(() => filterAndSortAnalysisRows(baseRows, 'all', '', 'totalRank', 'asc'), [baseRows]);
  const title = `${project.projectName} ${exam?.name ?? ''} ${subject?.name ?? ''}学科分析`.trim();
  const columns = analysisColumns(subject?.name ?? '学科');

  function changeSort(next: AnalysisSortKey) {
    if (sortKey === next) setDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSortKey(next); setDirection('asc'); }
  }

  async function runExport(type: Exclude<ExportState, 'idle'>) {
    if (!exam || !subject || exporting !== 'idle') return;
    setExportError(''); setExporting(type);
    try {
      if (type === 'xlsx') await exportSubjectAnalysisXlsx(title, exam.name, subject.name, rows);
      else await exportSubjectAnalysisPdf(title, exam.name, subject.name, threshold, pdfRows);
    } catch (error) { setExportError(error instanceof Error ? `导出失败：${error.message}` : '导出失败，请稍后重试。'); }
    finally { setExporting('idle'); }
  }

  return <>
    <header className="page-head"><div><span className="eyebrow">相对表现</span><h1>学科分析</h1></div><div className="export-actions"><button className="button secondary" disabled={!exam?.capabilities.canAnalyzeRankDifference || exporting !== 'idle'} onClick={() => runExport('xlsx')}><Download size={16}/>{exporting === 'xlsx' ? '正在生成…' : '导出 XLSX'}</button><button className="button primary" disabled={!exam?.capabilities.canAnalyzeRankDifference || exporting !== 'idle'} onClick={() => runExport('pdf')}><FileText size={16}/>{exporting === 'pdf' ? '正在生成 PDF…' : '导出班级 PDF'}</button></div></header>
    <section className="panel toolbar analysis-toolbar"><label>考试<select value={examId} onChange={(event) => setExamId(event.target.value)}>{project.exams.map((item) => <option value={item.examId} key={item.examId}>{item.name}</option>)}</select></label><label>学科<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>{availableSubjects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>排名差阈值<input type="number" min="1" value={threshold} onChange={(event) => { const value=Math.max(1,Number(event.target.value)||1); setThreshold(value); onProjectChange({...project,settings:{...project.settings,rankDifferenceThreshold:value}}); }}/></label><label className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="姓名 / 学号"/></label></section>
    {!exam ? <EmptyHint text="请先在考试管理中导入成绩表。"/> : !exam.capabilities.canAnalyzeRankDifference ? <EmptyHint text="当前考试缺少总排名或学科排名，排名差分析暂不可用。您仍可在考试管理中查看已导入数据。"/> : <>
      <div className="analysis-kpis"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><span>全部</span><strong>{baseRows.length}</strong></button><button className={`advantage ${filter === 'advantage' ? 'active' : ''}`} onClick={() => setFilter('advantage')}><span>相对优势</span><strong>{counts.advantage}</strong></button><button className={`weakness ${filter === 'weakness' ? 'active' : ''}`} onClick={() => setFilter('weakness')}><span>相对薄弱</span><strong>{counts.weakness}</strong></button><button className={filter === 'normal' ? 'active' : ''} onClick={() => setFilter('normal')}><span>正常</span><strong>{counts.normal}</strong></button></div>
      <section className="panel table-panel"><div className="section-title"><div><h2>{exam.name} · {subject?.name}</h2><p>D = 学科年级排名 − 总排名。D ≤ −{threshold} 为优势，D ≥ {threshold} 为薄弱。级次进退步由学校成绩表提供。</p></div><div className="legend"><span className="rank-progress">↑ 进步</span><span className="rank-decline">↓ 退步</span><span className="advantage">相对优势</span><span className="weakness">相对薄弱</span><span>{rows.length} 条结果</span></div></div><div className="table-wrap"><table><thead><tr>{columns.map(([field, label]) => <SortableHeader key={field} label={label} field={field} active={sortKey} direction={direction} onSort={changeSort}/>)}</tr></thead><tbody>{rows.map((item) => <tr key={item.student.studentId}><td className="student-id">{item.student.studentId}</td><td className="sticky-name">{item.student.name}</td><td>{show(item.total?.score)}</td><td>{show(item.total?.gradeRank)}</td><td className={`rank-change ${rankChangeTone(item.total?.sourceRankChange)}`}>{formatRankChange(item.total?.sourceRankChange)}</td><td>{show(item.total?.grade)}</td><td className={item.status}>{show(item.subject?.score)}</td><td className={item.status}>{show(item.subject?.grade)}</td><td className={item.status}>{show(item.subject?.gradeRank)}</td><td className={`rank-change ${rankChangeTone(item.subject?.sourceRankChange)}`}>{formatRankChange(item.subject?.sourceRankChange)}</td><td className={`${item.status} diff`}>{item.difference == null ? '—' : item.difference > 0 ? `+${item.difference}` : item.difference}</td></tr>)}</tbody></table>{rows.length === 0 && <div className="no-results">没有符合当前筛选条件的学生。</div>}</div></section>
    </>}
    {exportError && <div className="error-box export-error">{exportError}</div>}
  </>;
}

function SortableHeader({ label, field, active, direction, onSort }: { label: string; field: AnalysisSortKey; active: AnalysisSortKey; direction: SortDirection; onSort(field: AnalysisSortKey): void }) {
  const sort = active === field ? direction : undefined;
  const Icon = sort === 'asc' ? ArrowUp : sort === 'desc' ? ArrowDown : ChevronsUpDown;
  return <th scope="col" className="sortable-header" aria-sort={sort && (sort === 'asc' ? 'ascending' : 'descending')}>
    <button type="button" className={sort ? 'sort-active' : ''} onClick={() => onSort(field)}>
      {label}<Icon size={12} aria-hidden="true"/>
    </button>
  </th>;
}

function EmptyHint({ text }: { text: string }) { return <section className="panel compact-empty"><p>{text}</p></section>; }
function show(value: unknown) { return value == null || value === '' ? '—' : String(value); }
