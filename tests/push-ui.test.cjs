const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../push-ui.js'), 'utf8');
const publicKey = Buffer.from([4, ...Array(64).fill(1)]).toString('base64url');
const uuid = '4b7831aa-d4ba-4994-a3b3-7d2670fb30c1';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fixture(options = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><section id="screen-settings"><div class="slabel">Benachrichtigungen</div><div class="card"><p id="notif-status"></p><button id="notif-enable-btn">Aktivieren</button><input id="s-reminder-time" type="time"></div></section></body></html>', { url: options.url || 'https://dobolino.github.io/AlexFit-App/', runScripts: 'outside-only' });
  const w = dom.window, calls = [], messages = {}, navigation = [], emitted = [];
  let permission = options.permission || 'default';
  let subscription = options.subscription || null;
  let legacyReminders = 0;
  const record = { requests: [], unsubscribed: 0, permissionRequests: 0, scheduledEvents: [] };
  w.AF = { esc: (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') };
  w.AlexFitPushConfig = { serviceUrl: options.configured === false ? '' : 'https://push.example.test' };
  Object.defineProperty(w, 'isSecureContext', { value: true });
  Object.defineProperty(w.crypto, 'randomUUID', { value: () => uuid });
  Object.defineProperty(w.navigator, 'userAgent', { value: options.ios ? 'iPhone' : 'Firefox Desktop' });
  w.matchMedia = () => ({ matches: options.installed === true });
  w.Notification = class {
    static get permission() { return permission; }
    static requestPermission() { calls.push('permission'); record.permissionRequests++; permission = options.consent || 'granted'; return Promise.resolve(permission); }
  };
  w.PushManager = class {};
  const subscribe = () => {
    subscription = {
      endpoint: 'https://web.push.apple.com/test-device',
      options: {},
      toJSON() { return { endpoint: this.endpoint, keys: { p256dh: publicKey, auth: Buffer.alloc(16).toString('base64url') } }; },
      async unsubscribe() { record.unsubscribed++; if (options.unsubscribeFailure) throw Error('offline'); subscription = null; return true; },
    };
    // Preserve precisely the public-key bytes; Buffer's shared pool is larger.
    const bytes = Buffer.from(publicKey, 'base64url');
    subscription.options.applicationServerKey = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return subscription;
  };
  const registration = { pushManager: {
    async getSubscription() { calls.push('getSubscription'); return subscription; },
    async subscribe(value) { calls.push('subscribe'); record.subscriptionOptions = value; return subscribe(); },
  } };
  Object.defineProperty(w.navigator, 'serviceWorker', { configurable: true, value: {
    get ready() { calls.push('ready'); return Promise.resolve(registration); },
    addEventListener(name, handler) { messages[name] = handler; },
  } });
  if (options.unsupported) delete w.PushManager;
  w.renderSettings = () => {};
  w.scheduleTrainingReminder = () => { legacyReminders++; };
  w.switchTab = (target) => navigation.push(target);
  w.document.addEventListener('af:push-state', (event) => emitted.push(event.detail));
  const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  let failNetwork = false;
  w.fetch = async (url, init) => {
    const pathname = new URL(url).pathname;
    calls.push('fetch:' + pathname);
    const body = init.body ? JSON.parse(init.body) : undefined;
    const request = { path: pathname, method: init.method, headers: init.headers, body };
    record.requests.push(request);
    if (failNetwork) throw new TypeError('offline');
    if (options.fetch) {
      const result = await options.fetch(request, response);
      if (result) return result;
    }
    if (pathname === '/v1/config') return response(200, { ready: true, publicKey });
    if (options.registrationFailure && init.method === 'PUT' && !pathname.includes('/timers/')) return response(401, { error: 'auth' });
    if (init.method === 'GET') return response(200, { ok: true, registered: true, reminder: { enabled: true, time: '18:00', timeZone: 'Europe/Zurich', days: [1] }, timersEnabled: false });
    return response(200, { ok: true, revision: body?.revision });
  };
  if (options.stored) w.localStorage.setItem('af_push', JSON.stringify(options.stored));
  w.eval(source);
  return { w, push: w.AF.push, calls, record, navigation, emitted, messages,
    setPermission(value) { permission = value; },
    setOffline(value) { failNetwork = value; },
    makeSubscription: subscribe,
    legacyReminders: () => legacyReminders,
    close: () => w.close() };
}

test('iPhone Safari, unsupported browsers and unconfigured service never request permission or claim activation', async (t) => {
  for (const options of [{ ios: true }, { unsupported: true }, { configured: false }]) {
    const app = fixture(options); t.after(app.close);
    assert.equal(await app.push.enable('code'), false);
    assert.equal(app.record.permissionRequests, 0);
    assert.equal(app.record.requests.length, 0);
    assert.equal(app.push.isActive(), false);
    assert.equal(app.w.document.getElementById('af-push-enable').disabled, true);
    assert.ok(app.w.document.getElementById('af-push-status').textContent.length > 30);
  }
});

test('permission is requested before any await and activation follows real browser subscription and server registration', async (t) => {
  const app = fixture({ ios: true, installed: true }); t.after(app.close);
  const task = app.push.enable('my-pairing-code');
  assert.equal(app.calls[0], 'permission');
  assert.equal(app.push.isActive(), false);
  assert.equal(await task, true);
  assert.equal(app.push.isActive(), true);
  assert.equal(app.record.subscriptionOptions.userVisibleOnly, true);
  assert.equal(app.record.subscriptionOptions.applicationServerKey.byteLength, 65);
  const registration = app.record.requests.find((request) => request.method === 'PUT');
  assert.equal(registration.path, '/v1/devices/' + uuid);
  assert.equal(registration.body.pairingCode, 'my-pairing-code');
  assert.ok(registration.headers.Authorization.startsWith('Bearer '));
  assert.equal(registration.body.subscription.endpoint, 'https://web.push.apple.com/test-device');
  assert.equal(app.w.localStorage.getItem('af_push').includes('my-pairing-code'), false);
  assert.equal('token' in app.push.getState(), false);
  assert.ok(app.emitted.some((state) => state.active));
});

test('a rejected registration unsubscribes its new subscription and leaves an honest inactive status', async (t) => {
  const app = fixture({ registrationFailure: true }); t.after(app.close);
  assert.equal(await app.push.enable('wrong-code'), false);
  assert.equal(app.record.unsubscribed, 1);
  assert.equal(app.push.isActive(), false);
  assert.equal(app.push.getState().registered, false);
  assert.match(app.push.getState().status, /nicht bestätigt/);
  assert.equal(app.w.localStorage.getItem('af_push').includes('wrong-code'), false);
});

test('declined consent creates neither a subscription nor a server registration', async (t) => {
  const app = fixture({ consent: 'denied' }); t.after(app.close);
  assert.equal(await app.push.enable('code'), false);
  assert.equal(app.record.requests.length, 0);
  assert.equal(app.calls.includes('subscribe'), false);
  assert.equal(app.push.isActive(), false);
  assert.match(app.push.getState().status, /blockiert/);
});

test('timer preference becomes effective only after server acknowledgement', async (t) => {
  let finish;
  const app = fixture({ fetch(request, response) {
    if (request.method === 'PATCH') return new Promise((resolve) => { finish = () => resolve(response(200, { ok: true })); });
  } });
  t.after(app.close);
  await app.push.enable('code');
  const before = app.emitted.length;
  const task = app.push.syncSchedule({ timersEnabled: true });
  assert.equal(app.push.timersEnabled, false);
  assert.equal(app.push.getState().pendingSchedule, true);
  await tick();
  finish(); await task;
  assert.equal(app.push.timersEnabled, true);
  assert.equal(app.push.getState().pendingSchedule, false);
  assert.ok(app.emitted.length > before);
});

test('successive preference edits are serialized and only the newest acknowledgement clears pending state', async (t) => {
  const completions = [];
  const app = fixture({ fetch(request, response) {
    if (request.method === 'PATCH') return new Promise((resolve) => completions.push(() => resolve(response(200, { ok: true }))));
  } });
  t.after(app.close);
  await app.push.enable('code');
  const first = app.push.syncSchedule({ reminder: { time: '19:00' } });
  await tick();
  const second = app.push.syncSchedule({ reminder: { time: '20:00' } });
  assert.equal(completions.length, 1);
  completions[0](); await first; await tick();
  assert.equal(app.push.getState().pendingSchedule, true);
  assert.equal(completions.length, 2);
  completions[1](); await second;
  assert.equal(app.push.getState().pendingSchedule, false);
  assert.equal(app.push.getState().reminder.time, '20:00');
  assert.deepEqual(app.record.requests.filter((r) => r.method === 'PATCH').map((r) => r.body.reminder.time), ['19:00', '20:00']);
});

test('an expired push endpoint is visibly disconnected and explicit reconnect creates a fresh subscription', async (t) => {
  let expired = false;
  const app = fixture({ fetch(request, response) {
    if (expired && request.path.endsWith('/test')) return response(410, { error: 'gone' });
  } });
  t.after(app.close);
  await app.push.enable('code');
  expired = true;
  assert.equal(await app.push.test(), false);
  assert.equal(app.push.isActive(), false);
  assert.match(app.push.getState().status, /abgelaufen/);
  assert.equal(app.w.document.querySelector('.af-push-connect').hidden, false);
  assert.equal(await app.push.enable('code'), true);
  assert.equal(app.record.unsubscribed, 1);
  assert.equal(app.calls.filter((v) => v === 'subscribe').length, 2);
});

test('a cancellation is sent after an in-flight timer with a greater revision and ACKs do not create event loops', async (t) => {
  let finish;
  let first = true;
  const app = fixture({ fetch(request, response) {
    if (request.path.endsWith('/timers/rest') && first) {
      first = false;
      return new Promise((resolve) => { finish = () => resolve(response(200, { ok: true, revision: request.body.revision })); });
    }
  } });
  t.after(app.close);
  await app.push.enable('code');
  await app.push.syncSchedule({ timersEnabled: true });
  const emittedBefore = app.emitted.length;
  const alarm = app.push.scheduleTimers('rest', [{ id: 'r1', at: Date.now() + 90000, type: 'rest' }]);
  await tick();
  assert.equal(typeof finish, 'function');
  const cancel = app.push.scheduleTimers('rest', []);
  assert.equal(app.record.requests.filter((r) => r.path.endsWith('/timers/rest')).length, 1);
  finish(); await alarm; await cancel;
  const timers = app.record.requests.filter((r) => r.path.endsWith('/timers/rest'));
  assert.equal(timers.length, 2);
  assert.ok(timers[1].body.revision > timers[0].body.revision);
  assert.equal(timers[1].body.events.length, 0);
  assert.equal(app.push.getState().pendingTimers, 0);
  assert.equal(app.emitted.length, emittedBefore);
});

test('offline cancellation persists and is retried after reconnecting', async (t) => {
  const app = fixture(); t.after(app.close);
  await app.push.enable('code');
  await app.push.syncSchedule({ timersEnabled: true });
  app.setOffline(true);
  const result = await app.push.scheduleTimers('rest', []);
  assert.equal(result.ok, false);
  assert.equal(app.push.getState().pendingTimers, 1);
  assert.match(app.push.getState().status, /Verbindung|übertragen/);
  app.setOffline(false);
  await app.push.refreshConnection();
  const calls = app.record.requests.filter((r) => r.path.endsWith('/timers/rest'));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.events.length, 0);
  assert.ok(calls[1].body.revision > calls[0].body.revision);
  assert.equal(app.push.getState().pendingTimers, 0);
});

test('failed disable is visibly pending and permission revocation deletes the server schedule', async (t) => {
  const app = fixture(); t.after(app.close);
  await app.push.enable('code');
  app.setOffline(true);
  assert.equal(await app.push.disable(), false);
  assert.equal(app.push.isActive(), false);
  assert.equal(app.push.getState().pendingDelete, true);
  assert.match(app.push.getState().status, /Deaktivierung/);
  app.setOffline(false);
  await app.push.refreshConnection();
  assert.equal(app.push.getState().registered, false);
  assert.equal(app.push.getState().pendingDelete, false);

  await app.push.enable('code');
  app.setPermission('denied');
  await app.push.refreshConnection();
  assert.equal(app.push.isActive(), false);
  assert.equal(app.push.getState().registered, false);
  assert.equal(app.record.requests.filter((r) => r.method === 'DELETE').length, 3);
});

test('legacy JS reminders are suppressed and service-worker messages route without reload or automatic consent', async (t) => {
  const app = fixture(); t.after(app.close);
  app.w.scheduleTrainingReminder();
  assert.equal(app.legacyReminders(), 0);
  app.messages.message({ data: { type: 'AF_PUSH_OPEN', notificationType: 'cardio-work' } });
  app.messages.message({ data: { type: 'AF_PUSH_OPEN', notificationType: 'rest' } });
  assert.deepEqual(app.navigation, ['cardio', 'workout']);
  app.messages.message({ data: { type: 'AF_PUSH_SUBSCRIPTION_CHANGED' } });
  assert.equal(app.record.permissionRequests, 0);
  assert.match(app.push.getState().status, /geändert/);
  assert.equal(app.w.document.querySelector('.card').classList.contains('af-push-legacy'), true);
});

test('a cold notification launch opens the requested tab without starting a session or dropping unrelated URL state', async (t) => {
  const app = fixture({ url: 'https://dobolino.github.io/AlexFit-App/?from=home&push=cardio#today' });
  t.after(app.close);
  await tick();
  assert.deepEqual(app.navigation, ['cardio']);
  assert.equal(app.w.location.search, '?from=home');
  assert.equal(app.w.location.hash, '#today');
  assert.equal(app.record.permissionRequests, 0);
});

test('a newer server timer revision retries the latest desired state once and persists the successful revision', async (t) => {
  let firstRevision;
  const app = fixture({ fetch(request, response) {
    if (request.path.endsWith('/timers/rest') && firstRevision === undefined) {
      firstRevision = request.body.revision;
      return response(200, { ok: true, ignored: true, revision: firstRevision + 500 });
    }
  } });
  t.after(app.close);
  await app.push.enable('code');
  await app.push.syncSchedule({ timersEnabled: true });
  assert.equal((await app.push.scheduleTimers('rest', [])).ok, true);
  const requests = app.record.requests.filter((r) => r.path.endsWith('/timers/rest'));
  assert.equal(requests.length, 2);
  assert.ok(requests[1].body.revision > firstRevision + 500);
  assert.equal(requests[1].body.events.length, 0);
  assert.equal(app.push.getState().pendingTimers, 0);
  assert.equal(JSON.parse(app.w.localStorage.getItem('af_push')).revisions.rest, requests[1].body.revision);
});
