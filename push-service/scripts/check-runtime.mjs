/* Exercise the actual Workers runtime with an isolated local push provider. */
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(dir, 'package.json'));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { generateVAPIDKeys } = require('web-push');
const output = path.join(dir, '.wrangler/runtime-check/worker.js');
await fs.access(output); // Built by Wrangler's real nodejs_compat bundler first.
const vapid = generateVAPIDKeys(), code = crypto.randomBytes(32).toString('base64url');
let providerCalls = 0;
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, scriptPath: output, compatibilityDate: '2026-11-16', compatibilityFlags: ['nodejs_compat'],
  durableObjects: { DEVICES: { className: 'PushDevice', useSQLite: true } },
  bindings: { ALLOWED_ORIGIN: 'https://dobolino.github.io', APP_URL: 'https://dobolino.github.io/AlexFit-App/',
    VAPID_SUBJECT: 'https://dobolino.github.io/AlexFit-App/', VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey, PAIRING_CODE_HASH: crypto.createHash('sha256').update(code).digest('hex') },
  outboundService: async (request) => {
    if (new URL(request.url).origin !== 'https://fcm.googleapis.com') throw Error('Unexpected outbound request');
    if (!request.headers.get('Authorization')?.startsWith('vapid t=')) throw Error('Missing VAPID');
    if (request.headers.get('Content-Encoding') !== 'aes128gcm') throw Error('Unencrypted push');
    if ((await request.arrayBuffer()).byteLength < 100) throw Error('Empty encrypted push');
    providerCalls++;
    return new Response('', { status: 201 });
  },
}));
try {
  const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('base64url');
  const ec = crypto.createECDH('prime256v1'); ec.generateKeys();
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/runtime-test',
    keys: { p256dh: ec.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
  const endpoint = 'https://service.test/v1/devices/' + id;
  const headers = { Origin: 'https://dobolino.github.io', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const rejected = await mf.dispatchFetch(endpoint, { method: 'PUT', headers, body: JSON.stringify({ pairingCode: 'incorrect' }) });
  if (rejected.status !== 401) throw Error('Runtime API error status lost: ' + rejected.status);
  const registered = await mf.dispatchFetch(endpoint, { method: 'PUT', headers, body: JSON.stringify({ pairingCode: code, subscription,
    reminder: { enabled: false, time: '18:00', timeZone: 'Europe/Zurich', days: [] }, timersEnabled: true }) });
  if (registered.status !== 200) throw Error('Runtime registration failed: ' + registered.status);
  const delivered = await mf.dispatchFetch(endpoint + '/test', { method: 'POST', headers, body: '{}' });
  const status = await (await mf.dispatchFetch(endpoint, { headers })).json();
  if (delivered.status !== 200 || status.lastDeliveryStatus !== 201 || providerCalls !== 1)
    throw Error('Runtime delivery failed: ' + delivered.status + ' / ' + (status.lastDeliveryError || status.lastDeliveryStatus));
  console.log('Workers runtime: registration, VAPID encryption, provider request and delivery acknowledgement passed.');
} finally { await mf.dispose(); }
