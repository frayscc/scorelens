import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const derive = promisify(scrypt);
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + (await derive(password, salt, 64)).toString('hex');
}
async function verifyPassword(password, stored) {
  const [salt, digest] = stored.split(':');
  const actual = await derive(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(digest, 'hex'));
}
function credentials(body) {
  const username = String(body.username ?? '').trim().toLowerCase();
  const password = body.password;
  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) fail(400, '用户名需为 3–40 位字母、数字、下划线、点或短横线。');
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) fail(400, '密码需为 10–128 个字符。');
  return { username, password };
}
export async function createApp({ databasePath, adminUsername, adminPassword, secureCookie = true, origin, htmlPath } = {}) {
  databasePath ??= resolve('data/scorelens.sqlite');
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS projects(user_id TEXT NOT NULL REFERENCES users(id), id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(user_id,id));
  `);
  const userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name);
  if (!userColumns.includes('created')) db.exec('ALTER TABLE users ADD COLUMN created INTEGER');
  if (!userColumns.includes('last_login')) db.exec('ALTER TABLE users ADD COLUMN last_login INTEGER');
  if (!db.prepare("SELECT id FROM users WHERE role='admin'").get()) {
    const admin = credentials({ username: adminUsername, password: adminPassword });
    db.prepare('INSERT INTO users(id,username,password,role,created) VALUES(?,?,?,?,?)').run(randomUUID(), admin.username, await passwordHash(admin.password), 'admin', Date.now());
  }
  const html = htmlPath ? readFileSync(htmlPath) : Buffer.from('ScoreLens API');
  const attempts = new Map();
  function rateLimit(req) {
    const key = req.socket.remoteAddress;
    const now = Date.now();
    for (const [ip, item] of attempts) if (item.until < now) attempts.delete(ip);
    const item = attempts.get(key) ?? { count: 0, until: now + 60_000 };
    if (++item.count > 30) fail(429, '请求过于频繁，请一分钟后重试。');
    attempts.set(key, item);
  }
  function session(req) {
    const token = /(?:^|;\s*)scorelens_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
    if (!token) fail(401, '请登录。');
    const user = db.prepare('SELECT users.id,username,role FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(hash(token), Date.now());
    if (!user) fail(401, '登录已过期，请重新登录。');
    return user;
  }
  function issueSession(res, user) {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), user.id, Date.now() + 7 * 86400_000);
    res.setHeader('Set-Cookie', `scorelens_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secureCookie ? '; Secure' : ''}`);
    return { id: user.id, username: user.username, role: user.role };
  }
  async function body(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 30 * 1024 * 1024) fail(413, '班级数据超过 30 MB。');
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
    catch { fail(400, '请求格式无效。'); }
  }
  const server = createServer(async (req, res) => {
    const send = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const method = req.method;
      if (method === 'GET' && path === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html); }
      if (!path.startsWith('/api/')) fail(404, '页面不存在。');
      if (!['GET', 'HEAD'].includes(method)) {
        if (req.headers['x-scorelens-request'] !== '1') fail(403, '请求来源无效。');
        const expected = origin || `${secureCookie ? 'https' : 'http'}://${req.headers.host}`;
        if (req.headers.origin && req.headers.origin !== expected) fail(403, '请求来源无效。');
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) fail(415, '需要 JSON 请求。');
      }
      if (method === 'GET' && path === '/api/health') return send({ ok: true });
      if (method === 'POST' && ['/api/login', '/api/register'].includes(path)) {
        rateLimit(req);
        const input = await body(req);
        const { username, password } = credentials(input);
        if (path === '/api/login') {
          const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
          // Perform a password derivation for unknown accounts as well.
          const valid = await verifyPassword(password, user?.password ?? ('0'.repeat(32) + ':' + '0'.repeat(128)));
          if (!user || !valid) fail(401, '用户名或密码错误。');
          if (db.prepare('SELECT password FROM users WHERE id=?').get(user.id)?.password !== user.password) fail(401, '账号已变更，请重新登录。');
          db.prepare('UPDATE users SET last_login=? WHERE id=?').run(Date.now(), user.id);
          return send(issueSession(res, user));
        }
        const digest = await passwordHash(password);
        db.exec('BEGIN IMMEDIATE');
        let user;
        try {
          const invite = db.prepare('SELECT * FROM invites WHERE code=? AND expires>? AND revoked=0').get(hash(String(input.invite ?? '').trim()), Date.now());
          if (!invite) fail(400, '邀请码无效、已撤销或已过期。');
          if (db.prepare('SELECT id FROM users WHERE username=?').get(username)) fail(409, '用户名已被使用。');
          user = { id: randomUUID(), username, role: 'teacher' };
          db.prepare('INSERT INTO users(id,username,password,role,created,last_login) VALUES(?,?,?,?,?,?)').run(user.id, username, digest, user.role, Date.now(), Date.now());
          db.prepare('UPDATE invites SET used=used+1 WHERE id=?').run(invite.id);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return send(issueSession(res, user), 201);
      }
      const user = session(req);
      if (path.startsWith('/api/admin/') && user.role !== 'admin') fail(403, '需要管理员权限。');
      if (method === 'GET' && path === '/api/admin/users') {
        const projects = db.prepare('SELECT user_id,data FROM projects').all();
        return send(db.prepare('SELECT id,username,role,created,last_login FROM users ORDER BY username').all().map(account => ({
          ...account,
          classes: projects.filter(project => project.user_id === account.id).map(({ data }) => {
            const project = JSON.parse(data);
            return { projectId: project.projectId, projectName: project.projectName, studentCount: project.students.length, examCount: project.exams.length, updatedAt: project.updatedAt };
          }),
        })));
      }
      const accountPath = /^\/api\/admin\/users\/([^/]+)(\/password)?$/.exec(path);
      if (accountPath) {
        const accountId = decodeURIComponent(accountPath[1]);
        const account = db.prepare('SELECT id,username,role FROM users WHERE id=?').get(accountId);
        if (!account) fail(404, '用户不存在。');
        if (account.role === 'admin') fail(403, '此处仅管理教师账号。');
        if (method === 'POST' && accountPath[2]) {
          const input = await body(req);
          const { password } = credentials({ username: account.username, password: input.password });
          const digest = await passwordHash(password);
          db.exec('BEGIN IMMEDIATE');
          try {
            if (!db.prepare('UPDATE users SET password=? WHERE id=?').run(digest, account.id).changes) fail(404, '用户不存在。');
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          return send({ ok: true });
        }
        if (method === 'DELETE' && !accountPath[2]) {
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);
            db.prepare('DELETE FROM projects WHERE user_id=?').run(account.id);
            db.prepare('DELETE FROM users WHERE id=?').run(account.id);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
          return send({ ok: true });
        }
      }
      if (method === 'GET' && path === '/api/me') return send(user);
      if (method === 'POST' && path === '/api/logout') {
        const token = /scorelens_session=([a-f0-9]{64})/.exec(req.headers.cookie ?? '')?.[1];
        db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
        res.setHeader('Set-Cookie', `scorelens_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie ? '; Secure' : ''}`);
        return send({ ok: true });
      }
      if (path.startsWith('/api/admin/invites')) {
        if (user.role !== 'admin') fail(403, '需要管理员权限。');
        if (method === 'GET' && path === '/api/admin/invites') return send(db.prepare('SELECT id,expires,used,revoked,created FROM invites ORDER BY created DESC').all());
        if (method === 'POST' && path === '/api/admin/invites') {
          const { hours } = await body(req);
          if (!Number.isInteger(hours) || hours < 1 || hours > 8760) fail(400, '有效期需为 1–8760 小时。');
          const code = randomBytes(18).toString('base64url');
          const id = randomUUID(), expires = Date.now() + hours * 3600_000;
          db.prepare('INSERT INTO invites(id,code,expires,created) VALUES(?,?,?,?)').run(id, hash(code), expires, Date.now());
          return send({ id, code, expires }, 201);
        }
        const invitePath = /^\/api\/admin\/invites\/([^/]+)(\/(reactivate|permanent))?$/.exec(path);
        if (invitePath) {
          const id = decodeURIComponent(invitePath[1]);
          if (!db.prepare('SELECT id FROM invites WHERE id=?').get(id)) fail(404, '邀请码不存在。');
          if (method === 'POST' && invitePath[3] === 'reactivate') {
            const { hours } = await body(req);
            if (!Number.isInteger(hours) || hours < 1 || hours > 8760) fail(400, '有效期需为 1–8760 小时。');
            if (!db.prepare('UPDATE invites SET revoked=0,expires=? WHERE id=?').run(Date.now() + hours * 3600_000, id).changes) fail(404, '邀请码不存在。');
            return send({ ok: true });
          }
          if (method === 'DELETE' && invitePath[3] === 'permanent') {
            db.prepare('DELETE FROM invites WHERE id=?').run(id);
            return send({ ok: true });
          }
          if (method === 'DELETE' && !invitePath[3]) {
            db.prepare('UPDATE invites SET revoked=1 WHERE id=?').run(id);
            return send({ ok: true });
          }
        }
      }
      if (method === 'GET' && path === '/api/projects') {
        return send(db.prepare('SELECT data FROM projects WHERE user_id=? ORDER BY json_extract(data,\'$.updatedAt\') DESC').all(user.id).map(row => {
          const p = JSON.parse(row.data);
          return { projectId: p.projectId, projectName: p.projectName, updatedAt: p.updatedAt, studentCount: p.students.length, examCount: p.exams.length };
        }));
      }
      const projectPath = /^\/api\/projects\/([^/]+)$/.exec(path);
      if (projectPath) {
        const id = decodeURIComponent(projectPath[1]);
        const row = db.prepare('SELECT * FROM projects WHERE user_id=? AND id=?').get(user.id, id);
        if (method === 'GET') {
          if (!row) fail(404, '班级不存在。');
          return send({ project: JSON.parse(row.data), revision: row.revision });
        }
        if (method === 'PUT') {
          const { project, revision } = await body(req);
          if (!project || project.schemaVersion !== 1 || project.projectId !== id || typeof project.projectName !== 'string' || !Array.isArray(project.students) || !Array.isArray(project.exams) || !Array.isArray(project.subjects) || !project.settings || !project.aliases) fail(400, '班级数据格式无效。');
          // Re-read after the asynchronous body read, then compare and write synchronously.
          const current = db.prepare('SELECT revision FROM projects WHERE user_id=? AND id=?').get(user.id, id);
          if ((current?.revision ?? null) !== revision) fail(409, '班级已在其他页面更新，请重新进入班级后再编辑。');
          const saved = { ...project, updatedAt: new Date().toISOString() };
          const next = (current?.revision ?? 0) + 1;
          db.prepare('INSERT INTO projects VALUES(?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET revision=excluded.revision,data=excluded.data').run(user.id, id, next, JSON.stringify(saved));
          return send({ project: saved, revision: next });
        }
        if (method === 'DELETE') {
          db.prepare('DELETE FROM projects WHERE user_id=? AND id=?').run(user.id, id);
          return send({ ok: true });
        }
      }
      fail(404, '接口不存在。');
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.headersSent) send({ error: error.status ? error.message : '服务器处理失败。' }, error.status ?? 500);
      else res.end();
    }
  });
  server.on('close', () => db.close());
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createApp({
    adminUsername: process.env.ADMIN_USERNAME, adminPassword: process.env.ADMIN_PASSWORD,
    secureCookie: process.env.COOKIE_SECURE !== 'false', origin: process.env.PUBLIC_ORIGIN,
    databasePath: process.env.DATABASE_PATH, htmlPath: resolve('dist/ScoreLens.html'),
  });
  server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.log('ScoreLens server listening'));
}
