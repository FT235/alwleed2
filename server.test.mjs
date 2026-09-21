import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
process.env.NODE_ENV = 'test';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split('=')));
process.env.ADMIN_EMAIL = env.ADMIN_EMAIL;
process.env.ADMIN_PASSWORD = env.ADMIN_PASSWORD;
process.env.JWT_SECRET = env.JWT_SECRET;
process.env.DATABASE_PATH = env.DATABASE_PATH;
const { app } = await import('./server.mjs');
const server = app.listen(0);
const base = await new Promise(resolve => server.once('listening', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const call = (route, options = {}) => fetch(base + route, options);

test('public application API stores a request and track API returns it', async () => {
  const created = await call('/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { name: 'اختبار آلي', email: 'test@example.com', program_id: '1' } }) });
  assert.equal(created.status, 201);
  const payload = await created.json();
  assert.match(payload.reference_number, /^ALW-/);
  const tracked = await call('/api/track/' + payload.reference_number);
  assert.equal(tracked.status, 200);
  assert.equal((await tracked.json()).status, 'قيد المراجعة');
});

test('admin login protects records and permits status update', async () => {
  const login = await call('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const rows = await call('/api/applications', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(rows.status, 200);
  const list = await rows.json();
  assert.ok(list.length > 0);
  const changed = await call('/api/applications/' + list[0].id, { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'مقبول' }) });
  assert.equal(changed.status, 200);
});

after(() => { server.closeAllConnections?.(); server.close(); setImmediate(() => process.exit(0)); });
