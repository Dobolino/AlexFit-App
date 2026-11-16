import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cap = path.join(dir, 'node_modules/@capacitor/cli/bin/capacitor');
if (fs.existsSync(path.join(dir, 'ios'))) throw Error('iOS project already exists; use npm run ios:sync.');
async function run(args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cap, ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (value) => { output += value; process.stdout.write(value); });
    child.stderr.on('data', (value) => { output += value; process.stderr.write(value); });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, output }));
  });
}
const result = await run(['add', 'ios', '--packagemanager', 'SPM']);
if (result.status !== 0) {
  // Capacitor 7.6.10 creates the SPM template, then incorrectly chooses CocoaPods
  // for the first sync. A fresh CLI invocation detects the generated SPM project.
  const output = result.output;
  const generated = fs.existsSync(path.join(dir, 'ios/App/CapApp-SPM/Package.swift')) &&
    fs.existsSync(path.join(dir, 'ios/App/App.xcodeproj/project.pbxproj'));
  if (!generated || !output.includes('ENOENT') || !output.includes('Podfile')) process.exit(result.status || 1);
  console.log('Recovering known Capacitor 7.6.10 first-sync package-manager detection.');
}
const sync = await run(['sync', 'ios']);
if (sync.status !== 0) process.exit(sync.status || 1);
