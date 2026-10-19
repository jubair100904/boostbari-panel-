'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
app.use(express.static('public', { extensions: ['html'] }));
const API_URL = process.env.GETMYFOLLOW_API_URL || 'https://my.getmyfollow.com/api/v2';
const API_KEY = process.env.GETMYFOLLOW_API_KEY || '';
const ADMIN_PASSWORD = process.env.PANEL_ADMIN_PASSWORD || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false }, max: 5 }) : null;
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'অনেকবার চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।' } });
app.use('/api', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function requireDb(req, res, next) {
  if (!pool) return res.status(503).json({ error: 'DATABASE_URL সেট করা নেই। Render PostgreSQL যুক্ত করুন।' });
  next();
}
async function audit(event, details = {}) {
  if (!pool) return;
  try { await pool.query('INSERT INTO audit_events(event_type, details) VALUES($1,$2)', [event, JSON.stringify(details)]); } catch (_) {}
}
function cookieOptions() { return `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`; }
function clearCookie(res) { res.set('Set-Cookie', 'bb_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'); }
function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const piece of header.split(';')) { const i = piece.indexOf('='); if (i > -1 && piece.slice(0, i).trim() === name) return decodeURIComponent(piece.slice(i + 1).trim()); }
  return '';
}
async function adminOnly(req, res, next) {
  try {
    if (!pool) return res.status(503).json({ error: 'Database সেট করা নেই।' });
    const token = getCookie(req, 'bb_admin_session');
    if (!token || token.length > 200) return res.status(401).json({ error: 'লগইন করুন।' });
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query('SELECT id, expires_at FROM admin_sessions WHERE token_hash=$1 AND expires_at > NOW()', [hash]);
    if (!result.rowCount) { clearCookie(res); return res.status(401).json({ error: 'সেশন শেষ হয়েছে। আবার লগইন করুন।' }); }
    req.adminSessionId = result.rows[0].id;
    next();
  } catch (_) { res.status(500).json({ error: 'সেশন যাচাই করা যায়নি।' }); }
}
async function providerRequest(params) {
  if (!API_KEY) throw new Error('Provider API key is not configured');
  const body = new URLSearchParams({ key: API_KEY, ...params });
  const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  const data = await response.json();
  if (data && typeof data === 'object' && data.error) throw new Error('Provider returned an error');
  return data;
}
function sameOriginOnly(req, res, next) {
  const origin = req.get('origin');
  if (origin) {
    try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origin blocked.' }); }
    catch (_) { return res.status(403).json({ error: 'Invalid origin.' }); }
  }
  next();
}
app.get('/api/health', (req, res) => res.json({ ok: true, databaseConfigured: Boolean(pool), providerConfigured: Boolean(API_KEY) }));
app.get('/api/services', async (req, res) => {
  try {
    const data = await providerRequest({ action: 'services' });
    if (!Array.isArray(data)) return res.status(502).json({ error: 'Provider-এর সার্ভিস উত্তর সঠিক নয়।' });
    res.set('Cache-Control', 'public, max-age=60');
    res.json(data.map(s => ({ service: Number(s.service), name: String(s.name || ''), type: String(s.type || ''), category: String(s.category || ''), rate: String(s.rate || ''), min: String(s.min || ''), max: String(s.max || ''), refill: Boolean(s.refill), cancel: Boolean(s.cancel) })));
  } catch (_) { res.status(502).json({ error: 'সার্ভিস লোড হয়নি। API Key এবং Provider status যাচাই করুন।' }); }
});
app.post('/api/admin/login', loginLimiter, requireDb, sameOriginOnly, async (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'PANEL_ADMIN_PASSWORD সেট করা নেই।' });
  const password = req.body && req.body.password;
  if (typeof password !== 'string' || !safeEqual(password, ADMIN_PASSWORD)) {
    await audit('admin_login_failed');
    return res.status(401).json({ error: 'পাসওয়ার্ড সঠিক নয়।' });
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query('INSERT INTO admin_sessions(token_hash, expires_at) VALUES($1,$2)', [hash, expires]);
  res.set('Set-Cookie', `bb_admin_session=${encodeURIComponent(token)}; ${cookieOptions()}`);
  await audit('admin_login_success');
  res.json({ ok: true, expiresAt: expires.toISOString() });
});
app.post('/api/admin/logout', requireDb, sameOriginOnly, async (req, res) => {
  const token = getCookie(req, 'bb_admin_session');
  if (token) await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1', [crypto.createHash('sha256').update(token).digest('hex')]);
  clearCookie(res); res.json({ ok: true });
});
app.get('/api/admin/me', requireDb, adminOnly, (req, res) => res.json({ authenticated: true }));
app.get('/api/admin/overview', requireDb, adminOnly, async (req, res) => {
  const [orders, recent, audits] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='pending')::int AS pending, COUNT(*) FILTER (WHERE status='completed')::int AS completed, COUNT(*) FILTER (WHERE status='failed')::int AS failed FROM orders"),
    pool.query('SELECT id, provider_order_id, service_id, service_name, link, quantity, status, created_at FROM orders ORDER BY id DESC LIMIT 20'),
    pool.query('SELECT event_type, created_at FROM audit_events ORDER BY id DESC LIMIT 8')
  ]);
  res.json({ stats: orders.rows[0], orders: recent.rows, activity: audits.rows });
});
app.get('/api/admin/balance', requireDb, adminOnly, async (req, res) => {
  try { const result = await providerRequest({ action: 'balance' }); await audit('provider_balance_checked'); res.json(result); }
  catch (_) { res.status(502).json({ error: 'Provider balance আনা যায়নি। API Key/Provider status পরীক্ষা করুন।' }); }
});
app.get('/api/admin/services', requireDb, adminOnly, async (req, res) => {
  try {
    const data = await providerRequest({ action: 'services' });
    if (!Array.isArray(data)) return res.status(502).json({ error: 'Provider service response invalid.' });
    res.json(data.map(s => ({ service: Number(s.service), name: String(s.name || ''), type: String(s.type || ''), category: String(s.category || ''), rate: String(s.rate || ''), min: Number(s.min || 0), max: Number(s.max || 0), refill: Boolean(s.refill), cancel: Boolean(s.cancel) })));
  } catch (_) { res.status(502).json({ error: 'সার্ভিস লোড হয়নি। API Key যাচাই করুন।' }); }
});
app.post('/api/admin/orders', requireDb, adminOnly, sameOriginOnly, async (req, res) => {
  const { service, link, quantity } = req.body || {};
  const serviceId = Number(service), qty = Number(quantity);
  if (!Number.isInteger(serviceId) || serviceId < 1 || typeof link !== 'string' || link.length > 2000 || !/^https:\/\/\S+$/i.test(link) || !Number.isInteger(qty) || qty < 1 || qty > 100000) return res.status(400).json({ error: 'Service ID, HTTPS link ও 1–100000 quantity দিন।' });
  try {
    const services = await providerRequest({ action: 'services' });
    const chosen = Array.isArray(services) ? services.find(s => Number(s.service) === serviceId) : null;
    if (!chosen) return res.status(400).json({ error: 'এই Service ID provider তালিকায় নেই।' });
    if (qty < Number(chosen.min || 1) || qty > Number(chosen.max || 100000)) return res.status(400).json({ error: `Quantity ${chosen.min} থেকে ${chosen.max} এর মধ্যে হতে হবে।` });
    const result = await providerRequest({ action: 'add', service: String(serviceId), link, quantity: String(qty) });
    if (!result || !result.order) { await audit('provider_order_rejected', { serviceId }); return res.status(502).json({ error: 'Provider অর্ডার ID দেয়নি; provider উত্তর পরীক্ষা করুন।' }); }
    const saved = await pool.query('INSERT INTO orders(provider_order_id, service_id, service_name, link, quantity, status, provider_response) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id, provider_order_id, service_id, service_name, link, quantity, status, created_at', [String(result.order), serviceId, String(chosen.name || ''), link, qty, 'pending', JSON.stringify(result)]);
    await audit('provider_order_created', { orderId: saved.rows[0].id, providerOrderId: String(result.order), serviceId, quantity: qty });
    res.status(201).json({ ok: true, order: saved.rows[0] });
  } catch (_) { res.status(502).json({ error: 'Provider-এ অর্ডার দেওয়া বা DB-তে সংরক্ষণে সমস্যা হয়েছে। Provider panel পরীক্ষা করুন, পুনরায় অর্ডার দেওয়ার আগে duplicate হয়েছে কি না দেখুন।' }); }
});
app.post('/api/admin/orders/:id/refresh', requireDb, adminOnly, sameOriginOnly, async (req, res) => {
  const id = Number(req.params.id); if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid order ID.' });
  const found = await pool.query('SELECT id, provider_order_id FROM orders WHERE id=$1', [id]);
  if (!found.rowCount) return res.status(404).json({ error: 'Order পাওয়া যায়নি।' });
  try {
    const result = await providerRequest({ action: 'status', order: String(found.rows[0].provider_order_id) });
    const status = String(result.status || result.order_status || 'unknown').toLowerCase();
    const safeStatus = ['pending','processing','in progress','in_progress','completed','partial','canceled','cancelled','failed'].includes(status) ? status.replace('in progress','processing').replace('in_progress','processing').replace('cancelled','canceled') : 'unknown';
    await pool.query('UPDATE orders SET status=$1, provider_response=$2, updated_at=NOW() WHERE id=$3', [safeStatus, JSON.stringify(result), id]);
    await audit('order_status_refreshed', { orderId: id, status: safeStatus });
    const updated = await pool.query('SELECT id, provider_order_id, service_id, service_name, link, quantity, status, created_at, updated_at FROM orders WHERE id=$1', [id]);
    res.json({ ok: true, order: updated.rows[0], provider: result });
  } catch (_) { res.status(502).json({ error: 'Provider থেকে status আনা যায়নি।' }); }
});
app.use((err, req, res, next) => { console.error('Request failed:', err && err.message); res.status(500).json({ error: 'সার্ভারে সমস্যা হয়েছে। Logs পরীক্ষা করুন।' }); });
async function start() {
  if (!pool) { console.error('FATAL: DATABASE_URL is required. Add a Render PostgreSQL database and set DATABASE_URL.'); process.exit(1); }
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_sessions (id BIGSERIAL PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS orders (id BIGSERIAL PRIMARY KEY, provider_order_id TEXT NOT NULL, service_id INTEGER NOT NULL, service_name TEXT NOT NULL, link TEXT NOT NULL, quantity INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', provider_response JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS audit_events (id BIGSERIAL PRIMARY KEY, event_type TEXT NOT NULL, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON admin_sessions(expires_at);`);
  await pool.query('DELETE FROM admin_sessions WHERE expires_at < NOW()');
  const port = process.env.PORT || 3000;
  app.listen(port, '0.0.0.0', () => console.log(`BoostBari listening on ${port}`));
}
start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
                    
