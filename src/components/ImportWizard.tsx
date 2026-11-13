import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileSpreadsheet, Upload, X } from 'lucide-react';
import type { Exam, FieldMapping, FieldTarget, MetricType, ScoreLensProject } from '../models/project';
import { detectHeaderRows, flattenMultiLevelHeaders, headerStructureSignature } from '../parser/headerDetector';
import { findMappingConflicts, matchField } from '../parser/fieldMatcher';
import { calculateCapabilities, normalizeRows, parseWorkbook, selectedSubjectNames, type ParsedSheet } from '../parser/workbookParser';
import { detectStudentChanges, mergeExamStudents } from '../parser/studentMerge';

interface SheetDraft extends ParsedSheet {
  selected: boolean;
  headerStartRow: number;
  headerDepth: 1 | 2 | 3;
  dataStartRow: number;
  mappings: FieldMapping[];
  examName: string;
}

interface Props { project: ScoreLensProject; onComplete(project: ScoreLensProject): Promise<void>; onCancel(): void; }

const steps = ['选择文件', '选择工作表', '确认表头', '字段映射', '学生变化', '数据校验', '导入摘要'];

function makeDraft(sheet: ParsedSheet, project: ScoreLensProject): SheetDraft {
  const header = detectHeaderRows(sheet.table, project.subjects, project.aliases);
  const headers = flattenMultiLevelHeaders(sheet.table, header.headerStartRow, header.headerDepth);
  return { ...sheet, selected: true, ...header, examName: sheet.suggestedExamName, mappings: headers.map((value, index) => matchField(value, index, project.subjects, project.aliases)) };
}

function encodeTarget(target: FieldTarget): string {
  if (target.type === 'studentId' || target.type === 'studentName' || target.type === 'ignore') return target.type;
  return `${target.type}:${target.type === 'subject' ? target.subjectId : 'total'}:${target.metric}`;
}

function decodeTarget(value: string): FieldTarget {
  if (value === 'studentId' || value === 'studentName' || value === 'ignore') return { type: value };
  const [type, id, metric] = value.split(':');
  return type === 'total' ? { type: 'total', metric: metric as MetricType }
    : { type: 'subject', subjectId: id, metric: metric as MetricType };
}

export function ImportWizard({ project, onComplete, onCancel }: Props) {
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [drafts, setDrafts] = useState<SheetDraft[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [acceptedNew, setAcceptedNew] = useState<Record<string, boolean>>({});
  const [inactiveMissing, setInactiveMissing] = useState<Record<string, boolean>>({});
  const [reuseMappings, setReuseMappings] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = drafts.filter((draft) => draft.selected);
  const current = selected[active] ?? selected[0];

  const normalized = useMemo(() => selected.map((draft) => {
    try { return { draft, ...normalizeRows(draft.table, draft.dataStartRow, draft.mappings, project.aliases), error: '' }; }
    catch (caught) { return { draft, students: {}, names: {}, diagnostics: { processedRows: 0, skippedRows: 0, emptyValues: 0, invalidValues: 0, duplicateStudentIds: [] }, error: caught instanceof Error ? caught.message : '数据校验失败。' }; }
  }), [selected, project.aliases]);
  const allIncoming = Object.assign({}, ...normalized.map((item) => item.students));
  const changes = detectStudentChanges(project.students, allIncoming);
  const sheetChanges = normalized.map((item) => ({ name: item.draft.examName, ...detectStudentChanges(project.students, item.students) }));
  const nameMap = Object.assign({}, ...normalized.map((item) => item.names));

  async function chooseFile(file?: File) {
    if (!file) return;
    setError('');
    try {
      const sheets = await parseWorkbook(file);
      if (!sheets.length) throw new Error('文件中没有可导入的可见工作表。');
      setFileName(file.name);
      setDrafts(sheets.map((sheet) => makeDraft(sheet, project)));
      setStep(1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '无法读取文件。'); }
  }

  function updateCurrent(patch: Partial<SheetDraft>) {
    const targetName = current.name;
    setDrafts((items) => items.map((item) => {
      if (item.name !== targetName) return item;
      const next = { ...item, ...patch };
      if ('headerStartRow' in patch || 'headerDepth' in patch) {
        next.dataStartRow = next.headerStartRow + next.headerDepth;
        next.mappings = flattenMultiLevelHeaders(next.table, next.headerStartRow, next.headerDepth)
          .map((value, index) => matchField(value, index, project.subjects, project.aliases));
      }
      return next;
    }));
  }

  function updateMappings(mappings: FieldMapping[]) {
    const currentHeaders = flattenMultiLevelHeaders(current.table, current.headerStartRow, current.headerDepth);
    const signature = headerStructureSignature(currentHeaders);
    setDrafts((items) => items.map((item) => {
      if (item.name === current.name) return { ...item, mappings };
      const itemHeaders = flattenMultiLevelHeaders(item.table, item.headerStartRow, item.headerDepth);
      if (!reuseMappings || headerStructureSignature(itemHeaders) !== signature) return item;
      return { ...item, mappings: mappings.map((mapping, index) => ({ ...mapping, sourceColumnIndex: index, sourceHeader: itemHeaders[index] ?? mapping.sourceHeader })) };
    }));
  }

  function validateNext(): boolean {
    setError('');
    if (step === 1 && selected.length === 0) { setError('请至少选择一个工作表。'); return false; }
    if (step === 3) {
      const invalid = selected.find((draft) => findMappingConflicts(draft.mappings).length || !draft.mappings.some((m) => m.target.type === 'studentId') || !draft.mappings.some((m) => m.target.type === 'studentName'));
      if (invalid) { setError(`“${invalid.name}”存在重复映射，或尚未映射学号与姓名。`); return false; }
      const unconfirmed = selected.find((draft) => draft.mappings.some((mapping) => mapping.target.type !== 'ignore' && mapping.confidence < .85));
      if (unconfirmed) { setError(`“${unconfirmed.name}”仍有低置信度字段需要确认。`); return false; }
    }
    if (step === 5 && normalized.some((item) => item.error || item.diagnostics.duplicateStudentIds.length)) {
      const invalid = normalized.find((item) => item.error || item.diagnostics.duplicateStudentIds.length);
      setError(invalid?.error || `“${invalid?.draft.examName}”存在重复学号：${invalid?.diagnostics.duplicateStudentIds.join('、')}`); return false;
    }
    return true;
  }

  async function finish() {
    setSaving(true);
    setError('');
    const now = new Date().toISOString();
    const exams: Exam[] = normalized.map((item, index) => ({
      examId: crypto.randomUUID(), name: item.draft.examName.trim() || item.draft.suggestedExamName, order: project.exams.length + index,
      source: { originalFileName: fileName, sheetName: item.draft.name, headerStartRow: item.draft.headerStartRow,
        headerDepth: item.draft.headerDepth, dataStartRow: item.draft.dataStartRow, rawTable: item.draft.table, fieldMapping: item.draft.mappings },
      students: item.students, capabilities: calculateCapabilities(item.students), createdAt: now, updatedAt: now,
    }));
    const acceptedIds = changes.added.filter((id) => acceptedNew[id] !== false);
    const mergedStudents = mergeExamStudents(project.students, nameMap, acceptedIds).map((student) =>
      inactiveMissing[student.studentId] ? { ...student, status: 'inactive' as const } : student);
    const accepted = new Set(mergedStudents.map((student) => student.studentId));
    const filteredExams = exams.map((exam) => ({ ...exam, students: Object.fromEntries(Object.entries(exam.students).filter(([id]) => accepted.has(id))) }));
    try { await onComplete({ ...project, students: mergedStudents, exams: [...project.exams, ...filteredExams] }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '无法保存导入数据，请重试。'); }
    finally { setSaving(false); }
  }

  return <div className="modal-backdrop"><section className="wizard panel">
    <header className="wizard-head"><div><span className="eyebrow">导入向导</span><h2>导入成绩数据</h2></div><button className="icon-button" disabled={saving} onClick={onCancel} aria-label="关闭"><X size={20}/></button></header>
    <div className="stepper">{steps.map((label, index) => <div className={`step ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`} key={label}><span>{index < step ? <Check size={13}/> : index + 1}</span><small>{label}</small></div>)}</div>
    <div className="wizard-body">
      {step === 0 && <div className="dropzone" onClick={() => fileRef.current?.click()}><Upload size={30}/><strong>选择 XLSX、XLS 或 CSV 成绩表</strong><p>文件只在本机浏览器中处理，不会上传。</p><input ref={fileRef} hidden type="file" accept=".xlsx,.csv,.xls" onChange={(event) => chooseFile(event.target.files?.[0])}/></div>}
      {step === 1 && <><h3>选择需要导入的工作表</h3><p className="muted">隐藏和空工作表已自动排除。</p><div className="sheet-list">{drafts.map((draft) => <label key={draft.name}><input type="checkbox" checked={draft.selected} onChange={(event) => setDrafts((items) => items.map((item) => item.name === draft.name ? { ...item, selected: event.target.checked } : item))}/><FileSpreadsheet size={18}/><span>{draft.name}</span><small>{draft.table.length} 行</small></label>)}</div></>}
      {step >= 2 && step <= 3 && current && <><div className="draft-tabs">{selected.map((draft, index) => <button className={index === active ? 'active' : ''} onClick={() => setActive(index)} key={draft.name}>{draft.name}</button>)}</div>
        {step === 2 ? <><div className="form-row"><label>考试名称<input value={current.examName} onChange={(e) => updateCurrent({ examName: e.target.value })}/></label><label>表头开始（第几行）<input type="number" min="1" value={current.headerStartRow + 1} onChange={(e) => updateCurrent({ headerStartRow: Math.max(0, Number(e.target.value) - 1) })}/></label><label>表头层数<select value={current.headerDepth} onChange={(e) => updateCurrent({ headerDepth: Number(e.target.value) as 1 | 2 | 3 })}><option>1</option><option>2</option><option>3</option></select></label><label>数据开始（第几行）<input type="number" min="1" value={current.dataStartRow + 1} onChange={(e) => updateCurrent({ dataStartRow: Math.max(0, Number(e.target.value) - 1) })}/></label></div><Preview draft={current}/></>
        : <><label className="reuse-check"><input type="checkbox" checked={reuseMappings} onChange={(e) => setReuseMappings(e.target.checked)}/> 将当前字段映射同步应用到结构相同的工作表</label><MappingEditor draft={current} project={project} onChange={updateMappings}/></>}</>}
      {step === 4 && <><h3>学生变化确认</h3><div className="stat-grid"><div><strong>{Object.keys(allIncoming).length}</strong><span>识别学生</span></div><div><strong>{changes.added.length}</strong><span>新增学生</span></div><div><strong>{sheetChanges.reduce((sum,item)=>sum+item.missing.length,0)}</strong><span>各考试缺失记录</span></div></div>{changes.added.length > 0 && <div className="change-list"><h4>检测到新增学生</h4>{changes.added.map((id) => <label key={id}><input type="checkbox" checked={acceptedNew[id] ?? true} onChange={(e) => setAcceptedNew({...acceptedNew,[id]:e.target.checked})}/><span>{id}　{nameMap[id]}</span><small>{(acceptedNew[id] ?? true) ? '加入项目' : '忽略'}</small></label>)}</div>}{project.students.length > 0 && sheetChanges.some((item)=>item.missing.length) && <div className="change-list"><h4>考试中缺少的项目学生</h4>{sheetChanges.flatMap((item)=>item.missing.map((id)=>({exam:item.name,id}))).map(({exam,id}) => { const student=project.students.find((item)=>item.studentId===id); return <label key={`${exam}:${id}`}><input type="checkbox" checked={inactiveMissing[id] ?? false} onChange={(e) => setInactiveMissing({...inactiveMissing,[id]:e.target.checked})}/><span>{exam} · {id}　{student?.name}</span><small>{inactiveMissing[id] ? '标记休学/停用' : '仅本次无数据'}</small></label>;})}</div>}</>}
      {step === 5 && <><h3>数据校验</h3><div className="summary-list">{normalized.map((item) => <div key={item.draft.name}><strong>{item.draft.examName}</strong><span>{item.diagnostics.processedRows} 名学生 · {item.diagnostics.emptyValues} 个空值 · {item.diagnostics.invalidValues} 个无效值</span><b className={item.error || item.diagnostics.duplicateStudentIds.length ? 'bad' : 'good'}>{item.error || (item.diagnostics.duplicateStudentIds.length ? `重复学号 ${item.diagnostics.duplicateStudentIds.join('、')}` : '校验通过')}</b></div>)}</div></>}
      {step === 6 && <><h3>准备完成导入</h3><div className="summary-list">{normalized.map((item) => <div key={item.draft.name}><strong>{item.draft.examName}</strong><span>{item.diagnostics.processedRows} 人 · {selectedSubjectNames(item.draft.mappings, project.subjects).join(' / ') || '未识别学科'} · {item.diagnostics.emptyValues} 个空值</span><b>{item.draft.mappings.filter((m) => m.target.type !== 'ignore').length} 有效 / {item.draft.mappings.filter((m) => m.target.type === 'ignore').length} 忽略</b></div>)}</div><p className="notice success">点击“完成导入”后，全部考试将一次性写入项目并自动保存。</p></>}
      {error && <div className="error-box">{error}</div>}
    </div>
    <footer className="wizard-actions"><button className="button ghost" disabled={saving} onClick={step === 0 ? onCancel : () => setStep((value) => value - 1)}><ArrowLeft size={16}/>{step === 0 ? '取消' : '上一步'}</button>{step < 6 ? <button className="button primary" disabled={step === 0} onClick={() => validateNext() && setStep((value) => value + 1)}>下一步<ArrowRight size={16}/></button> : <button className="button primary" disabled={saving} onClick={finish}><Check size={16}/>{saving ? '正在保存…' : '完成导入'}</button>}</footer>
  </section></div>;
}

function Preview({ draft }: { draft: SheetDraft }) {
  const start = Math.max(0, draft.headerStartRow - 1);
  return <div className="table-wrap preview"><table><tbody>{draft.table.slice(start, draft.dataStartRow + 4).map((row, ri) => <tr className={start + ri < draft.dataStartRow && start + ri >= draft.headerStartRow ? 'header-row' : ''} key={ri}>{row.slice(0, 12).map((cell, ci) => <td key={ci}>{String(cell ?? '—')}</td>)}</tr>)}</tbody></table></div>;
}

function MappingEditor({ draft, project, onChange }: { draft: SheetDraft; project: ScoreLensProject; onChange(value: FieldMapping[]): void }) {
  const conflicts = new Set(findMappingConflicts(draft.mappings).flat());
  const options = [
    ['ignore', '忽略'], ['studentId', '身份 / 学号'], ['studentName', '身份 / 姓名'],
    ...(['score', 'grade', 'gradeRank', 'sourceRankChange'] as const).map((metric) => [`total:total:${metric}`, `总成绩 / ${{score:'成绩', grade:'等级', gradeRank:'年级排名', sourceRankChange:'级次进退步'}[metric]}`]),
    ...project.subjects.flatMap((subject) => (['score', 'grade', 'gradeRank', 'sourceRankChange'] as const).map((metric) => [`subject:${subject.id}:${metric}`, `${subject.name} / ${{score:'成绩', grade:'等级', gradeRank:'年级排名', sourceRankChange:'级次进退步'}[metric]}`])),
  ];
  function setTarget(index: number, target: FieldTarget) {
    onChange(draft.mappings.map((item, i) => i === index ? { ...item, target, confidence: 1 } : item));
  }

  return <div className="mapping-list">{draft.mappings.map((mapping, index) => {
    const ignored = mapping.target.type === 'ignore';
    const needsReview = !ignored && mapping.confidence < .85;
    const status = ignored ? (mapping.confidence === 1 ? '已忽略' : '未识别') : (needsReview ? '待确认' : '高置信度');
    return <div className={`${conflicts.has(mapping.sourceColumnIndex) ? 'conflict' : ''} ${needsReview ? 'needs-review' : ''}`} key={mapping.sourceColumnIndex}>
      <span className="source-field">{mapping.sourceHeader}</span>
      <span className={`confidence ${!ignored && !needsReview ? 'high' : 'low'}`}>{status}</span>
      <select aria-label={`${mapping.sourceHeader} 的字段映射`} value={encodeTarget(mapping.target)} onChange={(event) => setTarget(index, decodeTarget(event.target.value))}>
        {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <span className="mapping-actions">
        {needsReview && <button className="confirm-map" onClick={() => setTarget(index, mapping.target)}><Check size={13}/>确认</button>}
        <button className="ignore-map" disabled={ignored} aria-label={`忽略 ${mapping.sourceHeader}`} onClick={() => setTarget(index, { type: 'ignore' })}>忽略</button>
      </span>
    </div>;
  })}</div>;
}
