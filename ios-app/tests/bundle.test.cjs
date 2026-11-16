const test = require('node:test');
const { before, after } = test;
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');
const { transform } = require('esbuild');

const app = path.resolve(__dirname, '..');
const www = path.join(app, 'www');
let dom;

before(async () => {
  await import(pathToFileURL(path.join(app, 'scripts/prepare-web.mjs')).href);
  dom = new JSDOM(fs.readFileSync(path.join(www, 'index.html'), 'utf8'));
});
after(() => dom?.window.close());

test('the packaged page has every local script and stylesheet, including both Gym scripts', () => {
  const names = new Set();
  const elements = dom.window.document.querySelectorAll('script[src],link[rel="stylesheet"][href]');
  assert.ok(elements.length > 0);
  for (const element of elements) {
    const attribute = element.tagName === 'SCRIPT' ? 'src' : 'href';
    const reference = element.getAttribute(attribute);
    assert.ok(reference, 'Empty ' + attribute);
    assert.doesNotMatch(reference, /^(?:[a-z][a-z\d+.-]*:|\/\/)/i,
      'A packaged script or stylesheet still needs a remote origin: ' + reference);
    const url = new URL(reference, 'https://bundle.test/');
    const relative = decodeURIComponent(url.pathname).replace(/^\//, '');
    const file = path.resolve(www, relative);
    assert.ok(file.startsWith(www + path.sep), 'Asset outside bundle: ' + reference);
    assert.ok(fs.statSync(file).isFile(), 'Missing packaged asset: ' + reference);
    names.add(relative);
  }
  assert.ok(names.has('training-plans-gym.js'), 'Gym plans must not depend on the old service-worker manifest');
  assert.ok(names.has('gym-setup-ui.js'), 'Gym setup must be included even when absent from the service-worker manifest');
  assert.ok(names.has('ios-native.js'), 'The native adapter must be loaded by the packaged page');
  assert.ok(fs.statSync(path.join(www, 'ios-native.js')).size > 0);
});

test('native launch uses bundled resources without an active service-worker registration or remote app URL', async () => {
  for (const script of dom.window.document.querySelectorAll('script:not([src])')) {
    if (!/navigator\.serviceWorker\s*\.register/.test(script.textContent)) continue;
    // Constant folding verifies that registration cannot run, rather than merely
    // accepting a comment or an unused native-mode flag in the source.
    const compiled = (await transform(script.textContent, { minifySyntax: true })).code;
    assert.doesNotMatch(compiled, /navigator\.serviceWorker\s*\.register/,
      'The packaged app must not register a web service worker');
  }
  const config = JSON.parse(fs.readFileSync(path.join(app, 'capacitor.config.json'), 'utf8'));
  assert.equal(config.server?.url, undefined, 'The native app must not redirect launch to GitHub Pages');
  assert.equal(config.server?.hostname, 'localhost');
  const recipes = JSON.parse(fs.readFileSync(path.join(www, 'recipe-library.json'), 'utf8'));
  assert.ok(recipes && typeof recipes === 'object', 'The offline recipe library must be valid JSON data');
});

test('every local font referenced by the packaged stylesheet is present', () => {
  const css = fs.readFileSync(path.join(www, 'ios-fonts.css'), 'utf8');
  const references = [...css.matchAll(/url\(["']?([^\s)"']+)["']?\)/g)].map((match) => match[1]);
  assert.ok(references.length > 0, 'Expected local fonts');
  for (const reference of references) {
    assert.doesNotMatch(reference, /^(?:[a-z][a-z\d+.-]*:|\/\/)/i);
    assert.ok(fs.statSync(path.join(www, reference)).size > 0, 'Missing offline font: ' + reference);
  }
});

test('the bundle manifest covers every packaged file and its actual SHA-256', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(www, 'bundle-manifest.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.resources));
  const listed = new Set();
  for (const resource of manifest.resources) {
    assert.equal(typeof resource.path, 'string');
    assert.ok(!listed.has(resource.path), 'Duplicate manifest resource: ' + resource.path);
    assert.notEqual(resource.path, 'bundle-manifest.json', 'The manifest cannot hash itself');
    const file = path.resolve(www, resource.path);
    assert.ok(file.startsWith(www + path.sep), 'Unsafe manifest resource: ' + resource.path);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(resource.sha256, actual, 'Wrong bundle hash: ' + resource.path);
    listed.add(resource.path);
  }
  const actualFiles = [];
  function walk(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(path.join(directory, entry.name), name);
      else if (name !== 'bundle-manifest.json') actualFiles.push(name);
    }
  }
  walk(www);
  assert.deepEqual([...listed].sort(), actualFiles.sort(), 'The manifest must cover all shipped resources');
});
