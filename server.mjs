import express from 'express';
import initSqlJs from 'sql.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
const configuredDatabasePath = process.env.DATABASE_PATH || '.data/alwaleed.sqlite';
const dbFile = path.isAbsolute(configuredDatabasePath) ? configuredDatabasePath : path.resolve(__dirname, configuredDatabasePath);
const localSeedFile = path.resolve(__dirname, '.data/alwaleed.sqlite');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
if (dbFile === '/data/alwaleed.sqlite' && !fs.existsSync(dbFile) && fs.existsSync(localSeedFile)) {
  fs.copyFileSync(localSeedFile, dbFile);
  console.log('Copied bundled SQLite database to /data.');
}
const SQL = await initSqlJs({ locateFile: file => path.join(__dirname, 'node_modules/sql.js/dist', file) });
const db = new SQL.Database(fs.existsSync(dbFile) ? fs.readFileSync(dbFile) : undefined);
const saveDb = () => fs.writeFileSync(dbFile, Buffer.from(db.export()));
const rows = (sql, params = []) => { const stmt = db.prepare(sql); stmt.bind(params); const output = []; while (stmt.step()) output.push(stmt.getAsObject()); stmt.free(); return output; };
const one = (sql, params = []) => rows(sql, params)[0] || null;
const run = (sql, params = []) => db.run(sql, params);
const now = () => new Date().toISOString();
run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS applications (id INTEGER PRIMARY KEY AUTOINCREMENT, reference_number TEXT UNIQUE NOT NULL, data_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'قيد المراجعة', archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS contact_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'جديد', archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'page', updated_at TEXT NOT NULL);`);
const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@alwaleedcharitablefoundation.com').trim().toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || 'ChangeMe!2026-LocalOnly');
const admin = one("SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1");
if (!admin) run('INSERT INTO users (email,password_hash,role,created_at) VALUES (?,?,?,?)', [adminEmail, bcrypt.hashSync(adminPassword, 12), 'admin', now()]);
else run('UPDATE users SET email=?, password_hash=?, role=? WHERE id=?', [adminEmail, bcrypt.hashSync(adminPassword, 12), 'admin', admin.id]);
if (!one('SELECT id FROM content LIMIT 1')) { run('INSERT INTO content (slug,title,body,type,updated_at) VALUES (?,?,?,?,?)', ['home', 'الصفحة الرئيسية', 'محتوى الصفحة الرئيسية قابل للإدارة من لوحة التحكم.', 'page', now()]); run('INSERT INTO content (slug,title,body,type,updated_at) VALUES (?,?,?,?,?)', ['announcement', 'إعلان الموقع', 'مرحباً بكم في مؤسسة الوليد للإنسانية.', 'announcement', now()]); }
saveDb();

const app = express();
app.use(express.json({ limit: '2mb' })); app.use(express.urlencoded({ extended: true }));
const secret = process.env.JWT_SECRET || 'local-development-secret-change-before-production';
const issue = user => jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn: '8h' });
const auth = (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), secret); next(); } catch { res.status(401).json({ error: 'غير مصرح' }); } };
const adminOnly = (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'صلاحيات المشرف مطلوبة' });
const ref = () => `ALW-${Date.now().toString(36).toUpperCase().slice(-8)}`;
app.post('/api/auth/login', (req, res) => { const email = String(req.body.email || '').trim().toLowerCase(); const user = one('SELECT * FROM users WHERE email=?', [email]); if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' }); res.json({ token: issue(user), user: { id: user.id, email: user.email, role: user.role } }); });
app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));
app.post('/api/applications', (req, res) => { const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : req.body; const reference = ref(); run('INSERT INTO applications (reference_number,data_json,status,created_at) VALUES (?,?,?,?)', [reference, JSON.stringify(data), 'قيد المراجعة', now()]); saveDb(); res.status(201).json({ reference_number: reference, status: 'قيد المراجعة' }); });
app.get('/api/applications', auth, adminOnly, (req, res) => { const query = `%${String(req.query.q || '').trim()}%`; res.json(rows('SELECT * FROM applications WHERE archived=0 AND (reference_number LIKE ? OR data_json LIKE ?) ORDER BY id DESC', [query, query]).map(row => ({ ...row, data: JSON.parse(row.data_json) }))); });
app.patch('/api/applications/:id', auth, adminOnly, (req, res) => { if (req.body.status && !['قيد المراجعة', 'مقبول', 'مرفوض'].includes(req.body.status)) return res.status(400).json({ error: 'حالة غير صالحة' }); run('UPDATE applications SET status=COALESCE(?,status),archived=COALESCE(?,archived) WHERE id=?', [req.body.status || null, req.body.archived == null ? null : (req.body.archived ? 1 : 0), req.params.id]); saveDb(); res.json({ ok: true }); });
app.delete('/api/applications/:id', auth, adminOnly, (req, res) => { run('DELETE FROM applications WHERE id=?', [req.params.id]); saveDb(); res.json({ ok: true }); });
app.post('/api/contact', (req, res) => { const { name = '', email = '', phone = '', message = '' } = req.body || {}; if (!String(message).trim()) return res.status(400).json({ error: 'الرسالة مطلوبة' }); run('INSERT INTO contact_messages (name,email,phone,message,created_at) VALUES (?,?,?,?,?)', [name, email, phone, message, now()]); saveDb(); res.status(201).json({ status: 'جديد' }); });
app.get('/api/contact', auth, adminOnly, (req, res) => res.json(rows('SELECT * FROM contact_messages WHERE archived=0 ORDER BY id DESC')));
app.patch('/api/contact/:id', auth, adminOnly, (req, res) => { run('UPDATE contact_messages SET status=COALESCE(?,status),archived=COALESCE(?,archived) WHERE id=?', [req.body.status || null, req.body.archived == null ? null : (req.body.archived ? 1 : 0), req.params.id]); saveDb(); res.json({ ok: true }); });
app.delete('/api/contact/:id', auth, adminOnly, (req, res) => { run('DELETE FROM contact_messages WHERE id=?', [req.params.id]); saveDb(); res.json({ ok: true }); });
app.get('/api/users', auth, adminOnly, (req, res) => res.json(rows('SELECT id,email,role,created_at FROM users ORDER BY id')));
app.post('/api/users', auth, adminOnly, (req, res) => { const email = String(req.body.email || '').trim().toLowerCase(); const password = String(req.body.password || ''); if (!email || password.length < 8) return res.status(400).json({ error: 'البريد وكلمة المرور (8 أحرف على الأقل) مطلوبان' }); try { run('INSERT INTO users (email,password_hash,role,created_at) VALUES (?,?,?,?)', [email, bcrypt.hashSync(password, 12), 'admin', now()]); saveDb(); res.status(201).json({ ok: true }); } catch { res.status(409).json({ error: 'البريد مستخدم مسبقاً' }); } });
app.delete('/api/users/:id', auth, adminOnly, (req, res) => { if (Number(req.params.id) === Number(req.user.id)) return res.status(400).json({ error: 'لا يمكن حذف الحساب الحالي' }); run('DELETE FROM users WHERE id=?', [req.params.id]); saveDb(); res.json({ ok: true }); });
app.get('/api/track/:reference', (req, res) => { const result = one('SELECT reference_number,status,created_at FROM applications WHERE reference_number=? AND archived=0', [req.params.reference]); res.json(result || { error: 'لم يتم العثور على الطلب' }); });
app.get('/api/content', (req, res) => res.json(rows('SELECT * FROM content ORDER BY id')));
app.put('/api/content/:id', auth, adminOnly, (req, res) => { run('UPDATE content SET title=?,body=?,updated_at=? WHERE id=?', [req.body.title || '', req.body.body || '', now(), req.params.id]); saveDb(); res.json({ ok: true }); });
app.get('/api/stats', auth, adminOnly, (req, res) => res.json({ applications: one('SELECT COUNT(*) n FROM applications WHERE archived=0').n, messages: one('SELECT COUNT(*) n FROM contact_messages WHERE archived=0').n, content: one('SELECT COUNT(*) n FROM content').n }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
const routes = { '/about': 'about.html', '/goals': 'goals.html', '/projects': 'projects.html', '/beneficiaries': 'beneficiaries.html', '/programs': 'programs.html', '/news': 'news.html', '/track': 'track.html', '/apply': 'apply.html', '/faq': 'faq.html', '/privacy': 'privacy.html', '/terms': 'terms.html' };
for (const [route, file] of Object.entries(routes)) app.get(route, (req, res) => res.sendFile(path.join(__dirname, file)));
app.use(express.static(__dirname, { extensions: ['html'] }));
const port = Number(process.env.PORT || 3000);
if (process.env.NODE_ENV !== 'test') app.listen(port, '0.0.0.0', () => console.log(`Alwaleed Full-Stack running on http://localhost:${port}`));
export { app, db };
