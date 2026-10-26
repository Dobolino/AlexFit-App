(function coachBootstrap() {
  "use strict";
  const C = window.AlexFitCore,
    KEY = "af_coach",
    esc = escapeHTML;
  let state = C.normalizeState(safeParse(KEY, null));
  // Activate the requested replacement once, without deleting logs, templates
  // or an in-progress session. Previous assignments remain in the JSON backup.
  if (settings.trainingPlanVersion !== AlexFitTraining.VERSION) {
    const previous = {
      activatedAt: todayISO(),
      settings: { ...settings },
      weekPlans: state.weekPlans.filter(
        (p) =>
          p.date >= todayISO() &&
          /^d[1-5]$/.test(p.type) &&
          p.slot === "primary",
      ),
    };
    state.trainingPlanArchives = [
      ...(state.trainingPlanArchives || []),
      previous,
    ];
    state.weekPlans = state.weekPlans.filter(
      (p) => !previous.weekPlans.includes(p),
    );
    if (persist()) {
      settings.trainingPlanVersion = AlexFitTraining.VERSION;
      settings.templateSchedule = {};
      settings.activePhase = "p1";
      settings.programStart = todayISO();
      settings.programEnd = C.addDays(todayISO(), WORKOUT_PLANS.p1.weeks * 7);
      settings.cycleStart = todayISO();
      settings.cycleWeeks = 12;
      saveSettings();
      applyActivePlan();
    }
  }
  // Register the new variants in the existing picker and anatomy view, without
  // inventing video links or renaming the user's historical exercises.
  const anatomyAliases = {
    "Reverse Dumbbell Lunges": "Dumbbell Lunges",
    "Stationary Dumbbell Split Squat": "Bulgarian Split Squat",
    "Neutral-Grip Dumbbell Bench Press": "Dumbbell Bench Press",
    "Close-Grip Dumbbell Floor Press": "Close-Grip Bench Press",
    "Weighted Glute Bridge": "Glute Bridge",
  };
  for (const ex of WORKOUT_PLANS.p2.days.flatMap((d) => d.exercises)) {
    if (!EXERCISE_LIBRARY.some((e) => e.name === ex.name))
      EXERCISE_LIBRARY.push({ ...ex, id: "coach_" + ex.id });
    if (!EXERCISE_INFO[ex.name])
      EXERCISE_INFO[ex.name] = {
        tip: esc(
          ex.note || "Kontrolliert im schmerzfreien Bewegungsumfang ausführen.",
        ),
      };
    if (anatomyAliases[ex.name])
      EXERCISE_MUSCLES[ex.name] = EXERCISE_MUSCLES[anatomyAliases[ex.name]];
  }
  const val = (id) => document.getElementById(id)?.value ?? "";
  const num = (id) => (C.finite(val(id)) ? Number(val(id)) : null);
  const checked = (id) => !!document.getElementById(id)?.checked;
  const button = (text, action, attrs = "") =>
    `<button type="button" class="af-btn" data-af-action="${action}" ${attrs}>${text}</button>`;
  const field = (label, id, value = "", type = "number", extra = "") =>
    `<label class="af-field">${label}<input id="${id}" type="${type}" value="${esc(value ?? "")}" ${extra}></label>`;
  const select = (label, id, options, value) =>
    `<label class="af-field">${label}<select id="${id}">${options.map(([v, l]) => `<option value="${v}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const card = (title, body) =>
    `<section class="af-card"><h2>${title}</h2>${body}</section>`;
  const note = (text) => `<p class="af-note">${text}</p>`;
  const uid = () =>
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Date.now() + "-" + Math.random().toString(36).slice(2);
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      showToast("Speicher voll: JSON-Backup exportieren und Fotos prüfen.");
      return false;
    }
  }
  function latestWeight(date = todayISO()) {
    return (
      [...weightLog]
        .filter((e) => C.isoDate(e.date) && e.date <= date)
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1)?.kg || settings.startKg
    );
  }
  function hasPain(name) {
    const log = state.painLog
      .filter(
        (e) =>
          e.date >= C.addDays(todayISO(), -14) &&
          (!e.exercise || e.exercise === name),
      )
      .sort((a, b) =>
        (a.createdAt || a.date).localeCompare(b.createdAt || b.date),
      )
      .at(-1);
    return !!log && (log.score > 0 || log.neurological);
  }
  function safetyHold() {
    const logs = state.painLog
      .filter((e) => e.neurological || !e.exercise)
      .sort((a, b) =>
        (a.createdAt || a.date).localeCompare(b.createdAt || b.date),
      );
    return !!logs.at(-1)?.neurological;
  }
  function blocked(name) {
    return state.blockedExercises.includes(name);
  }
  function trainingContext() {
    return (
      !!state.profile.experience &&
      state.profile.sessionMinutes > 0 &&
      state.profile.restrictionsConfirmed &&
      Number(latestWeight()) >= 30
    );
  }
  function progression(name, definition = getExDef(name)) {
    return C.progression({
      name,
      history,
      definition,
      weights: state.profile.dumbbellWeights,
      blocked: blocked(name),
      pain: hasPain(name),
    });
  }
  function activities() {
    return [
      ...cardioLog,
      ...history.map((h) => ({
        date: h.date,
        type: h.energyType || (h.dayId === "d5" ? "rowing" : "strength"),
        time: h.duration,
        intensity: h.intensity,
        workoutId: h.id,
      })),
    ];
  }
  function energy(date) {
    return C.energyForDay(activities(), date, latestWeight(date));
  }
  function setState(next) {
    state = C.normalizeState(next);
    persist();
  }
  function screen(name, title, html) {
    let el = document.getElementById("screen-" + name);
    if (!el) {
      el = document.createElement("div");
      el.id = "screen-" + name;
      el.className = "screen";
      document.getElementById("content").append(el);
    }
    el.innerHTML = `<div class="af-pagehead"><div><p class="af-eyebrow">ALEXFIT COACH</p><h1>${title}</h1></div>${button("Zurück", "home")}</div>${html}`;
    showScreen(name);
    setNavActive(
      name === "nutrition" || name === "cooking" ? "nutrition" : "dashboard",
    );
    document.getElementById("content").scrollTop = 0;
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Kopiert ✓");
    } catch (e) {
      screen(
        "copy",
        "Text zum Kopieren",
        `<textarea class="af-copy" readonly>${esc(text)}</textarea>`,
      );
    }
  }
  function download(name, data, type = "application/json") {
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob(
          [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
          { type },
        ),
      );
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function renderProfile() {
    const p = state.profile,
      all = [
        ...new Set([
          ...DEFAULT_NAMES(),
          ...EXERCISE_LIBRARY.map((e) => e.name),
        ]),
      ].sort();
    screen(
      "coach-profile",
      "Dein Profil",
      note(
        "Diese Angaben bleiben auf diesem Gerät und in deinen JSON-Backups. Empfehlungen benötigen ein vollständiges Profil.",
      ) +
        `<form data-af-form="profile"><div class="af-grid">${field("Aktuelles Gewicht (kg)", "af-profile-weight", latestWeight() ?? "", "number", 'min="30" max="300" step="0.1" required')}${field("Alter", "af-age", p.age, "number", 'min="18" max="100" required')}${field("Grösse (cm)", "af-height", p.heightCm, "number", 'min="120" max="230" required')}${select(
          "Berechnungsformel",
          "af-sex",
          [
            ["male", "Männlich"],
            ["female", "Weiblich"],
          ],
          p.sex,
        )}${select(
          "Trainingserfahrung",
          "af-experience",
          [
            ["", "Bitte wählen"],
            ["beginner", "Anfänger"],
            ["returning", "Wiedereinstieg"],
            ["regular", "Regelmässiges Krafttraining"],
          ],
          p.experience,
        )}${field("Zeit je Training (Minuten)", "af-session", p.sessionMinutes, "number", 'min="10" max="180" required')}${field("Bike-Ausfahrten pro Woche", "af-bike", p.bikePerWeek, "number", 'min="0" max="14"')}${field("Körperfett (%) – falls bekannt", "af-bf", p.bodyFatPct, "number", 'min="5" max="60" step="0.1"')}${select(
          "Ziel",
          "af-goal",
          [
            ["recomp", "Rekomposition"],
            ["loss", "Fettabbau"],
            ["maintain", "Gewicht halten"],
            ["gain", "Muskelaufbau"],
          ],
          p.goalMode,
        )}${field("Individuelles Wochenziel (kg/Woche)", "af-weekchange", p.targetWeeklyChange, "number", 'min="-1" max="0.5" step="0.05" placeholder="Mit dem Coach festlegen"')}${field("Kalorienanpassung zum Erhalt (kcal/Tag)", "af-adjust", p.energyAdjustmentKcal, "number", 'min="-500" max="300" step="50" placeholder="Mit dem Coach festlegen"')}</div>` +
        `<label class="af-field">Verfügbare Gewichte pro Hantel (kg, mit Komma trennen)<input id="af-weights" value="${esc(p.dumbbellWeights.join(", "))}" required></label>` +
        `<label class="af-check"><input id="af-neck" type="checkbox" ${p.neckSensitive ? "checked" : ""}>Nackenbeschwerden bei der Übungsauswahl berücksichtigen</label>` +
        `<label class="af-check"><input id="af-confirm" type="checkbox" ${p.restrictionsConfirmed ? "checked" : ""}>Meine Einschränkungen und gesperrten Übungen sind geprüft. Bei ungeklärten Beschwerden kläre ich geeignete Belastungen mit Arzt oder Physiotherapie.</label>` +
        `<details class="af-card"><summary>Übungen sperren / freigeben</summary>${note("Diese Sperren gelten für Standardplan, Vorlagen, Alternativen und Steigerungsvorschläge. Eine Freigabe durch die App ist keine medizinische Beurteilung.")}<div class="af-blocklist">${all.map((n) => `<label class="af-check"><input type="checkbox" name="af-blocked" value="${esc(n)}" ${blocked(n) ? "checked" : ""}>${esc(n)}</label>`).join("")}</div></details><button class="af-btn af-primary" type="submit">Profil speichern</button></form>` +
        card(
          "Programm und Phasen",
          `<form data-af-form="cycle"><div class="af-grid">${field("Gesamtprogramm beginnt", "af-cycle-start", settings.cycleStart, "date", "required")}${field("Gesamtdauer (Wochen)", "af-cycle-weeks", settings.cycleWeeks || 12, "number", 'min="3" max="52" required')}</div>${note("Die Phasen werden beim Wechsel separat gestartet. Bestehende Phasenzeiträume wurden übernommen; neue Phasen dauern standardmässig vier Wochen.")}<button class="af-btn" type="submit">Programmzeitraum speichern</button></form>`,
        ),
    );
  }
  function DEFAULT_NAMES() {
    return C.DEFAULT_BLOCKED;
  }
  function saveProfile() {
    const weights = val("af-weights")
      .split(/[,;]+/)
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v) && v > 0 && v <= 100);
    if (!weights.length || !val("af-experience") || !checked("af-confirm")) {
      showToast("Trainingserfahrung, Hantelstufen und Einschränkungen prüfen.");
      return;
    }
    const kg = num("af-profile-weight");
    if (!(kg >= 30 && kg <= 300)) {
      showToast("Aktuelles Gewicht lokal eintragen.");
      return;
    }
    const before = state.profile.bikePerWeek;
    state.profile = {
      ...state.profile,
      age: num("af-age"),
      heightCm: num("af-height"),
      sex: val("af-sex"),
      experience: val("af-experience"),
      sessionMinutes: num("af-session"),
      bodyFatPct: num("af-bf"),
      bikePerWeek: num("af-bike"),
      goalMode: val("af-goal"),
      targetWeeklyChange: num("af-weekchange"),
      energyAdjustmentKcal: num("af-adjust"),
      neckSensitive: checked("af-neck"),
      restrictionsConfirmed: checked("af-confirm"),
      dumbbellWeights: [...new Set(weights)].sort((a, b) => a - b),
    };
    state.blockedExercises = [
      ...document.querySelectorAll('input[name="af-blocked"]:checked'),
    ].map((e) => e.value);
    if (!settings.startKg) {
      settings.startKg = kg;
      settings.goalKg = kg;
    }
    if (!weightLog.length || Number(latestWeight()) !== kg) {
      const date = todayISO(),
        existing = weightLog.find((e) => e.date === date);
      if (existing) existing.kg = kg;
      else weightLog.push({ date, kg });
      weightLog.sort((a, b) => a.date.localeCompare(b.date));
      saveW();
    }
    currentWeight = kg;
    saveSettings();
    updateWeightDisplay();
    if (persist()) {
      showToast(
        before !== null && before !== state.profile.bikePerWeek
          ? "Bike-Umfang geändert: Energie und Wochenplanung neu prüfen."
          : "Profil gespeichert ✓",
      );
      switchTab("dashboard");
    }
  }
  function renderPain() {
    const names = [
      ...new Set([
        ...workoutExercises.map((e) => e.name),
        ...EXERCISE_LIBRARY.map((e) => e.name),
      ]),
    ].sort();
    screen(
      "coach-pain",
      "Nacken & Beschwerden",
      `<form data-af-form="pain"><div class="af-grid">${field("Datum", "af-pain-date", todayISO(), "date", "required")}${select(
        "Zeitpunkt",
        "af-pain-stage",
        [
          ["before", "Vor dem Training"],
          ["during", "Während des Trainings"],
          ["after", "Nach dem Training"],
          ["nextDay", "Am Folgetag"],
        ],
        "before",
      )}${select("Übung / allgemein", "af-pain-ex", [["", "Allgemeine Nackenbeschwerden"], ...names.map((n) => [n, n])], "")}${field("Beschwerden 0–10", "af-pain-score", 0, "number", 'min="0" max="10" required')}</div><label class="af-check"><input type="checkbox" id="af-neuro">Neue oder zunehmende Taubheit, Kribbeln, Schwäche oder unsicheres Gehen</label>${field("Notiz", "af-pain-note", "", "text")}<button class="af-btn af-primary" type="submit">Beschwerden speichern</button></form>` +
        note(
          "Beschwerdeauslösende Übungen werden pausiert. Bei neuen oder zunehmenden neurologischen Symptomen Training unterbrechen und dringend medizinisch abklären lassen.",
        ) +
        state.painLog
          .slice()
          .reverse()
          .slice(0, 20)
          .map((e) =>
            card(
              `${esc(e.date)} · ${e.score}/10`,
              `${esc(e.exercise || "Allgemein")}<p>${esc(e.note || "")}</p><p>${esc(C.safetyMessage(e))}</p>`,
            ),
          )
          .join(""),
    );
  }
  function savePain() {
    const date = val("af-pain-date"),
      score = num("af-pain-score");
    if (!C.isoDate(date) || score === null || score < 0 || score > 10) return;
    const e = {
      id: uid(),
      date,
      stage: val("af-pain-stage"),
      exercise: val("af-pain-ex"),
      score,
      neurological: checked("af-neuro"),
      note: val("af-pain-note"),
      createdAt: new Date().toISOString(),
    };
    state.painLog.push(e);
    if ((score > 0 || e.neurological) && e.exercise && !blocked(e.exercise))
      state.blockedExercises.push(e.exercise);
    persist();
    if (score > 0 || e.neurological) {
      timerRunning = false;
      saveSession();
      showConfirm(
        C.safetyMessage(e),
        () => switchTab("dashboard"),
        "Verstanden",
        "var(--amber)",
      );
    } else showToast("Beschwerden protokolliert ✓");
    renderPain();
  }
  function renderWeek() {
    const start = window.AF.weekStart || C.monday(todayISO());
    window.AF.weekStart = start;
    const rows = Array.from({ length: 7 }, (_, i) => C.addDays(start, i));
    const planned = state.weekPlans.filter(
      (e) => e.date >= start && e.date <= C.addDays(start, 6),
    );
    const options = [
      ["rest", "Erholung"],
      ...WORKOUT_DAYS.map((d) => [d.id, d.name]),
      ["cycling", "Gravel / MTB"],
      ["walking", "WalkingPad / Spaziergang"],
      ["jogging", "Joggen"],
      ["rowing", "Rudern"],
    ];
    screen(
      "coach-week",
      "Training & Bike",
      `<div class="af-toolbar">${button("← Vorwoche", "week-prev")}${button("Diese Woche", "week-current")}${button("Folgewoche →", "week-next")}</div>` +
        note(
          "Plane Training und Ausfahrten gemeinsam. Verschieben verändert keine bereits gespeicherten Trainings. Erholung wird als geplanter Tag gewertet.",
        ) +
        `<form data-af-form="week">${rows
          .map((date) => {
            const existing = planned.filter((e) => e.date === date);
            const primary = existing.find((e) => e.slot === "primary"),
              bike = existing.find((e) => e.slot === "bike");
            return `<section class="af-card"><h2>${esc(fmtL(date))}</h2><div class="af-grid">${select("Training", "af-day-" + date, options, primary?.type || "rest")}${field("Trainingsdauer (Min.)", "af-min-" + date, primary?.minutes || state.profile.sessionMinutes || 45, "number", 'min="0" max="360"')}${field("Zusätzliche Bike-Minuten", "af-bike-" + date, bike?.minutes || 0, "number", 'min="0" max="720"')}${select(
              "Bike-Intensität",
              "af-bikelevel-" + date,
              [
                ["easy", "Locker"],
                ["moderate", "Mittel"],
                ["hard", "Anstrengend"],
              ],
              bike?.intensity || "easy",
            )}</div></section>`;
          })
          .join(
            "",
          )}<button class="af-btn af-primary" type="submit">Woche speichern</button></form>` +
        `<div class="af-toolbar">${button("Kalenderdatei (.ics)", "calendar-export")}${button("Bisherigen Kalender ansehen", "legacy-calendar")}${button("Cardio erfassen", "cardio")}</div>` +
        card("Wochenbelastung", weekSummary(start)),
    );
  }
  function weekSummary(start) {
    const plans = state.weekPlans.filter(
        (e) => e.date >= start && e.date <= C.addDays(start, 6),
      ),
      bike = plans.filter((e) => e.type === "cycling"),
      train = plans.filter((e) => /^d[1-5]$/.test(e.type)),
      minutes = plans.reduce((a, e) => a + (Number(e.minutes) || 0), 0);
    let warnings = [];
    for (const p of plans.filter((e) => e.type === "d4" || e.type === "d3"))
      if (
        plans.some(
          (e) =>
            e.type === "cycling" &&
            e.intensity === "hard" &&
            Math.abs(C.daysBetween(p.date, e.date)) <= 1,
        )
      )
        warnings.push(
          "Beine und eine anstrengende Bike-Fahrt liegen direkt beieinander. Erholung prüfen oder eine Einheit verschieben.",
        );
    if (
      state.profile.bikePerWeek !== null &&
      bike.length !== state.profile.bikePerWeek
    )
      warnings.push(
        "Der geplante Bike-Umfang weicht vom Profil ab. Kalorienbedarf beim Check-in neu prüfen.",
      );
    return `<p>${train.length} Trainingstage · ${bike.length} Ausfahrten · ${minutes} geplante Minuten</p>${warnings.map((w) => note(esc(w))).join("")}`;
  }
  function saveWeek() {
    const start = window.AF.weekStart;
    state.weekPlans = state.weekPlans.filter(
      (e) => e.date < start || e.date > C.addDays(start, 6),
    );
    for (let i = 0; i < 7; i++) {
      const date = C.addDays(start, i),
        type = val("af-day-" + date),
        minutes = num("af-min-" + date) || 0,
        bike = num("af-bike-" + date) || 0;
      state.weekPlans.push({
        id: date + "-primary",
        date,
        slot: "primary",
        type,
        minutes: type === "rest" ? 0 : minutes,
      });
      if (bike > 0)
        state.weekPlans.push({
          id: date + "-bike",
          date,
          slot: "bike",
          type: "cycling",
          minutes: bike,
          intensity: val("af-bikelevel-" + date),
        });
    }
    persist();
    showToast("Woche gespeichert ✓");
    renderWeek();
  }
  function calendarExport() {
    const start = window.AF.weekStart || C.monday(todayISO()),
      plans = state.weekPlans.filter(
        (e) =>
          e.date >= start && e.date <= C.addDays(start, 6) && e.type !== "rest",
      );
    if (!plans.length) {
      showToast("Zuerst die Woche planen.");
      return;
    }
    const clean = (s) =>
        String(s)
          .replace(/\\/g, "\\\\")
          .replace(/\r?\n/g, "\\n")
          .replace(/[,;]/g, (m) => "\\" + m),
      lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//AlexFit//Coach//DE",
        "CALSCALE:GREGORIAN",
      ];
    for (const p of plans) {
      const next = C.addDays(p.date, 1),
        name =
          WORKOUT_DAYS.find((d) => d.id === p.type)?.name ||
          CARDIO_TYPES[p.type]?.label ||
          p.type;
      lines.push(
        "BEGIN:VEVENT",
        "UID:" + p.id + "@alexfit.local",
        "DTSTAMP:" +
          new Date()
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}/, ""),
        "DTSTART;VALUE=DATE:" + p.date.replaceAll("-", ""),
        "DTEND;VALUE=DATE:" + next.replaceAll("-", ""),
        "SUMMARY:" + clean(name),
        "DESCRIPTION:" +
          clean(
            p.minutes + " Minuten geplant. Zeitpunkt im Kalender festlegen.",
          ),
        "BEGIN:VALARM",
        "TRIGGER:-PT10H",
        "ACTION:DISPLAY",
        "DESCRIPTION:AlexFit Training",
        "END:VALARM",
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    download(
      "AlexFit-Woche-" + start + ".ics",
      lines.join("\r\n") + "\r\n",
      "text/calendar",
    );
  }
  function renderNutrition() {
    const date = todayISO(),
      p = state.profile,
      kg = latestWeight(),
      bmr = C.mifflin(p, kg),
      base = bmr ? Math.round(bmr * 1.2) : null,
      extra = energy(date),
      protein = C.proteinRange(kg, p.bodyFatPct),
      entry = state.dailyNutrition.find((e) => e.date === date) || {};
    screen(
      "nutrition",
      "Ernährung",
      card(
        "Dein Tagesrahmen",
        bmr
          ? `<div class="af-metrics"><div><strong>${bmr}</strong><span>kcal Grundumsatz</span></div><div><strong>${base}</strong><span>kcal sitzender Alltag</span></div><div><strong>+${extra.kcal}</strong><span>aktive kcal erfasst</span></div></div>${note("Mifflin–St Jeor × 1,2; Training und Bike separat. Aktivitätswerte sind Schätzungen oder als aktiv gekennzeichnete Gerätewerte. Fehlende Intensitäten werden nicht ergänzt.")}<p>Erhaltung heute: etwa <strong>${base + extra.kcal} kcal</strong></p>${p.energyAdjustmentKcal !== null ? `<p>Mit eingestellter Anpassung: <strong>${base + extra.kcal + p.energyAdjustmentKcal} kcal</strong></p>` : note("Ein individuelles Kalorienziel ist noch offen. Gemeinsam mit dem Coach festlegen.")}<p>${protein ? `Protein: <strong>${protein.min}–${protein.max} g</strong> aus ${protein.leanKg} kg geschätzter Magermasse.` : "Körperfettanteil ergänzen, um das Proteinziel aus der Magermasse zu berechnen."}</p><p>Ballaststoff-Richtwert: mindestens 30 g täglich.</p>`
          : note("Alter, Grösse und Berechnungsformel im Profil ergänzen."),
      ) +
        `<div class="af-toolbar">${button("Profil", "profile")}${button("14-Tage-Check", "checkin")}${button("Sonntagskochen", "cooking")}</div>` +
        card(
          "Tageswerte aus Yazio",
          `${note("Übernimm deine Tagessummen manuell aus Yazio. Hier behältst du Ernährung und Training gemeinsam im Blick.")}<form data-af-form="nutrition"><div class="af-grid">${field("Datum", "af-food-date", date, "date", "required")}${C.NUTRIENTS.map((k) => field({ kcal: "Kalorien (kcal)", protein_g: "Protein (g)", carbs_g: "Kohlenhydrate (g)", fat_g: "Fett (g)", fiber_g: "Ballaststoffe (g)", sodium_mg: "Natrium (mg)" }[k], "af-food-" + k, entry[k], "number", 'min="0" step="0.1" ' + (k === "kcal" ? "required" : ""))).join("")}</div>${field("Notiz", "af-food-note", entry.note, "text")}<button class="af-btn af-primary" type="submit">Tageswerte speichern</button></form>`,
        ) +
        card(
          "Deine Routine",
          `<p>Optional Skyr / Müsli am Morgen. Mittags und abends die vorgekochten Portionen. Gegen 16 Uhr Waffeln mit Quark oder Frischkäse; abends Skyr nach deinem Geschmack.</p>${note("Yazio bleibt dein Ernährungstagebuch. Die Übernahme hier ist manuell; es wird keine automatische Yazio-Verbindung vorausgesetzt.")}`,
        ) +
        state.dailyNutrition
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 14)
          .map(
            (e) =>
              `<p class="af-logline">${esc(e.date)} · ${e.kcal} kcal · ${e.protein_g ?? "—"} g Protein · ${e.fiber_g ?? "—"} g Ballaststoffe</p>`,
          )
          .join(""),
    );
  }
  function saveNutrition() {
    const date = val("af-food-date"),
      kcal = num("af-food-kcal");
    if (!C.isoDate(date) || !(kcal > 0) || kcal > 15000) {
      showToast("Datum und Kalorien prüfen.");
      return;
    }
    const e = { id: date, date, note: val("af-food-note") };
    for (const k of C.NUTRIENTS) e[k] = num("af-food-" + k);
    state.dailyNutrition = state.dailyNutrition.filter((x) => x.date !== date);
    state.dailyNutrition.push(e);
    persist();
    showToast("Tageswerte gespeichert ✓");
    renderNutrition();
  }
  function renderCheckin() {
    const date = todayISO(),
      result = C.checkin(state, weightLog, date),
      trend = result.trend;
    screen(
      "coach-checkin",
      "Fortschrittscheck",
      card(
        result.due ? "Check-in fällig" : "Aktueller Verlauf",
        `<div class="af-metrics"><div><strong>${trend.current ?? "—"}</strong><span>kg · letzte 7 Tage</span></div><div><strong>${trend.previous ?? "—"}</strong><span>kg · vorherige 7 Tage</span></div><div><strong>${trend.ready ? (trend.change > 0 ? "+" : "") + trend.change : "—"}</strong><span>kg Veränderung</span></div></div>${note(`${trend.currentCount} / ${trend.previousCount} Gewichtstage · ${result.intakeDays}/14 Ernährungstage. Ø Aufnahme: ${result.intake ?? "—"} kcal.`)}<h3>${esc(result.recommendation)}</h3><p>${esc(result.reason)}</p>${result.adjustment ? `<p>Zur gemeinsamen Prüfung: ${result.adjustment > 0 ? "+" : ""}${result.adjustment} kcal/Tag.</p>` : ""}${result.ready ? button("Check-in dokumentieren", "complete-checkin") : ""}`,
      ) +
        card(
          "Bauchumfang dokumentieren",
          `<form data-af-form="waist"><div class="af-grid">${field("Datum", "af-waist-date", date, "date", "required")}${field("Umfang auf Bauchnabelhöhe (cm)", "af-waist", null, "number", 'min="40" max="200" step="0.1" required')}</div><button class="af-btn" type="submit">Messung speichern</button></form>${state.measurements
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 5)
            .map((e) => `<p>${esc(e.date)} · ${e.waistCm} cm</p>`)
            .join("")}`,
        ) +
        card(
          "Kraft und Erholung",
          `${
            getProgressionSuggestions()
              .map(
                (p) =>
                  `<p>${esc(p.name)}: ${p.currentW} → ${p.suggestedW} kg möglich.</p>`,
              )
              .join("") ||
            "<p>Noch keine bestätigte Laststeigerung. Bei Rekomposition auch mehr saubere Wiederholungen und sinkenden Umfang berücksichtigen.</p>"
          }<div class="af-toolbar">${button("Erholung erfassen", "recovery")}${button("Beschwerden erfassen", "pain")}${button("Bericht für den Coach kopieren", "report")}</div>`,
        ),
    );
  }
  function report() {
    const date = todayISO(),
      trend = C.weightTrend(weightLog, date),
      recent = history.filter(
        (h) => h.date >= C.addDays(date, -20) && h.date <= date,
      ),
      bike = cardioLog.filter(
        (e) =>
          e.type === "cycling" &&
          e.date >= C.addDays(date, -20) &&
          e.date <= date,
      );
    return [
      "AlexFit Check-in · " + date,
      "Ziel: " + state.profile.goalMode,
      `Gewichtsmittel letzte / vorherige 7 Tage: ${trend.current ?? "offen"} / ${trend.previous ?? "offen"} kg (${trend.currentCount}/${trend.previousCount} Messtage)`,
      `Gewichtstrend: ${trend.ready ? trend.change + " kg/Woche" : "noch zu wenig Daten"}`,
      "Bauchumfang: " +
        state.measurements
          .slice(-3)
          .map((m) => m.date + " " + m.waistCm + " cm")
          .join("; "),
      "Ernährung: " + JSON.stringify(C.checkin(state, weightLog, date)),
      "Training (letzte 21 Tage):",
      ...recent.map(
        (h) =>
          `${h.date} ${h.name} (${h.duration} Min): ` +
          h.exercises
            .map(
              (e) =>
                `${e.name}: ` +
                e.sets
                  .map(
                    (s) =>
                      (s.weight ? s.weight + " kg × " : "") +
                      (e.unit === "seconds"
                        ? (s.seconds ?? s.reps) + " s"
                        : s.reps + " Wdh") +
                      (s.rpe ? " RPE " + s.rpe : ""),
                  )
                  .join(", "),
            )
            .join(" | "),
      ),
      `Bike: ${bike.length} Ausfahrten, ${Math.round(bike.reduce((a, e) => a + e.time, 0))} Minuten`,
      "Erholung: " +
        JSON.stringify(
          recoveryLog.filter((e) => e.date >= C.addDays(date, -13)),
        ),
      "Beschwerden: " +
        JSON.stringify(
          state.painLog.filter((e) => e.date >= C.addDays(date, -20)),
        ),
      "Bitte Kalorienbedarf, Trainingslast und nächste Schritte anhand dieser Daten prüfen.",
    ].join("\n");
  }
  function homeCard() {
    const date = todayISO(),
      trend = C.weightTrend(weightLog, date),
      check = C.checkin(state, weightLog, date),
      planned = state.weekPlans.filter((e) => e.date === date),
      rec = getTodayRecovery(),
      prs = getProgressionSuggestions();
    const goal = document.getElementById("goal-banner");
    if (goal)
      goal.innerHTML = card(
        "Deine Rekomposition",
        `<div class="af-metrics"><div><strong>${trend.current ?? latestWeight() ?? "—"}</strong><span>${trend.current !== null ? "kg · 7-Tage-Mittel" : "kg zuletzt"}</span></div><div><strong>${state.measurements.at(-1)?.waistCm ?? "—"}</strong><span>cm Bauchumfang</span></div><div><strong>${prs.length}</strong><span>mögliche Steigerungen</span></div></div>${note(trend.ready ? `Gewichtsänderung zum vorherigen Wochenmittel: ${trend.change > 0 ? "+" : ""}${trend.change} kg.` : "Für den Trend mindestens drei Messungen je Vergleichswoche erfassen.")}`,
      );
    let el = document.getElementById("af-home");
    if (!el) {
      el = document.createElement("div");
      el.id = "af-home";
      goal?.before(el);
    }
    if (el)
      el.innerHTML = card(
        "Heute für dich",
        `${!trainingContext() ? `<p>Profil und Einschränkungen ergänzen, bevor du eine neue Einheit startest.</p>${button("Profil vervollständigen", "profile")}` : `<p>${planned.length ? planned.map((p) => esc(WORKOUT_DAYS.find((d) => d.id === p.type)?.name || CARDIO_TYPES[p.type]?.label || (p.type === "rest" ? "Erholung" : p.type))).join(" + ") : "Deine Woche individuell planen."}</p>${rec && calcRecoveryScore(rec) < 3 ? note("Erholung heute niedrig: Intensität und Umfang vor dem Training prüfen.") : ""}${prs[0] ? `<p>${esc(prs[0].name)}: ${prs[0].currentW} → ${prs[0].suggestedW} kg möglich.</p>` : note("Last steigern, wenn Wiederholungsziel und Anstrengung es bestätigen.")}`}<div class="af-toolbar">${button("Training & Bike", "week")}${button("Nacken-Check", "pain")}${button("Gewicht", "weight")}${button("Cardio", "cardio")}</div>${check.due ? button("Fortschrittscheck ansehen", "checkin") : ""}`,
      );
    document.getElementById("grace-skip-banner")?.setAttribute("hidden", "");
    const topGoal = document.getElementById("goal-weight-display");
    if (topGoal)
      topGoal.textContent =
        state.profile.goalMode === "recomp"
          ? "Rekomposition"
          : "→ " + settings.goalKg + " kg";
  }
  function applyWeekSchedule() {
    const start = C.monday(todayISO()),
      days = state.weekPlans.filter(
        (p) =>
          p.slot === "primary" &&
          p.date >= start &&
          p.date <= C.addDays(start, 6),
      );
    PLAN_DOW = days.length
      ? Object.fromEntries(
          days
            .filter((p) => /^d[1-5]$/.test(p.type))
            .map((p) => [parseISODateLocal(p.date).getDay(), p.type]),
        )
      : getActivePlan().schedule;
    for (const day of WORKOUT_DAYS) {
      const labels = Object.entries(PLAN_DOW)
        .filter(([, id]) => id === day.id)
        .map(
          ([dow]) => ["SO", "MO", "DI", "MI", "DO", "FR", "SA"][Number(dow)],
        );
      day.tag = labels.join("/") || "FREI";
    }
  }
  const originalDashboard = renderDashboard;
  renderDashboard = function () {
    applyWeekSchedule();
    originalDashboard();
    homeCard();
  };
  const originalSelect = renderWorkoutSelect;
  renderWorkoutSelect = function () {
    applyWeekSchedule();
    originalSelect();
    const cardioButton = [
      ...document.querySelectorAll("#workout-select-list button"),
    ].find((b) => b.getAttribute("onclick")?.includes("'d5'"));
    const cardioSubtitle = [
      ...(cardioButton?.querySelectorAll("div") || []),
    ].find((d) => d.textContent === "0 Übungen · 0 Sätze");
    if (cardioSubtitle)
      cardioSubtitle.textContent =
        "Bike · WaterRower · WalkingPad · frei wählbar";
    document.getElementById("af-training-guidance")?.remove();
    const el = document.createElement("section"),
      plan = getActivePlan();
    el.id = "af-training-guidance";
    el.className = "af-card";
    el.innerHTML = `<h2>Dein 12-Wochen-Plan</h2><p>Mo Oberkörper A · Di Unterkörper A · Mi Oberkörper B · Fr Unterkörper B · Sa Cardio nach Wahl. Donnerstag und Sonntag frei.</p>${note("Vier Krafttage, je etwa 45–60 Minuten inklusive Aufwärmen. Vorher fünf Minuten locker gehen und 1–2 leichte Aufwärmsätze der ersten Übungen; diese zählen nicht als Arbeitssätze.")}<h3>${esc(plan.label)} · ${esc(plan.subtitle)}</h3><p>${esc(plan.guidance)}</p>${note(`Reserve: ${plan.rir} saubere Wiederholungen. Pausen je Übung: ${plan.restLabel}. Bei zwei erfolgreichen Einheiten am oberen Wiederholungsziel und RPE höchstens 8 die nächstkleine passende Hantelstufe prüfen.`)}${note("Samstag: Bike, WaterRower oder WalkingPad frei wählen und im Cardio-Tab erfassen. Nach viel Bike unter der Woche ist keine weitere harte Einheit nötig. Vor einer harten Samstagstour am Freitag je Übung einen Satz weniger; bei stark müden Beinen verschieben.")}${note("Der neue Plan beginnt einmalig mit Phase 1. Vorherige Programm-Einstellungen und zukünftige Kraft-Zuordnungen sind im JSON-Backup unter coach.trainingPlanArchives archiviert. Vorlagen selbst, Trainingshistorie und laufende Einheiten bleiben erhalten.")}${button("Cardio erfassen", "cardio")}`;
    document.getElementById("screen-workout-select").prepend(el);
  };
  const originalPreview = openWorkoutPreview;
  openWorkoutPreview = function (dayId) {
    if (WORKOUT_DAYS.find((d) => d.id === dayId)?.flexibleCardio) {
      switchTab("cardio");
      return;
    }
    originalPreview(dayId);
  };
  getProgressionSuggestions = function () {
    return [...new Set(history.flatMap((h) => h.exercises.map((e) => e.name)))]
      .map((name) => progression(name))
      .filter((p) => p.action === "increase")
      .slice(0, 3);
  };
  suggestWeight = function (name, last) {
    const p = progression(name);
    return p.action === "increase" ? p.suggestedW : last;
  };
  const originalStart = doStartWorkout;
  doStartWorkout = function (dayId) {
    if (WORKOUT_DAYS.find((d) => d.id === dayId)?.flexibleCardio) {
      switchTab("cardio");
      return;
    }
    if (safetyHold()) {
      showToast(
        "Training pausiert: gemeldete neurologische Symptome medizinisch abklären.",
      );
      renderPain();
      return;
    }
    if (!trainingContext()) {
      showToast("Zuerst Profil und Einschränkungen prüfen.");
      renderProfile();
      return;
    }
    originalStart(dayId);
    activeWorkoutDay = { ...activeWorkoutDay, phaseId: getActivePhaseId() };
    workoutExercises = workoutExercises.map((ex) => ({
      ...C.definition(ex.name, ex),
      setData: ex.setData.map((s) => ({ ...s, rpe: undefined })),
    }));
    saveSession();
    renderWorkoutActive();
  };
  const originalTemplate = loadTemplate;
  loadTemplate = function (id) {
    if (!trainingContext()) {
      renderProfile();
      return;
    }
    originalTemplate(id);
  };
  createSetFromLast = function (name, i) {
    const previous = getLastSetValues(name, i),
      d = getExDef(name);
    return {
      weight: !d.bw && previous?.weight ? String(previous.weight) : "",
      reps: previous?.reps ? String(previous.reps) : "",
      done: false,
    };
  };
  saveSession = function () {
    try {
      if (!workoutExercises.length || !activeWorkoutDay) {
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        return;
      }
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          dayId: activeWorkoutDay.id,
          customDay: activeWorkoutDay,
          phaseId: activeWorkoutDay.phaseId || getActivePhaseId(),
          workoutExercises,
          workoutElapsed,
          timerRunning,
          timerStartTS: _timerStartTS,
          savedAt: Date.now(),
          workoutBaselineSignature,
          note: document.getElementById("workout-note-input")?.value || "",
          interval: window.AF?.interval || null,
        }),
      );
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      showToast(
        "Training konnte nicht zwischengespeichert werden. JSON-Backup prüfen.",
      );
    }
  };
  clearSession = function () {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    if (window.AF) window.AF.interval = null;
  };
  restoreSession = function () {
    const raw =
      localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    try {
      const s = JSON.parse(raw);
      if (
        !Array.isArray(s.workoutExercises) ||
        !s.workoutExercises.length ||
        s.workoutExercises.some((e) => !e.name || !Array.isArray(e.setData))
      )
        return false;
      activeWorkoutDay =
        s.customDay || WORKOUT_DAYS.find((d) => d.id === s.dayId);
      if (!activeWorkoutDay) return false;
      activeWorkoutDay.phaseId = s.phaseId || getActivePhaseId();
      workoutExercises = s.workoutExercises.map((e) => ({
        ...C.definition(e.name, e),
        setData: e.setData,
      }));
      workoutElapsed = s.workoutElapsed || 0;
      timerRunning = false;
      workoutBaselineSignature =
        s.workoutBaselineSignature || getWorkoutPlanSignature(workoutExercises);
      window.AF.restoredNote = s.note || "";
      window.AF.interval = null;
      startWorkoutTimer();
      saveSession();
      return true;
    } catch (e) {
      return false;
    }
  };
  const originalActive = renderWorkoutActive;
  renderWorkoutActive = function () {
    originalActive();
    workoutExercises = workoutExercises.map((ex) => ({
      ...C.definition(ex.name, ex),
      setData: ex.setData,
    }));
    renderExerciseList();
    const h = document.getElementById("workout-header");
    if (h)
      h.insertAdjacentHTML(
        "beforeend",
        `${note(esc(getActivePlan().guidance))}${note("5 Minuten locker aufwärmen, dann leichte Aufwärmsätze. Arbeitssätze mit " + esc(getActivePlan().rir) + " Wiederholungen Reserve. Beschwerden nicht übergehen.")}<div class="af-toolbar">${button("Beschwerden melden", "pain")}${select(
          "Intensität für die Energieschätzung",
          "session-intensity",
          [
            ["", "Nicht festgelegt"],
            ["easy", "Locker"],
            ["moderate", "Mittel"],
            ["hard", "Anstrengend"],
          ],
          activeWorkoutDay?.intensity || "",
        )}</div>`,
      );
    const n = document.getElementById("workout-note-input");
    if (n && window.AF.restoredNote) {
      n.value = window.AF.restoredNote;
      window.AF.restoredNote = "";
    }
    n?.addEventListener("input", saveSession);
  };
  renderExerciseList = function () {
    document.getElementById("exercise-list").innerHTML = workoutExercises
      .map((raw, ei) => {
        const ex = C.definition(raw.name, raw),
          locked = blocked(ex.name),
          timed = ex.unit === "seconds",
          p = progression(ex.name, ex),
          last = getLastPerf(ex.name),
          basis = ex.bw
            ? "Körpergewicht"
            : ex.weightBasis === "perHand"
              ? "kg pro Hantel"
              : "kg Zusatzgewicht";
        return `<section class="af-exercise ${locked ? "af-locked" : ""}"><div class="af-exhead"><button type="button" class="af-link" data-af-action="exercise-info" data-name="${esc(ex.name)}">${esc(ex.name)}</button>${button("Variante", "variant", `data-ei="${ei}"`)}</div><p class="af-note">${esc(ex.reps || "")} ${ex.perSide ? "· je Seite" : ""} · ${basis} · ${ex.restTimer || 120} s Pause${locked ? " · GESPERRT" : ""}</p>${ex.note ? note(esc(ex.note)) : ""}${locked ? note("Im Profil gesperrt. Eine individuell geeignete Variante wählen oder diese Übung auslassen.") : note(esc(p.reason))}<div class="af-sethead"><span>Satz</span><span>Letztes Mal</span><span>${ex.bw ? "BW" : "kg"}</span><span>${timed ? "Sek." : "Wdh"}</span><span>RPE</span><span>✓</span></div>${ex.setData
          .map((s, si) => {
            const prev = getLastSetValues(ex.name, si),
              previous = prev
                ? `${prev.weight ? prev.weight + "×" : ""}${prev.seconds ?? prev.reps}${timed ? " s" : ""}`
                : "—";
            return `<div class="af-setrow ${s.done ? "af-done" : ""}" id="sr-${ei}-${si}"><span>${si + 1}</span><span class="af-previous">${esc(previous)}</span>${ex.bw ? "<span>BW</span>" : `<input aria-label="${esc(ex.name)} Satz ${si + 1} kg pro Hantel" type="number" inputmode="decimal" min="0" step="0.5" data-af-set="weight" data-ei="${ei}" data-si="${si}" value="${esc(s.weight)}" ${locked ? "disabled" : ""}>`}<input aria-label="${esc(ex.name)} Satz ${si + 1} ${timed ? "Sekunden" : "Wiederholungen"}" type="number" inputmode="numeric" min="1" data-af-set="reps" data-ei="${ei}" data-si="${si}" placeholder="${timed ? ex.targetSeconds || "Sek." : esc(ex.reps)}" value="${esc(s.reps)}" ${locked ? "disabled" : ""}><select aria-label="RPE Satz ${si + 1}" data-af-set="rpe" data-ei="${ei}" data-si="${si}" ${locked ? "disabled" : ""}><option value="">—</option>${[5, 6, 7, 8, 9, 10].map((n) => `<option value="${n}" ${Number(s.rpe) === n ? "selected" : ""}>${n}</option>`).join("")}</select><button type="button" class="af-donebtn" data-af-action="set-done" data-ei="${ei}" data-si="${si}" aria-label="Satz ${si + 1} abschliessen" ${locked ? "disabled" : ""}>${s.done ? "✓" : "○"}</button></div>${timed && !locked ? button("▶ " + (ex.targetSeconds || 30) + " s starten", "interval", `data-ei="${ei}" data-si="${si}"`) : ""}`;
          })
          .join(
            "",
          )}<p class="af-note">RPE 8 ≈ 2 saubere Wiederholungen Reserve · RPE 10 = keine Reserve.</p><div class="af-toolbar">${button("+ Satz", "add-set", `data-ei="${ei}"`)}${button("− Satz", "remove-set", `data-ei="${ei}"`)}${button("Übung entfernen", "remove-ex", `data-ei="${ei}"`)}</div></section>`;
      })
      .join("");
  };
  const originalToggle = toggleSet;
  toggleSet = function (ei, si) {
    const e = workoutExercises[ei],
      s = e?.setData[si];
    if (!e || !s) return;
    if (safetyHold()) {
      showToast("Training wegen gemeldeter neurologischer Symptome pausiert.");
      return;
    }
    if (blocked(e.name)) {
      showToast("Diese Übung ist gesperrt.");
      return;
    }
    if (
      !s.done &&
      (!(Number(s.reps) > 0) || (!e.bw && !(Number(s.weight) > 0)))
    ) {
      showToast("Zuerst gültige Wiederholungen / Sekunden und Last erfassen.");
      return;
    }
    originalToggle(ei, si);
    renderExerciseList();
  };
  swapExercise = function (ei, name) {
    if (blocked(name)) {
      showToast("Diese Variante ist im Profil gesperrt.");
      return;
    }
    const old = workoutExercises[ei];
    if (!old) return;
    const apply = () => {
      const d = getExDef(name);
      workoutExercises[ei] = {
        ...d,
        id: old.id,
        name,
        _added: old._added,
        setData: createSetDataForExercise(d, old.setData.length),
      };
      saveSession();
      renderExerciseList();
    };
    if (old.setData.some((s) => s.done))
      showConfirm(
        "Übung wechseln? Bereits abgehakte Sätze dieser laufenden Übung werden zurückgesetzt.",
        apply,
        "Wechseln",
      );
    else apply();
  };
  showAltMenu = function (ei) {
    const ex = workoutExercises[ei],
      names = [
        ...new Set([
          ...(EXERCISE_ALTERNATIVES[ex.name] || []),
          ...EXERCISE_LIBRARY.filter((e) => e.muscle === ex.muscle).map(
            (e) => e.name,
          ),
        ]),
      ].filter((n) => n !== ex.name && !blocked(n));
    let overlay = document.getElementById("af-variants");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "af-variants";
      overlay.className = "af-modal";
      document.body.append(overlay);
    }
    overlay.innerHTML = `<div class="af-modalcard"><h2>Variante wählen</h2>${note("Nur nicht gesperrte Varianten. Individuelle Verträglichkeit und verfügbare Ausrüstung prüfen.")}<div class="af-variantlist">${names.map((n) => button(esc(n), "swap", `data-ei="${ei}" data-name="${esc(n)}"`)).join("") || note("Keine passende freigegebene Variante hinterlegt. Profil prüfen oder die Übung auslassen.")}</div>${button("Schliessen", "close-variants")}</div>`;
  };
  const originalLegacyAdd = addExercise;
  addExercise = function (id) {
    const ex = WORKOUT_DAYS.flatMap((d) => d.exercises).find(
      (e) => e.id === id,
    );
    if (!ex || blocked(ex.name)) {
      showToast("Übung gesperrt.");
      return;
    }
    originalLegacyAdd(id);
  };
  const originalAdd = addExerciseFromLib;
  addExerciseFromLib = function (id) {
    const e = EXERCISE_LIBRARY.find((e) => e.id === id);
    if (!e || blocked(e.name)) {
      showToast("Übung gesperrt. Im Profil prüfen.");
      return;
    }
    originalAdd(id);
  };
  const oldToggleTimer = toggleTimer;
  toggleTimer = function () {
    const run = window.AF.interval;
    if (run) {
      if (timerRunning) {
        run.pausedRemaining = Math.max(0, run.deadline - Date.now());
        run.paused = true;
      } else if (run.paused) {
        run.deadline = Date.now() + run.pausedRemaining;
        run.paused = false;
      }
    }
    oldToggleTimer();
  };
  const oldSummary = showWorkoutSummary;
  showWorkoutSummary = function (entry) {
    if (!entry.exercises.some((e) => e.unit === "seconds"))
      return oldSummary(entry);
    screen(
      "coach-summary",
      "Training gespeichert",
      card(
        esc(entry.name),
        "<p>" + entry.duration + " Minuten · " + entry.sets + " Sätze</p>",
      ) +
        entry.exercises
          .map((ex) =>
            card(
              esc(ex.name),
              ex.sets
                .map(
                  (s) =>
                    "<p>" +
                    (s.weight ? s.weight + " kg × " : "") +
                    (ex.unit === "seconds"
                      ? (s.seconds ?? s.reps) + " Sekunden"
                      : s.reps + " Wiederholungen") +
                    (s.rpe ? " · RPE " + s.rpe : "") +
                    "</p>",
                )
                .join(""),
            ),
          )
          .join("") +
        '<div class="af-toolbar">' +
        button("Trainingshistorie", "history") +
        (_pendingPlanSave
          ? button("Geänderten Plan speichern", "save-plan")
          : "") +
        "</div>",
    );
    return true;
  };
  const originalFinish = doFinishWorkout;
  doFinishWorkout = function () {
    if (
      safetyHold() ||
      workoutExercises.some(
        (e) => blocked(e.name) && e.setData.some((s) => s.done),
      )
    ) {
      showToast("Abgehakte gesperrte Übungen zuerst prüfen.");
      return;
    }
    if (activeWorkoutDay)
      activeWorkoutDay.intensity = val("session-intensity") || undefined;
    originalFinish();
    if (history.at(-1)) {
      history.at(-1).intensity =
        activeWorkoutDay?.intensity || history.at(-1).intensity;
      save();
    }
    persist();
  };
  const originalSwitch = switchTab;
  switchTab = function (tab) {
    if (tab === "nutrition") {
      renderNutrition();
      return;
    }
    originalSwitch(tab);
    if (tab === "stats") {
      const el = document.getElementById("screen-stats");
      let tools = document.getElementById("af-stats-tools");
      if (!tools) {
        tools = document.createElement("div");
        tools.id = "af-stats-tools";
        el.prepend(tools);
      }
      tools.innerHTML = `<div class="af-toolbar">${button("Gewicht & Umfang", "weight")}${button("Fortschrittscheck", "checkin")}${button("Coach-Bericht", "report")}</div>`;
    }
  };
  const originalSettings = renderSettings;
  renderSettings = function () {
    originalSettings();
    const el = document.getElementById("screen-settings");
    let box = document.getElementById("af-settings");
    if (!box) {
      box = document.createElement("div");
      box.id = "af-settings";
      el.prepend(box);
    }
    box.innerHTML = card(
      "Persönliches Coaching",
      `<div class="af-toolbar">${button("Profil & Übungssperren", "profile")}${button("Wochenplanung", "week")}${button("Kalender-Erinnerungen", "calendar-export")}</div>`,
    );
    const text = el.querySelector("#s-reminder-time")?.closest(".card");
    if (text) {
      const hints = [...text.querySelectorAll("div")].filter((d) =>
        d.textContent.includes("mindestens einmal täglich"),
      );
      for (const h of hints)
        h.textContent =
          "App-Erinnerungen funktionieren bei geöffneter App. Für Erinnerungen bei geschlossener App die geplante Woche als Kalenderdatei exportieren und importieren.";
    }
  };
  sendNotification = async function (title, body, tag = "alexfit") {
    if (!("Notification" in window) || Notification.permission !== "granted")
      return;
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg)
        await reg.showNotification(title, {
          body,
          tag,
          icon: "icons/icon.svg",
        });
      else if (!/Android|iPhone|iPad/i.test(navigator.userAgent))
        new Notification(title, { body, tag });
    } catch (e) {
      console.warn("AlexFit Benachrichtigung:", e);
    }
  };
  restartProgram = function () {
    showConfirm(
      "Programm neu starten? Phase 1 beginnt heute. Deine Trainings- und Gewichtsdaten bleiben erhalten.",
      () => {
        settings.activePhase = "p1";
        settings.programStart = todayISO();
        settings.programEnd = C.addDays(todayISO(), WORKOUT_PLANS.p1.weeks * 7);
        settings.cycleStart = todayISO();
        settings.streakPaused = false;
        delete settings.sickDays;
        delete settings.sickStart;
        applyActivePlan();
        saveSettings();
        switchTab("dashboard");
      },
      "Neu starten",
      "var(--blue)",
    );
  };
  const originalBackup = collectBackupPayload;
  collectBackupPayload = function () {
    const data = originalBackup();
    data.data.coach = state;
    return data;
  };
  const originalValidate = validateBackupPayload;
  validateBackupPayload = function (p) {
    if (!originalValidate(p)) return false;
    const d = p.data;
    for (const k of [
      "history",
      "weights",
      "cardio",
      "recovery",
      "photos",
      "templates",
    ])
      if (d[k] !== undefined && !Array.isArray(d[k])) return false;
    for (const h of d.history || [])
      if (
        !h ||
        !C.isoDate(h.date) ||
        !Array.isArray(h.exercises) ||
        h.exercises.some(
          (e) => typeof e.name !== "string" || !Array.isArray(e.sets),
        )
      )
        return false;
    for (const w of d.weights || [])
      if (!C.isoDate(w.date) || !C.finite(w.kg) || w.kg < 30 || w.kg > 300)
        return false;
    if (
      d.coach !== undefined &&
      (!d.coach || typeof d.coach !== "object" || Array.isArray(d.coach))
    )
      return false;
    if (d.meta) {
      if (typeof d.meta !== "object" || Array.isArray(d.meta)) return false;
      if (d.meta.activePhase && !WORKOUT_PLANS[d.meta.activePhase])
        return false;
      for (const k of ["programStart", "programEnd", "cycleStart"])
        if (d.meta[k] !== undefined && !C.isoDate(d.meta[k])) return false;
    }
    for (const t of d.templates || [])
      if (
        !t ||
        typeof t.name !== "string" ||
        !Array.isArray(t.exercises) ||
        t.exercises.some((e) => !e || typeof e.name !== "string")
      )
        return false;
    for (const e of d.cardio || [])
      if (
        !e ||
        !C.isoDate(e.date) ||
        !CARDIO_TYPES[e.type] ||
        !C.finite(e.time) ||
        e.time <= 0
      )
        return false;
    if (d.coach) {
      for (const k of [
        "blockedExercises",
        "painLog",
        "measurements",
        "dailyNutrition",
        "weekPlans",
        "checkins",
        "recipes",
        "cookingPlans",
      ])
        if (d.coach[k] !== undefined && !Array.isArray(d.coach[k]))
          return false;
    }
    return true;
  };
  const originalMerge = applyJSONMerge;
  applyJSONMerge = function (p) {
    if (!validateBackupPayload(p)) {
      showToast("Backup-Struktur ungültig.");
      return;
    }
    if (p.data.coach) state = C.mergeStates(state, p.data.coach);
    persist();
    originalMerge(p);
  };
  const originalRestore = restoreJSONBackup;
  restoreJSONBackup = function (p) {
    if (!validateBackupPayload(p)) {
      showToast("Backup-Struktur ungültig.");
      return;
    }
    if (p.data.coach) state = C.mergeStates(state, p.data.coach, true);
    persist();
    if (p.data.activeSession)
      localStorage.setItem(SESSION_KEY, JSON.stringify(p.data.activeSession));
    originalRestore(p);
    if (p.data.activeSession) {
      restoreSession();
      updateWorkoutBadge();
    }
  };
  function cardioExtras() {
    document.getElementById("af-cardio-energy")?.remove();
    const anchor = document.getElementById("cardio-calc");
    if (anchor)
      anchor.insertAdjacentHTML(
        "beforebegin",
        `<div id="af-cardio-energy" class="af-card"><div class="af-grid">${select(
          "Intensität für die Schätzung",
          "af-cardio-intensity",
          [
            ["", "Bitte wählen"],
            ["easy", "Locker"],
            ["moderate", "Mittel"],
            ["hard", "Anstrengend"],
          ],
          "",
        )}${select(
          "Energiequelle",
          "af-cardio-source",
          [
            ["estimate", "MET-Schätzung"],
            ["device", "Gerät / Uhr"],
          ],
          "estimate",
        )}${field("Gerätewert (kcal)", "af-cardio-kcal", "", "number", 'min="0"')}${select(
          "Gerätewert enthält",
          "af-cardio-mode",
          [
            ["active", "Nur aktive Energie"],
            ["gross", "Gesamtenergie inkl. Ruheanteil"],
          ],
          "active",
        )}${select(
          "Zu bereits erfasstem Workout",
          "af-cardio-link",
          [
            ["", "Eigenständige Aktivität"],
            ...history
              .filter(
                (h) =>
                  (h.energyType ||
                    (h.dayId === "d5" ? "rowing" : "strength")) ===
                  activeCardioType,
              )
              .slice(-20)
              .map((h) => [h.id, h.date + " " + h.name]),
          ],
          "",
        )}</div>${note("Dieselbe Aktivität nur einmal anrechnen. Ein verknüpftes Cardio-Protokoll ersetzt den Energieeintrag des Workouts.")}</div>`,
      );
  }
  function cardioFields() {
    return {
      type: activeCardioType,
      intensity: val("af-cardio-intensity") || undefined,
      energySource: val("af-cardio-source") || "estimate",
      kcal: num("af-cardio-kcal"),
      kcalMode: val("af-cardio-mode") || "active",
      workoutId: val("af-cardio-link") || undefined,
    };
  }
  const originalCardioType = setCardioType;
  setCardioType = function (type) {
    originalCardioType(type);
    cardioExtras();
  };
  for (const [type, cfg] of Object.entries(CARDIO_TYPES)) {
    const calc = cfg.calcFn,
      details = cfg.detailsFn;
    cfg.calcFn = (e) => {
      const rows = calc(e).filter((r) => !/kcal/i.test(r.l));
      const v = C.activityEnergy({ ...e, type }, latestWeight(e.date));
      return [
        ...rows,
        {
          l: "Aktive kcal",
          v: v ? "≈ " + v.kcal : "Intensität fehlt",
          c: "var(--amber)",
        },
      ];
    };
    cfg.detailsFn = (e) => {
      const rows = details(e).filter((r) => !/kcal/i.test(r.l)),
        v = C.activityEnergy({ ...e, type }, latestWeight(e.date));
      return [
        ...rows,
        {
          l: "Aktive Energie",
          v: v
            ? "≈ " + v.kcal + " kcal · " + v.source
            : "Keine Schätzung ohne Intensität / Gerätewert",
        },
      ];
    };
  }
  updateCardioCalc = function () {
    const cfg = CARDIO_TYPES[activeCardioType],
      el = document.getElementById("cardio-calc");
    if (!cfg || !el) return;
    const e = {
      time: getCardioTimeMins(),
      dist: Number(val("cardio-dist")) || 0,
      meters: Number(val("cardio-meters")) || 0,
      ...cardioFields(),
    };
    el.innerHTML = cfg
      .calcFn(e)
      .map(
        (r) =>
          `<div class="af-metric"><strong>${esc(r.v)}</strong><span>${esc(r.l)}</span></div>`,
      )
      .join("");
  };
  addCardioEntry = function () {
    const time = getCardioTimeMins(),
      date = val("cardio-date");
    if (
      !(time > 0) ||
      !C.isoDate(date) ||
      Number(val("cardio-time-m")) > 59 ||
      Number(val("cardio-time-s")) > 59
    ) {
      showToast("Datum und Zeit prüfen (Minuten / Sekunden jeweils 0–59).");
      return;
    }
    const entry = {
      id: uid(),
      date,
      time,
      ...cardioFields(),
      dist: num("cardio-dist") || undefined,
      meters: num("cardio-meters") || undefined,
      hr: num("cardio-hr") || undefined,
      note: val("cardio-note"),
    };
    if (entry.energySource === "device" && !(entry.kcal > 0)) {
      showToast("Geräte-Kalorien ergänzen.");
      return;
    }
    if (
      cardioLog.some(
        (e) =>
          e.date === date &&
          e.type === entry.type &&
          Math.abs(e.time - time) < 0.01 &&
          (e.dist || e.meters || 0) === (entry.dist || entry.meters || 0),
      )
    ) {
      showToast("Diese Aktivität ist bereits erfasst.");
      return;
    }
    const linked = entry.workoutId
      ? history.find((h) => h.id === entry.workoutId)
      : null;
    if (entry.workoutId && (!linked || linked.date !== date)) {
      showToast(
        "Verknüpftes Workout und Cardio müssen am gleichen Tag liegen.",
      );
      return;
    }
    cardioLog.push(entry);
    cardioLog.sort((a, b) => a.date.localeCompare(b.date));
    saveC();
    showToast("Cardio gespeichert ✓");
    renderCardio();
    cardioExtras();
  };
  function tickInterval() {
    const run = window.AF.interval;
    if (!run || run.paused) return;
    const left = Math.max(0, Math.ceil((run.deadline - Date.now()) / 1000)),
      el = document.getElementById("af-interval");
    if (el)
      el.innerHTML = `<strong>${run.phase === "work" ? "Belastung" : "Pause"} · ${fmt(left)}</strong> ${button("Stoppen", "stop-interval")}`;
    if (left > 0) return;
    const ex = workoutExercises[run.ei];
    if (!ex || ex.name !== run.name) {
      window.AF.interval = null;
      return;
    }
    if (run.phase === "work") {
      const s = ex.setData[run.si];
      s.reps = String(run.target);
      if (!s.done) toggleSet(run.ei, run.si);
      sendNotification("Intervall beendet", "Jetzt Pause.");
      if (/Rowing Intervals/.test(ex.name) && run.si + 1 < ex.setData.length) {
        window.AF.interval = {
          ...run,
          phase: "rest",
          deadline: Date.now() + (ex.restTimer || 60) * 1000,
        };
      } else {
        window.AF.interval = null;
        document.getElementById("af-interval")?.remove();
        dismissRestTimer();
      }
    } else {
      window.AF.interval = {
        ...run,
        si: run.si + 1,
        phase: "work",
        deadline: Date.now() + run.target * 1000,
      };
      dismissRestTimer();
      sendNotification("Nächstes Intervall", "Belastung startet.");
    }
    saveSession();
  }
  function startInterval(ei, si) {
    const ex = workoutExercises[ei];
    if (!ex || blocked(ex.name) || safetyHold()) return;
    if (window.AF.interval) {
      showToast("Zuerst den laufenden Timer stoppen.");
      return;
    }
    const target = Number(ex.setData[si].reps) || ex.targetSeconds || 30;
    window.AF.interval = {
      ei,
      si,
      name: ex.name,
      target,
      phase: "work",
      deadline: Date.now() + target * 1000,
    };
    let el = document.getElementById("af-interval");
    if (!el) {
      el = document.createElement("div");
      el.id = "af-interval";
      el.setAttribute("role", "status");
      document.getElementById("app").append(el);
    }
    tickInterval();
    saveSession();
  }
  updateProgress = function () {
    const valid = workoutExercises.filter((e) => !blocked(e.name)),
      total = valid.reduce((a, e) => a + e.setData.length, 0),
      done = valid.reduce(
        (a, e) => a + e.setData.filter((s) => s.done).length,
        0,
      ),
      pct = total ? Math.round((done / total) * 100) : 0;
    const bar = document.getElementById("workout-prog-bar");
    if (bar) bar.style.width = pct + "%";
    const text = document.getElementById("workout-prog-txt");
    if (text) text.textContent = done + "/" + total + " Sätze";
    const percent = document.getElementById("workout-prog-pct");
    if (percent) percent.textContent = pct + "%";
  };
  const originalWeight = renderWeight;
  renderWeight = function () {
    originalWeight();
    const kg = latestWeight(),
      trend = C.weightTrend(weightLog, todayISO()),
      lastBF = weightLog.filter((e) => e.bf).at(-1),
      lastMuscle = weightLog.filter((e) => e.muscle).at(-1);
    const box = document.getElementById("weight-stats");
    if (box && weightLog.length)
      box.innerHTML = card(
        "Gewicht und Körperwerte",
        '<div class="af-metrics"><div><strong>' +
          kg +
          "</strong><span>kg zuletzt</span></div><div><strong>" +
          (trend.current ?? "—") +
          "</strong><span>kg · 7-Tage-Mittel</span></div><div><strong>" +
          (trend.ready ? (trend.change > 0 ? "+" : "") + trend.change : "—") +
          "</strong><span>kg Wochenänderung</span></div></div>" +
          (lastBF
            ? "<p>Körperfett-Messwert: " +
              lastBF.bf +
              " % (" +
              esc(lastBF.date) +
              ")</p>"
            : "") +
          (lastMuscle
            ? "<p>Muskelanteil laut Waage: " +
              lastMuscle.muscle +
              " %. Dieser Wert entspricht nicht der Magermasse.</p>"
            : "") +
          note(
            "Einzelwerte schwanken. Bei Rekomposition auch Bauchumfang und Kraftverlauf prüfen.",
          ),
      );
  };
  const oldStats = renderProgress;
  renderProgress = function () {
    oldStats();
    const counts = {};
    history
      .filter((h) => h.date >= C.addDays(todayISO(), -6))
      .forEach((h) =>
        h.exercises.forEach((e) => {
          if ((e.unit || getExDef(e.name).unit) === "seconds") return;
          const muscle = e.muscle || getExDef(e.name).muscle || "Andere";
          counts[muscle] = (counts[muscle] || 0) + e.sets.length;
        }),
      );
    const volume = document.getElementById("progress-volume");
    if (volume)
      volume.innerHTML =
        '<p class="af-note">Abgeschlossene Arbeitssätze pro Muskelgruppe in den letzten sieben Tagen. Keine Vermischung von Sätzen und kg·Wiederholungen.</p>' +
        Object.entries(counts)
          .map(
            ([m, n]) =>
              "<p>" + esc(m) + ": <strong>" + n + " Sätze</strong></p>",
          )
          .join("");
    const trends = document.getElementById("progress-trends");
    if (trends)
      trends.innerHTML = [
        ...new Set(history.flatMap((h) => h.exercises.map((e) => e.name))),
      ]
        .map((name) => {
          const def = getExDef(name),
            sets = history.flatMap((h) =>
              h.exercises.filter((e) => e.name === name).flatMap((e) => e.sets),
            ),
            unit =
              def.unit === "seconds"
                ? "Sekunden"
                : def.bw
                  ? "Wiederholungen"
                  : "kg pro Hantel",
            best = Math.max(
              0,
              ...sets.map(
                (s) =>
                  Number(
                    def.unit === "seconds"
                      ? (s.seconds ?? s.reps)
                      : def.bw
                        ? s.reps
                        : s.weight,
                  ) || 0,
              ),
            );
          return (
            '<div class="af-card"><h3>' +
            esc(name) +
            "</h3><p>Bestwert: " +
            best +
            " " +
            unit +
            "</p></div>"
          );
        })
        .join("");
  };
  window.AF = {
    C,
    get state() {
      return state;
    },
    setState,
    persist,
    esc,
    button,
    field,
    select,
    card,
    note,
    val,
    num,
    checked,
    uid,
    copy,
    download,
    screen,
    energy,
    activities,
    latestWeight,
    progression,
    blocked,
    hasPain,
    interval: null,
    weekStart: null,
  };
  document.addEventListener("submit", (e) => {
    const type = e.target.dataset.afForm;
    if (!type) return;
    e.preventDefault();
    if (type === "profile") saveProfile();
    if (type === "pain") savePain();
    if (type === "week") saveWeek();
    if (type === "nutrition") saveNutrition();
    if (type === "waist") {
      const date = val("af-waist-date"),
        waistCm = num("af-waist");
      state.measurements = state.measurements.filter((x) => x.date !== date);
      state.measurements.push({ id: date, date, waistCm });
      state.measurements.sort((a, b) => a.date.localeCompare(b.date));
      persist();
      renderCheckin();
    }
    if (type === "cycle") {
      settings.cycleStart = val("af-cycle-start");
      settings.cycleWeeks = num("af-cycle-weeks");
      saveSettings();
      showToast("Programmzeitraum gespeichert ✓");
    }
    window.AF.handleForm?.(type, e.target);
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.afSet) {
      const ei = Number(t.dataset.ei),
        si = Number(t.dataset.si);
      setVal(ei, si, t.dataset.afSet, t.value);
    }
    if (t.id?.startsWith("af-cardio-")) updateCardioCalc();
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "session-intensity" && activeWorkoutDay) {
      activeWorkoutDay.intensity = e.target.value;
      saveSession();
    }
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-af-action]");
    if (!t) return;
    const a = t.dataset.afAction,
      ei = Number(t.dataset.ei),
      si = Number(t.dataset.si);
    const actions = {
      history: () => {
        switchTab("stats");
        switchStatsTab("history");
      },
      "save-plan": confirmSaveWorkoutPlanFromSummary,
      home: () => switchTab("dashboard"),
      profile: renderProfile,
      pain: renderPain,
      week: renderWeek,
      nutrition: renderNutrition,
      checkin: renderCheckin,
      cooking: () => window.AF.renderCooking?.(),
      weight: () => switchTab("weight"),
      cardio: () => switchTab("cardio"),
      recovery: showRecoveryModal,
      report: () => copy(report()),
      "legacy-calendar": () => switchTab("calendar"),
      "calendar-export": calendarExport,
      "week-prev": () => {
        window.AF.weekStart = C.addDays(window.AF.weekStart, -7);
        renderWeek();
      },
      "week-next": () => {
        window.AF.weekStart = C.addDays(window.AF.weekStart, 7);
        renderWeek();
      },
      "week-current": () => {
        window.AF.weekStart = C.monday(todayISO());
        renderWeek();
      },
      "complete-checkin": () => {
        const c = C.checkin(state, weightLog, todayISO());
        if (!c.ready) return;
        state.checkins = state.checkins.filter((e) => e.date !== todayISO());
        state.checkins.push({ id: todayISO(), date: todayISO(), summary: c });
        persist();
        showToast("Check-in dokumentiert ✓");
        renderCheckin();
      },
      "set-done": () => toggleSet(ei, si),
      "add-set": () => addSet(ei),
      "remove-set": () => removeSet(ei),
      "remove-ex": () =>
        showConfirm(
          "Übung aus dieser Einheit entfernen?",
          () => {
            window.AF.interval = null;
            document.getElementById("af-interval")?.remove();
            workoutExercises.splice(ei, 1);
            saveSession();
            renderExerciseList();
            updateProgress();
          },
          "Entfernen",
        ),
      variant: () => showAltMenu(ei),
      swap: () => {
        swapExercise(ei, t.dataset.name);
        document.getElementById("af-variants")?.remove();
      },
      "close-variants": () => document.getElementById("af-variants")?.remove(),
      "exercise-info": () => showExerciseInfo(t.dataset.name),
      interval: () => startInterval(ei, si),
      "stop-interval": () => {
        window.AF.interval = null;
        document.getElementById("af-interval")?.remove();
        saveSession();
      },
    };
    if (actions[a]) actions[a]();
    else window.AF.handleAction?.(a, t);
  });
  document.getElementById("gym-toggle-btn")?.setAttribute("hidden", "");
  const nav = document.getElementById("bottomnav");
  if (nav) {
    nav.innerHTML = `<div id="nav-glass-indicator" aria-hidden="true"></div><button class="navbtn active" id="nav-dashboard" data-af-action="home"><span class="nicon">⌂</span><span class="nlabel">Heute</span></button><button class="navbtn" id="nav-workout" onclick="switchTab('workout')"><span class="nicon">🏋</span><span class="nlabel">Training</span></button><button class="navbtn" id="nav-cardio" onclick="switchTab('cardio')"><span class="nicon">♡</span><span class="nlabel">Cardio</span></button><button class="navbtn" id="nav-nutrition" data-af-action="nutrition"><span class="nicon">◉</span><span class="nlabel">Ernährung</span></button><button class="navbtn" id="nav-stats" onclick="switchTab('stats')"><span class="nicon">↗</span><span class="nlabel">Fortschritt</span></button>`;
  }
  setInterval(tickInterval, 500);
  if (!workoutExercises.length) restoreSession();
  persist();
  renderDashboard();
  setNavActive("dashboard");
})();
