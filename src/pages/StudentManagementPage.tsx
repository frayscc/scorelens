import { useMemo, useState } from 'react';
import type { ScoreLensProject, Student } from '../models/project';
import { compareStudentIds } from '../analytics/studentOrder';

interface Props { project: ScoreLensProject; onSave(project: ScoreLensProject): Promise<void>; }

export function StudentManagementPage({ project, onSave }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const students = useMemo(() => [...project.students]
    .filter(student => (filter === 'all' || student.status === filter) && (student.name.includes(query.trim()) || student.studentId.includes(query.trim())))
    .sort((a, b) => compareStudentIds(a.studentId, b.studentId)), [project.students, query, filter]);

  async function save(students: Student[]) {
    setBusy(true); setError('');
    try { await onSave({ ...project, students }); return true; }
    catch (caught) { setError((caught as Error).message); return false; }
    finally { setBusy(false); }
  }

  function update(id: string, patch: Partial<Student>) {
    void save(project.students.map(student => student.studentId === id ? { ...student, ...patch } : student));
  }

  return <>
    <header className="page-head"><div><span className="eyebrow">班级名单</span><h1>学生管理</h1></div></header>
    <section className="panel setting-card student-add">
      <h2>添加学生</h2>
      <form onSubmit={async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const studentId = String(values.get('studentId') ?? '').trim();
        const name = String(values.get('name') ?? '').trim();
        if (!studentId || !name) { setError('请填写学号和姓名。'); return; }
        if (project.students.some(student => student.studentId === studentId)) { setError('该学号已存在，请在名单中修改状态。'); return; }
        const saved = await save([...project.students, { studentId, name, status: 'active', admissionType: values.get('admissionType') as Student['admissionType'], createdAt: new Date().toISOString() }]);
        if (saved) form.reset();
      }}>
        <label>学号<input name="studentId" required placeholder="保留完整学号"/></label>
        <label>姓名<input name="name" required/></label>
        <label>入班方式<select name="admissionType" defaultValue="transfer"><option value="regular">原班学生</option><option value="transfer">插班生</option></select></label>
        <button className="button primary" disabled={busy}>添加学生</button>
      </form>
      <p>新增学生从后续成绩表按学号关联。休学学生保留历史成绩，可随时恢复在读。</p>
    </section>
    {error && <div className="error-box" role="alert">{error}</div>}
    <section className="panel toolbar student-management-toolbar">
      <label>搜索姓名 / 学号<input value={query} onChange={event => setQuery(event.target.value)}/></label>
      <label>学籍状态<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部</option><option value="active">在读</option><option value="inactive">休学 / 停用</option></select></label>
      <span>{project.students.filter(student => student.status === 'active').length} 人在读 · {project.students.filter(student => student.status === 'inactive').length} 人休学 / 停用</span>
    </section>
    <section className="panel table-panel"><div className="table-wrap"><table>
      <thead><tr><th>学号</th><th>姓名</th><th>学籍状态</th><th>入班方式</th><th>历史考试记录</th></tr></thead>
      <tbody>{students.map(student => <tr key={student.studentId}>
        <td>{student.studentId}</td><td>{student.name}</td>
        <td><select className="student-management-select" aria-label={`${student.name}的学籍状态`} value={student.status} disabled={busy} onChange={event => {
          const status = event.target.value as Student['status'];
          if (status === 'inactive' && !window.confirm(`将「${student.name}」设为休学 / 停用吗？历史成绩保留，班级分析和批量画像将不再纳入该学生。`)) return;
          update(student.studentId, { status });
        }}><option value="active">在读</option><option value="inactive">休学 / 停用</option></select></td>
        <td><select className="student-management-select" aria-label={`${student.name}的入班方式`} value={student.admissionType ?? 'regular'} disabled={busy} onChange={event => update(student.studentId, { admissionType: event.target.value as Student['admissionType'] })}><option value="regular">原班学生</option><option value="transfer">插班生</option></select></td>
        <td>{project.exams.filter(exam => exam.students[student.studentId]).length} 场</td>
      </tr>)}</tbody>
    </table>{!students.length && <p className="no-results">暂无符合条件的学生。</p>}</div></section>
  </>;
}
