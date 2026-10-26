const test = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./helpers.cjs");
test("personal split templates are restored without rewriting originals or overriding later choices", () => {
  const templates = Object.entries({
    d1: "Brust / Trizeps",
    d4: "Beine / Core",
    d2: "Rücken / Bizeps",
    d3: "Schulter / Core",
  }).map(([id, name]) => ({
    id: "test-" + id,
    dayId: id,
    dayName: name,
    name,
    exercises: [
      {
        name: "Dead Bug",
        muscle: "Core",
        sets: 3,
        reps: "8 je Seite",
        bw: true,
      },
    ],
  }));
  const a = boot({ af_templates: templates });
  try {
    assert.equal(a.run("settings.templateSchedule.d4"), "test-d4");
    assert.equal(
      a.run("WORKOUT_DAYS.find(d=>d.id==='d3').name"),
      "Schulter / Core",
    );
    a.run("doStartWorkout('d4')");
    assert.equal(a.run("workoutExercises[0].setData.length"), 2);
    assert.equal(a.run("getTemplates()[0].exercises[0].sets"), 3);
    a.run("settings.templateSchedule={};renderWorkoutSelect()");
    assert.equal(a.run("Object.keys(settings.templateSchedule).length"), 0);
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
});
