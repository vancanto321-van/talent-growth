#!/usr/bin/env node

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import net from 'node:net';

const scrypt = promisify(scryptCallback);

const HOST = process.env.GROWTH_SYNC_HOST || '127.0.0.1';
const PORT = parsePort(process.env.GROWTH_SYNC_PORT || '18129');
const DATA_DIR = path.resolve(process.env.GROWTH_SYNC_DIR || '/opt/child-growth-sync/data');
const ACCOUNT_DIR = path.join(DATA_DIR, 'accounts');
const SESSION_DIR = path.join(DATA_DIR, 'sessions');
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_AUTH_BODY_BYTES = 4 * 1024;
const BODY_READ_CONCURRENCY = 8;
const BACKUP_RESPONSE_TIMEOUT_MS = 30_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_VERSIONS = 5;
const COOKIE_NAME = 'growth_session';
const COOKIE_PATH = '/growth/api';
const DEV_MODE = process.env.GROWTH_SYNC_DEV === '1' || process.env.NODE_ENV === 'development';
const COOKIE_SECURE = process.env.COOKIE_SECURE !== '0';
const PASSWORD_SCRYPT = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const USERNAME_RE = /^[a-z0-9._-]{3,40}$/;
const AGE_GROUPS = new Set(['early', 'preschool', 'child', 'teen', 'adult', 'later']);
const BAD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const DUMMY_SALT = randomBytes(16);
const DUMMY_HASH = randomBytes(64);

if (!COOKIE_SECURE && !DEV_MODE) {
  throw new Error('COOKIE_SECURE=0 is only allowed with GROWTH_SYNC_DEV=1 or NODE_ENV=development');
}

function parsePort(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error('GROWTH_SYNC_PORT must be a valid TCP port');
  return value;
}

function makeAllowedOrigins(primary) {
  let parsed;
  try { parsed = new URL(primary); } catch { throw new Error('GROWTH_SYNC_ORIGIN must be an absolute URL'); }
  if (!DEV_MODE && parsed.protocol !== 'https:') throw new Error('GROWTH_SYNC_ORIGIN must use https in production');
  const origins = new Set([parsed.origin]);
  if (DEV_MODE) {
    const extra = process.env.GROWTH_SYNC_ALLOWED_ORIGIN || process.env.GROWTH_SYNC_DEV_ORIGIN || '';
    for (const raw of extra.split(',')) {
      const value = raw.trim();
      if (!value) continue;
      try {
        const origin = new URL(value);
        if (origin.protocol === 'http:' || origin.protocol === 'https:') origins.add(origin.origin);
      } catch { /* Ignore malformed optional development origins. */ }
    }
    origins.add(`http://127.0.0.1:${PORT}`);
    origins.add(`http://localhost:${PORT}`);
  }
  return origins;
}

class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.entries = new Map();
    this.lastCleanup = 0;
  }

  allow(key) {
    const now = Date.now();
    let entry = this.entries.get(key);
    if (!entry || now - entry.startedAt >= this.windowMs) entry = { startedAt: now, count: 0 };
    entry.count += 1;
    this.entries.set(key, entry);
    if (now - this.lastCleanup > this.windowMs) {
      this.lastCleanup = now;
      for (const [item, value] of this.entries) if (now - value.startedAt >= this.windowMs) this.entries.delete(item);
    }
    return entry.count <= this.limit;
  }
}

class ScryptQueue {
  constructor(concurrency, maxQueue) {
    this.concurrency = concurrency;
    this.maxQueue = maxQueue;
    this.running = 0;
    this.queue = [];
  }

  run(task) {
    if (this.queue.length >= this.maxQueue) return Promise.reject(new HttpError(429, 'too many authentication requests'));
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.pump();
    });
  }

  pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const item = this.queue.shift();
      this.running += 1;
      Promise.resolve().then(item.task).then(item.resolve, item.reject).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }
}

class HttpError extends Error {
  constructor(status, message, details = null, retryAfter = null) {
    super(message);
    this.status = status;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

class BodyReadGate {
  constructor(limit) {
    this.limit = limit;
    this.active = 0;
  }

  tryAcquire() {
    if (this.active >= this.limit) return false;
    this.active += 1;
    return true;
  }

  release() {
    this.active = Math.max(0, this.active - 1);
  }
}

const configuredOrigin = process.env.GROWTH_SYNC_ORIGIN || 'https://your-domain.example';
const allowedOrigins = makeAllowedOrigins(configuredOrigin);
const requestLimiter = new RateLimiter(240, 5 * 60 * 1000);
const authLimiter = new RateLimiter(12, 15 * 60 * 1000);
const accountLocks = new Map();
const scryptQueue = new ScryptQueue(2, 32);
const bodyReadGate = new BodyReadGate(BODY_READ_CONCURRENCY);
const backupGate = new BodyReadGate(2);

async function ensureStorage() {
  await fs.mkdir(ACCOUNT_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(SESSION_DIR, { recursive: true, mode: 0o700 });
  await fs.chmod(DATA_DIR, 0o700).catch(() => {});
  await fs.chmod(ACCOUNT_DIR, 0o700).catch(() => {});
  await fs.chmod(SESSION_DIR, 0o700).catch(() => {});
}

function accountPath(username) {
  // Username validation makes this a single path component. Keep the check here
  // too so callers cannot accidentally turn an account lookup into traversal.
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'invalid username');
  return path.join(ACCOUNT_DIR, username);
}

function accountFile(username) { return path.join(accountPath(username), 'account.json'); }
function versionsPath(username) { return path.join(accountPath(username), 'versions'); }
function versionFile(username, revision) { return path.join(versionsPath(username), `${revision}.json`); }

async function readJson(file, missingOk = false) {
  try {
    const text = await fs.readFile(file, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (missingOk && error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJsonAtomic(file, value, mode = 0o600) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.chmod(dir, 0o700).catch(() => {});
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  const body = JSON.stringify(value);
  let handle;
  try {
    handle = await fs.open(temp, 'wx', mode);
    await handle.writeFile(body, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temp, file);
    await fs.chmod(file, mode).catch(() => {});
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temp).catch(() => {});
  }
}

async function loadAccount(username) {
  const account = await readJson(accountFile(username), true);
  if (!account) return null;
  if (account.username !== username || !USERNAME_RE.test(account.username)) throw new HttpError(500, 'account storage unavailable');
  if (!Number.isInteger(account.revision) || account.revision < 0 || account.revision > Number.MAX_SAFE_INTEGER) throw new HttpError(500, 'account storage unavailable');
  if (!Array.isArray(account.versions) || account.versions.length > MAX_VERSIONS) throw new HttpError(500, 'account storage unavailable');
  return account;
}

function emptyMeta() {
  return { revision: 0, updatedAt: null, people: 0, attempts: 0, bytes: 0, versions: [] };
}

function accountMeta(account) {
  if (!account || account.revision === 0) return emptyMeta();
  return {
    revision: account.revision,
    updatedAt: account.updatedAt,
    people: account.people,
    attempts: account.attempts,
    bytes: account.bytes,
    versions: account.versions.map(version => ({ revision: version.revision, updatedAt: version.updatedAt }))
  };
}

function parseCookies(header) {
  const cookies = Object.create(null);
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key && !Object.prototype.hasOwnProperty.call(cookies, key)) cookies[key] = value;
  }
  return cookies;
}

function sessionHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function isLoopback(address) {
  const normalized = address?.startsWith('::ffff:') ? address.slice(7) : address;
  return normalized === '127.0.0.1' || normalized === '::1';
}

function requestIp(req) {
  const peer = req.socket.remoteAddress || 'unknown';
  if (!isLoopback(peer)) return peer;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0].trim();
    if (net.isIP(first)) return first;
  }
  return peer;
}

function checkOrigin(req) {
  const origin = req.headers.origin;
  return typeof origin === 'string' && allowedOrigins.has(origin);
}

function requireJsonContentType(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) throw new HttpError(415, 'application/json required');
}

async function readBody(req, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    req.resume();
    throw new HttpError(413, 'request too large');
  }
  if (!bodyReadGate.tryAcquire()) {
    req.resume();
    throw new HttpError(503, 'request body capacity unavailable', null, 1);
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) throw new HttpError(413, 'request too large');
      chunks.push(chunk);
    }
    if (!size) throw new HttpError(400, 'request body required');
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new HttpError(400, 'invalid JSON'); }
  } finally {
    bodyReadGate.release();
  }
}

function assertPlainObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, message);
  for (const key of Object.keys(value)) if (BAD_KEYS.has(key)) throw new HttpError(400, 'invalid snapshot');
}

function cloneAndCheck(value, depth = 0, keys = { count: 0 }) {
  if (depth > 10) throw new HttpError(400, 'snapshot nesting is too deep');
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new HttpError(400, 'invalid snapshot');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new HttpError(400, 'invalid snapshot text');
    return value;
  }
  if (!value || typeof value !== 'object') throw new HttpError(400, 'invalid snapshot');
  if (++keys.count > 10000) throw new HttpError(400, 'snapshot has too many fields');
  if (Array.isArray(value)) return value.map(item => cloneAndCheck(item, depth + 1, keys));
  const output = Object.create(null);
  for (const [key, child] of Object.entries(value)) {
    if (BAD_KEYS.has(key) || key.length > 120) throw new HttpError(400, 'invalid snapshot field');
    output[key] = cloneAndCheck(child, depth + 1, keys);
  }
  return output;
}

function checkText(value, max, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new HttpError(400, 'invalid snapshot text');
  if (required && !value.trim()) throw new HttpError(400, 'required snapshot text missing');
}

function validateAttempt(attempt) {
  assertPlainObject(attempt, 'invalid attempt');
  if ('id' in attempt && (!SAFE_ID.test(attempt.id) || typeof attempt.id !== 'string')) throw new HttpError(400, 'invalid attempt id');
  if ('taskId' in attempt) { checkText(attempt.taskId, 120, true); if (!/^[A-Za-z0-9_\-\u3400-\u9fff.]+$/u.test(attempt.taskId)) throw new HttpError(400, 'invalid task id'); }
  if ('date' in attempt && (!Number.isFinite(attempt.date) || attempt.date <= 0 || attempt.date > Date.now() + 86_400_000)) throw new HttpError(400, 'invalid attempt date');
  if ('mode' in attempt && attempt.mode !== 'independent' && attempt.mode !== 'assisted') throw new HttpError(400, 'invalid attempt mode');
  for (const key of ['note', 'artifact', 'feedback', 'outcomeNote', 'change', 'changeNote']) if (key in attempt) checkText(attempt[key], 2000);
  if ('outcome' in attempt && !['untried', 'needs-work', 'useful'].includes(attempt.outcome)) throw new HttpError(400, 'invalid attempt outcome');
  if ('artifactTitle' in attempt) checkText(attempt.artifactTitle, 120);
  if ('duration' in attempt && !((typeof attempt.duration === 'number' && Number.isFinite(attempt.duration) && attempt.duration >= 0 && attempt.duration <= 100_000) || (typeof attempt.duration === 'string' && attempt.duration.length <= 120))) throw new HttpError(400, 'invalid attempt duration');
  if ('durationMinutes' in attempt && (!Number.isInteger(attempt.durationMinutes) || attempt.durationMinutes < 0 || attempt.durationMinutes > 240)) throw new HttpError(400, 'invalid attempt duration');
  for (const key of ['enjoyment', 'energy']) if (key in attempt && (!Number.isInteger(attempt[key]) || attempt[key] < 1 || attempt[key] > 5)) throw new HttpError(400, 'invalid attempt rating');
}

function validateSnapshot(raw) {
  assertPlainObject(raw, 'snapshot must be an object');
  if (raw.version !== 1) throw new HttpError(400, 'snapshot version must be 1');
  const snapshot = cloneAndCheck(raw);
  if (!Array.isArray(snapshot.people) || snapshot.people.length < 1 || snapshot.people.length > 20) throw new HttpError(400, 'snapshot people limit exceeded');
  const ids = new Set();
  for (const person of snapshot.people) {
    assertPlainObject(person, 'invalid person');
    if (typeof person.id !== 'string' || !SAFE_ID.test(person.id) || ids.has(person.id)) throw new HttpError(400, 'invalid person id');
    ids.add(person.id);
    checkText(person.name, 40, true);
    if (typeof person.ageGroup !== 'string' || !AGE_GROUPS.has(person.ageGroup)) throw new HttpError(400, 'invalid person age group');
  }
  if ('activeId' in snapshot && (typeof snapshot.activeId !== 'string' || !ids.has(snapshot.activeId))) throw new HttpError(400, 'invalid active person');
  assertPlainObject(snapshot.profiles, 'profiles must be an object');
  const profileIds = Object.keys(snapshot.profiles);
  if (profileIds.length !== ids.size || profileIds.some(id => !ids.has(id))) throw new HttpError(400, 'profiles must match people exactly');
  let attempts = 0;
  for (const id of ids) {
    const profile = snapshot.profiles[id];
    assertPlainObject(profile, 'invalid profile');
    if ('attempts' in profile) {
      if (!Array.isArray(profile.attempts) || profile.attempts.length > 5000) throw new HttpError(400, 'attempt limit exceeded');
      attempts += profile.attempts.length;
      for (const attempt of profile.attempts) validateAttempt(attempt);
    }
    if ('progress' in profile) assertPlainObject(profile.progress, 'invalid profile progress');
    for (const key of ['preferences', 'plan']) {
      if (key in profile && profile[key] !== null) assertPlainObject(profile[key], `invalid profile ${key}`);
    }
  }
  if ('preferences' in snapshot && snapshot.preferences !== null) assertPlainObject(snapshot.preferences, 'invalid preferences');
  const bytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
  if (bytes > MAX_BODY_BYTES) throw new HttpError(413, 'snapshot too large');
  return { snapshot, people: snapshot.people.length, attempts, bytes };
}

async function createSession(username) {
  const token = randomBytes(32).toString('base64url');
  const hash = sessionHash(token);
  const record = { username, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
  await writeJsonAtomic(path.join(SESSION_DIR, `${hash}.json`), record);
  return { token, expiresAt: record.expiresAt };
}

function setSessionCookie(res, session) {
  const expires = new Date(session.expiresAt).toUTCString();
  const secure = COOKIE_SECURE ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${session.token}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; Expires=${expires}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict${secure}`);
}

function clearSessionCookie(res) {
  const secure = COOKIE_SECURE ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict${secure}`);
}

async function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const record = await readJson(path.join(SESSION_DIR, `${sessionHash(token)}.json`), true);
  if (!record || typeof record.username !== 'string' || !USERNAME_RE.test(record.username)) return null;
  if (!Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now()) {
    await fs.unlink(path.join(SESSION_DIR, `${sessionHash(token)}.json`)).catch(() => {});
    return null;
  }
  return { username: record.username, token };
}

async function derivePassword(password, salt) {
  return scryptQueue.run(() => scrypt(password, salt, 64, PASSWORD_SCRYPT));
}

function passwordValid(value) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128;
}

function acquireBackupGate() {
  if (!backupGate.tryAcquire()) throw new HttpError(503, 'backup capacity unavailable', null, 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    backupGate.release();
  };
}

async function requireUser(req) {
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, 'authentication required');
  return user;
}

async function requireBackupUser(req) {
  const user = await requireUser(req);
  const expectedAccount = req.headers['x-growth-account'];
  if (typeof expectedAccount !== 'string' || expectedAccount !== user.username) {
    throw new HttpError(409, 'backup account changed', { accountChanged: true });
  }
  return user;
}

async function withAccountLock(username, operation) {
  const previous = accountLocks.get(username) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  const queued = previous.then(() => current);
  accountLocks.set(username, queued);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (accountLocks.get(username) === queued) accountLocks.delete(username);
  }
}

async function handleRegister(req, res) {
  const ip = requestIp(req);
  if (!authLimiter.allow(`auth:${ip}`)) throw new HttpError(429, 'too many authentication requests');
  requireJsonContentType(req);
  const body = await readBody(req, MAX_AUTH_BODY_BYTES);
  const username = body && typeof body.username === 'string' ? body.username : '';
  const password = body && typeof body.password === 'string' ? body.password : '';
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'username must be 3-40 lowercase ASCII characters (letters, digits, dot, underscore, hyphen)');
  if (!passwordValid(password)) throw new HttpError(400, 'password must be 10-128 characters');
  const result = await withAccountLock(username, async () => {
    if (await loadAccount(username)) throw new HttpError(409, 'username already exists');
    const salt = randomBytes(16);
    const passwordHash = await derivePassword(password, salt);
    const account = {
      username,
      passwordSalt: salt.toString('base64'),
      passwordHash: Buffer.from(passwordHash).toString('base64'),
      createdAt: Date.now(),
      revision: 0,
      updatedAt: null,
      people: 0,
      attempts: 0,
      bytes: 0,
      versions: []
    };
    await fs.mkdir(versionsPath(username), { recursive: true, mode: 0o700 });
    await writeJsonAtomic(accountFile(username), account);
    return createSession(username);
  });
  setSessionCookie(res, result);
  sendJson(res, 201, { authenticated: true, username });
}

async function handleLogin(req, res) {
  const ip = requestIp(req);
  if (!authLimiter.allow(`auth:${ip}`)) throw new HttpError(429, 'too many authentication requests');
  requireJsonContentType(req);
  const body = await readBody(req, MAX_AUTH_BODY_BYTES);
  const username = body && typeof body.username === 'string' ? body.username : '';
  const password = body && typeof body.password === 'string' ? body.password : '';
  if (!USERNAME_RE.test(username) || !passwordValid(password)) throw new HttpError(401, 'invalid username or password');
  const result = await withAccountLock(username, async () => {
    const account = await loadAccount(username);
    let expected = DUMMY_HASH;
    let salt = DUMMY_SALT;
    if (account) {
      try {
        salt = Buffer.from(account.passwordSalt, 'base64');
        expected = Buffer.from(account.passwordHash, 'base64');
      } catch { throw new HttpError(500, 'account storage unavailable'); }
    }
    const actual = Buffer.from(await derivePassword(password, salt));
    const valid = actual.length === expected.length && timingSafeEqual(actual, expected);
    if (!account || !valid) throw new HttpError(401, 'invalid username or password');
    return createSession(username);
  });
  setSessionCookie(res, result);
  sendJson(res, 200, { authenticated: true, username });
}

async function handleLogout(req, res) {
  const user = await requireUser(req);
  const file = path.join(SESSION_DIR, `${sessionHash(user.token)}.json`);
  await fs.unlink(file).catch(() => {});
  clearSessionCookie(res);
  sendJson(res, 200, { authenticated: false });
}

async function handleStatus(req, res) {
  const user = await currentUser(req);
  sendJson(res, 200, user ? { authenticated: true, username: user.username } : { authenticated: false });
}

async function readVersion(username, revision) {
  const value = await readJson(versionFile(username, revision), true);
  if (!value || !value.snapshot || !value.meta) throw new HttpError(404, 'backup revision not found');
  return value;
}

async function handleBackupMeta(req, res) {
  const user = await requireBackupUser(req);
  const account = await loadAccount(user.username);
  if (!account) throw new HttpError(401, 'authentication required');
  sendJson(res, 200, accountMeta(account));
}

async function handleBackupGet(req, res, url) {
  const user = await requireBackupUser(req);
  const releaseBackup = acquireBackupGate();
  try {
    const account = await loadAccount(user.username);
    if (!account) throw new HttpError(401, 'authentication required');
    if (account.revision === 0) {
      if (url.searchParams.has('revision') && url.searchParams.get('revision') !== '0') throw new HttpError(404, 'backup revision not found');
      await sendBackupJson(res, 200, { snapshot: null, meta: emptyMeta() });
      return;
    }
    const requested = url.searchParams.get('revision');
    if (requested === null) {
      const current = await readVersion(user.username, account.revision);
      await sendBackupJson(res, 200, { snapshot: current.snapshot, meta: accountMeta(account) });
      return;
    }
    if (!/^\d+$/.test(requested)) throw new HttpError(400, 'invalid revision');
    const revision = Number(requested);
    if (revision === 0) { await sendBackupJson(res, 200, { snapshot: null, meta: emptyMeta() }); return; }
    if (!account.versions.some(item => item.revision === revision)) throw new HttpError(404, 'backup revision not found');
    const version = await readVersion(user.username, revision);
    await sendBackupJson(res, 200, { snapshot: version.snapshot, meta: version.meta });
  } finally {
    releaseBackup();
  }
}

async function handleBackupPut(req, res) {
  const user = await requireBackupUser(req);
  const releaseBackup = acquireBackupGate();
  try {
    requireJsonContentType(req);
    const body = await readBody(req);
    if (!body || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 0) throw new HttpError(400, 'expectedRevision must be a non-negative integer');
    const checked = validateSnapshot(body.snapshot);
    const result = await withAccountLock(user.username, async () => {
      const account = await loadAccount(user.username);
      if (!account) throw new HttpError(401, 'authentication required');
      const currentMeta = accountMeta(account);
      if (body.expectedRevision !== account.revision) throw new HttpError(409, 'backup revision conflict', currentMeta);
      const revision = account.revision + 1;
      const updatedAt = new Date().toISOString();
      const versions = [{ revision, updatedAt }, ...account.versions.map(item => ({ revision: item.revision, updatedAt: item.updatedAt }))].slice(0, MAX_VERSIONS);
      const meta = { revision, updatedAt, people: checked.people, attempts: checked.attempts, bytes: checked.bytes, versions };
      await writeJsonAtomic(versionFile(user.username, revision), { snapshot: checked.snapshot, meta });
      const nextAccount = { ...account, revision, updatedAt, people: checked.people, attempts: checked.attempts, bytes: checked.bytes, versions };
      await writeJsonAtomic(accountFile(user.username), nextAccount);
      for (const old of account.versions) if (!versions.some(item => item.revision === old.revision)) await fs.unlink(versionFile(user.username, old.revision)).catch(() => {});
      return meta;
    });
    await sendBackupJson(res, 200, result);
  } finally {
    releaseBackup();
  }
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(body);
}

function sendBackupJson(res, status, value) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      res.off('finish', onFinish);
      res.off('close', onClose);
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const rejectOnce = error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onFinish = () => resolveOnce();
    const onClose = () => {
      if (res.writableFinished) resolveOnce();
      else rejectOnce(new Error('backup response closed before finish'));
    };
    res.once('finish', onFinish);
    res.once('close', onClose);
    timer = setTimeout(() => {
      res.destroy();
      rejectOnce(new Error('backup response timed out'));
    }, BACKUP_RESPONSE_TIMEOUT_MS);
    try {
      sendJson(res, status, value);
    } catch (error) {
      rejectOnce(error);
    }
  });
}

function routePath(url) {
  let pathname = url.pathname;
  if (pathname.startsWith('/growth/api/')) pathname = pathname.slice('/growth/api'.length);
  else if (pathname === '/growth/api') pathname = '/';
  return pathname;
}

async function requestHandler(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const ip = requestIp(req);
  if (!requestLimiter.allow(ip)) throw new HttpError(429, 'too many requests');
  if (!['GET', 'POST', 'PUT', 'OPTIONS'].includes(req.method || '')) throw new HttpError(405, 'method not allowed');
  if (checkOrigin(req)) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    if (!checkOrigin(req)) throw new HttpError(403, 'origin not allowed');
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    res.end();
    return;
  }
  if (['POST', 'PUT'].includes(req.method || '') && !checkOrigin(req)) throw new HttpError(403, 'origin not allowed');
  const route = routePath(url);
  if (req.method === 'GET' && route === '/health') { sendJson(res, 200, { ok: true }); return; }
  if (req.method === 'GET' && route === '/auth/status') { await handleStatus(req, res); return; }
  if (req.method === 'POST' && route === '/auth/register') { await handleRegister(req, res); return; }
  if (req.method === 'POST' && route === '/auth/login') { await handleLogin(req, res); return; }
  if (req.method === 'POST' && route === '/auth/logout') { await handleLogout(req, res); return; }
  if (req.method === 'GET' && route === '/backup/meta') { await handleBackupMeta(req, res); return; }
  if (req.method === 'GET' && route === '/backup') { await handleBackupGet(req, res, url); return; }
  if (req.method === 'PUT' && route === '/backup') { await handleBackupPut(req, res); return; }
  throw new HttpError(404, 'not found');
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    await requestHandler(req, res);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error('growth-sync request failed:', error?.message || 'unknown error');
    if (!res.headersSent) {
      if (error instanceof HttpError && error.retryAfter !== null) res.setHeader('Retry-After', String(error.retryAfter));
      const payload = { error: error instanceof HttpError ? error.message : 'internal server error' };
      if (error instanceof HttpError && error.status === 409 && error.details) payload.meta = error.details;
      sendJson(res, status, payload);
    } else {
      res.destroy();
    }
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

await ensureStorage();
server.listen(PORT, HOST, () => {
  console.log(`growth-sync listening on ${HOST}:${PORT}`);
});

