const test = require("node:test"),
  assert = require("node:assert/strict");
const { boot, ready } = require("./helpers.cjs");
function withApp(fn, stored) {
  return async () => {
    const a = boot(stored);
    try {
      await fn(a);
      assert.deepEqual(a.errors, []);
    } finally {
      a.close();
    }
  };
}
test(
  "all legacy screens and new navigation start without runtime errors",
  withApp((a) => {
    for (const fn of [
      "renderDashboard",
      "renderSettings",
      "renderWeight",
      "renderProgress",
      "renderCardio",
      "renderWorkoutSelect",
    ])
      a.run(fn + "()");
    a.run("switchTab('nutrition')");
    assert.match(
      a.document.getElementById("screen-nutrition").textContent,
      /Yazio/,
    );
    assert.equal(a.document.querySelectorAll("#bottomnav .navbtn").length, 5);
  }),
);
test(
  "a new training starts without a required profile",
  withApp((a) => {
    a.run("doStartWorkout('d1')");
    assert.equal(
      a.document.querySelector(".screen.active").id,
      "screen-workout-active",
    );
    assert.ok(a.run("workoutExercises.length") > 0);
  }),
);
test(
  "blocked exercises are disabled in the actual workout UI and cannot be checked",
  withApp((a) => {
    ready(a);
    a.window.AF.state.blockedExercises.push("Dumbbell Bench Press");
    a.run("doStartWorkout('d1')");
    const index = a.run(
      "workoutExercises.findIndex(e=>e.name==='Dumbbell Bench Press')",
    );
    assert.ok(index >= 0);
    assert.ok(
      a.document.querySelectorAll(".af-locked select:disabled").length > 0,
    );
    a.run(
      "workoutExercises[" +
        index +
        "].setData[0].reps='12';workoutExercises[" +
        index +
        "].setData[0].weight='8';toggleSet(" +
        index +
        ",0)",
    );
    assert.equal(
      a.run("workoutExercises[" + index + "].setData[0].done"),
      false,
    );
  }),
);
test(
  "blocked library additions and swaps cannot bypass profile restrictions",
  withApp((a) => {
    ready(a);
    a.run("doStartWorkout('d1')");
    const size = a.run("workoutExercises.length");
    a.run(
      "addExerciseFromLib(EXERCISE_LIBRARY.find(e=>e.name==='Dumbbell Shoulder Press').id)",
    );
    assert.equal(a.run("workoutExercises.length"), size);
    a.run("swapExercise(0,'Dumbbell Shoulder Press')");
    assert.equal(a.run("workoutExercises[0].name"), "Dumbbell Bench Press");
  }),
);
test(
  "rowing and holds render second inputs and persist typed units",
  withApp((a) => {
    ready(a);
    a.run(
      "doStartWorkout('d1');workoutExercises=LEGACY_WORKOUT_PLANS.p1.days.find(d=>d.id==='d5').exercises.map(ex=>({...AlexFitCore.definition(ex.name,ex),setData:createSetDataForExercise(ex)}));renderWorkoutActive()",
    );
    assert.match(
      a.document.getElementById("exercise-list").textContent,
      /Sek\./,
    );
    a.run(
      "workoutExercises[0].setData[0].reps='300';toggleSet(0,0);doFinishWorkout()",
    );
    const entry = a.run("history.at(-1)");
    assert.equal(entry.exercises[0].unit, "seconds");
    assert.equal(entry.exercises[0].sets[0].seconds, 300);
    assert.ok(a.window.localStorage.getItem("af_history"));
  }),
);
test("active workout draft survives closing and reopening with note and paused clock", async () => {
  const a = boot();
  ready(a);
  a.run("doStartWorkout('d2')");
  a.document.getElementById("workout-note-input").value =
    "Pause wegen Unterbrechung";
  a.run("workoutExercises[0].setData[0].reps='6';saveSession()");
  const stored = Object.fromEntries(
    Array.from({ length: a.window.localStorage.length }, (_, i) => {
      const k = a.window.localStorage.key(i);
      return [k, a.window.localStorage.getItem(k)];
    }),
  );
  a.close();
  const b = boot(stored);
  try {
    assert.equal(b.run("workoutExercises[0].setData[0].reps"), "6");
    assert.equal(b.run("timerRunning"), false);
    b.run("renderWorkoutActive()");
    assert.equal(
      b.document.getElementById("workout-note-input").value,
      "Pause wegen Unterbrechung",
    );
    assert.deepEqual(b.errors, []);
  } finally {
    b.close();
  }
});
test(
  "filtered weight chart handles older entries outside selected range",
  withApp((a) => {
    a.run(
      "weightLog=[{date:addDaysISO(todayISO(),-60),kg:100},{date:addDaysISO(todayISO(),-3),kg:99},{date:todayISO(),kg:99}];weightRange='1m';renderWeight()",
    );
    assert.ok(a.document.querySelector("#weight-chart-wrap svg"));
  }),
);
test(
  "settings accept a maintenance target instead of forcing weight loss",
  withApp((a) => {
    a.run("renderSettings()");
    a.set("s-start-kg", 100);
    a.set("s-goal-kg", 100);
    a.set("s-prog-start", a.run("todayISO()"));
    a.run("saveSettingsForm()");
    assert.equal(a.run("settings.goalKg"), 100);
  }),
);
test(
  "legacy settings, history, photos and all new state survive a full JSON backup",
  withApp((a) => {
    ready(a);
    const state = a.window.AF.state;
    state.measurements = [{ id: "m1", date: "2026-10-24", waistCm: 99 }];
    state.dailyNutrition = [{ id: "n1", date: "2026-10-24", kcal: 2400 }];
    state.weekPlans = [
      { id: "p1", date: "2026-10-24", type: "cycling", minutes: 60 },
    ];
    state.painLog = [{ id: "pain1", date: "2026-10-24", score: 0 }];
    a.window.AF.setState(state);
    a.run(
      "localStorage.setItem('af_photos',JSON.stringify([{id:'photo1',date:'2026-10-24',data:'data:image/jpeg;base64,AA'}]))",
    );
    const payload = a.run("collectBackupPayload()");
    assert.equal(payload.data.coach.measurements.length, 1);
    a.run("restoreJSONBackup(collectBackupPayload())");
    assert.equal(a.window.AF.state.dailyNutrition[0].kcal, 2400);
    assert.equal(a.window.AF.state.weekPlans.length, 1);
    assert.equal(
      JSON.parse(a.window.localStorage.getItem("af_photos")).length,
      1,
    );
  }),
);
test(
  "old JSON backups do not delete newly configured coaching data",
  withApp((a) => {
    ready(a);
    a.run(
      "applyJSONMerge({app:'AlexFit',data:{history:[],weights:[],cardio:[]}})",
    );
    assert.equal(a.window.AF.state.profile.age, 36);
  }),
);
test(
  "invalid backup collection types and broken exercise shapes are rejected",
  withApp((a) => {
    assert.equal(
      a.run("validateBackupPayload({data:{history:{bad:true}}})"),
      false,
    );
    assert.equal(
      a.run(
        "validateBackupPayload({data:{history:[{date:'2026-10-24',exercises:[{name:'x',sets:null}]}]}})",
      ),
      false,
    );
  }),
);
test(
  "weekly planning includes bike, rest and a closed-app calendar export",
  withApp((a) => {
    a.click("week");
    a.submit("week");
    assert.equal(a.window.AF.state.weekPlans.length, 7);
    const start = a.window.AF.weekStart;
    a.set("af-day-" + start, "d1");
    a.set("af-bike-" + start, 60);
    a.submit("week");
    assert.equal(a.window.AF.state.weekPlans.length, 8);
    a.click("calendar-export");
    assert.ok(a.downloads.length > 0);
  }),
);
test(
  "new neurological symptoms stop the next session",
  withApp((a) => {
    ready(a);
    const s = a.window.AF.state;
    s.painLog = [
      {
        date: "2026-10-24",
        createdAt: "2026-10-24T12:00:00Z",
        neurological: true,
        score: 4,
        exercise: "",
      },
    ];
    a.window.AF.setState(s);
    a.run("doStartWorkout('d2')");
    assert.equal(a.run("workoutExercises.length"), 0);
  }),
);
test(
  "nutrition writes complete Yazio values without inventing unknown macros",
  withApp((a) => {
    a.run("switchTab('nutrition')");
    a.set("af-food-kcal", 2300);
    a.set("af-food-protein_g", 170);
    a.submit("nutrition");
    const e = a.window.AF.state.dailyNutrition[0];
    assert.equal(e.kcal, 2300);
    assert.equal(e.protein_g, 170);
    assert.equal(e.sodium_mg, null);
  }),
);
test(
  "cooking produces five total portions, coordinated steps and both JSON exports",
  withApp(async (a) => {
    a.click("nutrition");
    a.click("cooking");
    await a.flush();
    a.set("af-portions-a", 5);
    a.set("af-recipe-b", "");
    a.submit("cook-plan");
    await a.flush();
    const p = a.window.AF.state.cookingPlans.at(-1);
    assert.equal(
      p.recipes.reduce((s, r) => s + r.servings, 0),
      5,
    );
    assert.ok(a.document.querySelector(".af-timeline article"));
    a.downloads.length = 0;
    a.click("export-shopping");
    a.click("export-recipes");
    assert.equal(a.downloads.length, 2);
    for (const blob of a.downloads) assert.ok(JSON.parse(await blob.text()));
  }),
);
test(
  "finished cooking weight updates per-100g values and is included in export",
  withApp(async (a) => {
    a.click("nutrition");
    a.click("cooking");
    await a.flush();
    a.submit("cook-plan");
    await a.flush();
    a.set("af-finished-0", 2500);
    a.submit("cooked-weight");
    await a.flush();
    const r = a.window.AF.state.cookingPlans.at(-1).recipes[0];
    assert.equal(r.weightMeasured, true);
    assert.equal(r.finishedWeightG, 2500);
    a.click("export-recipes");
    const p = JSON.parse(await a.downloads.at(-1).text());
    assert.equal(p.recipes[0].finishedWeightG, 2500);
    assert.ok(p.recipes[0].macrosPerServing.protein_g > 0);
  }),
);

test(
  "legacy settings and body measurements survive startup migration",
  withApp(
    (a) => {
      assert.equal(a.run("settings.goalKg"), 82);
      assert.equal(
        a.window.AF.state.trainingPlanArchives[0].settings.programEnd,
        "2026-11-30",
      );
      assert.equal(
        a.run("settings.programEnd"),
        a.run("addDaysISO(todayISO(),14)"),
      );
      assert.equal(a.run("history.length"), 1);
      assert.equal(a.run("weightLog[0].kg"), 100);
    },
    {
      af_meta: {
        v: 3,
        namesMigrated: true,
        activePhase: "p1",
        programStart: "2026-10-19",
        programEnd: "2026-11-30",
        startKg: 100,
        goalKg: 82,
        defaultRestTime: 120,
        weekGoal: 4,
      },
      af_history: [
        {
          id: "old",
          date: "2026-10-20",
          name: "Alt",
          dayId: "d1",
          phaseId: "p1",
          duration: 36,
          sets: 1,
          exercises: [
            { name: "Dumbbell Bench Press", sets: [{ weight: 20, reps: 10 }] },
          ],
        },
      ],
      af_weights: [{ date: "2026-10-20", kg: 100, bf: 25 }],
    },
  ),
);
test(
  "unsupported Notification API does not break settings",
  withApp((a) => {
    delete a.window.Notification;
    assert.doesNotThrow(() => a.run("renderSettings()"));
  }),
);
test(
  "unknown imported phase is rejected before mutating settings",
  withApp((a) => {
    assert.equal(
      a.run("validateBackupPayload({data:{meta:{activePhase:'invalid'}}})"),
      false,
    );
  }),
);
test(
  "imported names remain text in dashboard, history, detail and stats",
  withApp((a) => {
    const malicious = '<img src=x onerror="alert(1)">';
    a.run(
      'history=[{id:"x",date:todayISO(),dayId:"d1",phaseId:"p1",name:' +
        JSON.stringify(malicious) +
        ",duration:20,sets:1,exercises:[{name:" +
        JSON.stringify(malicious) +
        ",sets:[{weight:20,reps:10}]}]}]",
    );
    for (const call of [
      "renderDashboard()",
      "renderHistory()",
      'openWorkoutDetail("x")',
      "renderProgress()",
    ]) {
      a.run(call);
      assert.equal(a.document.querySelectorAll('img[src="x"]').length, 0);
    }
  }),
);
test(
  "moving a session changes the real workout schedule",
  withApp((a) => {
    ready(a);
    a.click("week");
    const start = a.window.AF.weekStart;
    a.set("af-day-" + start, "rest");
    a.set("af-day-" + a.window.AF.C.addDays(start, 4), "d1");
    a.submit("week");
    a.run("renderDashboard()");
    assert.equal(a.run("PLAN_DOW[1]"), undefined);
    assert.equal(a.run("PLAN_DOW[5]"), "d1");
  }),
);

test(
  "locked sets do not count as unfinished work in the progress display",
  withApp((a) => {
    ready(a);
    a.window.AF.state.blockedExercises.push("Dumbbell Bench Press");
    a.run("doStartWorkout('d1');updateProgress()");
    assert.equal(
      a.document.getElementById("workout-prog-txt").textContent,
      "0/8 Sätze",
    );
  }),
);
test(
  "intervals complete a timed set, enter rest and pause with the workout clock",
  withApp(async (a) => {
    ready(a);
    a.run(
      "doStartWorkout('d1');workoutExercises=LEGACY_WORKOUT_PLANS.p1.days.find(d=>d.id==='d5').exercises.map(ex=>({...AlexFitCore.definition(ex.name,ex),setData:createSetDataForExercise(ex)}));workoutExercises[1].setData[0].reps='1';renderExerciseList()",
    );
    a.document
      .querySelector('[data-af-action="interval"][data-ei="1"][data-si="0"]')
      .click();
    a.window.AF.interval.deadline = Date.now() - 1;
    await new Promise((r) => setTimeout(r, 550));
    assert.equal(a.run("workoutExercises[1].setData[0].done"), true);
    assert.equal(a.window.AF.interval.phase, "rest");
    a.run("toggleTimer()");
    assert.equal(a.window.AF.interval.paused, true);
  }),
);

test(
  "a fresh installation has no personal weight or goal defaults",
  withApp((a) => {
    assert.equal(a.run("settings.startKg"), null);
    assert.equal(a.run("settings.goalKg"), null);
    a.click("profile");
    assert.equal(a.document.getElementById("af-profile-weight").value, "");
  }),
);
test(
  "profile setup records weight locally without requiring a lower goal",
  withApp((a) => {
    a.click("profile");
    a.set("af-profile-weight", 100);
    a.submit("profile");
    assert.equal(a.run("settings.startKg"), 100);
    assert.equal(a.run("settings.goalKg"), 100);
    assert.equal(a.run("weightLog.at(-1).kg"), 100);
  }),
);
