const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker(options = {}) {
  const events = {}, shown = [], opened = [], messages = [], focused = [];
  const scope = 'https://dobolino.github.io/AlexFit-App/';
  const windows = options.windows || [];
  for (const window of windows) {
    window.postMessage = (value) => messages.push({ window: window.url, value });
    window.focus = async () => { focused.push(window.url); return window; };
  }
  const clients = {
    matchAll: async () => windows,
    openWindow: async (url) => { opened.push(url); return { url }; },
  };
  const context = {
    self: {
      location: { origin: 'https://dobolino.github.io', href: scope + 'sw.js' },
      registration: {
        scope,
        showNotification(title, value) {
          shown.push({ title, value });
          return options.displayPromise || Promise.resolve();
        },
      },
      addEventListener: (name, fn) => { events[name] = fn; },
    },
    clients, URL, Response, setTimeout, clearTimeout,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), context);
  return {
    shown, opened, messages, focused,
    push(data, malformed = false) {
      let task;
      events.push({
        data: data === undefined ? undefined : { json: () => {
          if (malformed) throw Error('invalid JSON');
          return data;
        } },
        waitUntil(value) { task = value; },
      });
      assert.ok(task && typeof task.then === 'function');
      return task;
    },
    click(data) {
      let task, closed = false;
      events.notificationclick({ notification: { data, close: () => { closed = true; } }, waitUntil: (value) => { task = value; } });
      assert.equal(closed, true);
      return task;
    },
    change() {
      let task;
      events.pushsubscriptionchange({ waitUntil: (value) => { task = value; } });
      return task;
    },
  };
}

test('push always displays a visible notification and waitUntil includes actual display', async () => {
  let resolve;
  const display = new Promise((r) => { resolve = r; });
  const w = worker({ displayPromise: display, windows: [{ url: 'https://dobolino.github.io/AlexFit-App/', visibilityState: 'visible', focused: true }] });
  const task = w.push({ type: 'rest', title: 'AlexFit', body: 'Satzpause vorbei', tag: 'rest', url: '?notification=training' });
  let completed = false;
  task.then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].value.body, 'Satzpause vorbei');
  assert.equal(w.shown[0].value.data.url, 'https://dobolino.github.io/AlexFit-App/?notification=training');
  assert.equal(w.shown[0].value.data.notificationType, 'rest');
  resolve();
  await task;
  assert.equal(completed, true);
});

test('empty, malformed and expired pushes remain visible without repeating a stale alarm', async () => {
  const w = worker();
  await w.push(undefined);
  await w.push({}, true);
  await w.push({ type: 'cardio-work', title: 'Jetzt sprinten!', body: 'Los!', expiresAt: Date.now() - 60000 });
  assert.equal(w.shown.length, 3);
  assert.equal(w.shown[0].title, 'AlexFit');
  assert.match(w.shown[1].value.body, /Trainingshinweis/);
  assert.equal(w.shown[2].title, 'AlexFit');
  assert.match(w.shown[2].value.body, /abgelaufen/);
  assert.doesNotMatch(w.shown[2].value.body, /Los!/);
});

test('payload text is bounded and destination stays in this application scope', async () => {
  for (const url of [
    'https://evil.test/steal', 'https://dobolino.github.io/Other-App/',
    '../Other-App/', 'javascript:alert(1)', '//evil.test/',
    'https://username:password@dobolino.github.io/AlexFit-App/',
    './%2f..%2fOther-App/', './%5c..%5cOther-App/', './%ZZ',
  ]) {
    const w = worker();
    await w.push({ title: 'A'.repeat(1000), body: 'B'.repeat(1000), url, type: 'surprise' });
    const shown = w.shown[0];
    assert.equal(shown.title.length, 80);
    assert.equal(shown.value.body.length, 240);
    assert.equal(shown.value.data.url, 'https://dobolino.github.io/AlexFit-App/', url);
    assert.equal(shown.value.data.notificationType, 'info');
  }
});

test('notification click focuses the existing app and routes without reloading a workout', async () => {
  const w = worker({ windows: [
    { url: 'https://dobolino.github.io/Other-App/' },
    { url: 'https://dobolino.github.io/AlexFit-App/?current=training' },
  ] });
  await w.click({ url: '?notification=cardio', notificationType: 'cardio-rest' });
  assert.deepEqual(w.opened, []);
  assert.deepEqual(w.focused, ['https://dobolino.github.io/AlexFit-App/?current=training']);
  assert.equal(w.messages.length, 1);
  assert.equal(w.messages[0].value.type, 'AF_PUSH_OPEN');
  assert.equal(w.messages[0].value.notificationType, 'cardio-rest');
  assert.equal(w.messages[0].value.url, 'https://dobolino.github.io/AlexFit-App/?notification=cardio');
});

test('closed app opens its validated URL, never an external URL or another GitHub project', async () => {
  const w = worker({ windows: [{ url: 'https://dobolino.github.io/Other-App/' }] });
  await w.click({ url: 'https://evil.test/', notificationType: 'test' });
  assert.deepEqual(w.opened, ['https://dobolino.github.io/AlexFit-App/']);
  assert.equal(w.focused.length, 0);
  await w.click({ url: './?notification=training', notificationType: 'training-reminder' });
  assert.equal(w.opened[1], 'https://dobolino.github.io/AlexFit-App/?notification=training');
});

test('subscription changes reconnect only existing AlexFit windows without exposing subscription keys', async () => {
  const w = worker({ windows: [
    { url: 'https://dobolino.github.io/AlexFit-App/' },
    { url: 'https://dobolino.github.io/Other-App/' },
    { url: 'https://evil.test/' },
  ] });
  await w.change();
  assert.equal(w.messages.length, 1);
  assert.equal(w.messages[0].value.type, 'AF_PUSH_SUBSCRIPTION_CHANGED');
  assert.deepEqual(Object.keys(w.messages[0].value), ['type']);
});
