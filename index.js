import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 8080);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  console.error('JWT_SECRET must be configured with at least 32 characters.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false });

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    const allowed = (process.env.CORS_ORIGIN || 'http://localhost:4173').split(',').map(s => s.trim());
    if (!origin || allowed.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '256kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

function cleanEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function validateCredentials(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return 'Email tidak valid.';
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return 'Kata sandi harus 8–128 karakter.';
  return null;
}
function issueToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email }, jwtSecret, { expiresIn: '7d', issuer: 'kickoff-manager-api', audience: 'kickoff-manager-app' });
}
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' });
  try {
    req.auth = jwt.verify(token, jwtSecret, { issuer: 'kickoff-manager-api', audience: 'kickoff-manager-app' });
    next();
  } catch {
    return res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa.' });
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'kickoff-manager-api' }));

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const email = cleanEmail(req.body?.email), password = req.body?.password;
    const error = validateCredentials(email, password);
    if (error) return res.status(400).json({ error });
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email', [email, hash]);
    const user = result.rows[0];
    return res.status(201).json({ token: issueToken(user), user: { id: user.id, email: user.email } });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email sudah terdaftar.' });
    next(err);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = cleanEmail(req.body?.email), password = req.body?.password;
    if (!email || typeof password !== 'string') return res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
    const result = await pool.query('SELECT id,email,password_hash FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email atau kata sandi salah.' });
    return res.json({ token: issueToken(user), user: { id: user.id, email: user.email } });
  } catch (err) { next(err); }
});

app.get('/api/me', auth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id,email,created_at FROM users WHERE id=$1', [req.auth.sub]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    res.json({ user: result.rows[0] });
  } catch (err) { next(err); }
});

app.get('/api/save', auth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT save_data,updated_at FROM game_saves WHERE user_id=$1', [req.auth.sub]);
    if (!result.rows[0]) return res.json({ save: null });
    res.json({ save: result.rows[0].save_data, updatedAt: result.rows[0].updated_at });
  } catch (err) { next(err); }
});

app.put('/api/save', auth, async (req, res, next) => {
  try {
    const save = req.body?.save;
    if (!save || typeof save !== 'object' || Array.isArray(save)) return res.status(400).json({ error: 'Format simpanan tidak valid.' });
    const bytes = Buffer.byteLength(JSON.stringify(save), 'utf8');
    if (bytes > 200_000) return res.status(413).json({ error: 'Simpanan terlalu besar (maksimum 200 KB).' });
    // Basic allowlist of top-level fields; server-side game rules must be authoritative in a competitive game.
    const allowed = {};
    for (const key of ['version','clubName','budget','played','points','players','tactics','savedAt']) {
      if (Object.hasOwn(save, key)) allowed[key] = save[key];
    }
    if (typeof allowed.clubName !== 'string' || allowed.clubName.length > 80) return res.status(400).json({ error: 'Nama klub tidak valid.' });
    const result = await pool.query(
      `INSERT INTO game_saves(user_id,save_data,updated_at) VALUES($1,$2::jsonb,NOW())
       ON CONFLICT(user_id) DO UPDATE SET save_data=EXCLUDED.save_data,updated_at=NOW()
       RETURNING updated_at`,
      [req.auth.sub, JSON.stringify(allowed)]
    );
    res.json({ ok: true, updatedAt: result.rows[0].updated_at });
  } catch (err) { next(err); }
});

// Account deletion is included for privacy/account lifecycle testing. Add re-authentication
// and a user-facing confirmation flow before public release.
app.delete('/api/me', auth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.auth.sub]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  console.error(err?.message || 'Unknown API error');
  if (res.headersSent) return;
  res.status(500).json({ error: 'Terjadi kesalahan server.' });
});
app.listen(port, () => console.log(`Kickoff Manager API listening on port ${port}`));
