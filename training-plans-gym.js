(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AlexFitGymTraining = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "gym-p1p2-2026-11";
  const phases = [
    {
      id: "p1",
      weeks: 4,
      subtitle: "Technik & Grundlagen",
      color: "#8B5CF6",
    },
    {
      id: "p2",
      weeks: 8,
      subtitle: "Volumen & Intensität",
      color: "#7C3AED",
    },
  ];
  const exercise = (name, muscle, sets, reps, restTimer, extra = {}) => ({
    name,
    muscle,
    sets,
    reps,
    restTimer,
    ...extra,
  });

  const p1Days = [
    {
      id: "gd1",
      label: "Tag 1",
      name: "Push",
      tag: "MO",
      color: "#8B5CF6",
      muscles: ["Brust", "Schultern", "Trizeps"],
      exercises: [
        exercise("Bankdrücken", "Brust", 3, "10", 120, {equipment: ["langhantel", "flachbank", "squat-rack"], movementPattern: "chest-press", note: "Schulterblätter zusammenziehen, Ellbogen 45–75°."}),
        exercise("Kurzhantel Bankdrücken", "Brust", 3, "10–12", 120, {equipment: ["kurzhantel", "flachbank", "verstellbare-bank"], movementPattern: "chest-press", note: "Volle Bewegungsamplitude."}),
        exercise("Schrägbank KH Drücken", "Brust oben", 3, "10–12", 120, {equipment: ["kurzhantel", "schraegbank", "verstellbare-bank"], movementPattern: "incline-press", note: "Bank 30–45°, Schulterblätter aktiv."}),
        exercise("Shoulder Press Maschine", "Schultern", 3, "12", 90, {equipment: ["shoulder-press-maschine"], movementPattern: "overhead-press", note: "Nicht ins Hohlkreuz fallen."}),
        exercise("KH Schulterdrücken", "Schultern", 3, "12", 90, {equipment: ["kurzhantel", "verstellbare-bank"], movementPattern: "overhead-press", note: "Handflächen nach vorne, Ellbogen leicht vorne."}),
        exercise("KH Seitheben", "Schultern seitl.", 3, "15", 90, {equipment: ["kurzhantel"], movementPattern: "lateral-raise", note: "Daumen leicht nach unten, Ellbogen minimal gebeugt."}),
        exercise("Trizeps Pushdown", "Trizeps", 3, "15", 90, {equipment: ["kabelzug-hoch", "funktionsturm"], movementPattern: "tricep-pushdown", note: "Ellbogen bleiben nah am Körper."}),
        exercise("Trizeps Maschine", "Trizeps", 3, "15", 90, {equipment: ["trizeps-maschine"], movementPattern: "tricep-pushdown", note: "Volle Streckung, langsam zurück."}),
      ],
    },
    {
      id: "gd2",
      label: "Tag 2",
      name: "Pull",
      tag: "DI",
      color: "#10B981",
      muscles: ["Rücken", "Bizeps", "Hintere Schulter"],
      exercises: [
        exercise("Latzug", "Rücken", 3, "10–12", 120, {equipment: ["latzug-maschine"], movementPattern: "vertical-pull", note: "Brust zur Stange, Schulterblätter zusammen."}),
        exercise("Klimmzüge", "Rücken", 3, "6–10", 120, {bw: true, equipment: ["klimmzugstange"], movementPattern: "vertical-pull", note: "Schulterblätter erst aktivieren."}),
        exercise("Seated Row Maschine", "Rücken", 3, "12", 120, {equipment: ["seated-row-maschine"], movementPattern: "horizontal-pull", note: "Rücken gerade, Ellbogen nah am Körper."}),
        exercise("KH Rudern", "Rücken", 3, "10", 120, {equipment: ["kurzhantel", "verstellbare-bank"], movementPattern: "horizontal-pull", note: "Stützhand auf Bank, Rücken parallel."}),
        exercise("Face Pull", "Hintere Schulter", 3, "15", 90, {equipment: ["kabelzug-hoch", "funktionsturm"], movementPattern: "rear-delt", note: "Seil zur Stirn, Ellbogen hoch."}),
        exercise("Reverse Pec Deck", "Hintere Schulter", 3, "15", 90, {equipment: ["reverse-pec-deck"], movementPattern: "rear-delt", note: "Arme leicht gebeugt, aus hinterer Schulter."}),
        exercise("EZ-Bar Curl", "Bizeps", 3, "12", 90, {equipment: ["ez-bar"], movementPattern: "bicep-curl", note: "Ellbogen fest, kein Ausweichen."}),
        exercise("KH Curl", "Bizeps", 3, "12", 90, {equipment: ["kurzhantel"], movementPattern: "bicep-curl", note: "Abwechselnd, Ellbogen fixiert."}),
      ],
    },
    {
      id: "gd3",
      label: "Tag 3",
      name: "Legs",
      tag: "DO",
      color: "#F59E0B",
      muscles: ["Beine", "Gesäss", "Core"],
      exercises: [
        exercise("Kniebeuge", "Beine", 3, "10", 120, {equipment: ["squat-rack", "langhantel"], movementPattern: "squat", note: "Knie über Zehen, Rücken gerade."}),
        exercise("Leg Press", "Beine", 4, "12", 120, {equipment: ["leg-press"], movementPattern: "squat", note: "Füsse schulterbreit, Knie nicht überstrecken."}),
        exercise("Leg Curl", "Oberschenkel hinten", 3, "12", 90, {equipment: ["leg-curl"], movementPattern: "leg-curl", note: "Volle Amplitude."}),
        exercise("Leg Extension", "Oberschenkel vorne", 3, "12", 90, {equipment: ["leg-extension"], movementPattern: "leg-extension", note: "Volle Streckung."}),
        exercise("Hip Thrust Maschine", "Gesäss", 3, "12", 90, {equipment: ["hip-thrust-maschine"], movementPattern: "hip-thrust", note: "Kinn zur Brust, Gesäss maximal anspannen."}),
        exercise("Calf Raise Maschine", "Waden", 4, "15", 60, {equipment: ["calf-raise-maschine"], movementPattern: "calf-raise", note: "Im oberen Punkt 1s halten."}),
        exercise("Planke", "Core", 3, "45s", 60, {bw: true, equipment: ["bodyweight"], movementPattern: "plank", note: "Körper gerade wie ein Brett."}),
      ],
    },
    {
      id: "gd4",
      label: "Tag 4",
      name: "Upper Mix",
      tag: "FR",
      color: "#3B82F6",
      muscles: ["Rücken", "Brust", "Schultern", "Arme"],
      exercises: [
        exercise("Klimmzüge", "Rücken", 3, "8–10", 120, {bw: true, equipment: ["klimmzugstange"], movementPattern: "vertical-pull", note: "Schulterblätter aktiv."}),
        exercise("Dips / Assisted Dips", "Trizeps", 3, "10", 90, {bw: true, equipment: ["dip-station", "assisted-pullup-maschine"], movementPattern: "dip", note: "Aufrecht für Trizeps-Fokus."}),
        exercise("Pec Deck", "Brust", 3, "12–15", 90, {equipment: ["pec-deck"], movementPattern: "chest-fly", note: "Volle Streckung am Anfang, Squeeze am Ende."}),
        exercise("Reverse Pec Deck", "Hintere Schulter", 3, "15", 90, {equipment: ["reverse-pec-deck"], movementPattern: "rear-delt", note: "Aus hinterer Schulter."}),
        exercise("Hammer Curl", "Bizeps", 3, "12", 90, {equipment: ["kurzhantel"], movementPattern: "hammer-curl", note: "Neutral Grip, Ellbogen fixiert."}),
      ],
    },
    {
      id: "gd5",
      label: "Tag 5",
      name: "Cardio nach Wahl",
      tag: "SA",
      color: "#10B981",
      muscles: ["Ausdauer"],
      flexibleCardio: true,
      exercises: [
        exercise("Ruder Intervalle", "Ausdauer", 5, "2 Min / 1 Min Pause", 0, {bw: true, equipment: ["ruderergometer"], movementPattern: "cardio", note: "Beine zuerst, dann Rücken, dann Arme."}),
        exercise("Crosstrainer", "Ausdauer", 1, "20 Min", 0, {bw: true, equipment: ["crosstrainer", "fahrradergometer", "laufband"], movementPattern: "cardio", note: "Moderate Intensität, Herzfrequenz 130–150."}),
      ],
    },
  ];

  const p2Days = [
    {
      id: "gd2_1",
      label: "Tag 1",
      name: "Brust/Trizeps",
      tag: "MO",
      color: "#8B5CF6",
      muscles: ["Brust", "Trizeps"],
      exercises: [
        exercise("Schrägbank KH Drücken", "Brust oben", 4, "8–10", 120, {equipment: ["kurzhantel", "schraegbank", "verstellbare-bank"], movementPattern: "incline-press", note: "Oberer Brustanteil — 30–45°."}),
        exercise("Bankdrücken", "Brust", 4, "6–10", 120, {equipment: ["langhantel", "flachbank", "squat-rack"], movementPattern: "chest-press", note: "Schulterblätter fest, Ellbogen 45–75°."}),
        exercise("Pec Deck", "Brust", 3, "12–15", 90, {equipment: ["pec-deck"], movementPattern: "chest-fly", note: "Volle Amplitude."}),
        exercise("Dips / Assisted Dips", "Trizeps", 4, "8–12", 90, {bw: true, equipment: ["dip-station", "assisted-pullup-maschine"], movementPattern: "dip", note: "Aufrecht für Trizeps."}),
        exercise("Skull Crushers", "Trizeps", 3, "10–12", 90, {equipment: ["ez-bar", "flachbank", "verstellbare-bank"], movementPattern: "skull-crusher", note: "Ellbogen zeigen zur Decke."}),
        exercise("Trizeps Pushdown", "Trizeps", 3, "12–15", 90, {equipment: ["kabelzug-hoch", "funktionsturm"], movementPattern: "tricep-pushdown", note: "Ellbogen nah am Körper."}),
      ],
    },
    {
      id: "gd2_2",
      label: "Tag 2",
      name: "Beine/Core",
      tag: "DI",
      color: "#F59E0B",
      muscles: ["Beine", "Gesäss", "Core"],
      exercises: [
        exercise("Kniebeuge", "Beine", 4, "6–10", 120, {equipment: ["squat-rack", "langhantel"], movementPattern: "squat", note: "Brust hoch, so tief wie möglich."}),
        exercise("Hack Squat", "Beine", 3, "10–12", 120, {equipment: ["hack-squat"], movementPattern: "hack-squat", note: "Enge Fußstellung für mehr Quads."}),
        exercise("Rumänisches Kreuzheben", "Oberschenkel hinten", 4, "8–10", 120, {equipment: ["langhantel", "kurzhantel"], movementPattern: "rdl", note: "Rücken gerade, Dehnung in Hamstrings spüren."}),
        exercise("Leg Curl", "Oberschenkel hinten", 3, "12–15", 90, {equipment: ["leg-curl"], movementPattern: "leg-curl", note: "Volle Amplitude."}),
        exercise("Hip Thrust Maschine", "Gesäss", 4, "10–12", 90, {equipment: ["hip-thrust-maschine"], movementPattern: "hip-thrust", note: "Kinn zur Brust, Gesäss maximal anspannen."}),
        exercise("Calf Raise Maschine", "Waden", 4, "15–20", 60, {equipment: ["calf-raise-maschine"], movementPattern: "calf-raise", note: "Im oberen Punkt 1s halten."}),
        exercise("Planke", "Core", 3, "45–60s", 60, {bw: true, equipment: ["bodyweight"], movementPattern: "plank", note: "Gleichmäßig atmen."}),
      ],
    },
    {
      id: "gd2_3",
      label: "Tag 3",
      name: "Rücken/Bizeps",
      tag: "MI",
      color: "#10B981",
      muscles: ["Rücken", "Bizeps", "Hintere Schulter"],
      exercises: [
        exercise("Klimmzüge", "Rücken", 4, "6–10", 120, {bw: true, equipment: ["klimmzugstange"], movementPattern: "vertical-pull", note: "Schulterblätter erst aktivieren."}),
        exercise("KH Rudern", "Rücken", 4, "10–12", 120, {equipment: ["kurzhantel", "verstellbare-bank"], movementPattern: "horizontal-pull", note: "Lat zieht — nicht der Arm."}),
        exercise("Latzug", "Rücken", 4, "10–12", 120, {equipment: ["latzug-maschine"], movementPattern: "vertical-pull-alt", note: "Brust zur Stange."}),
        exercise("Seated Row Maschine", "Rücken", 3, "10–12", 90, {equipment: ["seated-row-maschine", "kabelzug-tief", "funktionsturm"], movementPattern: "horizontal-pull-alt", note: "Rücken gerade."}),
        exercise("Face Pull", "Hintere Schulter", 3, "15–20", 90, {equipment: ["kabelzug-hoch", "funktionsturm"], movementPattern: "rear-delt", note: "Ellbogen hoch, externe Rotation."}),
        exercise("EZ-Bar Curl", "Bizeps", 4, "8–10", 90, {equipment: ["ez-bar"], movementPattern: "bicep-curl", note: "Ellbogen fest."}),
        exercise("KH Curl", "Bizeps", 3, "12–15", 90, {equipment: ["kurzhantel"], movementPattern: "bicep-curl-alt", note: "Volle Amplitude."}),
      ],
    },
    {
      id: "gd2_4",
      label: "Tag 4",
      name: "Schultern/Core",
      tag: "FR",
      color: "#3B82F6",
      muscles: ["Schultern", "Core"],
      exercises: [
        exercise("KH Schulterdrücken", "Schultern", 4, "6–10", 120, {equipment: ["kurzhantel", "verstellbare-bank"], movementPattern: "overhead-press", note: "Volle Streckung oben."}),
        exercise("KH Seitheben", "Schultern seitl.", 4, "12–15", 90, {equipment: ["kurzhantel"], movementPattern: "lateral-raise", note: "Daumen leicht nach unten."}),
        exercise("Reverse Pec Deck", "Hintere Schulter", 3, "15–20", 90, {equipment: ["reverse-pec-deck"], movementPattern: "rear-delt", note: "Aus hinterer Schulter bewegen."}),
        exercise("Hammer Curl", "Bizeps", 3, "12", 90, {equipment: ["kurzhantel"], movementPattern: "hammer-curl", note: "Neutral Grip."}),
        exercise("Planke", "Core", 3, "45–60s", 60, {bw: true, equipment: ["bodyweight"], movementPattern: "plank", note: "Brett-gerade."}),
      ],
    },
    {
      id: "gd2_5",
      label: "Tag 5",
      name: "Cardio nach Wahl",
      tag: "SA",
      color: "#10B981",
      muscles: ["Ausdauer"],
      flexibleCardio: true,
      exercises: [
        exercise("Ruder Intervalle", "Ausdauer", 7, "2 Min / 1 Min Pause", 0, {bw: true, equipment: ["ruderergometer"], movementPattern: "cardio", note: "7 Intervalle — eine mehr als Phase 1."}),
        exercise("Crosstrainer", "Ausdauer", 1, "25 Min", 0, {bw: true, equipment: ["crosstrainer", "fahrradergometer", "laufband"], movementPattern: "cardio", note: "Steadystate, Herzfrequenz 130–150."}),
      ],
    },
  ];

  const phasesDays = { p1: p1Days, p2: p2Days };
  const phasesSchedule = {
    p1: { 1: "gd1", 2: "gd2", 4: "gd3", 5: "gd4", 6: "gd5" },
    p2: { 1: "gd2_1", 2: "gd2_2", 3: "gd2_3", 5: "gd2_4", 6: "gd2_5" },
  };

  function buildPlans() {
    return Object.fromEntries(
      phases.map((phase) => {
        const days = phasesDays[phase.id].map((day) => ({
          ...day,
          duration: day.flexibleCardio ? "flexibel" : "45–60 Min.",
          exercises: day.exercises.map((ex, i) => ({
            ...ex,
            id: `${phase.id}_${day.id}_${i}`,
            sets: ex.sets,
          })),
        }));
        return [
          phase.id,
          {
            ...phase,
            label: phase.id === "p1" ? "Gym Phase 1" : "Gym Phase 2",
            restTimer: phase.id === "p1" ? 90 : 80,
            restLabel: "60–90 s je Übung",
            version: VERSION,
            schedule: phasesSchedule[phase.id],
            days,
          },
        ];
      }),
    );
  }
  return { VERSION, buildPlans };
});
