import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import type { Exam, Student } from '../models/project';

interface Props {
  students: Student[];
  exam?: Exam;
  currentId: string;
  onPreview(id: string): void;
  onChange(ids: string[]): void;
}
export function SelectedStudents({ students, exam, currentId, onPreview, onChange }: Props) {
  const [dragged, setDragged] = useState('');
  function move(id: string, target: string) {
    const ids = students.map(student => student.studentId);
    const from = ids.indexOf(id), to = ids.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onChange(ids);
  }
  return <section className="panel selected-students">
    <div className="section-title"><div><h2>已选学生 · 导出顺序</h2><p>拖拽或使用上下按钮排序，点击姓名预览。</p></div><span>{students.length} 人</span></div>
    {!students.length && <p className="no-results">从左侧勾选需要导出的学生。</p>}
    <ol>{students.map((student, index) => <li key={student.studentId} draggable
      onDragStart={event => { setDragged(student.studentId); event.dataTransfer.setData('text/plain', student.studentId); }}
      onDragEnd={() => setDragged('')}
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); move(dragged, student.studentId); setDragged(''); }}
      className={student.studentId === currentId ? 'previewing' : ''}>
      <GripVertical aria-hidden="true" size={16}/>
      <button className="selected-preview" onClick={() => onPreview(student.studentId)}><strong>{student.name}</strong><span>{student.studentId} · 总分 {exam?.students[student.studentId]?.total?.score ?? '—'} · 总排名 {exam?.students[student.studentId]?.total?.gradeRank ?? '—'}</span></button>
      <button aria-label={`上移 ${student.name}`} disabled={index === 0} onClick={() => move(student.studentId, students[index - 1].studentId)}><ArrowUp size={16}/></button>
      <button aria-label={`下移 ${student.name}`} disabled={index === students.length - 1} onClick={() => move(student.studentId, students[index + 1].studentId)}><ArrowDown size={16}/></button>
      <button aria-label={`移除 ${student.name}`} onClick={() => onChange(students.filter(item => item.studentId !== student.studentId).map(item => item.studentId))}><X size={16}/></button>
    </li>)}</ol>
  </section>;
}
