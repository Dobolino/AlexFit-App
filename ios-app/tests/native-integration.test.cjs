const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../src/native-core.js'), 'utf8');
const core = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

async function fixture(options = {}) {
  const { setupNativeIntegration } = await core;
  const dom = new JSDOM('<!doctype html><head></head><body><div id="install-banner">PWA</div><div id="screen-settings"><p id="notif-status"></p><button id="notif-enable-btn"></button><input id="s-reminder-time" type="time"><button onclick="saveReminderTime()">Erinnerung</button><input id="import" type="file"><button data-af-action="tools-update">Updates</button><p id="tools-update-status"></p></div></body>', { url: 'capacitor://localhost/' });
  const w = dom.window;
  const events = { writes: [], shares: [], clicks: 0, revokes: [], marks: 0, toasts: [], actions: [], impacts: [], feedback: [] };
  let urlCount = 0;
  w.URL.createObjectURL = () => 'blob:capacitor://localhost/test-' + (++urlCount);
  w.URL.revokeObjectURL = (url) => events.revokes.push(url);
  w.HTMLAnchorElement.prototype.click = () => { events.clicks++; };
  w.showToast = (message) => events.toasts.push(message);
  w.exportJSON = () => { throw new Error('Legacy backup must not run'); };
  w.collectBackupPayload = () => ({ title: 'Übung & Erholung', values: [11.5, 15] });
  w.todayISO = () => '2026-11-16';
  w.markBackupDone = () => events.marks++;
  w.renderSettings = () => { w.document.getElementById('notif-status').textContent = '(Browser nicht unterstützt)'; };
  w.AF = { handleAction: (action) => events.actions.push(action) };
  const Filesystem = {
    async writeFile(value) {
      events.writes.push(value);
      if (options.writeFailure) throw new Error('disk full');
      return { uri: 'file:///cache/' + value.path };
    },
  };
  const Share = {
    async share(value) {
      events.shares.push(value);
      return options.share ? options.share(value) : { activityType: 'com.apple.UIKit.activity.SaveToFiles' };
    },
  };
  const deps = {
    Capacitor: { isNativePlatform: () => options.native !== false },
    Filesystem, Directory: { Cache: 'CACHE' }, Share,
    Haptics: {
      async impact(value) { events.impacts.push(value); },
      async notification(value) { events.feedback.push(value); },
    },
    ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM' },
    NotificationType: { Success: 'SUCCESS' },
    version: '1.0.0',
  };
  const originalClick = w.HTMLAnchorElement.prototype.click;
  const originalCreate = w.URL.createObjectURL;
  const state = setupNativeIntegration(deps, w);
  return { w, state, deps, events, originalClick, originalCreate, close: () => w.close() };
}

test('normal website is untouched and native installation is idempotent', async (t) => {
  const web = await fixture({ native: false });
  t.after(web.close);
  assert.equal(web.state, null);
  assert.equal(web.w.AFNative, undefined);
  assert.equal(web.w.HTMLAnchorElement.prototype.click, web.originalClick);
  assert.equal(web.w.URL.createObjectURL, web.originalCreate);
  assert.equal(web.w.document.documentElement.dataset.native, undefined);

  const native = await fixture();
  t.after(native.close);
  const hook = native.w.HTMLAnchorElement.prototype.click;
  const { setupNativeIntegration } = await core;
  setupNativeIntegration(native.deps, native.w);
  assert.equal(native.w.HTMLAnchorElement.prototype.click, hook);
  assert.equal(native.w.document.querySelectorAll('#af-native-version').length, 1);
});

test('download keeps UTF-8 data after immediate URL revocation and preserves ordinary links', async (t) => {
  const app = await fixture();
  t.after(app.close);
  const { w, state, events } = app;
  const blob = new w.Blob(['Übung,11.5,15\n'], { type: 'text/csv' });
  const url = w.URL.createObjectURL(blob);
  const anchor = w.document.createElement('a');
  anchor.href = url;
  anchor.download = '../../AlexFit:Export.csv';
  anchor.click();
  w.URL.revokeObjectURL(url);
  const result = await state.lastDownload;
  assert.equal(result.shared, true);
  assert.equal(events.writes.length, 1);
  assert.equal(Buffer.from(events.writes[0].data, 'base64').toString('utf8'), 'Übung,11.5,15\n');
  assert.match(events.writes[0].path, /^exports\/\d+-\d+-AlexFit_Export\.csv$/);
  assert.equal(events.writes[0].directory, 'CACHE');
  assert.equal(events.shares[0].url, 'file:///cache/' + events.writes[0].path);
  assert.deepEqual(events.revokes, [url]);
  assert.equal(events.clicks, 0);
  const ordinary = w.document.createElement('a');
  ordinary.href = 'https://youtube.com/';
  ordinary.click();
  assert.equal(events.clicks, 1);
});

test('a second export cannot replace the already open share sheet', async (t) => {
  let resolveShare;
  const opened = new Promise((resolve) => { resolveShare = resolve; });
  const app = await fixture({ share: () => opened });
  t.after(app.close);
  const blob = new app.w.Blob(['test']);
  const first = app.state.shareBlob(blob, 'one.json');
  const second = await app.state.shareBlob(blob, 'two.json');
  assert.equal(second.reason, 'busy');
  resolveShare({ activityType: 'com.apple.UIKit.activity.SaveToFiles' });
  assert.equal((await first).shared, true);
  assert.equal(app.events.writes.length, 1);
  assert.equal(app.events.shares.length, 1);
});

test('JSON backup is marked only after a completed share, never after cancellation', async (t) => {
  const cancelled = await fixture({ share: async () => { throw new Error('Share canceled'); } });
  t.after(cancelled.close);
  assert.equal((await cancelled.w.exportJSON()).reason, 'cancelled');
  assert.equal(cancelled.events.marks, 0);
  assert.ok(cancelled.events.toasts.includes('Export abgebrochen.'));

  let complete;
  const app = await fixture({ share: () => new Promise((resolve) => { complete = resolve; }) });
  t.after(app.close);
  const task = app.w.exportJSON();
  assert.equal(app.events.marks, 0);
  for (let i = 0; i < 30 && !complete; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(typeof complete, 'function');
  assert.equal(app.events.marks, 0);
  complete({ activityType: 'com.apple.UIKit.activity.SaveToFiles' });
  assert.equal((await task).shared, true);
  assert.equal(app.events.marks, 1);
  assert.deepEqual(JSON.parse(Buffer.from(app.events.writes[0].data, 'base64').toString('utf8')), {
    title: 'Übung & Erholung', values: [11.5, 15],
  });
});

test('a completed iOS activity with no activity name still counts as an exported backup', async (t) => {
  const app = await fixture({ share: async () => ({ activityType: '' }) });
  t.after(app.close);
  assert.equal((await app.w.exportJSON()).shared, true);
  assert.equal(app.events.marks, 1);
});

test('a failed file export reports failure without marking a backup or leaving the share lock set', async (t) => {
  const app = await fixture({ writeFailure: true });
  t.after(app.close);
  assert.equal((await app.w.exportJSON()).reason, 'error');
  assert.equal(app.events.marks, 0);
  assert.equal(app.events.shares.length, 0);
  assert.ok(app.events.toasts.includes('Export nicht möglich. Bitte erneut versuchen.'));
  app.deps.Filesystem.writeFile = async () => ({ uri: 'file:///cache/retry.json' });
  assert.equal((await app.w.exportJSON()).shared, true);
  assert.equal(app.events.marks, 1);
});

test('native settings explain IPA updates and unavailable reminders, while file import stays available', async (t) => {
  const app = await fixture();
  t.after(app.close);
  app.w.renderSettings();
  const doc = app.w.document;
  assert.match(doc.getElementById('notif-status').textContent, /keine Erinnerungen oder Hintergrundalarme/);
  assert.equal(doc.getElementById('notif-enable-btn').disabled, true);
  assert.equal(doc.getElementById('s-reminder-time').disabled, true);
  assert.equal(doc.getElementById('import').disabled, false);
  assert.match(doc.getElementById('tools-update-status').textContent, /neue IPA/);
  assert.match(doc.getElementById('af-native-version').textContent, /Safari-Daten/);
  app.w.AF.handleAction('tools-update');
  app.w.AF.handleAction('home');
  assert.deepEqual(app.events.actions, ['home']);
  assert.equal(doc.querySelectorAll('#af-native-version').length, 1);
  assert.equal(app.w.getNotificationStatus().supported, false);
});

test('set feedback uses native haptics without requesting any notification permission', async (t) => {
  const app = await fixture();
  t.after(app.close);
  app.w.haptic('medium');
  app.w.haptic('done');
  assert.deepEqual(app.events.impacts, [{ style: 'MEDIUM' }]);
  assert.deepEqual(app.events.feedback, [{ type: 'SUCCESS' }]);
});
