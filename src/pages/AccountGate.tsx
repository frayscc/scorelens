import { useEffect, useState, type ReactNode } from 'react';
import { api, resetSession, serverMode } from '../storage/indexedDb';
import { UserManager } from './UserManager';

interface User { id: string; username: string; role: string; }
interface Invite { id: string; expires: number; used: number; revoked: number; created: number; }
export function AccountGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!serverMode);
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState<'invites' | 'users' | null>(null);
  useEffect(() => {
    if (serverMode) api<User>('/me').then(setUser).catch(() => {}).finally(() => setReady(true));
    const expired = () => { resetSession(); setUser(null); setAdmin(null); };
    window.addEventListener('scorelens-session-expired', expired);
    return () => window.removeEventListener('scorelens-session-expired', expired);
  }, []);
  if (!serverMode) return <>{children}</>;
  if (!ready) return <div className="boot">正在连接…</div>;
  if (!user) return <main className="class-manager"><section className="panel setting-card account-form">
    <h1>ScoreLens</h1><h2>{register ? '使用邀请码注册' : '教师登录'}</h2>
    <form onSubmit={async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      setBusy(true); setError('');
      try { resetSession(); setUser(await api<User>(register ? '/register' : '/login', 'POST', values)); }
      catch (caught) { setError((caught as Error).message); }
      finally { setBusy(false); }
    }}>
      <label>用户名<input name="username" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9_.-]+" autoComplete="username"/></label>
      <label>密码<input name="password" type="password" required minLength={10} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'}/></label>
      {register && <label>邀请码<input name="invite" required autoComplete="off"/></label>}
      {error && <p role="alert" className="error-box">{error}</p>}
      <button className="button primary wide" disabled={busy}>{busy ? '正在提交…' : register ? '注册' : '登录'}</button>
    </form>
    <button className="button ghost" onClick={() => { setRegister(!register); setError(''); }}>{register ? '已有账号，去登录' : '使用邀请码注册'}</button>
  </section></main>;
  return <><div className="account-bar"><span>{user.username}</span>
    {user.role === 'admin' && <>
      <button className="button secondary" onClick={() => setAdmin('invites')}>邀请码管理</button>
      <button className="button secondary" onClick={() => setAdmin('users')}>用户管理</button>
      {admin && <button className="button ghost" onClick={() => setAdmin(null)}>返回班级</button>}
    </>}
    <button className="button ghost" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await api('/logout', 'POST', {}); resetSession(); setUser(null); setAdmin(null); }
      catch (caught) { setError((caught as Error).message); }
      finally { setBusy(false); }
    }}>退出登录</button>{error && <span role="alert">{error}</span>}</div>
    {admin === 'invites' ? <InviteManager/> : admin === 'users' ? <UserManager/> : <div key={user.id}>{children}</div>}
  </>;
}
function InviteManager() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [hours, setHours] = useState(72);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => setInvites(await api<Invite[]>('/admin/invites'));
  useEffect(() => { refresh().catch(caught => setError(caught.message)); }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); await refresh(); } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
  }
  return <main className="class-manager"><section className="panel setting-card">
    <h1>邀请码管理</h1>
    <label>有效期（小时）<input type="number" min={1} max={8760} value={hours} onChange={event => setHours(Number(event.target.value))}/></label>
    <button disabled={busy} className="button primary" onClick={() => run(async () => {
      const result = await api<{ code: string }>('/admin/invites', 'POST', { hours }); setCode(result.code);
    })}>生成一次性邀请码</button>
    {code && <label>请复制并发送给老师，此代码仅显示本次<input readOnly value={code} onFocus={event => event.target.select()}/></label>}
    {error && <p className="error-box" role="alert">{error}</p>}
    <p>重新激活后，原邀请码恢复一次注册机会，有效期按上方小时数重新计算。请保留已发送的原代码。</p>
    {invites.map(item => <div className="class-row invite-row" key={item.id}>
      <div className="invite-info"><strong>邀请码 {item.id.slice(0, 8)}</strong><span>创建于 {new Date(item.created).toLocaleString()}</span>
      <span>到期 {new Date(item.expires).toLocaleString()} · {item.revoked ? '已撤销' : item.used ? '已使用' : item.expires <= Date.now() ? '已过期' : '可使用'}</span></div>
      <div className="invite-actions">
        <button className="button ghost" disabled={busy || !!item.revoked || !!item.used} onClick={() => run(async () => { await api('/admin/invites/' + item.id, 'DELETE'); })}>撤销</button>
        <button className="button secondary" disabled={busy} onClick={() => {
          if (window.confirm('确定重新激活此邀请码吗？原代码将恢复一次注册机会。')) void run(async () => { await api('/admin/invites/' + item.id + '/reactivate', 'POST', { hours }); });
        }}>重新激活</button>
        <button className="button ghost class-delete" disabled={busy} onClick={() => {
          if (window.confirm('确定永久删除此邀请码吗？已注册的用户保留。')) void run(async () => { await api('/admin/invites/' + item.id + '/permanent', 'DELETE'); });
        }}>删除</button>
      </div>
    </div>)}
  </section></main>;
}
