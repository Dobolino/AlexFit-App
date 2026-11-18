const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers.cjs');
const { normalizeStrength, normalizeCardio, dateInfo, duration } = require('../progress-history.js');

const exercise = (name, extra = {}) => ({ name, weightBasis: 'external', sets: [{ weight: 20, reps: 10 }], ...extra });
const workout = (extra = {}) => ({ id: 'w1', name: 'Oberkörper', date: '2026-11-18', duration: 42, exercises: [exercise('Bankdrücken')], ...extra });
function appTest(fn, stored) { return () => { const a = boot(stored); try { fn(a); assert.deepEqual(a.errors, []); } finally { a.close(); } }; }

test('history uses entered loads, excludes bodyweight/time/assistance/unknown basis and keeps set data', () => {
  const entry = normalizeStrength(workout({ exercises: [
    exercise('Kurzhantelbank', { weightBasis: 'perHand' }),
    exercise('Langhantelbank'),
    exercise('Plank', { bw: true, unit: 'seconds', sets: [{ weight: 0, reps: 45, seconds: 45 }] }),
    exercise('Klimmzüge', { bw: true, sets: [{ weight: 5, reps: 8 }] }),
    exercise('Assisted Dips', { weightBasis: 'external' }),
    exercise('Neue Übung', { weightBasis: undefined })
  ] }), 0, () => ({}));
  assert.equal(entry.volume, 400, 'each entered 20×10 counts once, not double per dumbbell');
  assert.equal(entry.exercises[2].sets[0].value, '45 s');
  assert.equal(entry.exercises[3].sets[0].load, 'Körpergewicht + 5 kg');
  assert.equal(entry.exercises[5].basisLabel, 'Gespeicherte Last · Bezug unbekannt');
});

test('only valid trusted new set records get PR badges; legacy exercise flags do not', () => {
  assert.equal(normalizeStrength(workout({ exercises: [exercise('Bank', { isPR: true, sets: [{ weight: 30, reps: 10, pr: true }] })] })).exercises[0].sets[0].pr, false);
  const entry = normalizeStrength(workout({ prVersion: 1, exercises: [exercise('Bank', { sets: [{ weight: 30, reps: 10, pr: true }, { weight: 100, reps: 0, pr: true }, { weight: 10, seconds: 60, pr: true }] })] }));
  assert.deepEqual(entry.exercises[0].sets.map((s) => s.pr), [true, false, false]);
});

test('planned sets and session status are explicit; old entries do not invent a full workout or clock time', () => {
  const legacy = normalizeStrength(workout());
  assert.equal(legacy.status, 'Gespeichert');
  assert.equal(legacy.planned, null);
  assert.equal(legacy.timeLabel, 'Uhrzeit nicht hinterlegt');
  const partial = normalizeStrength(workout({ status: 'partial', totalSets: 9, durationSeconds: 63, startedAt: '2026-11-18T15:30:00Z' }));
  assert.equal(partial.status, 'Teiltraining');
  assert.equal(partial.planned, 9);
  assert.equal(partial.durationSeconds, 63);
  assert.match(partial.timeLabel, /\d\d:\d\d Uhr/);
  assert.equal(normalizeStrength(workout({ status: 'completed', totalSets: 1 })).status, 'Abgeschlossen');
  assert.equal(duration(3661), '1:01:01');
  assert.equal(duration(null), '—');
  assert.equal(dateInfo({}).dateLabel, 'Datum nicht hinterlegt');
});

test('cardio uses recorded minutes, distance and pulse without fabricated measurements', () => {
  const entry = normalizeCardio({ date: '2026-11-19', type: 'rowing', time: 12.5, meters: 2500, hr: 132 }, 0, { rowing: { label: 'Rudern' } });
  assert.equal(entry.durationSeconds, 750);
  assert.equal(entry.title, 'Rudern');
  assert.equal(entry.metrics.length, 2);
  assert.equal(entry.timeLabel, 'Uhrzeit nicht hinterlegt');
});

test('Progress defaults to empty real history, retains existing body records, tools and archive', appTest((a) => {
  a.run("switchTab('stats')");
  assert.equal(a.run('activeStatsTab'), 'history');
  assert.match(a.document.getElementById('history-list').textContent, /Noch kein Training gespeichert/);
  assert.equal(a.run('weightLog.length'), 1);
  assert.equal(a.document.querySelectorAll('.ph-session').length, 0);
  a.document.getElementById('seg-stats').click();
  assert.equal(a.document.getElementById('stats-content').style.display, 'block');
  assert.ok(a.document.getElementById('progress-photos'));
  assert.ok(a.document.querySelector('#af-stats-tools [data-af-action="checkin"]'));
  a.document.getElementById('seg-archive').click();
  assert.equal(a.run('activeStatsTab'), 'archive');
  assert.match(a.document.getElementById('history-list').textContent, /Noch keine Workouts/);
}, { af_weights: [{ date: '2026-11-17', kg: 99.8 }] }));

test('real old and new strength/cardio entries sort, expand and filter without editing storage', appTest((a) => {
  const before = a.window.localStorage.getItem('af_history');
  a.run("switchTab('stats')");
  const cards = [...a.document.querySelectorAll('.ph-session')];
  assert.equal(cards.length, 3);
  assert.match(cards[0].textContent, /Rudern/);
  assert.match(cards[1].textContent, /Teiltraining/);
  assert.match(cards[1].textContent, /Satz 1/);
  assert.equal(a.document.querySelectorAll('.ph-pr').length, 1);
  cards[1].open = true;
  a.document.querySelector('[data-ph-filter="strength"]').click();
  assert.equal(a.document.querySelectorAll('.ph-session').length, 2);
  assert.equal(a.document.querySelector('.ph-session').open, true);
  const search = a.document.getElementById('ph-search');
  search.focus(); search.value = 'Plank'; search.dispatchEvent(new a.window.Event('input', { bubbles: true }));
  assert.equal(a.document.querySelectorAll('.ph-session').length, 1);
  assert.equal(a.document.activeElement, search);
  assert.match(a.document.getElementById('ph-results').textContent, /45 s/);
  assert.equal(a.window.localStorage.getItem('af_history'), before);
}, {
  af_history: [
    workout({ id: 'old', date: '2026-11-16', exercises: [exercise('Bankdrücken', { isPR: true })] }),
    workout({ id: 'new', date: '2026-11-18', status: 'partial', totalSets: 8, prVersion: 1, exercises: [exercise('Kurzhanteldrücken', { sets: [{ weight: 20, reps: 10, pr: true }] }), exercise('Plank', { bw: true, unit: 'seconds', sets: [{ weight: 0, reps: 45, seconds: 45 }] })] })
  ],
  af_cardio: [{ id: 'row', date: '2026-11-19', type: 'rowing', time: 12, meters: 2400 }]
}));

test('all records remain reachable beyond the first page and imported text stays inert', appTest((a) => {
  a.run("switchTab('stats')");
  assert.equal(a.document.querySelectorAll('.ph-session').length, 30);
  a.document.querySelector('[data-ph-more]').click();
  assert.equal(a.document.querySelectorAll('.ph-session').length, 35);
  assert.equal(a.document.querySelector('#ph-results img'), null);
  assert.match(a.document.getElementById('ph-results').textContent, /<img/);
}, { af_history: Array.from({ length: 35 }, (_, i) => workout({ id: 'page' + i, name: i === 0 ? '<img src=x onerror=alert(1)>' : 'Training ' + i })) }));
