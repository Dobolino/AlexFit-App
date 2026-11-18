const test = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./helpers.cjs");

function withApp(fn) {
  return () => {
    const a = boot();
    try {
      fn(a);
      assert.deepEqual(a.errors, []);
    } finally {
      a.close();
    }
  };
}

test("all current plan and library exercises have labelled anatomical regions", withApp((a) => {
  assert.equal(a.run(`(() => {
    const names = new Set([...EXERCISE_LIBRARY.map(e => e.name),
      ...Object.values(WORKOUT_PLANS).concat(Object.values(WORKOUT_PLANS_GYM)).flatMap(p => p.days.flatMap(d => d.exercises.map(e => e.name)))]);
    return [...names].every(name => {
      const data = EXERCISE_MUSCLES[name];
      return data && data.pri.length && [...data.pri, ...data.sec].every(key =>
        MUSCLE_LABELS[key] && BODY_MUSCLES_MAP[key]?.length) &&
        !data.pri.some(key => data.sec.includes(key));
    });
  })()`), true);
}));

test("seitheben highlights the side shoulder without also painting front and rear", withApp((a) => {
  const regions = a.run("Object.keys(buildMuscleBodyState(EXERCISE_MUSCLES['Lateral Raises'].pri, []))");
  assert.ok(regions.includes("shoulder-side-left"));
  assert.ok(regions.includes("shoulder-side-right"));
  assert.ok(!regions.some(key => /front|rear/.test(key)));
}));

test("mid-back and calf highlights do not bleed into unrelated anatomical regions", withApp((a) => {
  assert.equal(a.run("BODY_MUSCLES_MAP[M.BACK_MID].some(id => id.includes('lower-back'))"), false);
  assert.equal(a.run("BODY_MUSCLES_MAP[M.CALF].some(id => id.includes('tibialis'))"), false);
}));

test("goblet squat detail renders muscles instead of silently showing an empty anatomy chart", withApp((a) => {
  a.run("showExerciseInfo('Goblet Squat')");
  const text = a.document.getElementById("ex-info-box").textContent;
  assert.match(text, /Hauptmuskeln/);
  assert.match(text, /Quadrizeps/);
  assert.match(text, /Gesäß/);
}));

test("rowing classifications stay consistent across interval and steady exercise modes", withApp((a) => {
  assert.equal(a.run("JSON.stringify(EXERCISE_MUSCLES['Rowing Intervals']) === JSON.stringify(EXERCISE_MUSCLES['Rowing Steady-State'])"), true);
  assert.equal(a.run("EXERCISE_MUSCLES['Rowing Intervals'].pri.includes(M.QUAD) && EXERCISE_MUSCLES['Rowing Intervals'].pri.includes(M.GLUTE)"), true);
  assert.equal(a.run("[...EXERCISE_MUSCLES['Rowing Intervals'].pri,...EXERCISE_MUSCLES['Rowing Intervals'].sec].includes(M.CARDIO)"), false);
}));

test("bench press displays both local outlines with distinct fill and hatch", withApp((app) => {
  app.run("doStartWorkout('d1');showExerciseInfo('Dumbbell Bench Press','muscles')");
  const detail = app.document.getElementById("ex-info-box");
  assert.equal(detail.querySelectorAll('[data-anatomy-side="front"] [data-region]').length, 40);
  assert.equal(detail.querySelectorAll('[data-anatomy-side="back"] [data-region]').length, 49);
  assert.ok(detail.querySelector('[data-region="chest-upper-left"].af-region-primary'));
  const arm = detail.querySelector('[data-region="triceps-long-left"].af-region-secondary');
  assert.ok(arm);
  const hatchId = arm.getAttribute("fill").match(/^url\(#([\w-]+)\)$/)[1];
  assert.ok(arm.closest("svg").querySelector("pattern#" + hatchId));
  assert.match(detail.querySelector(".af-anatomy").style.getPropertyValue("--anatomy-accent"), /#3B82F6/i);
  assert.equal(detail.querySelector("iframe"), null);
}));

test("preview anatomy follows the scheduled custom exercises and remains intact under exercise details", withApp((app) => {
  app.run(`saveTemplates([{id:'map-plan', name:'Trizeps', exercises:[{name:'Dumbbell Kickbacks',sets:3,reps:'12'}]}]);
    settings.templateSchedule={d1:'map-plan'};openWorkoutPreview('d1');`);
  const preview = app.document.getElementById("workout-preview-body");
  assert.ok(preview.querySelector('[data-region="triceps-long-left"].af-region-primary'));
  assert.ok(preview.querySelector('[data-region="chest-upper-left"].af-region-neutral'));
  const detailsButton = preview.querySelector('button[data-name="Dumbbell Kickbacks"]');
  assert.ok(detailsButton);
  app.run(`showExerciseInfo('Dumbbell Kickbacks','all','#3B82F6')`);
  const allPatterns = [...app.document.querySelectorAll("pattern[id]")].map(node => node.id);
  assert.equal(new Set(allPatterns).size, allPatterns.length);
  app.run("closeExerciseInfo()");
  assert.equal(app.document.getElementById("workout-preview-overlay").style.display, "flex");
}));
