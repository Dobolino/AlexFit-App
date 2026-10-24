(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AlexFitCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const NUTRIENTS = [
    "kcal",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "sodium_mg",
  ];
  const DEFAULT_BLOCKED = [
    "Dumbbell Shoulder Press",
    "Overhead Triceps Extension",
    "Farmer's Walk (Dumbbells)",
    "Pike Push-ups",
    "Dumbbell Shrugs",
  ];
  const SOURCES = {
    mifflin: "https://pubmed.ncbi.nlm.nih.gov/2305711/",
    activity: "https://pacompendium.com/",
    progression: "https://pubmed.ncbi.nlm.nih.gov/19204579/",
    neck: "https://www.nhsinform.scot/illnesses-and-conditions/muscle-bone-and-joints/neck-and-back-problems-and-conditions/neck-problems/",
  };
  const finite = (v) =>
    v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v));
  const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
  function isoDate(v) {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(v + "T12:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v;
  }
  function addDays(iso, n) {
    if (!isoDate(iso)) throw Error("Ungültiges Datum");
    const d = new Date(iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    return Math.round(
      (Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000,
    );
  }
  function monday(iso) {
    const d = new Date(iso + "T12:00:00Z");
    return addDays(iso, -((d.getUTCDay() + 6) % 7));
  }
  function isoWeek(iso) {
    const d = new Date(iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const y = d.getUTCFullYear();
    return (
      y +
      "-W" +
      String(
        Math.ceil(((d - new Date(Date.UTC(y, 0, 1))) / 86400000 + 1) / 7),
      ).padStart(2, "0")
    );
  }
  function defaults() {
    return {
      version: 1,
      profile: {
        age: null,
        heightCm: null,
        sex: "male",
        bodyFatPct: null,
        experience: "",
        sessionMinutes: null,
        neckSensitive: true,
        restrictionsConfirmed: false,
        goalMode: "recomp",
        dumbbellWeights: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24],
        targetWeeklyChange: null,
        energyAdjustmentKcal: null,
        bikePerWeek: null,
      },
      blockedExercises: [...DEFAULT_BLOCKED],
      painLog: [],
      measurements: [],
      dailyNutrition: [],
      weekPlans: [],
      checkins: [],
      recipes: [],
      cookingPlans: [],
    };
  }
  function normalizeState(input) {
    const d = defaults();
    if (!input || typeof input !== "object" || Array.isArray(input)) return d;
    const s = {
      ...d,
      ...input,
      profile: { ...d.profile, ...(input.profile || {}) },
      version: 1,
    };
    for (const k of Object.keys(d).filter((k) => Array.isArray(d[k])))
      s[k] = Array.isArray(input[k]) ? input[k] : d[k];
    s.profile.dumbbellWeights = [
      ...new Set(
        (Array.isArray(s.profile.dumbbellWeights)
          ? s.profile.dumbbellWeights
          : []
        )
          .filter((x) => finite(x) && x > 0 && x <= 100)
          .map(Number),
      ),
    ].sort((a, b) => a - b);
    return s;
  }
  function definition(name, base = {}) {
    const n = String(name || "");
    let unit = base.unit || "reps",
      target = base.targetSeconds || null,
      rest = base.restTimer || null;
    if (/Rowing Intervals/i.test(n)) {
      unit = "seconds";
      target = 120;
      rest = 60;
    } else if (/Rowing Steady/i.test(n)) {
      unit = "seconds";
      target = 900;
    } else if (/WalkingPad Warm/i.test(n)) {
      unit = "seconds";
      target = 300;
    } else if (/Plank|Hold|Farmer.s Walk|Wall Sit|Dead Hang/i.test(n)) {
      unit = "seconds";
      const m = String(base.reps || "").match(/(\d+)(?:[–-](\d+))?\s*s/);
      target = m ? Number(m[2] || m[1]) : 30;
    }
    if (
      unit === "seconds" &&
      base.reps &&
      /Min/.test(base.reps) &&
      !/Intervals/.test(n)
    ) {
      const m = base.reps.match(/(\d+)\s*Min/);
      if (m) target = Number(m[1]) * 60;
    }
    return {
      ...base,
      name: n,
      unit,
      targetSeconds: target,
      restTimer: rest,
      weightBasis:
        base.weightBasis ||
        (/Dumbbell|Bench Press|Lateral Raises|Front Raises|Romanian Deadlift|Hammer Curls|Concentration Curls/i.test(
          n,
        )
          ? "perHand"
          : "external"),
      perSide:
        base.perSide ||
        /je Seite|Single-Arm|Lunges|Split Squat|Dead Bug/i.test(n),
    };
  }
  function repRange(text) {
    const m = String(text || "").match(/^(\d+)(?:\s*[–-]\s*(\d+))?/);
    return m ? { min: Number(m[1]), max: Number(m[2] || m[1]) } : null;
  }
  function progression({
    name,
    history = [],
    definition: def = {},
    weights = [],
    blocked = false,
    pain = false,
  }) {
    if (blocked || pain)
      return {
        action: "hold",
        reason: "Beschwerden oder Übungssperre: keine Laststeigerung.",
      };
    if (def.bw || definition(name, def).unit !== "reps")
      return {
        action: "hold",
        reason: "Fortschritt über saubere Wiederholungen oder Zeit verfolgen.",
      };
    const range = repRange(def.reps);
    if (!range)
      return {
        action: "hold",
        reason: "Zuerst einen Wiederholungsbereich festlegen.",
      };
    const sessions = history
      .map((h, i) => ({ ...h, _i: i }))
      .filter(
        (h) =>
          isoDate(h.date) &&
          Array.isArray(h.exercises) &&
          h.exercises.some((e) => e.name === name),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a._i - b._i)
      .slice(-2);
    if (sessions.length < 2)
      return {
        action: "hold",
        reason: "Zwei protokollierte Einheiten dieser Übung abwarten.",
      };
    const sets = sessions.map(
        (h) => h.exercises.find((e) => e.name === name).sets || [],
      ),
      required = Math.max(
        Number(def.sets) || 3,
        ...sessions.map(
          (h) =>
            Number(h.exercises.find((e) => e.name === name).plannedSets) || 0,
        ),
      ),
      current = Number(sets[1][0]?.weight) || 0;
    if (!current || sets.some((a) => a.length < required))
      return {
        action: "hold",
        currentW: current,
        reason: "Noch nicht alle geplanten Arbeitssätze erreicht.",
      };
    if (
      sets.some((a) =>
        a
          .slice(0, required)
          .some(
            (s) => Number(s.weight) !== current || Number(s.reps) < range.max,
          ),
      )
    )
      return {
        action: "hold",
        currentW: current,
        reason:
          "Erst in zwei Einheiten alle Arbeitssätze am oberen Wiederholungsziel schaffen.",
      };
    if (
      sets.some((a) =>
        a.slice(0, required).some((s) => !finite(s.rpe) || Number(s.rpe) > 8),
      )
    )
      return {
        action: "hold",
        currentW: current,
        reason:
          "Anstrengung erfassen: mindestens zwei Wiederholungen Reserve (RPE höchstens 8).",
      };
    const next = [...weights]
      .map(Number)
      .sort((a, b) => a - b)
      .find((w) => w > current);
    if (!next)
      return {
        action: "hold",
        currentW: current,
        reason:
          "Höchste Hantelstufe erreicht. Wiederholungen, Technik oder Tempo mit dem Coach prüfen.",
      };
    if (next / current > 1.101)
      return {
        action: "hold",
        currentW: current,
        reason:
          "Nächste Hantelstufe mehr als 10 % höher: Zwischengewicht oder Wiederholungsprogression prüfen.",
      };
    return {
      action: "increase",
      name,
      currentW: current,
      suggestedW: next,
      reason:
        "Zwei vollständige Einheiten am oberen Wiederholungsziel, RPE höchstens 8 und keine gemeldeten Beschwerden.",
    };
  }
  function weightTrend(entries, end) {
    const map = new Map();
    for (const e of entries || [])
      if (
        isoDate(e.date) &&
        finite(e.kg) &&
        e.kg >= 30 &&
        e.kg <= 300 &&
        e.date <= end
      )
        map.set(e.date, Number(e.kg));
    const window = (from, to) =>
        [...map].filter(([d]) => d >= from && d <= to).map(([, v]) => v),
      a = window(addDays(end, -6), end),
      b = window(addDays(end, -13), addDays(end, -7)),
      mean = (x) =>
        x.length ? round(x.reduce((s, v) => s + v, 0) / x.length, 2) : null;
    return {
      current: mean(a),
      previous: mean(b),
      currentCount: a.length,
      previousCount: b.length,
      ready: a.length >= 3 && b.length >= 3,
      change: a.length && b.length ? round(mean(a) - mean(b), 2) : null,
    };
  }
  function mifflin(p, kg) {
    if (
      !finite(kg) ||
      kg < 30 ||
      kg > 300 ||
      !finite(p.age) ||
      p.age < 18 ||
      p.age > 100 ||
      !finite(p.heightCm) ||
      p.heightCm < 120 ||
      p.heightCm > 230 ||
      !["male", "female"].includes(p.sex)
    )
      return null;
    return round(
      10 * kg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "male" ? 5 : -161),
      0,
    );
  }
  function proteinRange(kg, bf) {
    if (!finite(kg) || kg <= 0 || !finite(bf) || bf < 5 || bf > 60) return null;
    const lean = kg * (1 - bf / 100);
    return {
      leanKg: round(lean),
      min: round(lean * 2.2, 0),
      max: round(lean * 2.6, 0),
    };
  }
  const MET = {
    walking: { easy: 2.8, moderate: 3.8, hard: 4.8 },
    jogging: { easy: 6.5, moderate: 8.5, hard: 10.5 },
    cycling: { easy: 4, moderate: 6.8, hard: 10 },
    rowing: { easy: 5, moderate: 7.3, hard: 11 },
    hiit: { easy: 6, moderate: 8, hard: 11 },
    strength: { easy: 3, moderate: 3.5, hard: 6 },
  };
  function activityEnergy(e, kg) {
    const min = Number(e.time ?? e.duration);
    if (!finite(kg) || kg <= 0 || !finite(min) || min <= 0) return null;
    if (finite(e.kcal) && Number(e.kcal) > 0 && e.energySource === "device")
      return {
        kcal: round(
          Math.max(
            0,
            Number(e.kcal) - (e.kcalMode === "gross" ? (kg * min) / 60 : 0),
          ),
          0,
        ),
        source:
          "Gerät (" +
          (e.kcalMode === "gross"
            ? "Gesamtenergie abzüglich Ruheanteil"
            : "aktive Energie") +
          ")",
        estimated: false,
      };
    const met = MET[e.type]?.[e.intensity];
    if (!met) return null;
    return {
      kcal: round(((met - 1) * kg * min) / 60, 0),
      source: "MET-Schätzung, aktive Energie über Ruheverbrauch",
      estimated: true,
    };
  }
  function energyForDay(activities, date, kg) {
    const seen = new Set(),
      items = [];
    for (const e of [...(activities || [])].sort(
      (a, b) => (b.energySource === "device") - (a.energySource === "device"),
    )) {
      if (e.date !== date) continue;
      const key =
        e.workoutId ||
        e.externalId ||
        [
          e.date,
          e.type,
          round(Number(e.time ?? e.duration) || 0),
          Number(e.dist || e.meters) || 0,
        ].join("|");
      if (seen.has(key)) continue;
      const energy = activityEnergy(e, kg);
      if (energy) {
        seen.add(key);
        items.push({ ...energy, key });
      }
    }
    return { kcal: items.reduce((a, e) => a + e.kcal, 0), items };
  }
  function checkin(state, weights, end) {
    const trend = weightTrend(weights, end),
      recent = (state.dailyNutrition || []).filter(
        (e) =>
          isoDate(e.date) &&
          e.date >= addDays(end, -13) &&
          e.date <= end &&
          finite(e.kcal) &&
          e.kcal > 0,
      ),
      unique = new Map(recent.map((e) => [e.date, e])),
      intake = unique.size
        ? round(
            [...unique.values()].reduce((a, e) => a + Number(e.kcal), 0) /
              unique.size,
            0,
          )
        : null,
      last = [...(state.checkins || [])]
        .filter((e) => isoDate(e.date))
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1),
      due = !last || daysBetween(last.date, end) >= 14;
    const result = {
      due,
      trend,
      intake,
      intakeDays: unique.size,
      ready: trend.ready && unique.size >= 10,
      recommendation: "Daten ergänzen",
      reason:
        "Mindestens drei Gewichtsmessungen pro Vergleichswoche und zehn Ernährungstage in 14 Tagen erfassen.",
      adjustment: null,
    };
    if (!result.ready) return result;
    const target = state.profile.targetWeeklyChange;
    if (!finite(target))
      return {
        ...result,
        recommendation: "Verlauf gemeinsam beurteilen",
        reason:
          "Ein individuelles Wochenziel für die Gewichtsänderung fehlt. Bauchumfang und Kraftentwicklung berücksichtigen.",
      };
    if (!due)
      return {
        ...result,
        recommendation: "Ziel beibehalten",
        reason: "Der letzte Check-in liegt weniger als 14 Tage zurück.",
      };
    const m = (state.measurements || [])
      .filter(
        (e) =>
          isoDate(e.date) &&
          e.date >= addDays(end, -21) &&
          e.date <= end &&
          finite(e.waistCm),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    if (state.profile.goalMode === "recomp" && m.length < 2)
      return {
        ...result,
        recommendation: "Bauchumfang ergänzen",
        reason:
          "Vor einer Kalorienänderung mindestens zwei Umfangsmessungen zum Vergleich erfassen.",
      };
    if (state.profile.goalMode === "recomp" && m.at(-1).waistCm < m[0].waistCm)
      return {
        ...result,
        recommendation: "Ziel beibehalten",
        reason:
          "Der Bauchumfang sinkt. Das Gewicht allein begründet keine zusätzliche Kalorienreduktion.",
      };
    const delta = trend.change - Number(target);
    if (Math.abs(delta) <= 0.2)
      return {
        ...result,
        recommendation: "Ziel beibehalten",
        reason: "Der Verlauf liegt nahe deinem eingestellten Wochenziel.",
      };
    return {
      ...result,
      recommendation: "Mit dem Coach prüfen",
      adjustment: delta > 0 ? -100 : 100,
      reason:
        "Der Trend weicht vom Wochenziel ab. 100 kcal Änderung pro Tag zur Prüfung: Kraft, Hunger, Beschwerden und Bike-Umfang einbeziehen.",
    };
  }
  function ingredientGrams(i) {
    if (finite(i.rawGrams) && i.rawGrams > 0) return Number(i.rawGrams);
    if (!finite(i.amount) || i.amount <= 0) return null;
    if (i.unit === "g") return Number(i.amount);
    if (i.unit === "kg") return Number(i.amount) * 1000;
    if (
      ["ml", "l"].includes(i.unit) &&
      finite(i.densityGPerMl) &&
      i.densityGPerMl > 0
    )
      return Number(i.amount) * (i.unit === "l" ? 1000 : 1) * i.densityGPerMl;
    return null;
  }
  function recipeNutrition(
    r,
    servings = r.servings,
    finished = r.finishedWeightG,
  ) {
    const total = Object.fromEntries(NUTRIENTS.map((k) => [k, 0])),
      missing = [];
    for (const i of r.ingredients || []) {
      if (i.optional && !i.included) continue;
      const g = ingredientGrams(i);
      if (
        !g ||
        !i.nutritionPer100g ||
        NUTRIENTS.some(
          (k) => !finite(i.nutritionPer100g[k]) || i.nutritionPer100g[k] < 0,
        )
      ) {
        missing.push(i.name);
        continue;
      }
      for (const k of NUTRIENTS)
        total[k] += (Number(i.nutritionPer100g[k]) * g) / 100;
    }
    if (missing.length || !(servings > 0))
      return { complete: false, missing, perServing: null, per100g: null };
    const perServing = Object.fromEntries(
        NUTRIENTS.map((k) => [
          k,
          round(total[k] / servings, k === "sodium_mg" ? 0 : 1),
        ]),
      ),
      per100g =
        finished > 0
          ? Object.fromEntries(
              NUTRIENTS.map((k) => [
                k,
                round((total[k] / finished) * 100, k === "sodium_mg" ? 0 : 1),
              ]),
            )
          : null;
    return {
      complete: true,
      total,
      perServing,
      per100g,
      finishedWeightG: finished > 0 ? Number(finished) : null,
      portionWeightG: finished > 0 ? round(finished / servings, 0) : null,
      weightMeasured: r.weightMeasured === true,
    };
  }
  function scaleRecipe(r, servings) {
    const f = servings / r.servings,
      uses = (s) => ({
        ...s,
        uses: (s.uses || []).map((u) => ({
          ...u,
          amount: finite(u.amount) ? round(u.amount * f, 3) : undefined,
        })),
      });
    return {
      ...r,
      servings,
      finishedWeightG: r.finishedWeightG
        ? round(r.finishedWeightG * f, 0)
        : null,
      weightMeasured: false,
      ingredients: r.ingredients.map((i) => ({
        ...i,
        amount: round(i.amount * f, 3),
        rawGrams: i.rawGrams ? round(i.rawGrams * f, 3) : undefined,
      })),
      misEnPlace: (r.misEnPlace || []).map(uses),
      steps: r.steps.map(uses),
    };
  }
  function validateRecipes(p) {
    const errors = [];
    if (
      !p ||
      p.schemaVersion !== "1.3" ||
      !Array.isArray(p.recipes) ||
      p.recipes.length < 1 ||
      p.recipes.length > 2
    )
      return [
        "Erwartet wird recipes.json Schema 1.3 mit einem oder zwei Rezepten.",
      ];
    if (!/^\d{4}-W\d{2}$/.test(p.week || ""))
      errors.push("Kochwoche muss YYYY-Www enthalten.");
    const all = new Set(),
      add = (id) => {
        if (typeof id !== "string" || !id || all.has(id))
          errors.push("IDs fehlen oder sind doppelt: " + String(id));
        all.add(id);
      };
    for (const r of p.recipes) {
      if (!r || typeof r !== "object") {
        errors.push("Ungültiges Rezept.");
        continue;
      }
      add(r.id);
      if (
        !r.name ||
        !Number.isInteger(r.servings) ||
        r.servings < 1 ||
        r.servings > 100
      )
        errors.push("Rezeptname oder Portionszahl ungültig.");
      if (
        !Array.isArray(r.ingredients) ||
        !Array.isArray(r.steps) ||
        !r.steps.length
      ) {
        errors.push("Zutaten und Schritte erforderlich.");
        continue;
      }
      const ids = new Set(r.ingredients.map((i) => i.id));
      for (const i of r.ingredients) {
        add(i.id);
        if (!i.name || !finite(i.amount) || i.amount <= 0 || !i.unit)
          errors.push("Zutat oder Menge ungültig.");
      }
      for (const s of [...(r.misEnPlace || []), ...r.steps]) {
        add(s.id);
        for (const u of s.uses || [])
          if (!ids.has(u.ingredientId))
            errors.push("Unbekannte Zutat: " + u.ingredientId);
      }
      for (const s of r.steps)
        if (
          s.recipeId !== r.id ||
          !finite(s.order) ||
          !finite(s.timeMinutes) ||
          s.timeMinutes < 0 ||
          (finite(s.activeMinutes) &&
            (s.activeMinutes < 0 || s.activeMinutes > s.timeMinutes)) ||
          !["Topf", "Pfanne", "Ofen", "Arbeitsplatte"].includes(s.device)
        )
          errors.push("Kochschritt oder Gerät ungültig.");
    }
    return errors;
  }
  function cookingSchedule(
    recipes,
    equipment = { Topf: 2, Pfanne: 1, Ofen: 1, Arbeitsplatte: 1 },
  ) {
    const queue = recipes.flatMap((r) =>
        [
          ...(r.misEnPlace || []).map((s, i) => ({
            ...s,
            recipeId: r.id,
            recipeName: r.name,
            order: -100 + i,
            device: "Arbeitsplatte",
            timeMinutes: Number(s.timerMinutes) || 2,
            activeMinutes: Number(s.timerMinutes) || 2,
          })),
          ...r.steps.map((s) => ({ ...s, recipeName: r.name })),
        ].sort((a, b) => a.order - b.order),
      ),
      ready = {},
      resources = {},
      output = [];
    let hand = 0;
    for (const [d, q] of Object.entries(equipment))
      resources[d] = Array.from(
        { length: Math.max(1, Number(q) || 1) },
        () => 0,
      );
    while (queue.length) {
      const candidates = [];
      for (const r of recipes) {
        const s = queue.find((s) => s.recipeId === r.id);
        if (!s) continue;
        const slots = resources[s.device] || (resources[s.device] = [0]),
          slot = slots.indexOf(Math.min(...slots)),
          start = Math.max(ready[r.id] || 0, hand, slots[slot]),
          time = Number(s.timeMinutes) || 0,
          active = finite(s.activeMinutes) ? Number(s.activeMinutes) : time;
        candidates.push({
          s,
          slot,
          start,
          time,
          active,
          passive: time - active,
        });
      }
      candidates.sort((a, b) => a.start - b.start || b.passive - a.passive);
      const c = candidates[0];
      if (!c) break;
      queue.splice(queue.indexOf(c.s), 1);
      hand = c.start + c.active;
      ready[c.s.recipeId] = c.start + c.time;
      resources[c.s.device][c.slot] = c.start + c.time;
      output.push({
        ...c.s,
        start: c.start,
        end: c.start + c.time,
        activeEnd: c.start + c.active,
      });
    }
    return output;
  }
  const SHOP_CATEGORIES = {
    gemuese: "Früchte & Gemüse",
    fleisch_fisch: "Fleisch & Fisch",
    milch_ei: "Milch & Käse",
    trockenes: "Getreide & Beilagen",
    konserven: "Konserven & Saucen",
    gewuerze: "Gewürze, Öl & Backen",
    oele_saucen: "Gewürze, Öl & Backen",
    sonstiges: "Sonstiges",
  };
  function shopping(recipes, extras = []) {
    const map = new Map();
    for (const i of [
      ...recipes.flatMap((r) => r.ingredients || []),
      ...extras,
    ]) {
      if (i.optional && !i.included) continue;
      let unit = i.unit,
        amount = Number(i.amount);
      if (unit === "kg") {
        unit = "g";
        amount *= 1000;
      }
      if (unit === "l") {
        unit = "ml";
        amount *= 1000;
      }
      const name = i.productName || i.name,
        key = name.toLowerCase() + "|" + unit,
        previous = map.get(key);
      if (previous) previous.amount += amount;
      else
        map.set(key, {
          name,
          amount,
          unit,
          category:
            SHOP_CATEGORIES[i.category] || i.shoppingCategory || "Sonstiges",
          packageGrams: i.packageGrams,
          packagePriceCHF: i.packagePriceCHF,
        });
    }
    return [...map.values()].map((i) => ({
      ...i,
      amount: round(i.amount, 2),
      costCHF:
        finite(i.packagePriceCHF) &&
        i.packageGrams > 0 &&
        ["g", "ml"].includes(i.unit)
          ? round(Math.ceil(i.amount / i.packageGrams) * i.packagePriceCHF, 2)
          : null,
    }));
  }
  function mergeStates(current, incoming, replace = false) {
    const a = normalizeState(current),
      b = normalizeState(incoming);
    if (replace) return b;
    const out = {
      ...a,
      profile: a.profile.restrictionsConfirmed
        ? { ...b.profile, ...a.profile }
        : b.profile,
      blockedExercises: [
        ...new Set([...a.blockedExercises, ...b.blockedExercises]),
      ],
    };
    for (const k of [
      "painLog",
      "measurements",
      "dailyNutrition",
      "weekPlans",
      "checkins",
      "recipes",
      "cookingPlans",
    ]) {
      const map = new Map();
      for (const e of [...b[k], ...a[k]])
        if (e && typeof e === "object")
          map.set(e.id || e.date || JSON.stringify(e), e);
      out[k] = [...map.values()];
    }
    return out;
  }
  function safetyMessage(log) {
    if (log?.neurological)
      return "Training unterbrechen. Neue oder zunehmende Taubheit, Kribbeln, Schwäche oder unsicheres Gehen dringend medizinisch abklären lassen.";
    if (Number(log?.score) > 0)
      return "Beschwerdeauslösende Übung pausieren und anpassen. Anhaltende oder zunehmende Nackenbeschwerden ärztlich oder physiotherapeutisch abklären lassen.";
    return "Beschwerden weiter beobachten; keine automatische medizinische Freigabe.";
  }
  return {
    NUTRIENTS,
    DEFAULT_BLOCKED,
    SOURCES,
    finite,
    round,
    isoDate,
    addDays,
    daysBetween,
    monday,
    isoWeek,
    defaults,
    normalizeState,
    definition,
    repRange,
    progression,
    weightTrend,
    mifflin,
    proteinRange,
    activityEnergy,
    energyForDay,
    checkin,
    ingredientGrams,
    recipeNutrition,
    scaleRecipe,
    validateRecipes,
    cookingSchedule,
    shopping,
    mergeStates,
    safetyMessage,
  };
});
