(function () {
  "use strict";
  const A = window.AF,
    C = A.C,
    esc = A.esc;
  const VERSION = "2026.10.26.19";
  const strength = (p) => /^d[1-4]$/.test(p.type);
  const primary = (date) =>
    A.state.weekPlans.find((p) => p.date === date && p.slot === "primary");
  function ensureWeek(date) {
    const start = C.monday(date);
    for (let i = 0; i < 7; i++) {
      const d = C.addDays(start, i);
      if (!primary(d))
        A.state.weekPlans.push({
          id: d + "-primary",
          date: d,
          slot: "primary",
          type:
            getActivePlan().schedule[parseISODateLocal(d).getDay()] || "rest",
          minutes: getActivePlan().schedule[parseISODateLocal(d).getDay()]
            ? 60
            : 0,
        });
    }
  }
  function shift(from, to, all) {
    const before = structuredClone(A.state.weekPlans),
      logs = structuredClone(A.state.scheduleChanges || []);
    const result = shiftImpl(from, to, all);
    if (result.error) {
      A.state.weekPlans = before;
      A.state.scheduleChanges = logs;
    }
    return result;
  }
  function shiftImpl(from, to, all) {
    if (!C.isoDate(from) || !C.isoDate(to) || from < todayISO() || to <= from)
      return {
        error: "Ein zukünftiges Zieldatum nach dem Ausgangstag wählen.",
      };
    ensureWeek(from);
    const source = primary(from);
    if (!source || !strength(source))
      return { error: "Am Ausgangstag ist kein Krafttraining geplant." };
    const moves = all
      ? A.state.weekPlans.filter(
          (p) =>
            p.slot === "primary" && /^d[1-5]$/.test(p.type) && p.date >= from,
        )
      : [source];
    const delta = C.daysBetween(from, to),
      sources = new Set(moves.map((p) => p.date));
    if (sources.size !== moves.length)
      return {
        error:
          "Doppelte Tageszuordnungen zuerst in der Wochenplanung bereinigen.",
      };
    for (const p of moves) {
      if (history.some((h) => h.date === p.date && h.dayId === p.type))
        return {
          error: "Bereits absolvierte Einheiten werden nicht verschoben.",
        };
      const dest = C.addDays(p.date, delta),
        occupied = primary(dest);
      if (occupied && occupied.type !== "rest" && !sources.has(dest))
        return {
          error:
            "Ein Zieldatum ist bereits belegt. Zuerst in der Wochenplanung freigeben.",
        };
      if (history.some((h) => h.date === dest))
        return {
          error:
            "An einem Zieldatum wurde bereits trainiert. Anderes Datum wählen.",
        };
    }
    const targets = new Set(moves.map((p) => C.addDays(p.date, delta)));
    A.state.weekPlans = A.state.weekPlans.filter(
      (p) =>
        p.slot !== "primary" || (!sources.has(p.date) && !targets.has(p.date)),
    );
    for (const date of sources)
      if (!targets.has(date))
        A.state.weekPlans.push({
          id: date + "-primary",
          date,
          slot: "primary",
          type: "rest",
          minutes: 0,
        });
    for (const p of moves) {
      const date = C.addDays(p.date, delta);
      A.state.weekPlans.push({ ...p, id: date + "-primary", date });
    }
    A.state.scheduleChanges = [
      ...(A.state.scheduleChanges || []),
      { date: todayISO(), from, to, count: moves.length },
    ];
    if (!A.persist())
      return { error: "Speichern fehlgeschlagen. JSON-Backup prüfen." };
    renderDashboard();
    return { count: moves.length };
  }
  function shiftScreen() {
    A.screen(
      "move-training",
      "Training verschieben",
      A.note(
        "Nur zukünftige, noch nicht absolvierte Einheiten. Zusätzliche Bike-Einträge bleiben stehen. Belegte Ziele werden nicht überschrieben. «Folgende» umfasst bereits geplante Krafttrainings und den Standard-Cardiotag; freie Tage dürfen dabei genutzt werden.",
      ) +
        '<form data-af-form="move-training"><div class="af-grid">' +
        A.field("Ausgangstag", "tools-from", todayISO(), "date", "required") +
        A.field(
          "Neuer Tag",
          "tools-to",
          C.addDays(todayISO(), 1),
          "date",
          "required",
        ) +
        "</div>" +
        A.select(
          "Verschieben",
          "tools-mode",
          [
            ["one", "Nur diese Einheit"],
            ["all", "Diese und folgende Einheiten"],
          ],
          "all",
        ) +
        '<button class="af-btn af-primary">Verschieben</button></form>',
    );
  }
  const renderWeek = () => A.renderWeek();
  function review() {
    const start = A.weekStart || C.monday(todayISO()),
      end = C.addDays(start, 6),
      prev = C.addDays(start, -7);
    const completed = history.filter((h) => h.date >= start && h.date <= end);
    const older = history.filter((h) => h.date >= prev && h.date < start);
    const best = (rows, name) =>
      Math.max(
        0,
        ...rows
          .flatMap((h) => h.exercises || [])
          .filter((e) => e.name === name && !e.bw && e.unit !== "seconds")
          .flatMap((e) => e.sets || [])
          .map((s) => Number(s.weight) || 0),
      );
    const names = [
      ...new Set(
        completed.flatMap((h) => (h.exercises || []).map((e) => e.name)),
      ),
    ];
    const gains = names
      .map((n) => ({
        name: n,
        before: best(older, n),
        after: best(completed, n),
      }))
      .filter((p) => p.before > 0 && p.after > p.before);
    const changed = (A.state.scheduleChanges || []).filter(
      (p) => p.date >= start && p.date <= end,
    ).length;
    A.screen(
      "weekly-review",
      "Deine Woche",
      A.card(
        esc(fmtL(start)) + " – " + esc(fmtL(end)),
        "<p>" +
          completed.length +
          " Krafteinheiten · " +
          completed.reduce((n, h) => n + (Number(h.duration) || 0), 0) +
          " protokollierte Minuten</p><p>" +
          cardioLog.filter((p) => p.date >= start && p.date <= end).length +
          " Cardio-Einträge · " +
          changed +
          " Planverschiebungen</p>" +
          A.note(
            "Verschieben ist kein Misserfolg. Keine Bewertung anhand ausgefallener Wochentage. Minuten sind deine Aufzeichnungen, keine geprüfte Belastungsmessung.",
          ),
      ) +
        A.card(
          "Lastentwicklung",
          gains
            .map(
              (p) =>
                "<p>" +
                esc(p.name) +
                ": " +
                p.before +
                " → " +
                p.after +
                " kg</p>",
            )
            .join("") ||
            A.note(
              "Keine vergleichbare Laststeigerung zur Vorwoche erfasst. Technik, Wiederholungen und Erholung zählen ebenfalls.",
            ),
        ) +
        A.note(
          "Ein höheres Gewicht allein ist noch kein Beleg für bessere Ausführung oder eine Empfehlung zur weiteren Steigerung.",
        ),
    );
  }
  function saturday() {
    A.screen(
      "saturday",
      "Flexible Reserve",
      A.note(
        "Samstag ist kein Pflicht-Zusatztag. Wähle ein noch nicht erledigtes Training zum Nachholen oder plane bewusst Cardio beziehungsweise Erholung. Bei vier absolvierten Krafttagen ist keine weitere volle Krafteinheit nötig.",
      ) +
        '<form data-af-form="reserve"><div class="af-grid">' +
        A.field(
          "Datum",
          "reserve-date",
          C.addDays(C.monday(todayISO()), 5),
          "date",
          "required",
        ) +
        A.select(
          "Einheit",
          "reserve-type",
          [
            ["rest", "Erholung"],
            ["d5", "Cardio nach Wahl"],
            ...WORKOUT_DAYS.filter((d) => d.id !== "d5").map((d) => [
              d.id,
              d.name,
            ]),
          ],
          "d5",
        ) +
        '</div><button class="af-btn">In Woche einplanen</button></form>' +
        A.button("Ausgefallenes Training verschieben", "tools-move"),
    );
  }
  // One coherent prior session, not a mixture of set indexes from several weeks.
  const originalStart = doStartWorkout;
  doStartWorkout = function (id) {
    const before = activeWorkoutDay;
    originalStart(id);
    if (
      activeWorkoutDay === before ||
      !activeWorkoutDay ||
      activeWorkoutDay.id !== id ||
      id === "d5" ||
      !workoutExercises.length
    )
      return;
    const prior = [...history]
      .filter(
        (h) =>
          h.dayId === id &&
          h.name === activeWorkoutDay.name &&
          h.date <= todayISO(),
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1);
    for (const ex of workoutExercises) {
      const saved = prior?.exercises?.find((e) => e.name === ex.name);
      ex.setData = ex.setData.map((s, i) => {
        const old = saved?.sets?.[i];
        const compatible = old && (!saved.unit || saved.unit === ex.unit);
        return {
          ...s,
          weight:
            compatible && !ex.bw && Number(old.weight) > 0
              ? String(old.weight)
              : "",
          reps:
            compatible && Number(old.seconds ?? old.reps) > 0
              ? String(old.seconds ?? old.reps)
              : "",
          done: false,
          rpe: undefined,
        };
      });
    }
    A.lastSessionDate = prior?.date || null;
    saveSession();
    renderWorkoutActive();
  };
  function copySet(ei) {
    const ex = workoutExercises[ei];
    if (!ex || A.blocked(ex.name)) return;
    const sourceIndex = ex.setData.findLastIndex((s) => s.done),
      dest = ex.setData.findIndex((s, i) => i > sourceIndex && !s.done);
    if (sourceIndex < 0 || dest < 0) {
      showToast(
        "Zuerst einen Satz abschliessen; danach muss ein offener Satz folgen.",
      );
      return;
    }
    const s = ex.setData[sourceIndex];
    ex.setData[dest] = {
      ...ex.setData[dest],
      weight: s.weight,
      reps: s.reps,
      done: false,
      rpe: undefined,
    };
    saveSession();
    renderExerciseList();
  }
  const oldList = renderExerciseList;
  renderExerciseList = function () {
    oldList();
    document
      .querySelectorAll(".af-exercise")
      .forEach((el, i) =>
        el.insertAdjacentHTML(
          "beforeend",
          A.button(
            "Letzten Satz übernehmen",
            "tools-copy",
            'data-ei="' + i + '"',
          ),
        ),
      );
  };
  const oldActive = renderWorkoutActive;
  renderWorkoutActive = function () {
    oldActive();
    const h = document.getElementById("workout-header");
    if (h) {
      const notes = [...h.querySelectorAll(":scope > .af-note")];
      if (notes.length) {
        const d = document.createElement("details");
        d.className = "af-ex-hints";
        d.innerHTML = "<summary>Aufwärmen & Trainingshinweise</summary>";
        notes[0].before(d);
        notes.forEach((n) => d.append(n));
      }
      h.insertAdjacentHTML(
        "beforeend",
        A.note(
          A.lastSessionDate
            ? "Vorbelegt aus derselben Einheit vom " +
                esc(fmtS(A.lastSessionDate)) +
                ". Satzzahl und Zielbereiche bleiben vom aktuellen Plan; RPE und Häkchen bleiben leer."
            : "Gewicht und Wiederholungen sind Vorschläge, keine automatisch erledigten Sätze.",
        ),
      );
    }
  };
  const oldSelect = renderWorkoutSelect;
  renderWorkoutSelect = function () {
    oldSelect();
    document
      .getElementById("af-training-guidance")
      ?.insertAdjacentHTML(
        "beforeend",
        '<div class="af-toolbar">' +
          A.button("Heute nicht → verschieben", "tools-move") +
          A.button("Samstag / Reserve", "tools-saturday") +
          A.button("Wochenrückblick", "tools-review") +
          "</div>",
      );
  };
  const oldSettings = renderSettings;
  renderSettings = function () {
    oldSettings();
    document
      .getElementById("screen-settings")
      .insertAdjacentHTML(
        "afterbegin",
        A.card(
          "App-Version " + VERSION,
          A.button("Nach Updates suchen", "tools-update") +
            '<p id="tools-update-status" role="status">Trainingsdaten werden bei Updates nicht gelöscht.</p>',
        ),
      );
  };
  async function updates() {
    const el = document.getElementById("tools-update-status");
    if (el) el.textContent = "Prüfe Verbindung und Updates …";
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      const response = await fetch("./release.json?check=" + Date.now(), {
        cache: "no-store",
      });
      if (!response.ok) throw Error("network");
      const release = await response.json();
      if (el)
        el.textContent =
          "Installiert: " +
          VERSION +
          " · Server/letzte erreichbare Version: " +
          release.version +
          ". Bei Offlinebetrieb kann diese Auskunft aus dem Cache stammen.";
      if (reg?.installing || reg?.waiting || release.version !== VERSION)
        if (el)
          el.insertAdjacentHTML(
            "beforeend",
            "<br>" + A.button("Gespeichert neu laden", "tools-reload"),
          );
    } catch (e) {
      if (el)
        el.textContent =
          "Updateprüfung nicht möglich. Internetverbindung prüfen; deine Daten bleiben erhalten.";
    }
  }
  const oldAction = A.handleAction;
  A.handleAction = function (action, t) {
    if (action === "tools-move") return shiftScreen();
    if (action === "tools-review") return review();
    if (action === "tools-saturday") return saturday();
    if (action === "tools-copy") return copySet(Number(t.dataset.ei));
    if (action === "tools-update") return updates();
    if (action === "tools-reload") {
      if (!navigator.onLine) {
        showToast("Zum Aktualisieren zuerst Internetverbindung herstellen.");
        return;
      }
      if (workoutExercises.length) saveSession();
      showConfirm(
        "App neu laden? Der aktuelle Trainingsentwurf bleibt lokal gespeichert.",
        () => location.reload(),
        "Neu laden",
      );
      return;
    }
    return oldAction?.(action, t);
  };
  document.addEventListener("submit", (e) => {
    if (e.target.dataset.afForm === "move-training") {
      e.preventDefault();
      const result = shift(
        A.val("tools-from"),
        A.val("tools-to"),
        A.val("tools-mode") === "all",
      );
      if (result.error) showToast(result.error);
      else {
        showToast(result.count + " Einheiten verschoben");
        A.weekStart = C.monday(A.val("tools-to"));
        renderWeek();
      }
    }
    if (e.target.dataset.afForm === "reserve") {
      e.preventDefault();
      const date = A.val("reserve-date"),
        type = A.val("reserve-type");
      if (!C.isoDate(date) || date < todayISO()) {
        showToast("Ein zukünftiges Datum wählen.");
        return;
      }
      const old = primary(date);
      if (
        old &&
        old.type !== "rest" &&
        old.type !== "d5" &&
        old.type !== type
      ) {
        showToast("Dieser Tag ist belegt. Zuerst in der Wochenplanung ändern.");
        return;
      }
      ensureWeek(date);
      A.state.weekPlans = A.state.weekPlans.filter(
        (p) => !(p.date === date && p.slot === "primary"),
      );
      A.state.weekPlans.push({
        id: date + "-primary",
        date,
        slot: "primary",
        type,
        minutes: type === "rest" ? 0 : 60,
      });
      A.persist();
      A.weekStart = C.monday(date);
      renderWeek();
    }
  });
  A.tools = { shift, ensureWeek, copySet, review, version: VERSION };
})();
