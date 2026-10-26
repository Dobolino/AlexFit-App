const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { boot, root } = require("./helpers.cjs");

function withStyles(fn) {
  const a = boot();
  try {
    const style = a.document.createElement("style");
    style.textContent = fs.readFileSync(path.join(root, "coach.css"), "utf8");
    a.document.head.append(style);
    fn(a);
    assert.deepEqual(a.errors, []);
  } finally {
    a.close();
  }
}

test("navigation reserves space in the app column instead of covering scrolling content", () => {
  withStyles((a) => {
    const nav = a.document.getElementById("nav-container");
    const content = a.document.getElementById("content");
    assert.equal(nav.parentElement.id, "app");
    assert.equal(content.nextElementSibling, nav);
    assert.equal(a.window.getComputedStyle(nav).position, "relative");
    assert.equal(a.window.getComputedStyle(nav).transform, "none");
    assert.equal(a.window.getComputedStyle(content).overflowY, "auto");
    assert.equal(a.window.getComputedStyle(content).paddingTop, "24px");
    assert.equal(
      a.document.querySelector(
        'meta[name="apple-mobile-web-app-status-bar-style"]',
      ).content,
      "black",
    );
  });
});

test("preview keeps header and action outside its shrinking scroll body", () => {
  withStyles((a) => {
    a.run("openWorkoutPreview('d1')");
    const sheet = a.document.getElementById("workout-preview-sheet");
    const body = a.document.getElementById("workout-preview-body");
    const header = a.document.getElementById("workout-preview-header");
    const footer = a.document.getElementById("workout-preview-footer");
    assert.equal(sheet.parentElement.parentElement, a.document.body);
    assert.equal(sheet.parentElement.getAttribute("aria-modal"), "true");
    assert.equal(body.parentElement, sheet);
    assert.equal(header.parentElement, sheet);
    assert.equal(footer.parentElement, sheet);
    assert.equal(parseFloat(a.window.getComputedStyle(body).minHeight), 0);
    assert.equal(a.window.getComputedStyle(body).overflowY, "auto");
    assert.equal(a.window.getComputedStyle(header).flexShrink, "0");
    assert.equal(a.window.getComputedStyle(footer).flexShrink, "0");
    assert.equal(a.window.getComputedStyle(sheet).height, "100%");
    assert.equal(a.window.getComputedStyle(sheet).maxHeight, "760px");
    assert.match(footer.textContent, /Training starten/);
    a.run("closeWorkoutPreview()");
    assert.equal(sheet.parentElement.style.display, "none");
  });
});

test("preview stylesheet reserves all safe edges and constrains chart size", () => {
  const css = fs.readFileSync(path.join(root, "coach.css"), "utf8");
  assert.match(
    css,
    /#workout-preview-overlay\s*\{[^}]*100dvh[^}]*var\(--safe-top\)[^}]*var\(--safe-right\)[^}]*var\(--safe-bot\)[^}]*var\(--safe-left\)/,
  );
  assert.match(
    css,
    /\.muscle-chart-slot\s*\{[^}]*height:\s*clamp\(120px, 24dvh, 200px\)/,
  );
  assert.match(
    css,
    /\.muscle-chart-slot svg\s*\{[^}]*max-width:\s*100%[^}]*max-height:\s*100%/,
  );
});
