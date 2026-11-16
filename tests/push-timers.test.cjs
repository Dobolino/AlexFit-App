const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot, ready } = require('./helpers.cjs');
const code = fs.readFileSync(path.join(__dirname, '../push-timers.js'), 'utf8');
function fixture() {
  const app = boot();
  ready(app);
  const calls = [];
  let active = true, enabled = true;
  app.window.AF.push = {
    isActive: () => active,
    get timersEnabled() { return enabled; },
    async scheduleTimers(kind, events) { calls.push({ kind, events: JSON.parse(JSON.stringify(events)) }); return { ok: true }; },
  };
  app.run(code);
  return { ...app, calls, setEnabled(value) { enabled = value; app.document.dispatchEvent(new app.window.CustomEvent('af:push-state')); }, setActive(value) { active = value; } };
}
test('rest hints follow +30 seconds, cancellation and do not upload every clock tick', async (t) => {
  const app = fixture(); t.after(app.close);
  await app.flush(); app.calls.length = 0;
  app.run('startRestTimer(90)');
  await app.flush();
  let rest = app.calls.filter((c) => c.kind === 'rest');
  assert.equal(rest.length, 1);
  const first = rest[0].events[0].at;
  app.run('updateRestTimerUI();updateRestTimerUI();'); await app.flush();
  assert.equal(app.calls.filter((c) => c.kind === 'rest').length, 1);
  app.run('restTimerMax += 30;restTimerSec += 30;updateRestTimerUI();'); await app.flush();
  rest = app.calls.filter((c) => c.kind === 'rest');
  assert.equal(rest.at(-1).events[0].at, first + 30000);
  app.run('dismissRestTimer()'); await app.flush();
  assert.deepEqual(app.calls.filter((c) => c.kind === 'rest').at(-1).events, []);
});
test('Cardio schedules every remaining transition so the app need not run in the background', (t) => {
  const app = fixture(); t.after(app.close);
  const now = Date.now();
  const events = app.window.AF.pushTimers.cardioEvents({ status: 'running', mode: 'intervals', round: 1, rounds: 3, phase: 'work', deadlineAt: now + 60000, workSeconds: 60, restSeconds: 30 }, now);
  assert.deepEqual(JSON.parse(JSON.stringify(events.map((e) => [e.at - now, e.type]))), [
    [60000, 'cardio-rest'], [90000, 'cardio-work'], [150000, 'cardio-rest'], [180000, 'cardio-work'], [240000, 'cardio-finish'],
  ]);
  assert.equal(app.window.AF.pushTimers.cardioEvents({ status: 'paused' }, now).length, 0);
  assert.equal(app.window.AF.pushTimers.cardioEvents({ status: 'running', mode: 'free' }, now).length, 0);
});
test('real Cardio controls cancel when paused and rebuild deadlines after resume or skip', async (t) => {
  const app = fixture(); t.after(app.close);
  await app.flush(); app.calls.length = 0;
  const cardio = app.window.AF.cardioSession;
  cardio.start({ type: 'rowing', mode: 'intervals', rounds: 2, workSeconds: 60, restSeconds: 30 });
  await app.flush();
  assert.equal(app.calls.filter((c) => c.kind === 'cardio').at(-1).events.length, 3);
  cardio.pause(); await app.flush();
  assert.deepEqual(app.calls.filter((c) => c.kind === 'cardio').at(-1).events, []);
  cardio.resume(); await app.flush();
  assert.equal(app.calls.filter((c) => c.kind === 'cardio').at(-1).events.length, 3);
  cardio.skip(); await app.flush();
  assert.equal(app.calls.filter((c) => c.kind === 'cardio').at(-1).events[0].type, 'cardio-work');
  cardio.finish(); await app.flush();
  assert.deepEqual(app.calls.filter((c) => c.kind === 'cardio').at(-1).events, []);
});
test('timer hints are opt-in and resynchronise the current state after enabling', async (t) => {
  const app = fixture(); t.after(app.close);
  await app.flush(); app.calls.length = 0;
  app.setEnabled(false);
  app.run('startRestTimer(120)'); await app.flush();
  assert.equal(app.calls.length, 0);
  app.setEnabled(true); await app.flush();
  assert.equal(app.calls.find((c) => c.kind === 'rest').events[0].type, 'rest');
});
test('a new pending deadline cannot hide a quick change back to the last confirmed deadline', async (t) => {
  const app = fixture(); t.after(app.close);
  await app.flush();
  app.run('startRestTimer(90)'); await app.flush();
  const original = app.run('_restTimerStartTS + restTimerMax * 1000');
  const queued = [];
  app.window.AF.push.scheduleTimers = (kind, events) => new Promise((resolve) => { queued.push({ kind, events, resolve }); });
  app.run('restTimerMax += 30; updateRestTimerUI();');
  app.run('restTimerMax -= 30; updateRestTimerUI();');
  assert.equal(queued.length, 2);
  assert.equal(queued[1].events[0].at, original);
  queued.forEach((x) => x.resolve({ ok: true }));
  await app.flush();
});
