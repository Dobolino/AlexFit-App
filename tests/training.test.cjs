const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../training-plans.js");
const C = require("../coach-core.js");
const { boot, ready } = require("./helpers.cjs");

test("twelve weeks comprise two introductory, four build and six consolidation weeks", () => {
  const plans = T.buildPlans();
  assert.deepEqual(
    Object.values(plans).map((p) => p.weeks),
    [2, 4, 6],
  );
  for (const p of Object.values(plans)) {
    assert.deepEqual(p.schedule, {
      1: "d1",
      2: "d4",
      3: "d2",
      5: "d3",
      6: "d5",
    });
    assert.equal(p.days.find((d) => d.id === "d5").flexibleCardio, true);
    assert.equal(p.days.find((d) => d.id === "d5").exercises.length, 0);
    for (const ex of p.days.flatMap((d) => d.exercises)) {
      assert.ok(!C.DEFAULT_BLOCKED.includes(ex.name));
      assert.ok(C.repRange(ex.reps));
      assert.ok(ex.restTimer >= 60 && ex.restTimer <= 120);
      assert.doesNotMatch(ex.note || "", /Dropset|Superset/);
    }
  }
  assert.ok(
    plans.p1.days.flatMap((d) => d.exercises).every((e) => e.sets === 2),
  );
  assert.deepEqual(
    plans.p2.days,
    plans.p3.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({
        ...e,
        id: e.id.replace("p3_", "p2_"),
      })),
    })),
  );
});

test("single-hantel exercises distinguish total load from weight per hand", () => {
  const ex = T.buildPlans().p2.days.flatMap((d) => d.exercises);
  for (const name of ["Goblet Squat", "Weighted Glute Bridge"])
    assert.equal(
      C.definition(
        name,
        ex.find((e) => e.name === name),
      ).weightBasis,
      "external",
    );
  assert.equal(
    C.definition("Neutral-Grip Dumbbell Bench Press").weightBasis,
    "perHand",
  );
});

test("A/B progression respects each historical session's target and planned sets", () => {
  const name = "Romanian Deadlift";
  const session = (date, plannedSets, targetReps, reps) => ({
    date,
    exercises: [
      {
        name,
        plannedSets,
        targetReps,
        sets: Array.from({ length: plannedSets }, () => ({
          weight: 20,
          reps,
          rpe: 8,
        })),
      },
    ],
  });
  const history = [
    session("2026-10-20", 3, "8–12", 12),
    session("2026-10-23", 2, "10–15", 15),
  ];
  const input = {
    name,
    history,
    weights: [20, 22, 24],
    definition: { sets: 3, reps: "8–12" },
  };
  assert.equal(C.progression(input).suggestedW, 22);
  history[1].exercises[0].sets[0].reps = 12;
  assert.equal(C.progression(input).action, "hold");
  history[1].exercises[0].sets[0].reps = 15;
  history[0].exercises[0].sets.pop();
  assert.equal(C.progression(input).action, "hold");
});

test("Saturday opens free cardio entry without starting or replacing a strength session", () => {
  const a = boot();
  try {
    ready(a);
    a.run("doStartWorkout('d1')");
    const snapshot = a.run("JSON.stringify(workoutExercises)");
    a.run("openWorkoutPreview('d5')");
    assert.equal(
      a.document.querySelector(".screen.active").id,
      "screen-cardio",
    );
    assert.equal(a.run("JSON.stringify(workoutExercises)"), snapshot);
    a.run("doStartWorkout('d5')");
    assert.equal(a.run("JSON.stringify(workoutExercises)"), snapshot);
    assert.equal(a.run("history.length"), 0);
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
});

test("dashboard progression remains wired and finished sessions retain their exact target", () => {
  const a = boot();
  try {
    ready(a);
    a.run(
      "history=[{date:'2026-10-20',exercises:[{name:'Dumbbell Bench Press',plannedSets:2,targetReps:'8–12',sets:[{weight:20,reps:12,rpe:8},{weight:20,reps:12,rpe:8}]}]},{date:'2026-10-23',exercises:[{name:'Dumbbell Bench Press',plannedSets:2,targetReps:'8–12',sets:[{weight:20,reps:12,rpe:8},{weight:20,reps:12,rpe:8}]}]}]",
    );
    assert.equal(a.run("getProgressionSuggestions()[0].suggestedW"), 22);
    a.run(
      "doStartWorkout('d1');workoutExercises[0].setData[0]={weight:'20',reps:'12',rpe:8,done:true};doFinishWorkout()",
    );
    assert.equal(a.run("history.at(-1).exercises[0].targetReps"), "8–12");
    assert.equal(a.run("history.at(-1).exercises[0].plannedSets"), 2);
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
});

test("every phase and strength day renders with rests, guidance and usable exercise information", () => {
  const a = boot();
  try {
    ready(a);
    for (const phase of ["p1", "p2", "p3"]) {
      a.run(
        `settings.activePhase='${phase}';applyActivePlan();renderWorkoutSelect();openPhasePicker()`,
      );
      assert.match(
        a.document.getElementById("af-training-guidance").textContent,
        /Samstag/,
      );
      for (const id of ["d1", "d4", "d2", "d3"]) {
        a.run(`doStartWorkout('${id}')`);
        assert.match(
          a.document.getElementById("exercise-list").textContent,
          /s Pause/,
        );
        assert.ok(
          a.run("workoutExercises.every(e=>e.setData.length===e.sets)"),
        );
        a.run("workoutExercises.forEach(e=>showExerciseInfo(e.name))");
      }
    }
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
});

test("replacement archives assignments once and preserves logs, templates, bike entries and active drafts", () => {
  const a = boot({
    af_meta: {
      v: 4,
      namesMigrated: true,
      coachMigration: true,
      activePhase: "p3",
      programStart: "2026-10-01",
      programEnd: "2026-11-01",
      templateSchedule: { d1: "old-template" },
    },
    af_templates: [{ id: "old-template", name: "Alter Plan", exercises: [] }],
    af_coach: {
      weekPlans: [
        { date: "2099-01-01", slot: "primary", type: "d1" },
        { date: "2099-01-02", slot: "extra", type: "cycling" },
      ],
    },
  });
  let stored;
  try {
    assert.equal(a.run("settings.activePhase"), "p1");
    assert.equal(a.run("getScheduledTemplate('d1')"), null);
    assert.equal(a.run("getTemplates().length"), 1);
    assert.equal(a.window.AF.state.weekPlans.length, 1);
    assert.equal(a.window.AF.state.weekPlans[0].type, "cycling");
    assert.equal(
      a.window.AF.state.trainingPlanArchives[0].settings.activePhase,
      "p3",
    );
    assert.equal(a.window.AF.state.trainingPlanArchives[0].weekPlans.length, 1);
    ready(a);
    a.run(
      "doStartWorkout('d1');workoutExercises[0].setData[0].weight='20';saveSession();settings.activePhase='p2';saveSettings()",
    );
    stored = Object.fromEntries(
      Array.from({ length: a.window.localStorage.length }, (_, i) => {
        const key = a.window.localStorage.key(i);
        return [key, a.window.localStorage.getItem(key)];
      }),
    );
  } finally {
    a.close();
  }
  const b = boot(stored);
  try {
    assert.equal(b.run("settings.activePhase"), "p2");
    assert.equal(b.window.AF.state.trainingPlanArchives.length, 1);
    assert.equal(b.run("workoutExercises[0].setData[0].weight"), "20");
    assert.deepEqual(b.errors, []);
  } finally {
    b.close();
  }
});
