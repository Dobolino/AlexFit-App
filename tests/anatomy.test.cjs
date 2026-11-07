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
      ...Object.values(WORKOUT_PLANS).flatMap(p => p.days.flatMap(d => d.exercises.map(e => e.name)))]);
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
