/* Runs in GitHub Actions. The Cloudflare token is supplied as a repository secret. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const service = path.join(root, 'push-service');
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw Error('Repository-Secret CLOUDFLARE_API_TOKEN fehlt. Cloudflare-Token in GitHub hinterlegen und Workflow erneut starten.');
const base = 'https://api.cloudflare.com/client/v4';
async function cf(endpoint, options = {}) {
  const response = await fetch(base + endpoint, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    const code = body.errors?.[0]?.code || response.status;
    throw Error('Cloudflare API ' + endpoint.split('?')[0] + ' fehlgeschlagen (Code ' + code + '). Konto und Token-Berechtigungen prüfen.');
  }
  return body.result;
}
let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!accountId) {
  const accounts = await cf('/accounts?per_page=50');
  if (accounts.length !== 1) throw Error('Mehrere oder keine Cloudflare-Konten: Repository-Variable CLOUDFLARE_ACCOUNT_ID auf das gewünschte Konto setzen.');
  accountId = accounts[0].id;
}
if (!/^[a-f0-9]{32}$/i.test(accountId)) throw Error('Ungültige Cloudflare-Konto-ID.');
let subdomain;
try { subdomain = (await cf('/accounts/' + accountId + '/workers/subdomain'))?.subdomain; }
catch (error) {
  // A new account may not have a workers.dev subdomain yet. Do not mask permission errors.
  if (!/Code (10007|404)/.test(error.message)) throw error;
}
if (!subdomain) {
  subdomain = 'alexfit-' + accountId.slice(0, 12).toLowerCase();
  await cf('/accounts/' + accountId + '/workers/subdomain', { method: 'PUT', body: JSON.stringify({ subdomain }) });
}
let toml = await fs.readFile(path.join(service, 'wrangler.toml'), 'utf8');
const pairingHash = (await fs.readFile(path.join(service, 'pairing-code-hash.txt'), 'utf8')).trim();
if (!/^[a-f0-9]{64}$/.test(pairingHash)) throw Error('Einrichtungscode-Hash fehlt.');
if (!/^PAIRING_CODE_HASH\s*=/m.test(toml)) throw Error('PAIRING_CODE_HASH muss in wrangler.toml unter [vars] vorbereitet sein.');
toml = toml.replace(/^PAIRING_CODE_HASH\s*=.*$/m, 'PAIRING_CODE_HASH = "' + pairingHash + '"');
await fs.writeFile(path.join(service, 'wrangler.toml'), toml);
const name = toml.match(/^name\s*=\s*"([a-z0-9-]+)"/m)?.[1];
if (!name) throw Error('Workername in wrangler.toml fehlt.');
const wrangler = path.join(service, 'node_modules/wrangler/bin/wrangler.js');
function run(args) {
  return new Promise((resolve, reject) => {
    const processChild = spawn(process.execPath, [wrangler, ...args], {
      cwd: service, stdio: 'inherit',
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    });
    processChild.once('error', reject);
    processChild.once('close', (code) => code === 0 ? resolve() : reject(Error('Wrangler-Schritt fehlgeschlagen (' + code + ').')));
  });
}
await run(['deploy']);
const secrets = await cf('/accounts/' + accountId + '/workers/scripts/' + name + '/secrets');
const names = new Set(secrets.map((s) => s.name));
const hasPublic = names.has('VAPID_PUBLIC_KEY'), hasPrivate = names.has('VAPID_PRIVATE_KEY');
if (hasPublic !== hasPrivate) throw Error('Cloudflare enthält nur einen der beiden VAPID-Schlüssel. Vorhandene Schlüssel prüfen, keine automatische Rotation.');
if (!hasPublic) {
  const require = createRequire(path.join(service, 'package.json'));
  const pair = require('web-push').generateVAPIDKeys();
  const secretFile = path.join(service, '.deployment-secrets.json');
  await fs.writeFile(secretFile, JSON.stringify({ VAPID_PUBLIC_KEY: pair.publicKey, VAPID_PRIVATE_KEY: pair.privateKey }), { mode: 0o600 });
  try { await run(['secret', 'bulk', secretFile]); }
  finally { await fs.rm(secretFile, { force: true }); }
}
const serviceUrl = 'https://' + name + '.' + subdomain + '.workers.dev';
let configuration;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(serviceUrl + '/v1/config', { headers: { Origin: 'https://dobolino.github.io' } });
    const data = await response.json();
    if (response.ok && data.ready && data.publicKey) { configuration = data; break; }
  } catch (_) { /* Wait for the new Worker version to propagate. */ }
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
if (!configuration) throw Error('Push-Dienst veröffentlicht, aber noch nicht bereit. Worker-Konfiguration und Schlüssel prüfen.');
const result = { serviceUrl, publicKey: configuration.publicKey, deployedAt: new Date().toISOString() };
await fs.writeFile(path.join(service, 'deployment-info.json'), JSON.stringify(result, null, 2) + '\n');
console.log('Push-Dienst bereit: ' + serviceUrl);
