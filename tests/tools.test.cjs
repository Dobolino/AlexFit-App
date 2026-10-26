const test = require("node:test"),
  assert = require("node:assert/strict");
const { boot } = require("./helpers.cjs");

test("update check reports versions without reloading or deleting storage", async () => {
  const a = boot();
  try {
    a.run("renderSettings()");
    let updates = 0;
    Object.defineProperty(a.window.navigator, "serviceWorker", {
      value: {
        getRegistration: async () => ({ update: async () => updates++ }),
      },
      configurable: true,
    });
    a.window.fetch = async () => ({
      ok: true,
      json: async () => ({ version: "next-test-version" }),
    });
    const before = a.window.localStorage.getItem("af_coach");
    await a.window.AF.handleAction("tools-update", {});
    assert.equal(updates, 1);
    assert.match(
      a.document.getElementById("tools-update-status").textContent,
      /next-test-version/,
    );
    assert.ok(a.document.querySelector('[data-af-action="tools-reload"]'));
    assert.equal(a.window.localStorage.getItem("af_coach"), before);
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
});
function app(fn) {
  const a = boot();
  try {
    fn(a);
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
}
test("default week is shown rather than seven false rest days", () =>
  app((a) => {
    a.click("week");
    assert.equal(
      a.window.AF.state.weekPlans.filter((p) => p.type === "d1").length,
      1,
    );
    assert.equal(
      a.document.querySelectorAll('[data-af-form="week"] select[id^="af-day-"]')
        .length,
      7,
    );
  }));
test("a single move refuses collision and rolls back without duplicates", () =>
  app((a) => {
    const A = a.window.AF,
      d = a.run("todayISO()");
    A.tools.ensureWeek(d);
    const source = A.state.weekPlans.find(
      (p) => p.date >= d && p.type === "d1",
    );
    // Explicit synthetic future schedule independent of the weekday tests run on.
    const from = A.C.addDays(d, 8),
      to = A.C.addDays(d, 9);
    A.state.weekPlans = [
      { id: "a", date: from, slot: "primary", type: "d1" },
      { id: "b", date: to, slot: "primary", type: "d4" },
    ];
    const before = JSON.stringify(A.state.weekPlans);
    assert.ok(A.tools.shift(from, to, false).error);
    assert.equal(JSON.stringify(A.state.weekPlans), before);
  }));
test("chain moves preserve order, extras and all history across week boundary", () =>
  app((a) => {
    const A = a.window.AF,
      d = a.run("todayISO()"),
      from = A.C.addDays(d, 8),
      to = A.C.addDays(from, 1);
    A.state.weekPlans = [
      { id: "a", date: from, slot: "primary", type: "d1" },
      { id: "b", date: to, slot: "primary", type: "d4" },
      { id: "bike", date: from, slot: "bike", type: "cycling" },
    ];
    const result = A.tools.shift(from, to, true);
    assert.ok(!result.error);
    assert.equal(result.count >= 2, true);
    const rows = A.state.weekPlans.filter((p) => p.slot === "primary");
    assert.equal(rows.find((p) => p.date === to).type, "d1");
    assert.equal(rows.find((p) => p.date === A.C.addDays(to, 1)).type, "d4");
    assert.equal(new Set(rows.map((p) => p.date)).size, rows.length);
    assert.equal(A.state.weekPlans.find((p) => p.id === "bike").date, from);
    assert.equal(a.run("history.length"), 0);
  }));
test("completed training is never moved", () =>
  app((a) => {
    const A = a.window.AF,
      d = a.run("todayISO()");
    A.state.weekPlans = [{ date: d, slot: "primary", type: "d1" }];
    a.run("history=[{date:todayISO(),dayId:'d1',exercises:[]}]");
    assert.ok(A.tools.shift(d, A.C.addDays(d, 1), true).error);
  }));
test("prefill uses one matching session, keeps target sets and clears RPE and completion", () =>
  app((a) => {
    a.run(
      "history=[{date:'2026-01-01',dayId:'d1',name:'Oberkörper A',exercises:[{name:'Dumbbell Bench Press',unit:'reps',sets:[{weight:18,reps:10,rpe:9},{weight:20.5,reps:9,rpe:8},{weight:22.5,reps:8,rpe:10}]}]},{date:'2026-01-02',dayId:'d2',name:'Other',exercises:[{name:'Dumbbell Bench Press',sets:[{weight:24,reps:5}]}]}];doStartWorkout('d1')",
    );
    assert.equal(a.run("workoutExercises[0].setData.length"), 2);
    assert.equal(a.run("workoutExercises[0].setData[0].weight"), "18");
    assert.equal(a.run("workoutExercises[0].setData[1].reps"), "9");
    assert.equal(a.run("workoutExercises[0].setData[0].rpe"), undefined);
    assert.equal(a.run("workoutExercises[0].setData.some(s=>s.done)"), false);
  }));
test("no matching prior session means no unrelated set values are imported", () =>
  app((a) => {
    a.run(
      "history=[{date:'2026-01-02',dayId:'d2',name:'Other',exercises:[{name:'Dumbbell Bench Press',sets:[{weight:24,reps:5}]}]}];doStartWorkout('d1')",
    );
    assert.equal(a.run("workoutExercises[0].setData[0].weight"), "");
  }));
test("copy only changes next open set and leaves completed values intact", () =>
  app((a) => {
    a.run(
      "doStartWorkout('d1');workoutExercises[0].setData[0]={weight:'18',reps:'11',rpe:8,done:true}",
    );
    a.window.AF.tools.copySet(0);
    assert.equal(a.run("workoutExercises[0].setData[0].rpe"), 8);
    assert.equal(a.run("workoutExercises[0].setData[1].weight"), "18");
    assert.equal(a.run("workoutExercises[0].setData[1].reps"), "11");
    assert.equal(a.run("workoutExercises[0].setData[1].done"), false);
  }));
test("Saturday reserve form is explicit and rejects replacing a booked strength day", () =>
  app((a) => {
    a.run("renderWorkoutSelect()");
    a.click("tools-saturday");
    const date = a.document.getElementById("reserve-date").value;
    a.window.AF.state.weekPlans = [{ date, slot: "primary", type: "d1" }];
    a.set("reserve-type", "d2");
    a.submit("reserve");
    assert.equal(a.window.AF.state.weekPlans[0].type, "d1");
  }));
test("settings exposes installed version and week review avoids missed-day scoring", () =>
  app((a) => {
    a.run("renderSettings()");
    assert.match(
      a.document.getElementById("screen-settings").textContent,
      /2026.10.26.19/,
    );
    a.window.AF.tools.review();
    assert.match(
      a.document.querySelector(".screen.active").textContent,
      /Verschieben ist kein Misserfolg/,
    );
  }));
