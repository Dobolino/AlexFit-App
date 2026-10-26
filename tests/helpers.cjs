const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM, VirtualConsole } = require("jsdom");
const root = path.resolve(__dirname, "..");
function boot(stored = {}) {
  const errors = [],
    downloads = [],
    vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  w.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  w.URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return "blob:test";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLCanvasElement.prototype.getContext = () =>
    new Proxy({}, { get: (o, k) => o[k] || (() => {}) });
  w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,";
  w.HTMLAnchorElement.prototype.click = function () {};
  w.Notification = class {
    static permission = "denied";
    static requestPermission() {
      return Promise.resolve("denied");
    }
  };
  w.fetch = async (url) => ({
    ok: true,
    json: async () =>
      JSON.parse(
        fs.readFileSync(path.join(root, String(url).replace("./", "")), "utf8"),
      ),
  });
  w.Blob = Blob;
  w.structuredClone = structuredClone;
  w.addEventListener("error", (e) => {
    errors.push(e.error?.stack || e.message);
    e.preventDefault();
  });
  for (const [k, v] of Object.entries(stored))
    w.localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
  const context = dom.getInternalVMContext(),
    run = (code) =>
      new vm.Script(code).runInContext(context, { timeout: 5000 });
  run(fs.readFileSync(path.join(root, "coach-core.js"), "utf8"));
  run(fs.readFileSync(path.join(root, "training-plans.js"), "utf8"));
  for (const s of [...w.document.scripts].filter((s) => !s.src))
    run(s.textContent);
  for (const name of ["coach.js", "coach-recipes.js", "coach-tools.js"])
    run(fs.readFileSync(path.join(root, name), "utf8"));
  return {
    window: w,
    document: w.document,
    run,
    errors,
    downloads,
    close: () => w.close(),
    click(action) {
      const b =
        w.document.querySelector(
          '.screen.active [data-af-action="' + action + '"]',
        ) ||
        w.document.querySelector(
          '#bottomnav [data-af-action="' + action + '"]',
        ) ||
        w.document.querySelector('[data-af-action="' + action + '"]');
      if (!b) throw Error("Button fehlt: " + action);
      b.click();
    },
    submit(type) {
      const f =
        w.document.querySelector(
          '.screen.active [data-af-form="' + type + '"]',
        ) || w.document.querySelector('[data-af-form="' + type + '"]');
      if (!f) throw Error("Formular fehlt: " + type);
      f.dispatchEvent(
        new w.Event("submit", { bubbles: true, cancelable: true }),
      );
    },
    set(id, value) {
      const e = w.document.getElementById(id);
      if (!e) throw Error("Eingabe fehlt: " + id);
      e.value = String(value);
    },
    flush: () => new Promise((r) => setTimeout(r, 25)),
  };
}
function ready(app) {
  const p = app.window.AF.state;
  p.profile = {
    ...p.profile,
    age: 36,
    heightCm: 180,
    experience: "regular",
    sessionMinutes: 45,
    restrictionsConfirmed: true,
  };
  app.window.AF.setState(p);
  app.run("if(!settings.startKg){settings.startKg=100;settings.goalKg=100;}");
}
module.exports = { boot, ready, root };
