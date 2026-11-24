import { useEffect, useState } from 'react';
import { api } from '../storage/indexedDb';

interface ClassSummary { projectId: string; projectName: string; studentCount: number; examCount: number; updatedAt: string; }
interface Account { id: string; username: string; role: string; created: number | null; last_login: number | null; classes: ClassSummary[]; }
export function UserManager() {
  const [users, setUsers] = useState<Account[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState('');
  const refresh = async () => { setUsers(await api<Account[]>('/admin/users')); setReady(true); };
  useEffect(() => { refresh().catch(caught => setError(caught.message)); }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); await refresh(); }
    catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }
  const teachers = users.filter(user => user.role !== 'admin');
  return <main className="class-manager"><section className="panel setting-card">
    <h1>用户管理</h1>
    <p>{ready ? teachers.length : '…'} 位教师 · {users.reduce((sum, user) => sum + user.classes.length, 0)} 个班级</p>
    {error && <p className="error-box" role="alert">{error}</p>}
    {message && <p className="notice success" role="status">{message}</p>}
    {users.map(user => <section className="admin-user" key={user.id}>
      <div className="class-row"><div><strong>{user.username}</strong><p>{user.role === 'admin' ? '管理员' : '教师'} · {user.classes.length} 个班级</p>
        <p>注册于 {user.created ? new Date(user.created).toLocaleString() : '历史账号'} · 最近登录 {user.last_login ? new Date(user.last_login).toLocaleString() : '暂无记录'}</p></div>
        {user.role !== 'admin' && <div className="class-actions">
          <button className="button secondary" disabled={busy} onClick={() => setEditing(editing === user.id ? '' : user.id)}>重置密码</button>
          <button className="button ghost class-delete" disabled={busy} onClick={() => {
            if (window.confirm(`确定删除用户「${user.username}」及其全部 ${user.classes.length} 个班级、学生和考试记录吗？此操作无法恢复。`)) void run(async () => {
              await api('/admin/users/' + user.id, 'DELETE');
              setMessage('用户及其班级数据已删除。');
            });
          }}>删除用户</button>
        </div>}
      </div>
      {editing === user.id && <form className="admin-password" onSubmit={event => {
        event.preventDefault();
        const password = new FormData(event.currentTarget).get('password');
        if (!window.confirm(`确定重置「${user.username}」的密码吗？该用户需要重新登录。`)) return;
        void run(async () => {
          await api('/admin/users/' + user.id + '/password', 'POST', { password });
          setEditing(''); setMessage('密码已重置，该用户原有登录已失效。');
        });
      }}>
        <label>设置新密码<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password"/></label>
        <button className="button primary" disabled={busy}>确认重置</button>
        <button className="button ghost" type="button" onClick={() => setEditing('')}>取消</button>
      </form>}
      <div className="admin-classes">{user.classes.length ? user.classes.map(item => <div key={item.projectId}>
        <strong>{item.projectName}</strong><span>{item.studentCount} 名学生 · {item.examCount} 场考试 · 更新于 {new Date(item.updatedAt).toLocaleString()}</span>
      </div>) : <p>暂无班级</p>}</div>
    </section>)}
  </section></main>;
}
