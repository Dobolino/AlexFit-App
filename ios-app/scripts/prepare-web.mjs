import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(dir, '..');
const www = path.join(dir, 'www');
await fs.rm(www, { recursive: true, force: true });
await fs.mkdir(www, { recursive: true });
const sw = await fs.readFile(path.join(repo, 'sw.js'), 'utf8');
const literal = sw.match(/const APP_FILES\s*=\s*(\[[^;]+\]);/);
if (!literal) throw Error('Offline manifest APP_FILES not found');
const files = new Set(vm.runInNewContext(literal[1], {}, { timeout: 1000 }));
const originalHTML = await fs.readFile(path.join(repo, 'index.html'), 'utf8');
const parsed = new JSDOM(originalHTML);
for (const element of parsed.window.document.querySelectorAll('script[src],link[rel="stylesheet"][href]')) {
  const url = element.getAttribute(element.tagName === 'SCRIPT' ? 'src' : 'href');
  if (url && !/^(?:[a-z]+:|\/\/|#)/i.test(url)) files.add(url);
}
parsed.window.close();
for (const name of files) {
  if (name === './' || name === './sw.js') continue;
  const relative = name.replace(/^\.\//, '');
  if (relative.includes('..') || path.isAbsolute(relative)) throw Error('Unsafe asset: ' + name);
  const destination = path.join(www, relative);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join(repo, relative), destination);
}
let html = await fs.readFile(path.join(www, 'index.html'), 'utf8');
html = html.replace(/<link[^>]+fonts\.googleapis\.com[^>]+>\s*/g, '<link rel="stylesheet" href="ios-fonts.css">\n');
html = html.replace('https://unpkg.com/body-muscles@1.0.0/dist/umd/body-muscles.umd.min.js', './vendor/body-muscles.umd.min.js');
const swGuard = "if('serviceWorker' in navigator){";
if (!html.includes(swGuard)) throw Error('Service worker guard changed; inspect native copy');
html = html.replace(swGuard, 'if(false){ /* Offline resources are part of the native app bundle. */');
html = html.replace('</head>', '<script src="ios-native.js" defer></script>\n</head>');
await fs.writeFile(path.join(www, 'index.html'), html);
await fs.cp(path.join(dir, 'vendor'), path.join(www, 'vendor'), { recursive: true });
await fs.mkdir(path.join(www, 'fonts'), { recursive: true });
let fontCSS = '';
for (const [family, slug, weights] of [
  ['Barlow', 'barlow', [400, 500, 600]],
  ['Barlow Condensed', 'barlow-condensed', [400, 500, 600, 700, 800, 900]],
]) {
  const pkg = path.join(dir, 'node_modules', '@fontsource', slug);
  await fs.copyFile(path.join(pkg, 'LICENSE'), path.join(www, 'fonts', slug + '-LICENSE.txt'));
  for (const weight of weights) {
    const name = slug + '-latin-' + weight + '-normal.woff2';
    await fs.copyFile(path.join(pkg, 'files', name), path.join(www, 'fonts', name));
    fontCSS += '@font-face{font-family:"' + family + '";font-style:normal;font-weight:' + weight + ';font-display:swap;src:url("fonts/' + name + '") format("woff2");}\n';
  }
}
await fs.writeFile(path.join(www, 'ios-fonts.css'), fontCSS);
await build({ entryPoints: [path.join(dir, 'src/native-integration.js')], outfile: path.join(www, 'ios-native.js'), bundle: true, format: 'iife', target: ['safari15'], minify: true, legalComments: 'eof' });
const checks = [];
async function manifest(base, relative = '') {
  for (const entry of await fs.readdir(base, { withFileTypes: true })) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) await manifest(path.join(base, entry.name), name);
    else checks.push({ path: name, sha256: crypto.createHash('sha256').update(await fs.readFile(path.join(base, entry.name))).digest('hex') });
  }
}
await manifest(www);
await fs.writeFile(path.join(www, 'bundle-manifest.json'), JSON.stringify({ nativeVersion: '1.0.0', resources: checks }, null, 2));
console.log('Bundled ' + checks.length + ' local resources. No remote application URL.');
