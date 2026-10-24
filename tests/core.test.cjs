const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../coach-core.js"),
  data = require("../recipe-library.json");
const name = "Dumbbell Bench Press",
  definition = { sets: 3, reps: "10–12" },
  weights = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
const session = (date, reps = 12, rpe = 8, weight = 20) => ({
  date,
  exercises: [
    { name, sets: Array.from({ length: 3 }, () => ({ weight, reps, rpe })) },
  ],
});
test("Mifflin validates required context and uses sitting baseline independently", () => {
  assert.equal(C.mifflin({ age: 36, heightCm: 180, sex: "male" }, 100), 1950);
  assert.equal(C.mifflin({ age: null, heightCm: 180, sex: "male" }, 100), null);
  assert.equal(C.mifflin({ age: 36, heightCm: 180, sex: "female" }, 100), 1784);
});
test("protein derives from lean mass and does not guess missing body fat", () => {
  assert.deepEqual(C.proteinRange(100, 25), {
    leanKg: 75,
    min: 165,
    max: 195,
  });
  assert.equal(C.proteinRange(100, null), null);
});
test("low reps and RPE 10 prevent the observed false progression", () => {
  const p = C.progression({
    name,
    history: [session("2026-10-01", 5, 10), session("2026-10-08", 4, 10)],
    definition,
    weights,
  });
  assert.equal(p.action, "hold");
  assert.equal(p.suggestedW, undefined);
});
test("progression skips unrelated split sessions and uses actual available weights", () => {
  const history = [
    session("2026-10-01"),
    { date: "2026-10-03", exercises: [{ name: "Dumbbell Squats", sets: [] }] },
    session("2026-10-08"),
    { date: "2026-10-09", exercises: [{ name: "Dead Bug", sets: [] }] },
  ];
  assert.equal(
    C.progression({ name, history, definition, weights }).suggestedW,
    22,
  );
});
test("pain, blocked exercises, unknown effort and incomplete sets hold the load", () => {
  for (const extra of [{ pain: true }, { blocked: true }])
    assert.equal(
      C.progression({
        name,
        history: [session("2026-10-01"), session("2026-10-08")],
        definition,
        weights,
        ...extra,
      }).action,
      "hold",
    );
  assert.equal(
    C.progression({
      name,
      history: [session("2026-10-01", 12, null), session("2026-10-08")],
      definition,
      weights,
    }).action,
    "hold",
  );
  const history = [session("2026-10-01"), session("2026-10-08")];
  history[1].exercises[0].sets.pop();
  assert.equal(
    C.progression({ name, history, definition, weights }).action,
    "hold",
  );
});
test("no invented weight increments beyond equipment or excessively large steps", () => {
  assert.equal(
    C.progression({
      name,
      history: [
        session("2026-10-01", 12, 8, 24),
        session("2026-10-08", 12, 8, 24),
      ],
      definition,
      weights,
    }).action,
    "hold",
  );
  assert.equal(
    C.progression({
      name,
      history: [
        session("2026-10-01", 12, 8, 8),
        session("2026-10-08", 12, 8, 8),
      ],
      definition,
      weights,
    }).action,
    "hold",
  );
});
test("time exercises have real seconds and interval rest definitions", () => {
  assert.equal(C.definition("Plank", { reps: "36–40s" }).targetSeconds, 40);
  assert.equal(
    C.definition("Rowing Steady-State", { reps: "20 Min" }).targetSeconds,
    1200,
  );
  assert.equal(C.definition("Rowing Intervals").restTimer, 60);
  assert.equal(
    C.definition("Farmer's Walk (Dumbbells)", { reps: "40s" }).unit,
    "seconds",
  );
});
test("weight trend is calendar based, deduplicates days and requires enough data", () => {
  const a = [];
  for (let i = 0; i < 14; i++)
    a.push({ date: C.addDays("2026-10-24", -i), kg: i < 7 ? 99 : 100 });
  a.push({ date: "2026-10-24", kg: 99 });
  assert.equal(C.weightTrend(a, "2026-10-24").change, -1);
  assert.equal(C.weightTrend(a, "2026-10-24").currentCount, 7);
  assert.equal(C.weightTrend(a.slice(0, 2), "2026-10-24").ready, false);
});
test("calendar helpers validate dates and handle week/year boundaries", () => {
  assert.equal(C.isoDate("2026-02-30"), false);
  assert.equal(C.monday("2026-10-24"), "2026-10-19");
  assert.equal(C.isoWeek("2021-01-01"), "2020-W53");
  assert.equal(C.daysBetween("2026-03-28", "2026-03-30"), 2);
});
test("activity estimates use duration, mass and net energy; missing intensity stays unknown", () => {
  assert.equal(
    C.activityEnergy({ type: "cycling", time: 60, intensity: "easy" }, 100)
      .kcal,
    300,
  );
  assert.equal(C.activityEnergy({ type: "cycling", time: 60 }, 100), null);
  assert.equal(
    C.activityEnergy(
      {
        type: "cycling",
        time: 60,
        energySource: "device",
        kcal: 600,
        kcalMode: "gross",
      },
      100,
    ).kcal,
    500,
  );
});
test("a linked device entry replaces workout estimates instead of double counting", () => {
  const e = [
    {
      date: "2026-10-24",
      type: "rowing",
      time: 60,
      intensity: "moderate",
      workoutId: "h1",
    },
    {
      date: "2026-10-24",
      type: "rowing",
      time: 60,
      energySource: "device",
      kcal: 400,
      kcalMode: "active",
      workoutId: "h1",
    },
  ];
  assert.equal(C.energyForDay(e, "2026-10-24", 100).kcal, 400);
});
test("an unknown earlier activity does not suppress a valid linked estimate", () => {
  assert.equal(
    C.energyForDay(
      [
        { date: "2026-10-24", type: "cycling", time: 60, workoutId: "x" },
        {
          date: "2026-10-24",
          type: "cycling",
          time: 60,
          intensity: "easy",
          workoutId: "x",
        },
      ],
      "2026-10-24",
      100,
    ).kcal,
    300,
  );
});
test("check-in does not change calories without current trend and intake", () => {
  const s = C.defaults();
  assert.equal(C.checkin(s, [], "2026-10-24").adjustment, null);
  assert.equal(C.checkin(s, [], "2026-10-24").ready, false);
});
test("recomposition with falling waist does not recommend a calorie cut", () => {
  const s = C.defaults();
  s.profile.targetWeeklyChange = -0.3;
  s.measurements = [
    { date: "2026-10-10", waistCm: 100 },
    { date: "2026-10-24", waistCm: 99 },
  ];
  const a = [];
  for (let i = 0; i < 14; i++) {
    const date = C.addDays("2026-10-24", -i);
    a.push({ date, kg: 100 });
    s.dailyNutrition.push({ date, kcal: 2400 });
  }
  const p = C.checkin(s, a, "2026-10-24");
  assert.equal(p.ready, true);
  assert.equal(p.adjustment, null);
  assert.equal(p.recommendation, "Ziel beibehalten");
});
test("recipe library validates against schema and all ingredient references", () => {
  assert.deepEqual(C.validateRecipes(data), []);
  const broken = structuredClone(data);
  broken.recipes[0].steps[0].uses.push({ ingredientId: "missing" });
  assert.ok(C.validateRecipes(broken).length);
});
test("recipe scaling scales ingredient weights, references and optional overrides", () => {
  const r = C.scaleRecipe(data.recipes[0], 3);
  assert.equal(r.servings, 3);
  assert.equal(r.ingredients[0].amount, 150);
  assert.equal(r.weightMeasured, false);
  assert.deepEqual(C.validateRecipes({ ...data, recipes: [r] }), []);
});
test("nutrition is conserved across portions and calculated from real finished weight", () => {
  const r = {
    servings: 5,
    finishedWeightG: 1000,
    weightMeasured: true,
    ingredients: [
      {
        name: "x",
        amount: 500,
        unit: "g",
        nutritionPer100g: {
          kcal: 100,
          protein_g: 10,
          carbs_g: 10,
          fat_g: 2,
          fiber_g: 2,
          sodium_mg: 40,
        },
      },
    ],
  };
  const n = C.recipeNutrition(r);
  assert.equal(n.perServing.kcal, 100);
  assert.equal(n.per100g.kcal, 50);
  assert.equal(n.portionWeightG, 200);
  assert.equal(n.perServing.sodium_mg, 40);
});
test("missing sodium, unit conversion or end weight is not silently invented", () => {
  const r = structuredClone(data.recipes[0]);
  assert.equal(C.recipeNutrition(r).per100g, null);
  r.ingredients[0].nutritionPer100g.sodium_mg = null;
  assert.equal(C.recipeNutrition(r).complete, false);
  assert.equal(C.ingredientGrams({ unit: "EL", amount: 1 }), null);
  assert.equal(C.ingredientGrams({ unit: "ml", amount: 100 }), null);
  assert.equal(
    C.ingredientGrams({ unit: "ml", amount: 100, densityGPerMl: 0.9 }),
    90,
  );
});
test("interleaved cooking never overlaps active work and respects step order", () => {
  const schedule = C.cookingSchedule(data.recipes);
  for (let i = 0; i < schedule.length; i++)
    for (let j = i + 1; j < schedule.length; j++)
      assert.ok(
        schedule[i].activeEnd <= schedule[j].start ||
          schedule[j].activeEnd <= schedule[i].start,
      );
  for (const r of data.recipes) {
    const a = schedule.filter((s) => s.recipeId === r.id);
    for (let i = 1; i < a.length; i++) assert.ok(a[i].start >= a[i - 1].end);
  }
  assert.ok(
    Math.max(...schedule.map((s) => s.end)) <
      data.recipes
        .flatMap((r) => [...r.misEnPlace, ...r.steps])
        .reduce((a, s) => a + (s.timeMinutes || s.timerMinutes), 0),
  );
});
test("shopping aggregates exact products and rounds purchased packages", () => {
  const items = C.shopping(data.recipes);
  assert.equal(items.filter((i) => i.name.includes("Tofu")).length, 1);
  const tofu = items.find((i) => i.name.includes("Tofu"));
  assert.equal(tofu.amount, 2100);
  assert.equal(tofu.costCHF, 8.05);
  assert.equal(items.find((i) => i.name.includes("Linsen")).costCHF, null);
});
test("backup merge fills a fresh profile and preserves configured current preferences", () => {
  const a = C.defaults(),
    b = C.defaults();
  b.profile.age = 36;
  b.profile.restrictionsConfirmed = true;
  b.dailyNutrition = [{ id: "d1", date: "2026-10-24", kcal: 2300 }];
  assert.equal(C.mergeStates(a, b).profile.age, 36);
  a.profile.age = 40;
  a.profile.restrictionsConfirmed = true;
  assert.equal(C.mergeStates(a, b).profile.age, 40);
  assert.equal(C.mergeStates(a, b, true).profile.age, 36);
  assert.equal(C.mergeStates(C.mergeStates(a, b), b).dailyNutrition.length, 1);
});
