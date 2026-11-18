const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../coach-core.js");
const { boot, ready } = require("./helpers.cjs");

const SESSION_KEY = "af_active_session";

function appTest(fn) {
  return () => {
    const app = boot();
    try {
      ready(app);
      app.run("doStartWorkout('d1')");
      fn(app);
      assert.deepEqual(app.errors, []);
    } finally {
      app.close();
    }
  };
}

function snapshotStorage(app) {
  const storage = app.window.localStorage;
  return Object.fromEntries(
    Array.from({ length: storage.length }, (_, i) => {
      const key = storage.key(i);
      return [key, storage.getItem(key)];
    }),
  );
}

function completeSet(app, ei = 0, si = 0, weight = 16, reps = 10) {
  app.run(
    `setVal(${ei},${si},'weight',${JSON.stringify(String(weight))});` +
      `setVal(${ei},${si},'reps',${JSON.stringify(String(reps))});` +
      `toggleSet(${ei},${si})`,
  );
}

function session(app) {
  return JSON.parse(app.window.localStorage.getItem(SESSION_KEY));
}

function lastEntry(app) {
  return JSON.parse(app.run("JSON.stringify(history.at(-1))"));
}

function endOverlay(app) {
  const overlay = app.document.getElementById("workout-end-overlay");
  assert.ok(overlay, "the active workout needs its own ending confirmation");
  assert.ok(
    overlay.matches('[role="dialog"]') ||
      overlay.querySelector('[role="dialog"]'),
    "ending confirmation exposes an accessible dialog",
  );
  return overlay;
}

function visibleSummary(app) {
  return [
    ...app.document.querySelectorAll(
      "#workout-summary-overlay, #screen-coach-summary",
    ),
  ].find((node) => app.window.getComputedStyle(node).display !== "none");
}

function recordFixture(app, sets, previous = [], overrides = {}) {
  const base = JSON.parse(app.run("JSON.stringify(workoutExercises[0])"));
  const exercise = {
    ...base,
    reps: "8–12",
    bw: false,
    unit: "reps",
    weightBasis: "perHand",
    ...overrides,
    setData: sets.map(([weight, reps]) => ({ weight, reps, done: true })),
  };
  const prior = previous.length
    ? [
        {
          id: "record-reference",
          name: "Referenztraining",
          date: "2026-10-20",
          dayId: "d1",
          phaseId: "p1",
          duration: 1,
          sets: previous.length,
          exercises: [
            {
              name: exercise.name,
              targetReps: exercise.reps,
              plannedSets: previous.length,
              unit: exercise.unit,
              bw: exercise.bw,
              weightBasis: exercise.weightBasis,
              sets: previous.map(([weight, reps]) => ({ weight, reps })),
            },
          ],
        },
      ]
    : [];
  app.run(
    "history=" +
      JSON.stringify(prior) +
      ";workoutExercises=[" +
      JSON.stringify(exercise) +
      "];workoutBaselineSignature=getWorkoutPlanSignature(workoutExercises);saveSession();doFinishWorkout()",
  );
  return lastEntry(app);
}

test(
  "ending an empty workout offers continue/discard and never writes an empty history entry",
  appTest((app) => {
    app.run("finishWorkout()");
    const overlay = endOverlay(app);
    assert.notEqual(app.window.getComputedStyle(overlay).display, "none");
    assert.match(overlay.textContent, /weitertrainieren/i);
    assert.match(overlay.textContent, /verwerfen/i);
    const visibleSave = [...overlay.querySelectorAll("button")].find(
      (button) =>
        /speichern/i.test(button.textContent) &&
        !button.disabled &&
        !button.hidden &&
        app.window.getComputedStyle(button).display !== "none",
    );
    assert.equal(visibleSave, undefined);
    app.run("doFinishWorkout()");
    assert.equal(app.run("history.length"), 0);
    assert.ok(app.run("activeWorkoutDay !== null"));
    app.run("continueWorkout()");
    assert.equal(app.window.getComputedStyle(overlay).display, "none");
    assert.ok(app.run("workoutExercises.length > 0"));
  }),
);

test(
  "continue preserves the current edits, running timer, pause and active draft identity",
  appTest((app) => {
    completeSet(app);
    app.run("setVal(0,0,'reps','12');saveSession()");
    const before = app.run(
      "JSON.stringify({day:activeWorkoutDay,exercises:workoutExercises,id:workoutSessionId,running:timerRunning,restStart:_restTimerStartTS,restMax:restTimerMax})",
    );
    app.run("requestWorkoutEnd();continueWorkout()");
    assert.equal(
      app.run(
        "JSON.stringify({day:activeWorkoutDay,exercises:workoutExercises,id:workoutSessionId,running:timerRunning,restStart:_restTimerStartTS,restMax:restTimerMax})",
      ),
      before,
    );
    assert.equal(app.run("history.length"), 0);
    assert.equal(session(app).workoutSessionId, app.run("workoutSessionId"));
  }),
);

test(
  "saving a partial workout retains only completed sets, exact targets and the unmodified plan",
  appTest((app) => {
    app.run("addSet(0)");
    completeSet(app);
    app.run("setVal(0,1,'weight','18');setVal(0,1,'reps','11')");
    const expectedTotal = app.run(
      "workoutExercises.reduce((n,e)=>n+e.setData.length,0)",
    );
    const id = app.run("workoutSessionId");
    const planned = app.run("workoutExercises[0].setData.length");
    app.run("finishWorkout()");
    assert.equal(app.run("history.length"), 0);
    assert.notEqual(
      app.window.getComputedStyle(endOverlay(app)).display,
      "none",
    );
    app.run("doFinishWorkout()");
    const entry = lastEntry(app);
    assert.equal(entry.id, id);
    assert.equal(entry.status, "partial");
    assert.equal(entry.sets, 1);
    assert.equal(entry.totalSets, expectedTotal);
    assert.equal(entry.exercises.length, 1);
    assert.equal(entry.exercises[0].plannedSets, planned);
    assert.equal(entry.exercises[0].targetReps, "8–12");
    assert.equal(entry.exercises[0].sets.length, 1);
    assert.equal(entry.exercises[0].sets[0].weight, 16);
    assert.equal(entry.exercises[0].sets[0].reps, 10);
    assert.equal(typeof entry.exercises[0].sets[0].pr, "boolean");
    assert.equal(entry.prVersion, 1);
    assert.equal(entry.mode, "home");
    assert.ok(Number.isInteger(entry.durationSeconds));
    assert.ok(Number.isFinite(Date.parse(entry.startedAt)));
    assert.ok(Number.isFinite(Date.parse(entry.endedAt)));
    assert.equal(app.run("_pendingPlanSave"), null);
    assert.equal(app.run("activeWorkoutDay"), null);
    assert.equal(app.run("workoutExercises.length"), 0);
    assert.equal(app.run("timerRunning"), false);
    assert.equal(app.run("restTimerSec"), 0);
    assert.equal(app.run("restTimerInterval"), null);
    assert.equal(app.window.AF.interval, null);
    assert.equal(app.window.localStorage.getItem(SESSION_KEY), null);
    assert.equal(app.window.sessionStorage.getItem(SESSION_KEY), null);
    const result = visibleSummary(app);
    assert.ok(result);
    assert.match(result.textContent, /teiltraining|vorzeitig/i);
    app.run("doFinishWorkout();finishWorkout()");
    assert.equal(app.run("history.length"), 1);
  }),
);

test(
  "all completed sets produce a completed result, including timed exercises",
  appTest((app) => {
    app.run("addExerciseFromLib('lib_c1')");
    assert.ok(app.run("workoutExercises.some(e=>e.unit==='seconds')"));
    app.run(
      "workoutExercises.forEach(e=>e.setData.forEach(s=>Object.assign(s,{weight:e.bw?'':'16',reps:e.unit==='seconds'?'30':'10',rpe:8,done:true})));saveSession()",
    );
    const expectedTotal = app.run(
      "workoutExercises.reduce((n,e)=>n+e.setData.length,0)",
    );
    app.run("doFinishWorkout()");
    const entry = lastEntry(app);
    assert.equal(entry.status, "completed");
    assert.equal(entry.sets, expectedTotal);
    assert.equal(entry.totalSets, expectedTotal);
    assert.equal(
      entry.exercises.reduce((n, e) => n + e.sets.length, 0),
      expectedTotal,
    );
    for (const exercise of entry.exercises) {
      assert.equal(exercise.plannedSets, exercise.sets.length);
      for (const set of exercise.sets) assert.equal(typeof set.pr, "boolean");
      if (exercise.unit === "seconds")
        assert.equal(exercise.sets[0].seconds, 30);
    }
    assert.equal(app.run("timerRunning"), false);
    assert.equal(app.window.localStorage.getItem(SESSION_KEY), null);
    app.run("doFinishWorkout()");
    assert.equal(app.run("history.length"), 1);
  }),
);

test(
  "saving only a timed set shows a partial result and preserves its seconds",
  appTest((app) => {
    app.run("addExerciseFromLib('lib_c1')");
    const ei = app.run("workoutExercises.findIndex(e=>e.name==='Plank')");
    completeSet(app, ei, 0, 0, 30);
    app.run("doFinishWorkout()");
    const entry = lastEntry(app);
    assert.equal(entry.status, "partial");
    assert.equal(entry.sets, 1);
    assert.equal(entry.exercises[0].name, "Plank");
    assert.equal(entry.exercises[0].sets[0].seconds, 30);
    assert.equal(entry.exercises[0].sets[0].reps, 30);
    const result = visibleSummary(app);
    assert.ok(result);
    assert.match(result.textContent, /teiltraining|vorzeitig/i);
    assert.match(result.textContent, /30 (?:Sekunden|s\b)/);
  }),
);

test(
  "discard and replacement stop pending rest and timed-set callbacks without creating history",
  appTest((app) => {
    completeSet(app);
    app.run(
      "window.AF.interval={ei:0,si:1,name:workoutExercises[0].name,target:30,phase:'work',deadline:Date.now()+30000};saveSession()",
    );
    const firstId = app.run("workoutSessionId");
    app.run("discardWorkout()");
    assert.ok(app.run("activeWorkoutDay !== null"));
    app.run("doDiscardWorkout()");
    assert.equal(app.run("history.length"), 0);
    assert.equal(app.run("restTimerSec"), 0);
    assert.equal(app.run("restTimerInterval"), null);
    assert.equal(app.window.AF.interval, null);
    assert.equal(app.document.getElementById("af-interval"), null);
    assert.equal(app.window.localStorage.getItem(SESSION_KEY), null);
    assert.equal(app.run("activeWorkoutDay"), null);
    app.run("doStartWorkout('d1')");
    const secondId = app.run("workoutSessionId");
    assert.notEqual(secondId, firstId);
    assert.equal(app.run("workoutElapsed"), 0);
    completeSet(app);
    app.run(
      "window.AF.interval={ei:0,si:1,name:workoutExercises[0].name,target:30,phase:'work',deadline:Date.now()+30000};doStartWorkout('d2')",
    );
    assert.notEqual(app.run("workoutSessionId"), secondId);
    assert.equal(app.run("restTimerSec"), 0);
    assert.equal(app.window.AF.interval, null);
    assert.equal(
      app.run("workoutExercises.some(e=>e.setData.some(s=>s.done))"),
      false,
    );
    assert.equal(app.run("history.length"), 0);
  }),
);

test(
  "a custom template starts a fresh session and keeps its own name and planned set count",
  appTest((app) => {
    const previousId = app.run("workoutSessionId");
    app.run("doDiscardWorkout()");
    app.run(
      "saveTemplates([{id:'lifecycle-custom',name:'Eigener Kurzplan',dayName:'Mein Kurztraining',exercises:[{name:'Dumbbell Bench Press',muscle:'Brust',sets:3,reps:'8–12',weightBasis:'perHand',restTimer:90}]}]);loadTemplate('lifecycle-custom');closeConfirm(true)",
    );
    assert.notEqual(app.run("workoutSessionId"), previousId);
    assert.equal(app.run("activeWorkoutDay.id"), "custom");
    assert.equal(app.run("activeWorkoutDay.name"), "Mein Kurztraining");
    assert.equal(app.run("workoutExercises[0].setData.length"), 3);
    assert.equal(app.run("workoutElapsed"), 0);
    completeSet(app);
    app.run("doFinishWorkout()");
    const entry = lastEntry(app);
    assert.equal(entry.dayId, "custom");
    assert.equal(entry.name, "Mein Kurztraining");
    assert.equal(entry.status, "partial");
    assert.equal(entry.totalSets, 3);
    assert.equal(entry.exercises[0].plannedSets, 3);
    assert.equal(entry.exercises[0].targetReps, "8–12");
  }),
);

test(
  "repeating a saved performance in a new workout does not create another personal record",
  appTest((app) => {
    completeSet(app, 0, 0, 16, 10);
    app.run("doFinishWorkout();doStartWorkout('d1')");
    completeSet(app, 0, 0, 16, 10);
    app.run("doFinishWorkout()");
    assert.equal(app.run("history.length"), 2);
    const entry = lastEntry(app);
    assert.equal(entry.exercises[0].isPR, false);
    assert.equal(entry.exercises[0].sets[0].pr, false);
  }),
);

test(
  "only an eligible completed set after the initial baseline can become a weighted record",
  appTest((app) => {
    const entry = recordFixture(app, [
      [40, 1],
      [16, 10],
      [18, 8],
    ]);
    assert.equal(entry.sets, 3, "out-of-range repetitions remain saved");
    assert.deepEqual(
      entry.exercises[0].sets.map((set) => set.pr),
      [false, false, true],
    );
    assert.equal(entry.exercises[0].isPR, true);
    const result = visibleSummary(app);
    assert.ok(result);
    const records = [...result.querySelectorAll("section")].find((section) =>
      /Bestleistungen/.test(section.querySelector("h3")?.textContent || ""),
    );
    assert.ok(records);
    assert.match(records.textContent, /18 kg × 8/);
    assert.doesNotMatch(records.textContent, /40 kg/);
  }),
);

test(
  "historical sets outside the target range cannot block a later eligible strength record",
  appTest((app) => {
    const entry = recordFixture(
      app,
      [[18, 8]],
      [
        [16, 10],
        [40, 1],
      ],
    );
    assert.equal(entry.exercises[0].sets[0].pr, true);
  }),
);

test(
  "estimated strength compares actual weight-repetition pairs rather than independent maxima",
  appTest((app) => {
    const entry = recordFixture(
      app,
      [[24, 9]],
      [
        [24, 8],
        [16, 12],
      ],
    );
    assert.equal(entry.exercises[0].sets[0].pr, true);
  }),
);

test(
  "a heavier set with lower estimated strength and repetitions above target are not records",
  appTest((app) => {
    const entry = recordFixture(
      app,
      [
        [24, 8],
        [22.5, 13],
      ],
      [[22.5, 12]],
    );
    assert.deepEqual(
      entry.exercises[0].sets.map((set) => set.pr),
      [false, false],
    );
    assert.equal(entry.exercises[0].isPR, false);
  }),
);

test(
  "more assistance weight cannot be awarded a strength record",
  appTest((app) => {
    const entry = recordFixture(app, [[60, 10]], [[30, 10]], {
      name: "Assisted Pull-ups",
      muscle: "Rücken",
      weightBasis: "assistance",
    });
    assert.equal(entry.exercises[0].sets[0].pr, false);
    assert.equal(entry.exercises[0].isPR, false);
  }),
);

test(
  "bodyweight repetitions establish their first baseline before recognizing an improvement",
  appTest((app) => {
    const entry = recordFixture(
      app,
      [
        [0, 10],
        [0, 11],
        [0, 9],
      ],
      [],
      {
        name: "Push-ups",
        bw: true,
        weightBasis: "bodyweight",
      },
    );
    assert.deepEqual(
      entry.exercises[0].sets.map((set) => set.pr),
      [false, true, false],
    );
  }),
);

test("a stored completed session cannot be restored and saved a second time", () => {
  const app = boot();
  let stored;
  try {
    ready(app);
    app.run("doStartWorkout('d1')");
    completeSet(app);
    const staleDraft = app.window.localStorage.getItem(SESSION_KEY);
    app.run("doFinishWorkout()");
    stored = snapshotStorage(app);
    stored[SESSION_KEY] = staleDraft;
    assert.equal(app.run("history.length"), 1);
    assert.deepEqual(app.errors, []);
  } finally {
    app.close();
  }
  const restored = boot(stored);
  try {
    assert.equal(restored.run("workoutExercises.length"), 0);
    assert.equal(restored.run("activeWorkoutDay"), null);
    assert.equal(restored.window.localStorage.getItem(SESSION_KEY), null);
    restored.run("doFinishWorkout()");
    assert.equal(restored.run("history.length"), 1);
    assert.deepEqual(restored.errors, []);
  } finally {
    restored.close();
  }
});

test(
  "failed history persistence preserves the active draft and retries once with the same id",
  appTest((app) => {
    completeSet(app);
    const id = app.run("workoutSessionId");
    const prototype = Object.getPrototypeOf(app.window.localStorage);
    const original = prototype.setItem;
    prototype.setItem = function (key, value) {
      if (key === "af_history")
        throw new app.window.DOMException(
          "Storage is full",
          "QuotaExceededError",
        );
      return original.call(this, key, value);
    };
    try {
      app.run("doFinishWorkout()");
      assert.equal(app.run("history.length"), 0);
      assert.equal(app.run("workoutSessionId"), id);
      assert.ok(app.run("activeWorkoutDay !== null"));
      assert.equal(app.run("workoutExercises[0].setData[0].done"), true);
      assert.ok(app.window.localStorage.getItem(SESSION_KEY));
    } finally {
      prototype.setItem = original;
    }
    app.run("doFinishWorkout();doFinishWorkout()");
    assert.equal(app.run("history.length"), 1);
    assert.equal(lastEntry(app).id, id);
    assert.equal(app.window.localStorage.getItem(SESSION_KEY), null);
  }),
);

test("restore retains the original day, mode and session id when the selected plan changes", () => {
  const app = boot();
  let stored, id, originalName;
  try {
    ready(app);
    app.run("doStartWorkout('d1')");
    completeSet(app);
    id = app.run("workoutSessionId");
    originalName = app.run("activeWorkoutDay.name");
    app.run(
      "settings.gymMode=true;settings.activePhase='p2';saveSettings();saveSession()",
    );
    stored = snapshotStorage(app);
    assert.deepEqual(app.errors, []);
  } finally {
    app.close();
  }
  const restored = boot(stored);
  try {
    assert.equal(restored.run("activeWorkoutDay.name"), originalName);
    assert.equal(restored.run("workoutSessionId"), id);
    assert.equal(restored.run("timerRunning"), false);
    assert.equal(restored.run("workoutExercises[0].setData[0].done"), true);
    restored.run("doFinishWorkout()");
    assert.equal(lastEntry(restored).mode, "home");
    assert.equal(lastEntry(restored).phaseId, "p1");
    assert.equal(lastEntry(restored).id, id);
    assert.deepEqual(restored.errors, []);
  } finally {
    restored.close();
  }
});

test("partial sessions never satisfy the coach's two-session load-progression rule", () => {
  const name = "Dumbbell Bench Press";
  const make = (date, status) => ({
    date,
    status,
    exercises: [
      {
        name,
        plannedSets: 2,
        targetReps: "8–12",
        sets: [
          { weight: 20, reps: 12, rpe: 8 },
          { weight: 20, reps: 12, rpe: 8 },
        ],
      },
    ],
  });
  const input = {
    name,
    definition: { sets: 2, reps: "8–12" },
    weights: [20, 20.5, 22.5],
    history: [make("2026-10-20", "partial"), make("2026-10-23", "partial")],
  };
  assert.equal(C.progression(input).action, "hold");
  input.history[0].status = "completed";
  assert.equal(C.progression(input).action, "hold");
  input.history[1].status = "completed";
  assert.equal(C.progression(input).suggestedW, 20.5);
});
