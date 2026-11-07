const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers.cjs');
function appTest(fn) {
  return () => { const a = boot(); try { fn(a); assert.deepEqual(a.errors, []); } finally { a.close(); } };
}
test('third set copies current load and reps without marking it complete or copying RPE', appTest(a => {
  a.run("doStartWorkout('d1');workoutExercises[0].setData[1]={weight:'16',reps:'10',rpe:'8',done:true};addSet(0)");
  const set = a.run('workoutExercises[0].setData[2]');
  assert.equal(set.weight, '16'); assert.equal(set.reps, '10');
  assert.equal(set.done, false); assert.equal(set.rpe, undefined);
  assert.match(a.document.getElementById('workout-prog-txt').textContent, /11 Sätze/);
  a.run('restoreSession();renderExerciseList()');
  assert.equal(a.run('workoutExercises[0].setData.length'), 3);
  assert.match(a.document.querySelector('.af-workout-flow').textContent, /1\/3/);
}));
test('removing an entered or completed set requires confirmation', appTest(a => {
  a.run("doStartWorkout('d1');workoutExercises[0].setData[1]={weight:'16',reps:'10',done:true};removeSet(0)");
  assert.equal(a.run('workoutExercises[0].setData.length'), 2);
  a.run('closeConfirm(false)');
  assert.equal(a.run('workoutExercises[0].setData[1].done'), true);
  a.run('removeSet(0);closeConfirm(true)');
  assert.equal(a.run('workoutExercises[0].setData.length'), 1);
}));
test('video and muscle details share the exercise but preserve entered values', appTest(a => {
  a.run("doStartWorkout('d1');workoutExercises[0].setData[0].weight='16';showExerciseInfo('Dumbbell Bench Press')");
  const link = a.document.querySelector('.af-video-links a');
  assert.match(link.href, /^https:\/\/www.youtube.com\/watch\?v=/);
  assert.equal(link.target, '_blank');
  assert.ok(a.document.querySelector('#ex-info-box iframe').title);
  a.run("closeExerciseInfo();showExerciseInfo('Dumbbell Bench Press','muscles')");
  assert.equal(a.document.querySelector('#ex-info-box iframe'), null);
  assert.match(a.document.getElementById('ex-info-box').textContent, /Brust/);
  assert.equal(a.run('workoutExercises[0].setData[0].weight'), '16');
}));
test('all active standard plan exercises have a video and the flow includes all exercises', appTest(a => {
  assert.equal(a.run('Object.values(WORKOUT_PLANS).flatMap(p=>p.days.flatMap(d=>d.exercises)).every(e=>!!EXERCISE_VIDEOS[e.name])'), true);
  a.run("doStartWorkout('d1')");
  assert.equal(a.document.querySelectorAll('.af-workout-flow li').length, a.run('workoutExercises.length'));
  assert.match(a.document.querySelector('.af-workout-flow [aria-current="step"]').textContent, /Jetzt: Satz 1/);
  assert.match(a.document.querySelector('.af-muscle-summary').textContent, /Hauptmuskeln: Brust/);
}));
test('exercise replacement keeps movement families and offers Ab Wheel for core', appTest(a => {
  a.run("doStartWorkout('d1');showAltMenu(1)");
  const rowOptions = [...a.document.querySelectorAll('#af-variants [data-af-action="swap"]')].map(b=>b.dataset.name);
  assert.ok(rowOptions.includes('Double-Arm Dumbbell Row'));
  assert.ok(!rowOptions.some(n=>/Pull-up|Incline|Band|Press|Curl/.test(n)));
  a.run("document.getElementById('af-variants').remove();workoutExercises=[{...getExDef('Dead Bug'),setData:[{reps:'8',done:false}]}];showAltMenu(0)");
  assert.ok(a.document.querySelector('#af-variants [data-name="Ab Wheel Rollouts"]'));
  a.run("swapExercise(0,'Ab Wheel Rollouts')");
  assert.equal(a.run('workoutExercises[0].bw'), true);
  assert.equal(a.run('workoutExercises[0].setData.length'), 1);
}));
