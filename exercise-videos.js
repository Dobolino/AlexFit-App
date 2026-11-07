/* Variant-specific demonstrations. Publisher pages and indexed video titles
   checked on 2026-11-07; playback and embed availability remain provider-owned. */
const EXERCISE_VIDEO_META = Object.freeze({
  "Reverse Dumbbell Lunges": {
    videoId: "AXxjaK_KtJY",
    title: "How To: Dumbbell Reverse Lunge",
    publisher: "Live Lean TV",
    sourceUrl: "https://www.liveleantv.com/how-to-do-a-dumbbell-reverse-lunge/",
    url: "https://www.youtube.com/watch?v=AXxjaK_KtJY",
    variantNote: "Rückwärts aussteigen, eine Kurzhantel pro Hand. Beide Seiten ergeben einen Satz.",
    checkedOn: "2026-11-07",
  },
  "Stationary Dumbbell Split Squat": {
    videoId: "EByFmf2LfY8",
    title: "Dumbbell Split Squat",
    publisher: "Muscle & Strength",
    sourceUrl: "https://www.muscleandstrength.com/exercises/dumbbell-split-squat",
    url: "https://www.youtube.com/watch?v=EByFmf2LfY8",
    variantNote: "Statischer Ausfallschritt: Beide Füsse bleiben am Boden, der hintere Fuss wird nicht auf die Bank gelegt.",
    checkedOn: "2026-11-07",
  },
  "Neutral-Grip Dumbbell Bench Press": {
    videoId: "elKOyKyJ3GM",
    title: "Neutral Grip Flat Dumbbell Bench Press",
    publisher: "Strong Athlete / Coach G",
    sourceUrl: "https://www.youtube.com/watch?v=elKOyKyJ3GM",
    url: "https://www.youtube.com/watch?v=elKOyKyJ3GM",
    variantNote: "Flache Bank, Handflächen während der Bewegung zueinander. Gewicht pro Hantel erfassen.",
    checkedOn: "2026-11-07",
  },
  "Close-Grip Dumbbell Floor Press": {
    videoId: "gDO6U_C1ktE",
    title: "How to Do: DUMBBELL CLOSE GRIP FLOOR PRESS",
    publisher: "Leap Fitness",
    sourceUrl: "https://www.youtube.com/watch?v=gDO6U_C1ktE",
    url: "https://www.youtube.com/watch?v=gDO6U_C1ktE",
    variantNote: "Am Boden mit Kurzhanteln und engem neutralem Griff. Oberarme kontrolliert absetzen; Gewicht pro Hantel erfassen.",
    checkedOn: "2026-11-07",
  },
  "Weighted Glute Bridge": {
    videoId: "cruqsnAyU6A",
    title: "Dumbbell Glute Bridge",
    publisher: "PureGym",
    sourceUrl: "https://www.puregym.com/exercises/glutes/glute-bridge/dumbbell-glute-bridges/",
    url: "https://www.youtube.com/watch?v=cruqsnAyU6A",
    variantNote: "Schultern am Boden, eine gepolsterte Kurzhantel auf der Hüfte. Kein Hip Thrust mit aufgestütztem Rücken auf der Bank.",
    checkedOn: "2026-11-07",
  },
});

// Loaded after index.html's legacy video catalog, before the deferred coach UI.
if (typeof EXERCISE_VIDEOS !== "undefined") {
  for (const [name, video] of Object.entries(EXERCISE_VIDEO_META))
    EXERCISE_VIDEOS[name] = video.videoId;
}
if (typeof module === "object" && module.exports)
  module.exports = EXERCISE_VIDEO_META;
