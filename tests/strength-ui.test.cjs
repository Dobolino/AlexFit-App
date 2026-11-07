const test = require("node:test");
const assert = require("node:assert/strict");
const { boot, ready } = require("./helpers.cjs");

function appTest(fn) {
  return () => {
    const a = boot();
    try {
      ready(a);
      a.run("doStartWorkout('d1')");
      fn(a);
      assert.deepEqual(a.errors, []);
    } finally {
      a.close();
    }
  };
}
function focusField(a, name) {
  return a.document.querySelector('[data-af-focus-set="' + name + '"]');
}
function change(a, input, value, type = "change") {
  input.value = String(value);
  input.dispatchEvent(new a.window.Event(type, { bubbles: true }));
}

test(
  "focused set uses the personal weights, compact guidance and German display name",
  appTest((a) => {
    assert.equal(
      a.document.querySelector("#af-focus-title").textContent,
      "Bankdrücken",
    );
    assert.equal(
      a.document.querySelector(".af-strength-sessionoptions").open,
      false,
    );
    const weights = [...focusField(a, "weight").options]
      .map((o) => o.value)
      .filter(Boolean)
      .map(Number);
    assert.deepEqual(weights, [...a.window.AF.state.profile.dumbbellWeights]);
    assert.ok(
      a.document.querySelector(
        '.af-strength-icons [aria-label="Video und Technik: Bankdrücken"] svg',
      ),
    );
    assert.ok(
      a.document.querySelector(
        '.af-strength-icons [aria-label="Muskelgruppen: Bankdrücken"] svg',
      ),
    );
    assert.match(
      a.document.querySelector(".af-strength-muscles").textContent,
      /Brust/,
    );
    a.document.querySelector('[data-af-strength="hints"]').click();
    assert.equal(a.document.getElementById("af-strength-options").open, true);
  }),
);

test(
  "repetitions above 50 persist and update both focus and all-set editors",
  appTest((a) => {
    change(a, focusField(a, "reps"), "custom");
    const manual = a.document.querySelector("[data-af-focus-custom]");
    assert.equal(manual.closest("label").hidden, false);
    change(a, manual, "64", "input");
    assert.equal(a.run("workoutExercises[0].setData[0].reps"), "64");
    assert.equal(
      a.document.querySelector(
        'select[data-af-set="reps"][data-ei="0"][data-si="0"]',
      ).value,
      "64",
    );
    a.run("restoreSession();renderExerciseList()");
    assert.equal(
      a.document.querySelector("[data-af-focus-custom]").value,
      "64",
    );
    assert.equal(focusField(a, "reps").value, "custom");
    change(a, focusField(a, "reps"), "22");
    assert.equal(a.run("workoutExercises[0].setData[0].reps"), "22");
    assert.equal(a.document.querySelector(".af-strength-custom").hidden, true);
  }),
);

test(
  "completing a valid set advances; empty or fractional repetitions cannot complete",
  appTest((a) => {
    change(a, focusField(a, "weight"), "16");
    change(a, focusField(a, "reps"), "custom");
    change(a, a.document.querySelector("[data-af-focus-custom]"), "0", "input");
    a.document.querySelector(".af-strength-submit").click();
    assert.equal(a.run("workoutExercises[0].setData[0].done"), false);
    change(
      a,
      a.document.querySelector("[data-af-focus-custom]"),
      "10.5",
      "input",
    );
    a.document.querySelector(".af-strength-submit").click();
    assert.equal(a.run("workoutExercises[0].setData[0].done"), false);
    change(
      a,
      a.document.querySelector("[data-af-focus-custom]"),
      "16",
      "input",
    );
    a.document.querySelector(".af-strength-submit").click();
    assert.equal(a.run("workoutExercises[0].setData[0].done"), true);
    assert.equal(a.window.AF.strength.selected.ei, 0);
    assert.equal(a.window.AF.strength.selected.si, 1);
    assert.match(
      a.document.querySelector(".af-strength-eyebrow").textContent,
      /SATZ 2 VON 2/,
    );
    assert.equal(
      a.document.querySelectorAll(".af-strength-rest-actions button").length,
      2,
    );
  }),
);

test(
  "every set through the end is selectable and done sets can be edited and reopened",
  appTest((a) => {
    assert.equal(
      a.document.querySelectorAll(".af-strength-flow li").length,
      a.run("workoutExercises.length"),
    );
    assert.equal(
      a.document.querySelectorAll(".af-strength-set-jump").length,
      a.run("workoutExercises.reduce((n,e)=>n+e.setData.length,0)"),
    );
    assert.equal(
      [
        ...a.document.querySelectorAll(".af-strength-exercise-name > span"),
      ].filter((el) => el.textContent.includes("Als Nächstes")).length,
      1,
    );
    a.run("setVal(0,0,'weight','16');setVal(0,0,'reps','10');toggleSet(0,0)");
    a.document
      .querySelector('.af-strength-set-jump[data-ei="0"][data-si="0"]')
      .click();
    assert.match(
      a.document.querySelector(".af-strength-submit").textContent,
      /wieder öffnen/,
    );
    change(a, focusField(a, "reps"), "12");
    assert.equal(a.run("workoutExercises[0].setData[0].reps"), "12");
    a.document.querySelector(".af-strength-submit").click();
    assert.equal(a.run("workoutExercises[0].setData[0].done"), false);
    a.document
      .querySelector('.af-strength-set-jump[data-ei="4"][data-si="1"]')
      .click();
    assert.equal(a.window.AF.strength.selected.ei, 4);
    a.document.querySelector('[data-af-strength="current"]').click();
    assert.equal(a.window.AF.strength.selected.ei, 0);
    assert.equal(a.window.AF.strength.selected.si, 0);
  }),
);

test(
  "third set is focused and preserves the existing set-add and replacement rules",
  appTest((a) => {
    a.run(
      "setVal(0,1,'weight','16');setVal(0,1,'reps','10');setVal(0,1,'rpe','8');addSet(0)",
    );
    assert.equal(a.window.AF.strength.selected.si, 2);
    assert.match(
      a.document.querySelector(".af-strength-eyebrow").textContent,
      /SATZ 3 VON 3/,
    );
    assert.equal(focusField(a, "weight").value, "16");
    assert.equal(focusField(a, "rpe").value, "");
    a.run("swapExercise(0,'Neutral-Grip Dumbbell Bench Press')");
    assert.match(
      a.document.getElementById("af-focus-title").textContent,
      /neutraler Griff/,
    );
    assert.equal(a.run("workoutExercises[0].setData.length"), 3);
    assert.equal(
      a.run("workoutExercises[0].name"),
      "Neutral-Grip Dumbbell Bench Press",
    );
  }),
);

test(
  "legacy editors synchronize the focus without losing a manually entered repetition count",
  appTest((a) => {
    const standard = a.document.querySelector(
      'select[data-af-set="weight"][data-ei="0"][data-si="0"]',
    );
    change(a, standard, "18");
    assert.equal(focusField(a, "weight").value, "18");
    change(a, focusField(a, "reps"), "custom");
    change(
      a,
      a.document.querySelector("[data-af-focus-custom]"),
      "73",
      "input",
    );
    a.run("renderExerciseList()");
    assert.equal(
      a.document.querySelector("[data-af-focus-custom]").value,
      "73",
    );
    assert.match(
      a.document.querySelector(
        '.af-strength-setvalue[data-ei="0"][data-si="0"]',
      ).textContent,
      /18 kg × 73/,
    );
  }),
);

test(
  "manual repetitions normalize scientific notation and reject unsafe integers",
  appTest((a) => {
    change(a, focusField(a, "reps"), "custom");
    const manual = a.document.querySelector("[data-af-focus-custom]");
    change(a, manual, "1e2", "input");
    assert.equal(a.run("workoutExercises[0].setData[0].reps"), "100");
    change(a, manual, "9007199254740992", "input");
    assert.equal(a.run("workoutExercises[0].setData[0].reps"), "");
  }),
);

test(
  "completion prefills only blank next-set values, preserving history and optional RPE",
  appTest((a) => {
    a.run(
      "workoutExercises[0].setData=[{weight:'16',reps:'12',rpe:'8',done:false},{weight:'',reps:'',done:false},{weight:'18',reps:'8',rpe:'9',done:false}];toggleSet(0,0)",
    );
    assert.equal(a.run("workoutExercises[0].setData[1].weight"), "16");
    assert.equal(a.run("workoutExercises[0].setData[1].reps"), "12");
    assert.equal(a.run("workoutExercises[0].setData[1].rpe"), undefined);
    a.run("toggleSet(0,1)");
    assert.equal(a.run("workoutExercises[0].setData[2].weight"), "18");
    assert.equal(a.run("workoutExercises[0].setData[2].reps"), "8");
    assert.equal(a.run("workoutExercises[0].setData[2].rpe"), "9");
  }),
);

test(
  "rest extension preserves the original deadline origin and skip ends the rest",
  appTest((a) => {
    a.run(
      "startRestTimer(90);_restTimerStartTS=Date.now()-20000;updateRestTimerUI()",
    );
    const origin = a.run("_restTimerStartTS");
    a.document.querySelector('[data-af-strength="rest-add"]').click();
    assert.equal(a.run("_restTimerStartTS"), origin);
    assert.equal(a.run("restTimerMax"), 120);
    assert.ok(a.run("restTimerSec") >= 99 && a.run("restTimerSec") <= 100);
    a.document.querySelector('[data-af-strength="rest-skip"]').click();
    assert.equal(a.run("restTimerInterval"), null);
    assert.equal(a.run("restTimerSec"), 0);
    assert.equal(
      a.document.getElementById("rest-timer-bar").classList.contains("active"),
      false,
    );
  }),
);

test(
  "timed exercises retain interval controls and blocked exercises are never focused",
  appTest((a) => {
    a.run(
      "workoutExercises=[{...getExDef('Dumbbell Shoulder Press'),setData:[{weight:'16',reps:'10',done:false}]},{...getExDef('Plank'),setData:[{weight:'',reps:'30',done:false}]}];renderWorkoutActive()",
    );
    assert.equal(a.window.AF.strength.selected.ei, 1);
    assert.ok(
      a.document.querySelector(
        '.af-strength-focus [data-af-action="interval"]',
      ),
    );
    a.document
      .querySelector('.af-strength-focus [data-af-action="interval"]')
      .click();
    assert.equal(a.window.AF.interval.target, 30);
    assert.equal(a.window.AF.interval.name, "Plank");
    assert.ok(a.document.getElementById("af-interval"));
    a.run("scrollToSetRow(0,0)");
    assert.equal(a.window.AF.strength.selected.ei, 1);
    assert.ok(a.document.querySelector(".af-locked select:disabled"));
  }),
);
