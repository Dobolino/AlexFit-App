const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../coach-core.js");
const { boot } = require("./helpers.cjs");
const stages = [
  2.5, 3.5, 4.5, 5.5, 6.5, 8, 9, 10, 11.5, 13.5, 16, 18, 20.5, 22.5, 24,
];
function snapshot(a) {
  return Object.fromEntries(
    Array.from({ length: a.window.localStorage.length }, (_, i) => {
      const k = a.window.localStorage.key(i);
      return [k, a.window.localStorage.getItem(k)];
    }),
  );
}

test("body data save without required profile details and survive reopening", () => {
  const a = boot();
  let stored;
  try {
    a.click("profile");
    assert.equal(
      a.document.querySelectorAll('[data-af-form="profile"] [required]').length,
      0,
    );
    assert.equal(a.document.getElementById("af-confirm"), null);
    assert.equal(a.document.getElementById("af-experience"), null);
    a.set("af-profile-weight", 100);
    a.set("af-bf", 25);
    a.submit("profile");
    assert.equal(a.window.AF.state.profile.bodyFatPct, 25);
    assert.equal(a.run("weightLog.at(-1).bf"), 25);
    stored = snapshot(a);
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
  const b = boot(stored);
  try {
    assert.equal(b.run("weightLog.at(-1).kg"), 100);
    assert.equal(b.window.AF.state.profile.bodyFatPct, 25);
    b.run("doStartWorkout('d1')");
    assert.equal(
      b.document.querySelector(".screen.active").id,
      "screen-workout-active",
    );
    assert.deepEqual(b.errors, []);
  } finally {
    b.close();
  }
});

test("body fat alone does not invent a body weight or overwrite calculation details", () => {
  const a = boot({ af_coach: { profile: { age: 36, heightCm: 180 } } });
  try {
    a.click("profile");
    a.set("af-bf", 25);
    a.submit("profile");
    assert.equal(a.run("weightLog.length"), 0);
    assert.equal(a.run("settings.startKg"), null);
    assert.equal(a.window.AF.state.profile.age, 36);
    assert.equal(a.window.AF.state.profile.heightCm, 180);
    assert.equal(a.window.AF.state.profile.bodyFatPct, 25);
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
});

test("native weight selection uses exact stages and persists change events to the active draft", () => {
  assert.deepEqual(C.defaults().profile.dumbbellWeights, stages);
  const a = boot({ af_coach: { profile: { dumbbellWeights: [2, 4, 6] } } });
  let stored;
  try {
    assert.deepEqual(
      Array.from(a.window.AF.state.profile.dumbbellWeights),
      stages,
    );
    a.run("doStartWorkout('d1')");
    const picker = a.document.querySelector(
      '.af-weight-picker[data-ei="0"][data-si="0"]',
    );
    assert.deepEqual(
      Array.from(picker.options)
        .filter((o) => o.value)
        .map((o) => Number(o.value)),
      stages,
    );
    picker.value = "22.5";
    picker.dispatchEvent(new a.window.Event("change", { bubbles: true }));
    assert.equal(a.run("workoutExercises[0].setData[0].weight"), "22.5");
    stored = snapshot(a);
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
  const b = boot(stored);
  try {
    assert.equal(b.run("workoutExercises[0].setData[0].weight"), "22.5");
    b.run("resumeWorkout()");
    assert.equal(
      b.document.querySelector('.af-weight-picker[data-ei="0"][data-si="0"]')
        .value,
      "22.5",
    );
    assert.deepEqual(b.errors, []);
  } finally {
    b.close();
  }
});

test("old nonstandard weights are retained rather than silently snapped to a new stage", () => {
  const a = boot();
  try {
    a.run(
      "doStartWorkout('d1');workoutExercises[0].setData[0].weight='20';renderExerciseList()",
    );
    const picker = a.document.querySelector(
      '.af-weight-picker[data-ei="0"][data-si="0"]',
    );
    assert.equal(picker.value, "20");
    assert.match(picker.selectedOptions[0].textContent, /bisher/);
    assert.equal(a.run("workoutExercises[0].setData[0].weight"), "20");
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
});

test("saved templates start without a profile but neurological safety holds remain", () => {
  const a = boot({
    af_templates: [
      {
        id: "sample",
        name: "Test",
        dayName: "Test",
        exercises: [{ name: "Dumbbell Bench Press", sets: 2, reps: "8–12" }],
      },
    ],
  });
  try {
    a.run("loadTemplate('sample');closeConfirm(true)");
    assert.equal(
      a.document.querySelector(".screen.active").id,
      "screen-workout-active",
    );
    assert.equal(a.run("workoutExercises.length"), 1);
    a.window.AF.state.painLog.push({
      date: a.run("todayISO()"),
      score: 5,
      neurological: true,
    });
    a.run("loadTemplate('sample')");
    assert.equal(
      a.document.querySelector(".screen.active").id,
      "screen-coach-pain",
    );
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
});
