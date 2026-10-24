const test = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
function worker() {
  const events = {},
    cacheMap = new Map(),
    deleted = [],
    base = "https://example.test/app/";
  let offline = false;
  const key = (r) => new URL(typeof r === "string" ? r : r.url, base).href;
  const cache = {
    addAll: async (files) => {
      for (const f of files) cacheMap.set(key(f), new Response("install:" + f));
    },
    put: async (r, response) => cacheMap.set(key(r), response),
    match: async (r, options = {}) => {
      const wanted = key(r);
      if (!options.ignoreSearch) return cacheMap.get(wanted)?.clone();
      const match = [...cacheMap].find(
        ([k]) => k.split("?")[0] === wanted.split("?")[0],
      );
      return match?.[1].clone();
    },
  };
  const context = {
    self: {
      location: { origin: "https://example.test" },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
      addEventListener: (name, cb) => (events[name] = cb),
    },
    clients: { matchAll: async () => [], openWindow: async () => {} },
    caches: {
      open: async () => cache,
      keys: async () => ["af-v11", "unrelated-cache", "af-v12-coach-20261024"],
      delete: async (k) => deleted.push(k),
    },
    fetch: async () => {
      if (offline) throw Error("offline");
      return new Response("fresh");
    },
    Response,
    URL,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../sw.js"), "utf8"),
    context,
  );
  return {
    cacheMap,
    deleted,
    async install() {
      let task;
      events.install({ waitUntil: (p) => (task = p) });
      await task;
    },
    async activate() {
      let task;
      events.activate({ waitUntil: (p) => (task = p) });
      await task;
    },
    setOffline() {
      offline = true;
    },
    async fetch(file, mode = "cors") {
      let response;
      const work = [];
      events.fetch({
        request: { method: "GET", url: new URL(file, base).href, mode },
        waitUntil: (p) => work.push(p),
        respondWith: (p) => (response = p),
      });
      const result = await response;
      await Promise.all(work);
      return result;
    },
  };
}
test("offline install includes every local runtime dependency", async () => {
  const w = worker();
  await w.install();
  for (const name of [
    "index.html",
    "coach-core.js",
    "coach.js",
    "coach-recipes.js",
    "coach.css",
    "recipe-library.json",
    "manifest.webmanifest",
    "icons/icon.svg",
  ]) {
    assert.ok(w.cacheMap.has("https://example.test/app/" + name));
    assert.ok(fs.existsSync(path.join(__dirname, "..", name)));
  }
});
test("online responses refresh the offline copy", async () => {
  const w = worker();
  await w.install();
  assert.equal(await (await w.fetch("coach.js")).text(), "fresh");
  w.setOffline();
  assert.equal(await (await w.fetch("coach.js")).text(), "fresh");
});
test("offline navigation falls back to the app shell", async () => {
  const w = worker();
  await w.install();
  w.setOffline();
  assert.match(
    await (await w.fetch("deep-link", "navigate")).text(),
    /index.html/,
  );
});
test("unknown offline assets do not receive HTML as JavaScript", async () => {
  const w = worker();
  await w.install();
  w.setOffline();
  assert.equal((await w.fetch("missing.js")).status, 503);
});
test("activation removes old AlexFit caches and preserves other apps", async () => {
  const w = worker();
  await w.activate();
  assert.deepEqual(w.deleted, ["af-v11"]);
});
