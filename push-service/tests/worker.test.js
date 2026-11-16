import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes, createHash } from 'node:crypto';
import webPush from 'web-push';
import worker, { PushDevice, validateSubscription } from '../src/worker.js';

const ID = 'b3e83160-d3b8-4ef3-8544-207a578c0435';
const ORIGIN = 'https://dobolino.github.io';
const TOKEN = randomBytes(32).toString('base64url');
const PAIRING = randomBytes(32).toString('base64url');
const VAPID = webPush.generateVAPIDKeys();
const ec = createECDH('prime256v1'); ec.generateKeys();
const subscription = { endpoint: 'https://web.push.apple.com/test-subscription', keys: {
  p256dh: ec.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url'),
} };
const clone = (value) => value === undefined ? value : structuredClone(value);
function fixture(t) {
  const originalNow = Date.now;
  let now = Date.UTC(2026, 10, 16, 10);
  Date.now = () => now;
  t.after(() => { Date.now = originalNow; });
  const values = new Map(), calls = [];
  let alarm = null, providerStatus = 201;
  const ctx = { blockConcurrencyWhile: (callback) => Promise.resolve().then(callback), storage: {
    async get(key) { return clone(values.get(key)); },
    async put(key, value) { values.set(key, clone(value)); },
    async deleteAll() { values.clear(); },
    async setAlarm(at) { alarm = at; },
    async deleteAlarm() { alarm = null; },
  } };
  const env = { ALLOWED_ORIGIN: ORIGIN, APP_URL: ORIGIN + '/AlexFit-App/',
    VAPID_PUBLIC_KEY: VAPID.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey,
    VAPID_SUBJECT: ORIGIN + '/AlexFit-App/',
    PAIRING_CODE_HASH: createHash('sha256').update(PAIRING).digest('hex'),
    PUSH_FETCH: async (url, options) => { calls.push({ url, options }); return new Response(null, { status: providerStatus }); },
  };
  const device = new PushDevice(ctx, env);
  env.DEVICES = { idFromName: (id) => id, get: (id) => { assert.equal(id, ID); return device; } };
  async function api(method, suffix = '', body, token = TOKEN, origin = ORIGIN) {
    const headers = { Authorization: 'Bearer ' + token };
    if (origin) headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return worker.fetch(new Request('https://push.test/v1/devices/' + ID + suffix, { method, headers,
      ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }), env);
  }
  async function register(extra = {}) {
    return api('PUT', '', { pairingCode: PAIRING, subscription, reminder: { enabled: false }, timersEnabled: true, ...extra });
  }
  return { env, device, calls, values, api, register, get alarm() { return alarm; },
    advance(ms) { now += ms; }, setStatus(status) { providerStatus = status; } };
}

test('config exposes only public VAPID key and CORS rejects unrelated origins', async (t) => {
  const f = fixture(t);
  const result = await worker.fetch(new Request('https://push.test/v1/config', { headers: { Origin: ORIGIN } }), f.env);
  assert.deepEqual(await result.json(), { ready: true, publicKey: VAPID.publicKey });
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const blocked = await f.api('PUT', '', {}, TOKEN, 'https://attacker.example');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await f.api('PUT', '', {}, TOKEN, null)).status, 403);
  const preflight = await worker.fetch(new Request('https://push.test/v1/devices/' + ID, { method: 'OPTIONS', headers: { Origin: ORIGIN } }), f.env);
  assert.equal(preflight.status, 204);
  delete f.env.VAPID_PRIVATE_KEY;
  assert.equal((await worker.fetch(new Request('https://push.test/v1/config'), f.env)).status, 503);
});

test('new registration needs pairing code; later operations need original device token', async (t) => {
  const f = fixture(t);
  assert.equal((await f.register({ pairingCode: 'wrong' })).status, 401);
  assert.equal(f.values.has('device'), false);
  assert.equal((await f.register()).status, 200);
  const stored = f.values.get('device');
  assert.notEqual(stored.tokenHash, TOKEN);
  assert.equal(JSON.stringify(stored).includes(PAIRING), false);
  assert.equal((await f.api('PUT', '', { pairingCode: PAIRING, subscription }, randomBytes(32).toString('base64url'))).status, 401);
  assert.equal((await f.api('GET', '', undefined, randomBytes(32).toString('base64url'))).status, 401);
  const status = await (await f.api('GET')).json();
  assert.equal(status.registered, true);
  assert.equal(status.timersEnabled, true);
});

test('subscription addresses cannot target arbitrary hosts, userinfo, alternate ports, or malformed keys', () => {
  for (const endpoint of ['http://web.push.apple.com/x', 'https://web.push.apple.com.evil.example/x',
    'https://127.0.0.1/x', 'https://user@web.push.apple.com/x', 'https://web.push.apple.com:444/x', 'https://web.push.apple.com/x#fragment'])
    assert.throws(() => validateSubscription({ ...subscription, endpoint }));
  assert.throws(() => validateSubscription({ ...subscription, keys: { ...subscription.keys, auth: 'bad' } }));
  assert.equal(validateSubscription(subscription).endpoint, subscription.endpoint);
  assert.equal(validateSubscription({ ...subscription, endpoint: 'https://fcm.googleapis.com/fcm/send/test' }).keys.auth, subscription.keys.auth);
});

test('body limits and malformed requests fail without changing persisted preferences', async (t) => {
  const f = fixture(t);
  await f.register();
  const before = clone(f.values.get('device'));
  assert.equal((await f.api('PATCH', '/schedule', 'x'.repeat(17000))).status, 413);
  assert.equal((await f.api('PATCH', '/schedule', '{broken')).status, 400);
  assert.equal((await f.api('PATCH', '/schedule', { reminder: { enabled: false }, timersEnabled: 'yes' })).status, 400);
  assert.deepEqual(f.values.get('device'), before);
  assert.deepEqual((await (await f.api('GET')).json()).reminder, before.reminder);
});

test('monotonic timer revisions prevent a late request from resurrecting a cancelled pause', async (t) => {
  const f = fixture(t); await f.register();
  const at = Date.now() + 90000;
  assert.equal((await f.api('PUT', '/timers/rest', { revision: Date.now() * 1000, events: [{ id: 's1', at, type: 'rest' }] })).status, 200);
  assert.equal(f.alarm, at);
  const newer = Date.now() * 1000 + 1;
  await f.api('PUT', '/timers/rest', { revision: newer, events: [] });
  const stale = await (await f.api('PUT', '/timers/rest', { revision: newer - 1, events: [{ id: 's1', at, type: 'rest' }] })).json();
  assert.equal(stale.ignored, true);
  assert.equal(f.alarm, null);
  f.advance(90000); await f.device.alarm();
  assert.equal(f.calls.length, 0);
});

test('alarm sends encrypted Web Push once; retries cannot repeat a claimed timer', async (t) => {
  const f = fixture(t); await f.register();
  await f.api('PUT', '/timers/rest', { revision: 1, events: [{ id: 's1', at: Date.now() + 90000, type: 'rest' }] });
  f.advance(90000); await f.device.alarm(); await f.device.alarm();
  assert.equal(f.calls.length, 1);
  const sent = f.calls[0];
  assert.equal(sent.url, subscription.endpoint);
  assert.equal(sent.options.redirect, 'error');
  assert.equal(sent.options.headers['Content-Encoding'], 'aes128gcm');
  assert.match(sent.options.headers.Authorization, /^vapid /);
  assert.ok(Buffer.isBuffer(sent.options.body));
  assert.equal(sent.options.body.includes(Buffer.from('Deine Satzpause')), false);
  assert.equal(f.alarm, null);
});

test('late intervals collapse to current phase, expired timers drop, and disabling cancels pending jobs', async (t) => {
  const f = fixture(t); await f.register();
  await f.api('PUT', '/timers/cardio', { revision: 1, events: [
    { id: '1', at: Date.now() + 1000, type: 'cardio-rest' }, { id: '2', at: Date.now() + 2000, type: 'cardio-work' },
  ] });
  f.advance(3000); await f.device.alarm();
  assert.equal(f.calls.length, 1);
  await f.api('PUT', '/timers/rest', { revision: 1, events: [{ id: 'late', at: Date.now() + 1000, type: 'rest' }] });
  f.advance(62000); await f.device.alarm();
  assert.equal(f.calls.length, 1);
  await f.api('PUT', '/timers/rest', { revision: 2, events: [{ id: 'next', at: Date.now() + 90000, type: 'rest' }] });
  await f.api('PATCH', '/schedule', { timersEnabled: false });
  assert.equal(f.alarm, null);
  assert.deepEqual(f.values.get('device').timers.rest.events, []);
});

test('training reminder runs once and advances, while gone subscriptions stop all delivery', async (t) => {
  const f = fixture(t);
  await f.register({ reminder: { enabled: true, time: '10:01', timeZone: 'UTC', days: [1] } });
  f.advance(60000); await f.device.alarm(); await f.device.alarm();
  assert.equal(f.calls.length, 1);
  assert.equal(f.values.get('device').nextReminderAt, Date.UTC(2026, 10, 23, 10, 1));
  f.setStatus(410);
  const expired = await f.api('POST', '/test');
  assert.equal(expired.status, 410);
  assert.equal((await (await f.api('GET')).json()).registered, false);
  assert.equal(f.alarm, null);
  assert.equal((await f.api('PUT', '/timers/rest', { revision: 2, events: [] })).status, 410);
});

test('test notifications are throttled and unsubscribe erases server state', async (t) => {
  const f = fixture(t); await f.register();
  assert.equal((await f.api('POST', '/test')).status, 200);
  assert.equal((await f.api('POST', '/test')).status, 429);
  assert.equal(f.calls.length, 1);
  assert.equal((await f.api('DELETE')).status, 200);
  assert.equal(f.values.size, 0);
  assert.equal(f.alarm, null);
  assert.equal((await f.api('GET')).status, 404);
});
