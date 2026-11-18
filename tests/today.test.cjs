const test = require('node:test');
const assert = require('node:assert/strict');
const { boot, ready } = require('./helpers.cjs');

test('Heute prioritises a real ongoing session and distinguishes rest, saved work and additional bike', () => {
  const app = boot();
  try {
    ready(app);
    const action = () => app.document.querySelector('#af-home button');
    const heading = () => app.document.querySelector('#af-home h2').textContent;
    const update = (type, bike = false) => {
      const date = app.run('todayISO()');
      app.window.AF.state.weekPlans = [{ date, slot: 'primary', type }, ...(bike ? [{ date, slot: 'bike', type: 'cycling' }] : [])];
      app.run('renderDashboard()');
    };
    update('rest');
    assert.equal(heading(), 'Ruhetag');
    assert.equal(action().dataset.afAction, 'week');
    update('d1');
    assert.equal(action().dataset.day, 'd1');
    action().click();
    assert.ok(app.run('workoutExercises.length') > 0);
    app.run("switchTab('dashboard')");
    update('rest');
    assert.equal(action().dataset.afAction, 'home-resume');
    action().click();
    assert.ok(app.document.querySelector('#screen-workout-active.active'));
    app.run("workoutExercises=[];activeWorkoutDay=null;clearSession();switchTab('dashboard')");
    app.run("history=[{date:todayISO(),dayId:'d1',status:'partial',name:'Oberkörper',exercises:[]}]");
    update('d1');
    assert.equal(action().dataset.afAction, 'home-start');
    assert.equal(app.document.querySelector('#af-home-week progress').value, 0);
    app.run("history[0].status='completed'");
    update('d1', true);
    assert.equal(action().dataset.afAction, 'cardio');
    assert.equal(app.document.querySelector('#af-home-week progress').value, 1);
    app.run("cardioLog=[{date:todayISO(),type:'cycling',time:10}]");
    update('d1', true);
    assert.equal(action().dataset.afAction, 'history');
    assert.equal(app.document.querySelector('#af-home-week progress').value, 2);
    assert.deepEqual(app.errors, []);
  } finally { app.close(); }
});

test('rest-only schedules preserve an earlier training day without an unbounded streak lookup', () => {
  const app = boot();
  try {
    ready(app);
    assert.equal(app.run(`
      getActivePlan().schedule = {};
      const older = AF.C.addDays(todayISO(), -8);
      AF.state.weekPlans=[];
      PLAN_DOW={}; history=[{date:older,exercises:[]}];cardioLog=[];
      computeStreak()
    `), 1);
  } finally { app.close(); }
});

test('Gym and Home switches expose the correct plan days and remember the active phase', () => {
  const a = boot();
  try {
    ready(a);
    a.run("settings.activePhase='p3';settings.gymSetup=['kurzhantel'];applyActivePlan()");
    a.run('toggleGymMode()');
    assert.equal(a.run('getActivePhaseId()'), 'p1');
    a.run("settings.activePhase='p2';applyActivePlan();renderDashboard();renderWorkoutSelect();renderCalendar()");
    const assertDays = expected => assert.deepEqual(
      [...a.document.querySelectorAll('#quick-launch button')].map(b => b.getAttribute('onclick').match(/'([^']+)'/)[1]),
      expected,
    );
    assertDays(['gd2_1','gd2_2','gd2_3','gd2_4','gd2_5']);
    assert.equal(a.run("homePlanType(AF.C.monday(todayISO()))"), 'gd2_1');
    assert.match(a.document.querySelector('#af-training-guidance').textContent, /Gym Phase 2/);
    a.run('toggleGymMode()');
    assert.equal(a.run('getActivePhaseId()'), 'p3');
    assertDays(Array.from(a.run('WORKOUT_DAYS.map(day => day.id)')));
    a.run('toggleGymMode()');
    assert.equal(a.run('getActivePhaseId()'), 'p2');
    assertDays(['gd2_1','gd2_2','gd2_3','gd2_4','gd2_5']);
    assert.deepEqual(a.errors, []);
  } finally { a.close(); }
});
