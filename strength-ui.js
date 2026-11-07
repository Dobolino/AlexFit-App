/* Focused strength view. Stored exercise keys and the existing coaching rules stay authoritative. */
(function () {
  "use strict";
  if (!window.AF || window.AF.strength) return;
  const esc = window.AF.esc;
  const names = {
    "Dumbbell Bench Press": "Bankdrücken",
    "Neutral-Grip Dumbbell Bench Press": "Bankdrücken · neutraler Griff",
    "Single-Arm Dumbbell Press": "Einarmiges Bankdrücken",
    "Dumbbell Squeeze Press": "Enges Bankdrücken",
    "Single-Arm Dumbbell Row": "Kurzhantelrudern",
    "Double-Arm Dumbbell Row": "Beidarmiges Kurzhantelrudern",
    "Push-ups (Reebok Deck)": "Liegestütze an der Bank",
    "Push-ups": "Liegestütze",
    "Lateral Raises": "Seitheben",
    "Hammer Curls": "Hammercurls",
    "Dumbbell Curls": "Bizepscurls",
    "Goblet Squat": "Goblet-Kniebeuge",
    "Dumbbell Squats": "Kurzhantel-Kniebeugen",
    "Romanian Deadlift": "Rumänisches Kreuzheben",
    "Single-Leg RDL": "Einbeiniges Kreuzheben",
    "Reverse Dumbbell Lunges": "Ausfallschritte rückwärts",
    "Dumbbell Lunges": "Ausfallschritte",
    "Stationary Dumbbell Split Squat": "Split Squats",
    "Weighted Glute Bridge": "Hüftheben mit Kurzhantel",
    "Glute Bridge": "Hüftheben",
    "Single-Leg Glute Bridge": "Einbeiniges Hüftheben",
    "Standing Calf Raises": "Wadenheben",
    "Single-Leg Calf Raises": "Einbeiniges Wadenheben",
    "Seated Calf Raises": "Wadenheben im Sitzen",
    "Dead Bug": "Dead Bug",
    Plank: "Unterarmstütz",
    "Ab Wheel Rollouts": "AbWheel-Rollouts",
    "Reverse Flyes (Dumbbells)": "Reverse Flys",
    "Close-Grip Dumbbell Floor Press": "Enges Bodendrücken",
    "Dumbbell Kickbacks": "Trizeps-Kickbacks",
    "Hollow Body Hold": "Hollow Hold",
  };
  const displayName = (name) => names[name] || name;
  const icon = (name) => {
    const paths = {
      video:
        '<rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 6 4-6 4Z"/>',
      body: '<circle cx="12" cy="4" r="2"/><path d="M8 21l1-7-3-3 2-3h8l2 3-3 3 1 7M9 14h6M12 14v7"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      arrow: '<path d="m9 5 7 7-7 7"/>',
      pause: '<path d="M9 5v14M15 5v14"/>',
      play: '<path d="m8 5 11 7-11 7Z"/>',
      back: '<path d="m15 5-7 7 7 7"/>',
    };
    return (
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (paths[name] || paths.arrow) +
      "</svg>"
    );
  };
  let selected = null;
  const customReps = new Set();
  function isBlocked(ex) {
    return !!window.AF.blocked(ex.name);
  }
  function firstOpen() {
    for (let ei = 0; ei < workoutExercises.length; ei++) {
      if (isBlocked(workoutExercises[ei])) continue;
      const si = workoutExercises[ei].setData.findIndex((s) => !s.done);
      if (si >= 0) return { ei, si };
    }
    return null;
  }
  function same(a, b) {
    return !!a && !!b && a.ei === b.ei && a.si === b.si;
  }
  function muscleChips(name) {
    const a = EXERCISE_MUSCLES[name];
    if (!a) return "";
    return (
      '<div class="af-strength-muscles">' +
      [...a.pri, ...a.sec]
        .filter((key) => key !== M.CARDIO)
        .slice(0, 3)
        .map(
          (key, i) =>
            "<span" +
            (i < a.pri.length ? ' class="af-strength-primary-muscle"' : "") +
            ">" +
            esc(MUSCLE_LABELS[key] || key) +
            "</span>",
        )
        .join("") +
      "</div>"
    );
  }
  function setSummary(ex, s) {
    if (!s.reps && !s.weight)
      return ex.unit === "seconds"
        ? (ex.targetSeconds || 30) + " s Ziel"
        : (ex.reps || "Werte erfassen") +
            (ex.perSide && !/je Seite/i.test(ex.reps || "") ? " je Seite" : "");
    return (
      (ex.bw ? "" : (s.weight || "—") + " kg × ") +
      (s.reps || "—") +
      (ex.unit === "seconds" ? " s" : ex.bw ? " Wdh" : "")
    );
  }
  function weightControl(ex, s, ei, si, locked) {
    if (ex.bw)
      return '<div class="af-strength-bw"><span>Last</span><strong>Körpergewicht</strong></div>';
    const weights = window.AF.state.profile.dumbbellWeights;
    const current = Number(s.weight);
    const options = weights
      .map(
        (w) =>
          '<option value="' +
          w +
          '" ' +
          (w === current ? "selected" : "") +
          ">" +
          w +
          " kg</option>",
      )
      .join("");
    const legacy =
      current > 0 && !weights.includes(current)
        ? '<option value="' +
          current +
          '" selected>' +
          current +
          " kg (bisher)</option>"
        : "";
    return (
      '<label class="af-strength-field"><span>' +
      (ex.weightBasis === "perHand" ? "kg pro Hantel" : "kg Zusatzgewicht") +
      '</span><select data-af-focus-set="weight" data-ei="' +
      ei +
      '" data-si="' +
      si +
      '" aria-label="' +
      esc(ex.name) +
      " · Gewicht für Satz " +
      (si + 1) +
      '" ' +
      locked +
      '><option value="">kg wählen</option>' +
      legacy +
      options +
      "</select></label>"
    );
  }
  function repsControl(ex, s, ei, si, locked) {
    const data = ' data-ei="' + ei + '" data-si="' + si + '" ' + locked;
    if (ex.unit === "seconds")
      return (
        '<label class="af-strength-field"><span>Sekunden</span><input data-af-focus-set="reps" type="number" inputmode="numeric" min="1" step="1" aria-label="Sekunden für Satz ' +
        (si + 1) +
        '" value="' +
        esc(s.reps || "") +
        '"' +
        data +
        "></label>"
      );
    const manual = Number(s.reps) > 50 || customReps.has(ei + ":" + si);
    const options = Array.from({ length: 50 }, (_, i) => i + 1)
      .map(
        (n) =>
          '<option value="' +
          n +
          '" ' +
          (Number(s.reps) === n && !manual ? "selected" : "") +
          ">" +
          n +
          "</option>",
      )
      .join("");
    return (
      '<div class="af-strength-field"><label for="af-focus-reps">Wiederholungen</label><select id="af-focus-reps" data-af-focus-set="reps" aria-label="Wiederholungen für Satz ' +
      (si + 1) +
      '"' +
      data +
      '><option value="">Wdh wählen</option>' +
      options +
      '<option value="custom" ' +
      (manual ? "selected" : "") +
      '>Andere Zahl …</option></select><label class="af-strength-custom" ' +
      (!manual ? "hidden" : "") +
      '><span>Direkt eingeben · auch über 50</span><input data-af-focus-custom="reps" type="number" inputmode="numeric" min="1" step="1" aria-label="Wiederholungen direkt eingeben" value="' +
      esc(s.reps || "") +
      '"' +
      data +
      "></label></div>"
    );
  }
  function focusMarkup() {
    const next = firstOpen();
    if (
      !selected ||
      !workoutExercises[selected.ei]?.setData[selected.si] ||
      isBlocked(workoutExercises[selected.ei])
    )
      selected = next;
    if (!selected)
      return (
        '<section class="af-strength-focus af-strength-complete"><p class="af-strength-eyebrow">Geschafft</p><h2>' +
        (workoutExercises.some((ex) => !isBlocked(ex))
          ? "Alle Sätze erledigt"
          : "Keine freigegebenen Sätze") +
        '</h2><p>Deine erfassten Sätze findest du im Ablauf.</p><button type="button" class="af-strength-submit" data-af-strength="finish">Training abschliessen</button></section>'
      );
    const { ei, si } = selected,
      ex = workoutExercises[ei],
      s = ex.setData[si];
    const locked = isBlocked(ex) ? "disabled" : "";
    const eyebrow = s.done
      ? "ERLEDIGT"
      : same(selected, next)
        ? "JETZT"
        : "AUSGEWÄHLT";
    let upcoming = null;
    for (let e = ei; e < workoutExercises.length && !upcoming; e++) {
      if (isBlocked(workoutExercises[e])) continue;
      for (
        let i = e === ei ? si + 1 : 0;
        i < workoutExercises[e].setData.length;
        i++
      )
        if (!workoutExercises[e].setData[i].done) {
          upcoming = { ei: e, si: i };
          break;
        }
    }
    if (!upcoming && next && !same(selected, next)) upcoming = next;
    const target =
      (ex.reps || "Saubere Ausführung") +
      (ex.perSide && !/je Seite/i.test(ex.reps || "") ? " · je Seite" : "") +
      (ex.unit === "seconds"
        ? /sek|second|\bs\b/i.test(ex.reps || "")
          ? ""
          : " Sekunden"
        : /wdh|wiederholung/i.test(ex.reps || "")
          ? ""
          : " Wiederholungen");
    return (
      '<section class="af-strength-focus" data-ei="' +
      ei +
      '" data-si="' +
      si +
      '" aria-labelledby="af-focus-title"><p class="af-strength-eyebrow">' +
      eyebrow +
      " · SATZ " +
      (si + 1) +
      " VON " +
      ex.setData.length +
      '</p><div class="af-strength-titleline"><h2 id="af-focus-title">' +
      esc(displayName(ex.name)) +
      '</h2><div class="af-strength-icons"><button type="button" class="af-strength-icon" data-af-action="exercise-info" data-name="' +
      esc(ex.name) +
      '" aria-label="Video und Technik: ' +
      esc(displayName(ex.name)) +
      '" title="Video und Technik">' +
      icon("video") +
      '</button><button type="button" class="af-strength-icon" data-af-action="muscle-info" data-name="' +
      esc(ex.name) +
      '" aria-label="Muskelgruppen: ' +
      esc(displayName(ex.name)) +
      '" title="Muskelgruppen">' +
      icon("body") +
      '</button></div></div><p class="af-strength-target">Ziel: ' +
      esc(target) +
      "<span> · " +
      (ex.restTimer || 120) +
      " s Pause</span></p>" +
      muscleChips(ex.name) +
      '<div class="af-strength-fields">' +
      weightControl(ex, s, ei, si, locked) +
      repsControl(ex, s, ei, si, locked) +
      '</div><p class="af-strength-preset">' +
      (ex.bw
        ? "Kontrollierte Ausführung vor Tempo."
        : "Deine Hantelstufen · Last je Hantel beachten.") +
      '</p><details class="af-strength-rpe" ' +
      (s.rpe ? "open" : "") +
      "><summary>Anstrengung <span>" +
      (s.rpe ? "RPE " + esc(s.rpe) : "optional") +
      '</span></summary><label>RPE <select data-af-focus-set="rpe" data-ei="' +
      ei +
      '" data-si="' +
      si +
      '" aria-label="Anstrengung für Satz ' +
      (si + 1) +
      '" ' +
      locked +
      '><option value="">Nicht erfasst</option>' +
      [5, 6, 7, 8, 9, 10]
        .map(
          (n) =>
            '<option value="' +
            n +
            '" ' +
            (Number(s.rpe) === n ? "selected" : "") +
            ">" +
            n +
            (n === 8
              ? " · etwa 2 Wdh Reserve"
              : n === 10
                ? " · keine Reserve"
                : "") +
            "</option>",
        )
        .join("") +
      "</select></label><p>RPE 8 ≈ 2 saubere Wiederholungen Reserve.</p></details>" +
      (ex.unit === "seconds"
        ? '<button type="button" class="af-strength-timed" data-af-action="interval" data-ei="' +
          ei +
          '" data-si="' +
          si +
          '" ' +
          locked +
          ">" +
          icon("play") +
          " " +
          (Number(s.reps) || ex.targetSeconds || 30) +
          " s starten</button>"
        : "") +
      '<button type="button" class="af-strength-submit ' +
      (s.done ? "af-strength-undo" : "") +
      '" data-af-action="set-done" data-ei="' +
      ei +
      '" data-si="' +
      si +
      '" ' +
      locked +
      ">" +
      icon("check") +
      (s.done ? "Satz wieder öffnen" : "Satz abschliessen") +
      '</button><div class="af-strength-actions"><button type="button" data-af-action="add-set" data-ei="' +
      ei +
      '" ' +
      locked +
      '>+ Satz</button><button type="button" data-af-action="variant" data-ei="' +
      ei +
      '">Übung wechseln</button></div>' +
      (upcoming
        ? '<button type="button" class="af-strength-next" data-af-strength="focus" data-ei="' +
          upcoming.ei +
          '" data-si="' +
          upcoming.si +
          '"><span><small>Danach · Satz ' +
          (upcoming.si + 1) +
          " von " +
          workoutExercises[upcoming.ei].setData.length +
          "</small><strong>" +
          esc(displayName(workoutExercises[upcoming.ei].name)) +
          "</strong></span>" +
          icon("arrow") +
          "</button>"
        : '<p class="af-strength-last">Danach ist dein Training vollständig.</p>') +
      "</section>"
    );
  }
  const originalRenderList = renderExerciseList;
  renderExerciseList = function () {
    const list = document.getElementById("exercise-list");
    if (!list) return;
    const states = new Map(
      [...list.querySelectorAll(".af-strength-exercise")].map((d) => [
        Number(d.dataset.ei),
        d.open,
      ]),
    );
    const editorStates = new Set(
      [...list.querySelectorAll(".af-strength-editor[open]")].map((d) =>
        Number(d.dataset.ei),
      ),
    );
    originalRenderList();
    const legacy = [...list.querySelectorAll(".af-exercise")];
    const next = firstOpen();
    const nextExercise = next
      ? workoutExercises.findIndex(
          (ex, ei) =>
            ei > next.ei && !isBlocked(ex) && ex.setData.some((s) => !s.done),
        )
      : -1;
    const focus = focusMarkup();
    const total = workoutExercises.reduce((n, ex) => n + ex.setData.length, 0);
    list.innerHTML =
      focus +
      '<section class="af-workout-flow af-strength-flow"><div class="af-strength-flowhead"><h2>Dein Ablauf</h2><p>' +
      workoutExercises.length +
      " Übungen · " +
      total +
      " Sätze</p></div><ol>" +
      workoutExercises
        .map((ex, ei) => {
          const done = ex.setData.filter((s) => s.done).length;
          const now = next?.ei === ei;
          const status = isBlocked(ex)
            ? "Gesperrt"
            : done === ex.setData.length
              ? "Erledigt"
              : now
                ? "Jetzt: Satz " + (next.si + 1)
                : ei === nextExercise
                  ? "Als Nächstes"
                  : "Noch offen";
          const rows = ex.setData
            .map(
              (s, si) =>
                '<button type="button" class="af-strength-set-jump ' +
                (s.done ? "is-done" : "") +
                (same(selected, { ei, si }) ? " is-selected" : "") +
                '" data-af-strength="focus" data-ei="' +
                ei +
                '" data-si="' +
                si +
                '" ' +
                (isBlocked(ex) ? "disabled" : "") +
                '><span class="af-strength-status">' +
                (s.done ? icon("check") : "") +
                "</span><span>Satz " +
                (si + 1) +
                '</span><span class="af-strength-setvalue" data-ei="' +
                ei +
                '" data-si="' +
                si +
                '">' +
                esc(setSummary(ex, s)) +
                "</span></button>",
            )
            .join("");
          const old = legacy[ei];
          const controls = old
            ? [...old.children]
                .filter(
                  (el) =>
                    el.matches(
                      ".af-sethead,.af-setrow,.af-ex-hints,.af-muscle-summary",
                    ) || el.dataset.afAction === "interval",
                )
                .map((el) => el.outerHTML)
                .join("")
            : "";
          return (
            '<li><details class="af-strength-exercise ' +
            (isBlocked(ex) ? "af-locked" : "") +
            '" id="af-exercise-' +
            ei +
            '" data-ei="' +
            ei +
            '" ' +
            (states.has(ei) ? (states.get(ei) ? "open" : "") : "open") +
            "><summary " +
            (now ? 'aria-current="step"' : "") +
            '><span class="af-strength-order">' +
            String(ei + 1).padStart(2, "0") +
            '</span><span class="af-strength-exercise-name"><strong>' +
            esc(displayName(ex.name)) +
            "</strong><span>" +
            done +
            "/" +
            ex.setData.length +
            " · " +
            status +
            '</span></span><span class="af-strength-chevron">⌄</span></summary>' +
            rows +
            '<details class="af-strength-editor" data-ei="' +
            ei +
            '" ' +
            (editorStates.has(ei) ? "open" : "") +
            "><summary>Werte aller Sätze bearbeiten</summary>" +
            controls +
            '<div class="af-strength-actions"><button type="button" data-af-action="add-set" data-ei="' +
            ei +
            '" ' +
            (isBlocked(ex) ? "disabled" : "") +
            '>+ Satz</button><button type="button" data-af-action="remove-set" data-ei="' +
            ei +
            '">− Satz</button><button type="button" data-af-action="variant" data-ei="' +
            ei +
            '">Übung wechseln</button><button type="button" data-af-action="remove-ex" data-ei="' +
            ei +
            '">Übung entfernen</button></div></details></details></li>'
          );
        })
        .join("") +
      '</ol><button type="button" class="af-strength-return" data-af-strength="current">Zum aktuellen Satz ' +
      icon("arrow") +
      "</button></section>";
  };
  const originalActive = renderWorkoutActive;
  renderWorkoutActive = function () {
    selected = firstOpen();
    originalActive();
    const header = document.getElementById("workout-header");
    if (!header || !activeWorkoutDay) return;
    const options = [...header.children]
      .slice(2)
      .map((n) => n.outerHTML)
      .join("");
    header.innerHTML =
      '<div class="af-strength-session"><div class="af-strength-sessiontop"><button type="button" class="af-strength-icon" data-af-strength="back" aria-label="Zurück zur Trainingsauswahl">' +
      icon("back") +
      '</button><button type="button" class="af-strength-open-hints" data-af-strength="hints">Aufwärmen & Hinweise</button><time id="workout-timer">' +
      fmt(workoutElapsed) +
      '</time><button type="button" class="af-strength-icon" id="timer-toggle-btn" data-af-strength="timer" aria-label="Trainingstimer pausieren oder fortsetzen">' +
      icon(timerRunning ? "pause" : "play") +
      "</button></div><h1>" +
      esc(activeWorkoutDay.name) +
      '</h1><div class="af-strength-progressline"><span id="workout-prog-txt"></span><span id="workout-prog-pct"></span></div><div class="af-strength-progress"><div id="workout-prog-bar"></div></div></div>';
    const warmup = document
      .getElementById("warmup-toggle")
      ?.closest(".workout-section");
    const oldOptions = document.getElementById("af-strength-options");
    const settingsDetails = document.createElement("details");
    settingsDetails.id = "af-strength-options";
    settingsDetails.className = "af-strength-sessionoptions";
    settingsDetails.innerHTML =
      "<summary>Aufwärmen, Trainingshinweise & Einstellungen</summary>" +
      options +
      '<button type="button" data-af-strength="reset-timer">Trainingstimer zurücksetzen</button>';
    if (warmup)
      settingsDetails.insertBefore(warmup, settingsDetails.children[1] || null);
    oldOptions?.remove();
    document.getElementById("exercise-list").after(settingsDetails);
    updateProgress();
  };
  const originalSetVal = setVal;
  setVal = function (ei, si, field, value) {
    originalSetVal(ei, si, field, value);
    const s = workoutExercises[ei]?.setData[si];
    if (!s) return;
    const selector = '[data-ei="' + ei + '"][data-si="' + si + '"]';
    document
      .querySelectorAll(
        '[data-af-set="' +
          field +
          '"]' +
          selector +
          ',[data-af-focus-set="' +
          field +
          '"]' +
          selector,
      )
      .forEach((el) => {
        if (
          field === "reps" &&
          el.tagName === "SELECT" &&
          Number(value) > 50 &&
          !el.querySelector('option[value="' + Number(value) + '"]') &&
          el.dataset.afSet
        )
          el.add(new Option(value, value));
        if (
          el.dataset.afFocusSet === "reps" &&
          el.tagName === "SELECT" &&
          (Number(value) > 50 || customReps.has(ei + ":" + si))
        )
          el.value = "custom";
        else el.value = value;
      });
    document
      .querySelectorAll(".af-strength-setvalue" + selector)
      .forEach((el) => {
        el.textContent = setSummary(workoutExercises[ei], s);
      });
    const custom = document.querySelector("[data-af-focus-custom]" + selector);
    if (field === "reps" && custom && document.activeElement !== custom)
      custom.value = value;
  };
  const originalToggle = toggleSet;
  toggleSet = function (ei, si) {
    const before = workoutExercises[ei]?.setData[si]?.done;
    originalToggle(ei, si);
    const after = workoutExercises[ei]?.setData[si]?.done;
    if (before !== after) {
      selected = after ? firstOpen() : { ei, si };
      if (after && selected?.ei === ei && selected.si > si) {
        const completed = workoutExercises[ei].setData[si];
        const following = workoutExercises[ei].setData[selected.si];
        for (const field of ["weight", "reps"])
          if (!following[field] && completed[field])
            setVal(ei, selected.si, field, completed[field]);
      }
      renderExerciseList();
    }
  };
  const originalAddSet = addSet;
  addSet = function (ei) {
    const before = workoutExercises[ei]?.setData.length;
    originalAddSet(ei);
    if (workoutExercises[ei]?.setData.length > before) {
      selected = { ei, si: workoutExercises[ei].setData.length - 1 };
      renderExerciseList();
    }
  };
  scrollToSetRow = function (ei, si) {
    if (!workoutExercises[ei]?.setData[si] || isBlocked(workoutExercises[ei])) {
      const next = firstOpen();
      if (!next) return;
      ({ ei, si } = next);
    }
    selected = { ei, si };
    renderExerciseList();
    document
      .querySelector(".af-strength-focus")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  function inputFocus(e) {
    const el = e.target;
    if (!el.matches("[data-af-focus-set],[data-af-focus-custom]")) return;
    const ei = Number(el.dataset.ei),
      si = Number(el.dataset.si),
      field = el.dataset.afFocusSet || el.dataset.afFocusCustom;
    if (field === "reps" && el.value === "custom") {
      customReps.add(ei + ":" + si);
      const label = document.querySelector(".af-strength-custom");
      if (label) {
        label.hidden = false;
        label.querySelector("input").focus();
      }
      return;
    }
    if (field === "reps" && el.tagName === "SELECT") {
      customReps.delete(ei + ":" + si);
      const label = document.querySelector(".af-strength-custom");
      if (label) label.hidden = true;
    }
    const valid =
      field !== "reps" ||
      (Number.isSafeInteger(Number(el.value)) && Number(el.value) > 0);
    if (field === "reps" && el.tagName === "INPUT")
      el.setCustomValidity(
        el.value && !valid ? "Bitte eine positive ganze Zahl eingeben." : "",
      );
    setVal(
      ei,
      si,
      field,
      valid ? (field === "reps" ? String(Number(el.value)) : el.value) : "",
    );
  }
  document.addEventListener("input", inputFocus);
  document.addEventListener("change", inputFocus);
  document.addEventListener("click", (e) => {
    const button = e.target.closest("[data-af-strength]");
    if (!button) return;
    const action = button.dataset.afStrength;
    if (action === "focus")
      scrollToSetRow(Number(button.dataset.ei), Number(button.dataset.si));
    if (action === "current") {
      const next = firstOpen();
      if (next) scrollToSetRow(next.ei, next.si);
      else {
        selected = null;
        renderExerciseList();
        document
          .querySelector(".af-strength-focus")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    if (action === "timer") toggleTimer();
    if (action === "reset-timer") resetTimer();
    if (action === "back") backToWorkoutSelect();
    if (action === "hints") {
      const options = document.getElementById("af-strength-options");
      if (options) {
        options.open = true;
        options.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    if (action === "finish") finishWorkout();
    if (action === "rest-add") {
      restTimerMax += 30;
      restTimerSec = Math.max(
        0,
        restTimerMax - Math.round((Date.now() - _restTimerStartTS) / 1000),
      );
      updateRestTimerUI();
    }
    if (action === "rest-skip") dismissRestTimer();
  });
  updateRestTimerUI = function () {
    const bar = document.getElementById("rest-timer-bar");
    if (!bar) return;
    if (restTimerSec <= 0) {
      bar.classList.remove("active");
      return;
    }
    bar.classList.add("active", "af-strength-rest");
    if (!bar.querySelector(".af-strength-rest-main"))
      bar.innerHTML =
        '<div class="af-strength-rest-main"><span>ERHOLUNG<small>Nächster Satz nach der Pause</small></span><strong role="timer" aria-label="Verbleibende Pause"></strong></div><div class="af-strength-rest-progress"><span></span></div><div class="af-strength-rest-actions"><button type="button" data-af-strength="rest-add">+30 s</button><button type="button" data-af-strength="rest-skip">Überspringen ' +
        icon("arrow") +
        "</button></div>";
    bar.querySelector('[role="timer"]').textContent = fmt(restTimerSec);
    bar.querySelector(".af-strength-rest-progress > span").style.width =
      Math.max(0, Math.min(100, (restTimerSec / restTimerMax) * 100)) + "%";
  };
  window.AF.strength = {
    displayName,
    firstOpen,
    get selected() {
      return selected;
    },
    select: scrollToSetRow,
  };
})();
