import { createHash, timingSafeEqual } from 'node:crypto';
import webPush from 'web-push';
import { validateReminder, nextReminder } from './schedule.js';

const MAX_BODY = 16384;
const DAY = 86400000;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = new Set(['rest', 'cardio-work', 'cardio-rest', 'cardio-finish']);
const EMPTY_REMINDER = { enabled: false, time: '18:00', timeZone: 'UTC', days: [] };

class APIError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new APIError(status, code); };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
function response(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
function errorResponse(error) {
  return response({ error: error instanceof APIError ? error.code : error instanceof RangeError ? 'invalid_request' : 'internal_error' },
    error instanceof APIError ? error.status : error instanceof RangeError ? 400 : 500);
}
function decode(value, bytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail(400, 'invalid_subscription');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== bytes || decoded.toString('base64url') !== value) fail(400, 'invalid_subscription');
  return decoded;
}
export function validateSubscription(value) {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 4096) fail(400, 'invalid_subscription');
  let url;
  try { url = new URL(value.endpoint); } catch { fail(400, 'invalid_subscription'); }
  const host = url.hostname;
  const allowed = host.endsWith('.push.apple.com') || host === 'fcm.googleapis.com' ||
    host === 'updates.push.services.mozilla.com' || host.endsWith('.notify.windows.com');
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) fail(400, 'invalid_subscription');
  const p256dh = decode(value.keys?.p256dh, 65);
  if (p256dh[0] !== 4) fail(400, 'invalid_subscription');
  decode(value.keys?.auth, 16);
  return { endpoint: url.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}
function configured(env) {
  try {
    const pub = decode(env.VAPID_PUBLIC_KEY, 65);
    decode(env.VAPID_PRIVATE_KEY, 32);
    const app = new URL(env.APP_URL), origin = new URL(env.ALLOWED_ORIGIN);
    const subject = new URL(env.VAPID_SUBJECT);
    return pub[0] === 4 && origin.origin === env.ALLOWED_ORIGIN && app.origin === origin.origin &&
      app.protocol === 'https:' && ['https:', 'mailto:'].includes(subject.protocol) &&
      (/^[0-9a-f]{64}$/i.test(env.PAIRING_CODE_HASH || '') || String(env.PAIRING_CODE || '').length >= 16);
  } catch { return false; }
}
function bearer(request) {
  const value = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!TOKEN.test(value || '')) fail(401, 'unauthorized');
  return value;
}
async function body(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) fail(415, 'json_required');
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) fail(413, 'request_too_large');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'invalid_request');
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); fail(413, 'request_too_large'); }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'invalid_request');
    return value;
  } catch (error) { if (error instanceof APIError) throw error; fail(400, 'invalid_request'); }
}
function route(url) {
  const match = url.pathname.match(/^\/v1\/devices\/([^/]+)(?:\/(schedule|test|timers\/(rest|cardio)))?$/);
  if (!match || !UUID.test(match[1])) fail(404, 'not_found');
  return { id: match[1].toLowerCase(), suffix: match[2] || '', kind: match[3] };
}
function cors(result, origin, env) {
  const headers = new Headers(result.headers);
  if (origin === env.ALLOWED_ORIGIN) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET, PUT, PATCH, POST, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  return new Response(result.body, { status: result.status, headers });
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    let result;
    try {
      if (origin && origin !== env.ALLOWED_ORIGIN) fail(403, 'origin_not_allowed');
      if (!origin && !['GET', 'OPTIONS'].includes(request.method)) fail(403, 'origin_required');
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), origin, env);
      if (!configured(env)) fail(503, 'not_configured');
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/v1/config')
        result = response({ ready: true, publicKey: env.VAPID_PUBLIC_KEY });
      else {
        const r = route(url);
        bearer(request);
        result = await env.DEVICES.get(env.DEVICES.idFromName(r.id)).fetch(request);
      }
    } catch (error) { result = errorResponse(error); }
    return cors(result, origin, env);
  },
};

function publicState(record) {
  return { ok: true, registered: !!record.subscription, reminder: record.reminder, timersEnabled: record.timersEnabled,
    nextReminderAt: record.nextReminderAt, lastDeliveryStatus: record.lastDeliveryStatus || null };
}
function checkedEvents(input, kind, now) {
  if (!Number.isSafeInteger(input.revision) || input.revision < 1 || !Array.isArray(input.events) || input.events.length > 200)
    fail(400, 'invalid_timers');
  const ids = new Set();
  return input.events.map((event) => {
    if (!event || typeof event.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,96}$/.test(event.id) || ids.has(event.id) ||
      !Number.isSafeInteger(event.at) || event.at > now + DAY || !TYPES.has(event.type) ||
      (kind === 'rest' ? event.type !== 'rest' : !event.type.startsWith('cardio-'))) fail(400, 'invalid_timers');
    ids.add(event.id);
    return { id: event.id, at: event.at, type: event.type };
  }).filter((event) => event.at > now).sort((a, b) => a.at - b.at);
}
function payload(env, type, id, at, expiresAt) {
  const bodies = { 'training-reminder': 'Zeit für dein Training. Öffne AlexFit für deinen heutigen Plan.',
    rest: 'Deine Satzpause ist vorbei. Bereit für den nächsten Satz?',
    'cardio-work': 'Das nächste Belastungsintervall beginnt.', 'cardio-rest': 'Belastung beendet. Jetzt locker weiterbewegen.',
    'cardio-finish': 'Dein Intervalltraining ist beendet.', test: 'Push-Nachrichten sind auf diesem Gerät verbunden.' };
  return { v: 1, id, type, title: 'AlexFit', body: bodies[type], timestamp: at, expiresAt,
    tag: type.startsWith('cardio-') ? 'af-cardio' : type === 'rest' ? 'af-rest' : type === 'test' ? 'af-test' : 'af-training',
    url: env.APP_URL + '?push=' + (type.startsWith('cardio-') ? 'cardio' : 'training') };
}
export async function sendPush(subscription, notification, env, fetcher = fetch) {
  const ttl = Math.max(1, Math.min(900, Math.ceil((notification.expiresAt - Date.now()) / 1000)));
  const request = webPush.generateRequestDetails(subscription, JSON.stringify(notification), {
    TTL: ttl, urgency: 'high', contentEncoding: 'aes128gcm',
    vapidDetails: { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
  });
  const result = await fetcher(request.endpoint, { method: request.method, headers: request.headers,
    body: request.body, redirect: 'error', signal: AbortSignal.timeout(8000) });
  return result.status;
}

export class PushDevice {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.record = null;
    this.ready = ctx.blockConcurrencyWhile(async () => { this.record = await ctx.storage.get('device') || null; });
  }
  async save() {
    await this.ctx.storage.put('device', this.record);
    const times = [this.record?.nextReminderAt,
      ...Object.values(this.record?.timers || {}).flatMap((group) => group.events.map((event) => event.at))].filter(Number.isFinite);
    if (times.length && this.record.subscription) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...times)));
    else await this.ctx.storage.deleteAlarm();
  }
  async fetch(request) {
    await this.ready;
    try { return await this.ctx.blockConcurrencyWhile(() => this.handle(request)); }
    catch (error) { return errorResponse(error); }
  }
  async handle(request) {
    const r = route(new URL(request.url));
    const tokenHash = hash(bearer(request));
    const now = Date.now();
    if (this.record && !equal(this.record.tokenHash, tokenHash)) fail(401, 'unauthorized');
    if (!r.suffix && request.method === 'PUT') {
      const value = await body(request);
      if (!this.record) {
        const provided = String(value.pairingCode || '');
        const valid = /^[0-9a-f]{64}$/i.test(this.env.PAIRING_CODE_HASH || '')
          ? equal(hash(provided), this.env.PAIRING_CODE_HASH.toLowerCase())
          : equal(provided, this.env.PAIRING_CODE);
        if (!valid) fail(401, 'pairing_required');
      }
      const subscription = validateSubscription(value.subscription);
      const reminder = validateReminder(value.reminder || this.record?.reminder || EMPTY_REMINDER);
      if (value.timersEnabled !== undefined && typeof value.timersEnabled !== 'boolean') fail(400, 'invalid_request');
      this.record = { ...this.record, tokenHash, subscription, reminder,
        timersEnabled: value.timersEnabled ?? this.record?.timersEnabled ?? false,
        timers: this.record?.timers || { rest: { revision: 0, events: [] }, cardio: { revision: 0, events: [] } },
        nextReminderAt: nextReminder(reminder, now) };
      if (!this.record.timersEnabled) for (const group of Object.values(this.record.timers)) group.events = [];
      await this.save(); return response(publicState(this.record));
    }
    if (!this.record) fail(404, 'device_not_found');
    if (!r.suffix && request.method === 'GET') return response(publicState(this.record));
    if (!r.suffix && request.method === 'DELETE') {
      this.record = null; await this.ctx.storage.deleteAll(); await this.ctx.storage.deleteAlarm();
      return response({ ok: true });
    }
    if (r.suffix === 'schedule' && request.method === 'PATCH') {
      const value = await body(request);
      const reminder = value.reminder !== undefined ? validateReminder(value.reminder) : this.record.reminder;
      if (value.timersEnabled !== undefined && typeof value.timersEnabled !== 'boolean') fail(400, 'invalid_request');
      if (value.reminder !== undefined) {
        this.record.reminder = reminder;
        this.record.nextReminderAt = nextReminder(this.record.reminder, now);
      }
      if (value.timersEnabled !== undefined) {
        this.record.timersEnabled = value.timersEnabled;
        if (!value.timersEnabled) for (const group of Object.values(this.record.timers)) group.events = [];
      }
      await this.save(); return response(publicState(this.record));
    }
    if (r.kind && request.method === 'PUT') {
      if (!this.record.subscription) fail(410, 'subscription_gone');
      const value = await body(request);
      const events = checkedEvents(value, r.kind, now);
      const existing = this.record.timers[r.kind];
      if (value.revision <= existing.revision) return response({ ok: true, ignored: true, revision: existing.revision });
      this.record.timers[r.kind] = { revision: value.revision, events: this.record.timersEnabled ? events : [] };
      await this.save(); return response({ ok: true, revision: value.revision, scheduled: this.record.timers[r.kind].events.length });
    }
    if (r.suffix === 'test' && request.method === 'POST') {
      if (!this.record.subscription) fail(410, 'subscription_gone');
      if (now - (this.record.lastTestAt || 0) < 30000) fail(429, 'test_rate_limited');
      this.record.lastTestAt = now; await this.save();
      const status = await this.deliver(payload(this.env, 'test', 'test:' + now, now, now + 60000));
      if (status === 404 || status === 410) fail(410, 'subscription_gone');
      if (status < 200 || status >= 300) fail(502, 'delivery_failed');
      return response({ ok: true });
    }
    fail(405, 'method_not_allowed');
  }
  async deliver(notification) {
    let status;
    try { status = await sendPush(this.record.subscription, notification, this.env, this.env.PUSH_FETCH || fetch); }
    catch { status = 0; }
    this.record.lastDeliveryStatus = status;
    if (status === 404 || status === 410) {
      this.record.subscription = null; this.record.nextReminderAt = null;
      for (const group of Object.values(this.record.timers)) group.events = [];
    }
    await this.save();
    return status;
  }
  async alarm() {
    await this.ready;
    return await this.ctx.blockConcurrencyWhile(async () => {
      if (!this.record?.subscription) return;
      const now = Date.now(), notifications = [];
      if (Number.isFinite(this.record.nextReminderAt) && this.record.nextReminderAt <= now) {
        const at = this.record.nextReminderAt;
        if (now - at <= 900000) notifications.push(payload(this.env, 'training-reminder', 'training:' + at, at, at + 900000));
        this.record.nextReminderAt = nextReminder(this.record.reminder, now);
      }
      for (const [kind, group] of Object.entries(this.record.timers)) {
        const due = group.events.filter((event) => event.at <= now);
        group.events = group.events.filter((event) => event.at > now);
        const latest = due[due.length - 1];
        if (this.record.timersEnabled && latest && now - latest.at <= 60000)
          notifications.push(payload(this.env, latest.type, kind + ':' + group.revision + ':' + latest.id, latest.at, latest.at + 60000));
      }
      // Persist claims before network delivery: alarm retries cannot duplicate a notification.
      await this.save();
      for (const notification of notifications) {
        if (!this.record.subscription) break;
        await this.deliver(notification);
      }
    });
  }
}
