const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { boot } = require("./helpers.cjs");
const videos = require("../exercise-videos.js");

test("new training variants open their own demonstration instead of an unrelated legacy exercise", () => {
  const app = boot();
  try {
    // Also works while the normal HTML/helper script list is being integrated.
    if (!app.run("typeof EXERCISE_VIDEO_META !== 'undefined'"))
      app.run(fs.readFileSync(path.join(__dirname, "../exercise-videos.js"), "utf8"));
    for (const [name, video] of Object.entries(videos)) {
      assert.match(video.videoId, /^[A-Za-z0-9_-]{11}$/);
      assert.equal(new URL(video.url).searchParams.get("v"), video.videoId);
      assert.ok(video.publisher && video.variantNote && video.sourceUrl);
      app.run("showExerciseInfo(" + JSON.stringify(name) + ")");
      const frame = app.document.querySelector("#ex-info-box iframe");
      assert.ok(frame, "missing video for " + name);
      assert.equal(new URL(frame.src).pathname, "/embed/" + video.videoId);
      app.run("closeExerciseInfo()");
    }
    assert.deepEqual(app.errors, []);
  } finally {
    app.close();
  }
});
