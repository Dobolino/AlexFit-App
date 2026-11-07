const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers.cjs');
function appTest(fn, stored) { return () => {const a=boot(stored);try{fn(a);assert.deepEqual(a.errors,[]);}finally{a.close();}};}
test('four named navigation tabs use distinct sections without exposing nutrition', appTest(a=>{
 assert.deepEqual([...a.document.querySelectorAll('#bottomnav .nlabel')].map(e=>e.textContent),['Heute','Training','Cardio','Fortschritt']);
 assert.equal(a.document.getElementById('nav-nutrition'),null);
 a.run("switchTab('weight')");
 assert.equal(a.document.querySelector('#bottomnav [aria-current="page"]').id,'nav-stats');
 for(const section of ['workout','cardio','stats','dashboard']){
  a.run(`switchTab('${section}')`);
  assert.equal(a.document.body.dataset.section,section);
  assert.equal(a.document.querySelector('#bottomnav [aria-current="page"]').id,'nav-'+section);
 }
}));
test('removing nutrition entry points keeps existing imported nutrition records intact', appTest(a=>{
 assert.equal(a.window.AF.state.dailyNutrition[0].kcal,2300);
 a.click('profile');
 const archive=a.document.querySelector('[data-af-form="calculations"]').closest('details');
 assert.equal(archive.hidden,true);
 const data=a.run('collectBackupPayload()');
 assert.equal(data.data.coach.dailyNutrition[0].kcal,2300);
}, {af_coach:{dailyNutrition:[{date:'2026-10-24',kcal:2300}]}}));
test('progress check can be documented using weight trends without duplicating Yazio entries', appTest(a=>{
 a.run("weightLog=Array.from({length:14},(_,i)=>({date:addDaysISO(todayISO(),i-13),kg:80-i*.02}));switchTab('stats')");
 a.click('checkin');
 const text=a.document.querySelector('.screen.active').textContent;
 assert.doesNotMatch(text,/Ernährungstage|Ø Aufnahme|Kalorienanpassung/);
 a.click('complete-checkin');
 assert.equal(a.window.AF.state.checkins.length,1);
 assert.equal(a.window.AF.state.dailyNutrition.length,0);
}));
