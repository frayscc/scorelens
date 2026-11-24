import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, GripVertical, Pencil, Trash2, X } from 'lucide-react';
import type { ScoreLensProject } from '../models/project';
import { orderedExams, renameExam, reorderExams } from '../analytics/trend';

export function ExamList({ project, onChange }: { project: ScoreLensProject; onChange(project: ScoreLensProject): void }) {
  const [draggedId, setDraggedId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const exams = orderedExams(project.exams);

  function saveName(examId: string) {
    const name = nameDraft.trim();
    if (name) onChange({ ...project, exams: renameExam(project.exams, examId, name) });
    setEditingId(''); setNameDraft('');
  }

  function move(examId: string, offset: -1 | 1) {
    const index = exams.findIndex((exam) => exam.examId === examId);
    const target = exams[index + offset];
    if (target) onChange({ ...project, exams: reorderExams(project.exams, examId, target.examId) });
  }

  return <div className="exam-list">{exams.map((exam, index) => <article
    className={draggedId === exam.examId ? 'dragging' : ''}
    draggable={editingId !== exam.examId}
    onDragStart={(event) => { setDraggedId(exam.examId); event.dataTransfer.effectAllowed = 'move'; }}
    onDragEnd={() => setDraggedId('')}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
    onDrop={(event) => { event.preventDefault(); if (draggedId) onChange({ ...project, exams: reorderExams(project.exams, draggedId, exam.examId) }); setDraggedId(''); }}
    key={exam.examId}>
    <span className="drag-handle" title="拖拽调整考试顺序"><GripVertical size={17}/><b>{String(index + 1).padStart(2, '0')}</b></span>
    <div className="exam-main">{editingId === exam.examId ? <div className="rename-exam"><input autoFocus value={nameDraft} onChange={(event)=>setNameDraft(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter')saveName(exam.examId);if(event.key==='Escape')setEditingId('');}}/><button onClick={()=>saveName(exam.examId)} aria-label="保存名称"><Check size={15}/></button><button onClick={()=>setEditingId('')} aria-label="取消"><X size={15}/></button></div> : <div className="exam-name"><strong>{exam.name}</strong><button onClick={()=>{setEditingId(exam.examId);setNameDraft(exam.name);}} aria-label={`修改 ${exam.name} 的名称`}><Pencil size={14}/></button></div>}<p>{Object.keys(exam.students).length} 名学生 · {exam.source.originalFileName}</p></div>
    <div className="capabilities"><span className={exam.capabilities.canViewScores ? 'on' : ''}>成绩</span><span className={exam.capabilities.canAnalyzeRankDifference ? 'on' : ''}>排名差</span><span className={exam.capabilities.canRenderRadar ? 'on' : ''}>雷达图</span><span className={exam.capabilities.canAnalyzeTotalRankTrend ? 'on' : ''}>趋势</span></div>
    <div className="exam-order-buttons"><button className="exam-delete" aria-label={`删除 ${exam.name}`} onClick={() => { if (window.confirm(`确定删除「${exam.name}」吗？该考试的成绩将被删除，班级学生名单保留。`)) onChange({ ...project, exams: exams.filter(item => item.examId !== exam.examId).map((item, order) => ({ ...item, order })) }); }}><Trash2 size={16}/>删除</button><button disabled={index===0} onClick={()=>move(exam.examId,-1)} aria-label="上移"><ArrowUp size={14}/></button><button disabled={index===exams.length-1} onClick={()=>move(exam.examId,1)} aria-label="下移"><ArrowDown size={14}/></button></div>
  </article>)}</div>;
}
