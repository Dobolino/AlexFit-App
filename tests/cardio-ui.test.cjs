const test = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./helpers.cjs");

function setup(stored) {
  const app = boot(stored);
  let now = 100000;
  const api = app.window.AF.cardioSession;
  api.setClock(() => now);
  return {
    ...app,
    api,
    advance(ms) {
      now += ms;
      return api.tick();
    },
  };
}

test("cardio consumes elapsed timestamps across delayed ticks and ends exactly at the plan boundary", () => {
  const app = setup();
  try {
    app.api.start({
      type: "rowing",
      mode: "intervals",
      rounds: 3,
      workSeconds: 60,
      restSeconds: 30,
    });
    const state = app.advance(155000);
    assert.equal(state.status, "running");
    assert.equal(state.phase, "rest");
    assert.equal(state.round, 2);
    assert.equal(state.completedRounds, 2);
    assert.equal(state.remainingMs, 25000);
    assert.equal(state.elapsedMs, 155000);
    const done = app.advance(1000000);
    assert.equal(done.status, "finished");
    assert.equal(done.elapsedMs, 240000);
    assert.equal(done.completedRounds, 3);
    assert.equal(done.complete, true);
    assert.equal(
      JSON.parse(app.window.localStorage.getItem("af_cardio") || "[]").length,
      0,
    );
    assert.match(
      app.document.getElementById("af-cardio-live").textContent,
      /Aktivität speichern/,
    );
    assert.deepEqual(app.errors, []);
  } finally {
    app.close();
  }
});

test("pausing excludes interruption time while interval recovery counts as training time", () => {
  const app = setup();
  try {
    app.api.start({
      type: "walking",
      mode: "intervals",
      rounds: 2,
      workSeconds: 60,
      restSeconds: 30,
    });
    app.advance(20000);
    const paused = app.api.pause();
    assert.equal(paused.remainingMs, 40000);
    app.advance(900000);
    assert.equal(app.api.getState().elapsedMs, 20000);
    app.api.resume();
    const rest = app.advance(50000);
    assert.equal(rest.elapsedMs, 70000);
    assert.equal(rest.phase, "rest");
    assert.equal(rest.remainingMs, 20000);
    app.api.finish();
    const entry = app.api.save({ note: "Walkingpad", intensity: "easy" });
    assert.equal(entry.time, 70000 / 60000);
    assert.equal(entry.note, "Walkingpad");
    assert.equal(entry.intensity, "easy");
    assert.equal(entry.type, "walking");
    assert.equal(entry.kcal, undefined);
    assert.equal(entry.hr, undefined);
    assert.equal(entry.dist, undefined);
  } finally {
    app.close();
  }
});

test("skipping phases never credits skipped seconds or complete intervals", () => {
  const app = setup();
  try {
    app.api.start({
      type: "rowing",
      mode: "intervals",
      rounds: 2,
      workSeconds: 60,
      restSeconds: 30,
    });
    app.advance(12000);
    let state = app.api.skip();
    assert.equal(state.phase, "rest");
    assert.equal(state.elapsedMs, 12000);
    assert.equal(state.remainingMs, 30000);
    assert.equal(state.completedRounds, 0);
    app.api.pause();
    state = app.api.skip();
    assert.equal(state.status, "paused");
    assert.equal(state.phase, "work");
    assert.equal(state.round, 2);
    app.api.resume();
    state = app.advance(60000);
    assert.equal(state.status, "finished");
    assert.equal(state.complete, false);
    assert.equal(state.elapsedMs, 72000);
    assert.equal(state.completedRounds, 1);
    assert.equal(state.skippedPhases, 2);
  } finally {
    app.close();
  }
});

test("a running session restores paused and saves once even across a reload", () => {
  const app = setup({
    af_cardio: [
      { id: "older", date: "2020-01-01", type: "walking", time: 10 },
      { id: "future", date: "2099-01-01", type: "walking", time: 10 },
    ],
  });
  let restored, again;
  try {
    app.api.start({
      type: "rowing",
      mode: "intervals",
      rounds: 8,
      workSeconds: 60,
      restSeconds: 60,
    });
    app.advance(15000);
    const saved = app.window.localStorage.getItem("af_cardio_session");
    restored = setup({
      af_cardio_session: saved,
      af_cardio: app.window.localStorage.getItem("af_cardio"),
    });
    assert.equal(restored.api.getState().status, "paused");
    assert.equal(restored.api.getState().elapsedMs, 15000);
    assert.equal(restored.api.getState().remainingMs, 45000);
    assert.equal(restored.api.getState().restored, true);
    restored.advance(500000);
    assert.equal(restored.api.getState().elapsedMs, 15000);
    restored.api.resume();
    restored.advance(5000);
    restored.api.finish();
    const first = restored.api.save();
    restored.api.save();
    let entries = JSON.parse(restored.window.localStorage.getItem("af_cardio"));
    assert.equal(entries.length, 3);
    assert.equal(entries[1].id, first.id);
    assert.equal(entries[1].time, 20000 / 60000);
    again = setup({
      af_cardio_session:
        restored.window.localStorage.getItem("af_cardio_session"),
      af_cardio: entries,
    });
    again.api.save();
    assert.equal(
      JSON.parse(again.window.localStorage.getItem("af_cardio")).length,
      3,
    );
  } finally {
    app.close();
    restored?.close();
    again?.close();
  }
});

test("free training, configurable rounds, and manual archive coexist without changing strength state", () => {
  const app = setup();
  try {
    const strengthInterval = { ei: 2, marker: "strength remains independent" };
    app.window.AF.interval = strengthInterval;
    assert.throws(() => app.api.start({ rounds: 0 }), /Intervalle/);
    assert.throws(() => app.api.start({ workSeconds: 0 }), /Belastung/);
    app.api.start({ type: "walking", mode: "free" });
    app.advance(31000);
    app.run("renderCardio()");
    assert.equal(app.api.getState().elapsedMs, 31000);
    assert.equal(app.api.getState().status, "running");
    assert.equal(app.window.AF.interval, strengthInterval);
    assert.equal(app.document.getElementById("af-cardio-manual").open, false);
    for (const id of [
      "cardio-fields",
      "cardio-date",
      "cardio-calc",
      "cardio-type-row",
      "cardio-log",
      "cardio-chart-wrap",
      "cardio-save-btn",
    ])
      assert.ok(app.document.querySelector("#af-cardio-manual #" + id), id);
    app.api.pause();
    app.advance(5000);
    app.api.resume();
    app.advance(19000);
    app.api.finish();
    assert.equal(app.api.getState().elapsedMs, 50000);
    app.api.save();
    assert.equal(app.window.AF.interval, strengthInterval);
    app.api.reset();
    assert.ok(app.document.getElementById("af-cardio-start-form"));
    assert.deepEqual(app.errors, []);
  } finally {
    app.close();
  }
});

test("the start form accepts custom intervals and optional summary notes through actual UI events", () => {
  const app = setup();
  try {
    app.set("af-cardio-work", "45");
    app.set("af-cardio-rest", "15");
    app.set("af-cardio-rounds", "4");
    app.document
      .getElementById("af-cardio-start-form")
      .dispatchEvent(
        new app.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    assert.equal(app.api.getState().rounds, 4);
    assert.equal(app.api.getState().remainingMs, 45000);
    app.advance(10000);
    app.document.querySelector('[data-cardio-action="toggle"]').click();
    assert.equal(app.api.getState().status, "paused");
    assert.match(
      app.document.getElementById("af-cardio-toggle").textContent,
      /Fortsetzen/,
    );
    app.api.finish();
    app.set("af-cardio-session-note", "Technik ruhig gehalten");
    app.document
      .getElementById("af-cardio-save-form")
      .dispatchEvent(
        new app.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    assert.equal(
      JSON.parse(app.window.localStorage.getItem("af_cardio"))[0].note,
      "Technik ruhig gehalten",
    );
    assert.deepEqual(app.errors, []);
  } finally {
    app.close();
  }
});
