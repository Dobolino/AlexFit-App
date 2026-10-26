(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AlexFitTraining = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "upper-lower-2026-10";
  const phases = [
    {
      id: "p1",
      weeks: 2,
      subtitle: "Wiedereinstieg",
      color: "#2563EB",
      rir: "3",
      guidance:
        "Woche 1–2: alle Übungen mit zwei Arbeitssätzen. Etwa drei saubere Wiederholungen Reserve lassen; Technik und Verträglichkeit prüfen.",
    },
    {
      id: "p2",
      weeks: 4,
      subtitle: "Aufbau",
      color: "#8B5CF6",
      rir: "2–3",
      guidance:
        "Woche 3–6: den vorgesehenen Umfang nur bei guter Erholung nutzen. Zuerst Wiederholungen, dann die nächstkleine passende Hantelstufe steigern.",
    },
    {
      id: "p3",
      weeks: 6,
      subtitle: "Festigen & weiter steigern",
      color: "#10B981",
      rir: "2",
      guidance:
        "Woche 7–12: Übungen, Satzumfang und Pausen beibehalten. Keine Pflicht zu Muskelversagen, Dropsätzen oder Supersätzen. Bei anhaltender Müdigkeit eine leichte Woche mit je einem Satz weniger und geringerer Last einlegen.",
    },
  ];
  // Stable English names retain the existing exercise-based training history.
  const exercise = (name, muscle, sets, reps, restTimer, extra = {}) => ({
    name,
    muscle,
    sets,
    reps,
    restTimer,
    ...extra,
  });
  function buildPlans() {
    return Object.fromEntries(
      phases.map((phase, pi) => {
        const days = [
          {
            id: "d1",
            label: "Tag 1",
            name: "Oberkörper A",
            tag: "MO",
            color: "#3B82F6",
            muscles: ["Brust", "Rücken", "Schultern", "Bizeps"],
            exercises: [
              exercise("Dumbbell Bench Press", "Brust", 3, "8–12", 120, {
                note: "Flache Bank; Kopf bequem auflegen. Gewicht pro Hantel erfassen.",
              }),
              exercise(
                "Single-Arm Dumbbell Row",
                "Rücken",
                3,
                "8–12 je Seite",
                120,
                {
                  note: "Freie Hand auf der Bank abstützen. Beide Seiten ergeben einen Satz; Pause danach.",
                },
              ),
              exercise("Push-ups (Reebok Deck)", "Brust", 2, "8–15", 90, {
                bw: true,
                note: "Normale Liegestütze oder Hände auf einer stabilen Bank erhöhen. Kein Reebok Deck nötig.",
              }),
              exercise("Lateral Raises", "Schultern", 2, "12–20", 90, {
                note: "Leicht und kontrolliert, ohne Schulterhochziehen.",
              }),
              exercise("Hammer Curls", "Bizeps", 2, "10–15", 90),
            ],
          },
          {
            id: "d4",
            label: "Tag 2",
            name: "Unterkörper A",
            tag: "DI",
            color: "#F59E0B",
            muscles: ["Quadrizeps", "Hinterschenkel", "Gesäß", "Waden", "Core"],
            exercises: [
              exercise("Goblet Squat", "Quadrizeps", 3, "8–12", 120, {
                weightBasis: "external",
                note: "Eine Hantel vor der Brust. Das Gewicht dieser einen Hantel erfassen.",
              }),
              exercise("Romanian Deadlift", "Hinterschenkel", 3, "8–12", 120, {
                note: "Hüfte zurückführen; Kopf in Verlängerung der Wirbelsäule halten.",
              }),
              exercise(
                "Reverse Dumbbell Lunges",
                "Quadrizeps",
                2,
                "8–12 je Seite",
                120,
                {
                  note: "Rückwärts aussteigen. Beide Seiten ergeben einen Satz; Pause danach.",
                },
              ),
              exercise("Standing Calf Raises", "Waden", 2, "12–20", 60, {
                bw: true,
                note: "Bei Bedarf leicht abstützen; zunächst ohne Zusatzgewicht.",
              }),
              exercise("Dead Bug", "Core", 2, "6–10 je Seite", 60, {
                bw: true,
              }),
            ],
          },
          {
            id: "d2",
            label: "Tag 3",
            name: "Oberkörper B",
            tag: "MI",
            color: "#8B5CF6",
            muscles: [
              "Rücken",
              "Brust",
              "Hintere Schulter",
              "Trizeps",
              "Bizeps",
              "Schultern",
            ],
            exercises: [
              exercise(
                "Single-Arm Dumbbell Row",
                "Rücken",
                3,
                "10–15 je Seite",
                120,
                {
                  note: "Freie Hand auf der Bank abstützen. Beide Seiten ergeben einen Satz; Pause danach.",
                },
              ),
              exercise(
                "Neutral-Grip Dumbbell Bench Press",
                "Brust",
                3,
                "8–12",
                120,
                {
                  note: "Flache Bank, Handflächen zueinander; Kopf bequem auflegen.",
                },
              ),
              exercise(
                "Reverse Flyes (Dumbbells)",
                "Hintere Schulter",
                2,
                "12–20",
                90,
                {
                  note: "Leicht und kontrolliert. Bei Beschwerden auslassen und eine verträgliche Variante wählen.",
                },
              ),
              exercise(
                "Close-Grip Dumbbell Floor Press",
                "Trizeps",
                2,
                "10–15",
                90,
                {
                  note: "Am Boden, neutraler Griff, Oberarme nicht stark abspreizen.",
                },
              ),
              exercise("Dumbbell Curls", "Bizeps", 2, "10–15", 90),
              exercise("Lateral Raises", "Schultern", 2, "12–20", 90, {
                note: "Leicht und ohne Schulterhochziehen.",
              }),
            ],
          },
          {
            id: "d3",
            label: "Tag 4",
            name: "Unterkörper B",
            tag: "FR",
            color: "#EC4899",
            muscles: ["Quadrizeps", "Gesäß", "Hinterschenkel", "Waden", "Core"],
            exercises: [
              exercise(
                "Stationary Dumbbell Split Squat",
                "Quadrizeps",
                3,
                "8–12 je Seite",
                120,
                {
                  note: "Beide Füsse am Boden, kein Bulgarian Split Squat. Beide Seiten ergeben einen Satz; Pause danach.",
                },
              ),
              exercise("Weighted Glute Bridge", "Gesäß", 3, "10–15", 90, {
                weightBasis: "external",
                note: "Am Boden; eine gepolsterte Hantel auf der Hüfte. Gewicht dieser einen Hantel erfassen.",
              }),
              exercise("Romanian Deadlift", "Hinterschenkel", 2, "10–15", 120, {
                note: "Kontrollierte Hüftbewegung; Kopf neutral halten.",
              }),
              exercise("Standing Calf Raises", "Waden", 2, "12–20", 60, {
                bw: true,
              }),
              exercise("Dead Bug", "Core", 2, "8–10 je Seite", 60, {
                bw: true,
              }),
            ],
          },
          {
            id: "d5",
            label: "Tag 5",
            name: "Cardio nach Wahl",
            tag: "SA",
            color: "#10B981",
            muscles: ["Ausdauer"],
            flexibleCardio: true,
            exercises: [],
            note: "Bike, WaterRower oder WalkingPad nach Lust und Erholung. Kein festes Intervallprogramm und keine zusätzliche harte Einheit vorgeschrieben. Nach einem fordernden Beintag eher locker; vor einer geplanten harten Tour Freitag je Übung einen Satz weniger.",
          },
        ];
        for (const day of days) {
          day.duration = day.flexibleCardio ? "flexibel" : "45–60 Min.";
          day.exercises = day.exercises.map((ex, i) => ({
            ...ex,
            id: `${phase.id}_${day.id}_${i}`,
            sets: pi === 0 ? 2 : ex.sets,
          }));
        }
        return [
          phase.id,
          {
            ...phase,
            label: `Phase ${pi + 1}`,
            restTimer: 120,
            restLabel: "60–120 s je Übung",
            version: VERSION,
            schedule: { 1: "d1", 2: "d4", 3: "d2", 5: "d3", 6: "d5" },
            days,
          },
        ];
      }),
    );
  }
  return { VERSION, buildPlans };
});
