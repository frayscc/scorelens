import { useEffect, useState, type ReactNode } from 'react';
import { api, resetSession, serverMode } from '../storage/indexedDb';

interface User { id: string; username: string; role: string; }
interface Invite { id: string; expires: number; used: number; revoked: number; }
export function AccountGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!serverMode);
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (serverMode) api<User>('/me').then(setUser).catch(() => {}).finally(() => setReady(true));
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
    {user.role === 'admin' && <button className="button secondary" onClick={() => setAdmin(!admin)}>{admin ? '返回班级' : '邀请码管理'}</button>}
    <button className="button ghost" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await api('/logout', 'POST', {}); resetSession(); setUser(null); setAdmin(false); }
      catch (caught) { setError((caught as Error).message); }
      finally { setBusy(false); }
    }}>退出登录</button>{error && <span role="alert">{error}</span>}</div>
    {admin ? <InviteManager/> : <div key={user.id}>{children}</div>}
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
    {invites.map(item => <div className="class-row" key={item.id}>
      <span>到期 {new Date(item.expires).toLocaleString()} · {item.revoked ? '已撤销' : item.used ? '已使用' : item.expires <= Date.now() ? '已过期' : '可使用'}</span>
      <button className="button ghost" disabled={busy || !!item.revoked || !!item.used} onClick={() => run(async () => { await api('/admin/invites/' + item.id, 'DELETE'); })}>撤销</button>
    </div>)}
  </section></main>;
}
