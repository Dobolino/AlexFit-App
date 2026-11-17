const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("iOS home screen uses a real PNG touch icon and no runtime-generated manifest", () => {
  assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="icons\/apple-touch-icon.png">/);
  assert.doesNotMatch(html, /drawIcon|URL\.createObjectURL\(mb\)/);
  assert.equal((html.match(/rel="manifest"/g) || []).length, 1);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  for (const icon of manifest.icons)
    assert.ok(fs.existsSync(path.join(root, icon.src)), icon.src);
  assert.ok(manifest.icons.some((i) => i.type === "image/png" && i.purpose === "maskable"));
});

test("every iOS startup image referenced in the head exists and matches its media query", () => {
  const links = [...html.matchAll(/<link rel="apple-touch-startup-image" href="([^"]+)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\)/g)];
  assert.ok(links.length >= 10);
  for (const [, href, w, h, r] of links) {
    assert.ok(fs.existsSync(path.join(root, href)), href);
    assert.ok(href.endsWith(`-${w * r}x${h * r}.png`), href);
  }
});
