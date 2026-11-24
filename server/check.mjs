import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './index.mjs';

test('accounts, invitations, isolation, conflicts and persistence', async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), 'scorelens-api-')), 'test.sqlite');
  let server = await createApp({ databasePath, adminUsername: 'admin', adminPassword: 'admin-test-password', secureCookie: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let base = 'http://127.0.0.1:' + server.address().port;
  async function request(path, method = 'GET', body, cookie = '', extra = {}) {
    const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-ScoreLens-Request': '1', Cookie: cookie, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    assert.equal((await request('/projects')).status, 401);
    const admin = await request('/login', 'POST', { username: 'admin', password: 'admin-test-password' });
    assert.equal(admin.status, 200);
    const invite = await request('/admin/invites', 'POST', { hours: 72 }, admin.cookie);
    assert.equal(invite.status, 201);
    const input = { username: 'teacher', password: 'teacher-password', invite: invite.data.code };
    const results = await Promise.all([request('/register', 'POST', input), request('/register', 'POST', { ...input, username: 'teacher2' })]);
    assert.equal(results.filter(item => item.status === 201).length, 1);
    const teacher = results.find(item => item.status === 201);
    assert.equal((await request('/admin/invites', 'GET', undefined, teacher.cookie)).status, 403);
    const revoked = await request('/admin/invites', 'POST', { hours: 1 }, admin.cookie);
    await request('/admin/invites/' + revoked.data.id, 'DELETE', undefined, admin.cookie);
    assert.equal((await request('/register', 'POST', { ...input, username: 'revoked', invite: revoked.data.code })).status, 400);
    const expired = await request('/admin/invites', 'POST', { hours: 1 }, admin.cookie);
    const db = new DatabaseSync(databasePath);
    db.prepare('UPDATE invites SET expires=0 WHERE id=?').run(expired.data.id); db.close();
    assert.equal((await request('/register', 'POST', { ...input, username: 'expired', invite: expired.data.code })).status, 400);
    const project = { schemaVersion: 1, projectId: 'class-1', projectName: '测试班级', students: [{ studentId: '001' }], exams: [{ examId: 'exam-1' }], subjects: [], aliases: {}, settings: {} };
    const saved = await request('/projects/class-1', 'PUT', { project, revision: null }, teacher.cookie);
    assert.equal(saved.status, 200);
    assert.equal((await request('/projects', 'GET', undefined, admin.cookie)).data.length, 0);
    assert.equal((await request('/projects/class-1', 'GET', undefined, admin.cookie)).status, 404);
    assert.equal((await request('/projects/class-1', 'PUT', { project, revision: 0 }, teacher.cookie)).status, 409);
    assert.equal((await request('/projects/class-1', 'PUT', { project, revision: 1 }, teacher.cookie, { Origin: 'https://evil.invalid' })).status, 403);
    const changed = await request('/projects/class-1', 'PUT', { project: { ...project, exams: [] }, revision: 1 }, teacher.cookie);
    assert.equal(changed.data.project.students.length, 1);
    await new Promise(resolve => server.close(resolve));
    server = await createApp({ databasePath, secureCookie: false });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
    assert.equal((await request('/projects/class-1', 'GET', undefined, teacher.cookie)).data.project.exams.length, 0);
    await request('/logout', 'POST', {}, teacher.cookie);
    assert.equal((await request('/projects', 'GET', undefined, teacher.cookie)).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
