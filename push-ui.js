/* Web Push registration is opt-in; credentials belong only to this browser. */
(function () {
  'use strict';
  const A = window.AF;
  if (!A || A.push || window.Capacitor?.isNativePlatform?.()) return;
  const KEY = 'af_push';
  const esc = A.esc || ((v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Zurich';
  const defaults = () => {
    let time = '18:00', days = [1, 2, 3, 5, 6];
    try {
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.reminderTime || '')) time = settings.reminderTime;
      const planned = Object.keys(PLAN_DOW).map((day) => Number(day) || 7).filter((day) => day >= 1 && day <= 7);
      if (planned.length) days = [...new Set(planned)].sort();
    } catch (_) {}
    return { enabled: true, time, timeZone: zone(), days };
  };
  let stored;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
  let state = stored?.version === 1 && typeof stored === 'object' && !Array.isArray(stored) ? stored : { version: 1 };
  state.reminder = { ...defaults(), ...(state.reminder || {}) };
  if (!Array.isArray(state.reminder.days)) state.reminder.days = defaults().days;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(state.reminder.time || '')) state.reminder.time = defaults().time;
  try { new Intl.DateTimeFormat('en', { timeZone: state.reminder.timeZone }); } catch (_) { state.reminder.timeZone = zone(); }
  state.timersEnabled = state.timersEnabled === true;
  state.revisions = { rest: 0, cardio: 0, ...(state.revisions || {}) };
  state.pendingTimers = state.pendingTimers && typeof state.pendingTimers === 'object' && !Array.isArray(state.pendingTimers) ? state.pendingTimers : {};
  state.pendingDelete = state.pendingDelete === true;
  state.registered = state.registered === true && /^[a-f0-9-]{36}$/i.test(state.id || '') && /^[A-Za-z0-9_-]{43}$/.test(state.token || '');
  let confirmed = false, busy = false, error = '', note = '', config = null, checking = null, emittedState = '';
  const queues = { rest: Promise.resolve(), cardio: Promise.resolve() };
  let scheduleQueue = Promise.resolve(), scheduleGeneration = 0;

  function serviceURL() {
    try {
      const url = new URL(window.AlexFitPushConfig?.serviceUrl || '');
      if (url.protocol !== 'https:' && !(location.hostname === 'localhost' && ['localhost', '127.0.0.1'].includes(url.hostname))) return '';
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return '';
      return url.origin;
    } catch (_) { return ''; }
  }
  function support() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const installed = navigator.standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches;
    const available = window.isSecureContext !== false && 'Notification' in window && 'PushManager' in window && !!navigator.serviceWorker;
    return { ios, installed, supported: available && (!ios || installed), available };
  }
  function permission() { return window.Notification?.permission || 'unavailable'; }
  function isActive() { return support().supported && permission() === 'granted' && !!state.registered && confirmed && !state.pendingDelete; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (_) { error = 'Die Verbindung kann nicht dauerhaft gespeichert werden. Bitte freien Speicher prüfen.'; return false; }
  }
  function credentials() {
    if (!/^[a-f0-9-]{36}$/i.test(state.id || '') || !/^[A-Za-z0-9_-]{43}$/.test(state.token || '')) {
      if (!window.crypto?.getRandomValues || !window.crypto?.randomUUID) throw new Error('secure');
      state.id = window.crypto.randomUUID();
      const bytes = window.crypto.getRandomValues(new Uint8Array(32));
      state.token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      state.revisions = { rest: 0, cardio: 0 };
      state.pendingTimers = {};
    }
    if (!save()) throw new Error('storage');
  }
  function message(cause) {
    if (cause?.status === 401 || cause?.status === 403) return 'Die Verbindung wurde nicht bestätigt. Bitte Einrichtungscode und Berechtigungen prüfen.';
    if (cause?.status === 404 || cause?.status === 410) return 'Diese Push-Verbindung ist abgelaufen. Bitte erneut verbinden.';
    if (cause?.status === 503) return 'Der Push-Dienst ist noch nicht eingerichtet.';
    if (cause?.name === 'NotAllowedError') return 'Benachrichtigungen wurden nicht erlaubt. Bitte die Mitteilungseinstellungen von AlexFit prüfen.';
    if (cause?.message === 'storage') return error;
    if (cause?.message === 'days') return 'Bitte mindestens einen Wochentag auswählen.';
    if (cause?.message === 'time') return 'Bitte eine gültige Uhrzeit auswählen.';
    return 'Keine Verbindung zum Push-Dienst. Bitte Internetverbindung prüfen und erneut versuchen.';
  }
  function reconnectOnFailure(cause) {
    if (![401, 404, 410].includes(cause?.status)) return;
    confirmed = false;
    if (cause.status === 401) state.resetIdentity = true;
    if (cause.status === 410) state.refreshSubscription = true;
    save();
  }
  async function request(path, method = 'GET', body, authenticated = true) {
    const base = serviceURL();
    if (!base) throw Object.assign(new Error('not-configured'), { status: 503 });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (authenticated) headers.Authorization = 'Bearer ' + state.token;
      const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', cache: 'no-store', signal: controller.signal });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error('push-request'), { status: response.status });
      return value;
    } finally { clearTimeout(timeout); }
  }
  function devicePath() { return '/v1/devices/' + state.id; }
  async function getConfig() {
    if (config) return config;
    const value = await request('/v1/config', 'GET', undefined, false);
    if (!value.ready || !/^[A-Za-z0-9_-]{87}$/.test(value.publicKey || '')) throw Object.assign(new Error('config'), { status: 503 });
    config = value;
    return value;
  }
  function keyBytes(value) {
    const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
    return Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  }
  function normalizeReminder(value) {
    const result = { ...state.reminder, ...(value || {}) };
    result.enabled = result.enabled === true;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result.time)) throw new Error('time');
    new Intl.DateTimeFormat('en', { timeZone: result.timeZone });
    result.days = [...new Set(result.days || [])].map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).sort();
    if (result.enabled && !result.days.length) throw new Error('days');
    return result;
  }
  function statusText() {
    const s = support();
    if (s.ios && !s.installed) return 'Auf dem iPhone zuerst in Safari über Teilen → Zum Home-Bildschirm hinzufügen. Danach AlexFit vom Home-Bildschirm öffnen.';
    if (!s.supported) return 'Web Push ist in diesem Browser nicht verfügbar. Auf dem iPhone ist eine installierte PWA ab iOS 16.4 erforderlich.';
    if (!serviceURL()) return 'Der Push-Dienst ist noch nicht eingerichtet. Deine Trainingsdaten bleiben wie gewohnt verfügbar.';
    if (permission() === 'denied') return 'Benachrichtigungen sind blockiert. Bitte in den Mitteilungseinstellungen von AlexFit erlauben.';
    if (state.pendingDelete) return 'Deaktivierung noch nicht vollständig bestätigt. Internetverbindung herstellen und erneut deaktivieren.';
    if (busy) return 'Verbindung wird geprüft …';
    if (error) return error;
    if (state.pendingSchedule || Object.keys(state.pendingTimers).length) return 'Änderungen wurden noch nicht vollständig übertragen. Internetverbindung prüfen.';
    if (isActive()) return 'Push ist verbunden. Erinnerungen können auch bei geschlossener App und gesperrtem Display eintreffen.';
    if (state.registered) return 'Die gespeicherte Verbindung konnte noch nicht bestätigt werden.';
    return 'Noch nicht verbunden. Die Freigabe erfolgt erst, wenn du „Push aktivieren“ antippst.';
  }
  function publicState() {
    return { ...support(), configured: !!serviceURL(), permission: permission(), active: isActive(), registered: state.registered, busy, timersEnabled: state.timersEnabled, pendingDelete: !!state.pendingDelete, pendingSchedule: !!state.pendingSchedule, pendingTimers: Object.keys(state.pendingTimers).length, reminder: clone(state.reminder), error, status: statusText() };
  }
  function emit() {
    renderSettings();
    const signature = [isActive(), state.timersEnabled && !state.pendingSchedule, !!state.pendingDelete, !!state.registered].join('|');
    if (signature !== emittedState) {
      emittedState = signature;
      document.dispatchEvent(new CustomEvent('af:push-state', { detail: publicState() }));
    }
  }
  async function enable(pairingCode = '') {
    if (busy) return false;
    error = ''; note = '';
    if (!support().supported || !serviceURL() || permission() === 'denied' || state.pendingDelete) { emit(); return false; }
    // This call happens synchronously in the click handler, before any network/SW await.
    let consent;
    try { consent = permission() === 'granted' ? Promise.resolve('granted') : Notification.requestPermission(); }
    catch (cause) { error = message(cause); emit(); return false; }
    busy = true; emit();
    let created = false, subscription;
    try {
      if (await consent !== 'granted') { confirmed = false; return false; }
      const currentConfig = await getConfig();
      const registration = await navigator.serviceWorker.ready;
      subscription = await registration.pushManager.getSubscription();
      if (subscription && (state.refreshSubscription || state.resetIdentity)) {
        if (!await subscription.unsubscribe()) throw new Error('unsubscribe');
        subscription = null;
      }
      if (state.resetIdentity) {
        delete state.id; delete state.token;
        state.registered = false;
      }
      credentials();
      const expected = keyBytes(currentConfig.publicKey);
      const oldKey = subscription?.options?.applicationServerKey;
      if (subscription && oldKey && (oldKey.byteLength !== expected.byteLength || [...new Uint8Array(oldKey)].some((n, i) => n !== expected[i]))) {
        if (!await subscription.unsubscribe()) throw new Error('unsubscribe');
        subscription = null;
      }
      if (!subscription) { subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected }); created = true; }
      const reminder = normalizeReminder(readForm()?.reminder || state.reminder);
      const timersEnabled = readForm()?.timersEnabled ?? state.timersEnabled;
      const result = await request(devicePath(), 'PUT', { pairingCode: String(pairingCode).trim(), subscription: subscription.toJSON(), reminder, timersEnabled });
      if (!result.ok) throw new Error('registration');
      state.registered = true;
      state.pendingDelete = false;
      state.pendingSchedule = false;
      delete state.resetIdentity; delete state.refreshSubscription;
      state.reminder = reminder;
      state.timersEnabled = timersEnabled;
      confirmed = true;
      if (!save()) throw new Error('storage');
      const field = document.getElementById('af-push-code');
      if (field) field.value = '';
      return true;
    } catch (cause) {
      confirmed = false;
      error = message(cause);
      if (created && subscription) await subscription.unsubscribe().catch(() => false);
      return false;
    } finally { busy = false; emit(); }
  }
  async function disable() {
    if (busy) return false;
    busy = true; error = ''; note = ''; state.pendingDelete = true; save(); emit();
    try {
      let subscription = null;
      if (navigator.serviceWorker) subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (subscription && !await subscription.unsubscribe()) throw new Error('unsubscribe');
      if (state.id && state.token) await request(devicePath(), 'DELETE');
      state.registered = false;
      state.pendingDelete = false;
      state.pendingSchedule = false;
      state.pendingTimers = {};
      state.timersEnabled = false;
      confirmed = false;
      save();
      note = 'Push ist für dieses Gerät deaktiviert.';
      return true;
    } catch (cause) { confirmed = false; error = message(cause); save(); return false; }
    finally { busy = false; emit(); }
  }
  async function syncSchedule(value = {}) {
    try {
      if (value.reminder) state.reminder = normalizeReminder(value.reminder);
      if ('timersEnabled' in value) state.timersEnabled = value.timersEnabled === true;
      state.pendingSchedule = true;
      if (!save()) throw new Error('storage');
      emit();
      if (!isActive()) return false;
      const generation = ++scheduleGeneration;
      const body = { reminder: clone(state.reminder), timersEnabled: state.timersEnabled };
      scheduleQueue = scheduleQueue.catch(() => {}).then(async () => {
        if (generation !== scheduleGeneration || state.pendingDelete) return false;
        try {
          const result = await request(devicePath() + '/schedule', 'PATCH', body);
          if (!result.ok) throw new Error('schedule');
          if (generation === scheduleGeneration) {
            state.pendingSchedule = false; error = ''; note = 'Erinnerungen wurden übertragen.'; save(); emit();
          }
          return true;
        } catch (cause) { reconnectOnFailure(cause); error = message(cause); emit(); return false; }
      });
      return scheduleQueue;
    } catch (cause) { reconnectOnFailure(cause); error = message(cause); emit(); return false; }
  }
  function scheduleTimers(kind, events) {
    if (!['rest', 'cardio'].includes(kind)) return Promise.reject(new TypeError('Unknown timer kind'));
    if (!Array.isArray(events) || events.length > 200) return Promise.reject(new TypeError('Invalid timer events'));
    if (events.length && (!isActive() || !state.timersEnabled)) return Promise.resolve({ ok: false, reason: 'inactive' });
    if (!state.id || !state.registered || state.pendingDelete) return Promise.resolve({ ok: false, reason: 'inactive' });
    const now = Date.now();
    const accepted = events.filter((event) => Number.isFinite(event.at) && event.at > now && event.at <= now + 86400000).map((event) => ({ id: String(event.id).slice(0, 64), at: event.at, type: event.type }));
    const revision = Math.max(Number(state.revisions[kind]) + 1 || 1, now * 1000);
    const entry = { revision, events: accepted };
    state.revisions[kind] = revision;
    state.pendingTimers[kind] = entry;
    if (!save()) { emit(); return Promise.resolve({ ok: false, reason: 'storage' }); }
    queues[kind] = queues[kind].catch(() => {}).then(async () => {
      if (state.pendingDelete || !state.registered) return { ok: false, reason: 'inactive' };
      if (state.pendingTimers[kind]?.revision !== revision) return { ok: true, ignored: true };
      try {
        let sent = entry;
        let result = await request(devicePath() + '/timers/' + kind, 'PUT', sent);
        if (!result.ok) throw new Error('timer');
        if (Number.isSafeInteger(result.revision)) state.revisions[kind] = Math.max(state.revisions[kind], result.revision);
        // Another open window may already have reserved a later revision. Retry
        // the newest desired state once; never revive a superseded timer request.
        if (result.ignored && state.pendingTimers[kind]?.revision === sent.revision) {
          const retryRevision = Math.max(state.revisions[kind] + 1, Date.now() * 1000);
          if (!Number.isSafeInteger(retryRevision)) throw new Error('revision');
          sent = { revision: retryRevision, events: sent.events };
          state.revisions[kind] = retryRevision;
          state.pendingTimers[kind] = sent;
          if (!save()) throw new Error('storage');
          result = await request(devicePath() + '/timers/' + kind, 'PUT', sent);
          if (!result.ok) throw new Error('timer');
          if (Number.isSafeInteger(result.revision)) state.revisions[kind] = Math.max(state.revisions[kind], result.revision);
          if (result.ignored) {
            error = 'Die Timer-Hinweise wurden in einem anderen Fenster geändert. Bitte erneut versuchen.';
            save(); emit();
            return { ok: false, reason: 'conflict' };
          }
        }
        if (state.pendingTimers[kind]?.revision === sent.revision) delete state.pendingTimers[kind];
        error = ''; save(); emit();
        return result;
      } catch (cause) { reconnectOnFailure(cause); error = message(cause); save(); emit(); return { ok: false, reason: 'network' }; }
    });
    return queues[kind];
  }
  async function testPush() {
    if (!isActive() || busy) return false;
    busy = true; error = ''; note = ''; emit();
    try {
      const result = await request(devicePath() + '/test', 'POST', {});
      if (!result.ok) throw new Error('test');
      note = 'Testnachricht wurde angefordert. Bitte die Mitteilungszentrale prüfen.';
      return true;
    } catch (cause) { reconnectOnFailure(cause); error = message(cause); return false; }
    finally { busy = false; emit(); }
  }
  async function refreshConnection() {
    if (checking) return checking;
    checking = (async () => {
      if (!support().supported || !serviceURL() || !state.registered) { confirmed = false; emit(); return; }
      if (state.pendingDelete) { await disable(); return; }
      if (permission() !== 'granted') {
        confirmed = false;
        state.pendingDelete = true;
        save();
        await disable();
        return;
      }
      try {
        await getConfig();
        const registration = await navigator.serviceWorker.ready;
        if (!await registration.pushManager.getSubscription()) throw Object.assign(new Error('subscription'), { status: 410 });
        const result = await request(devicePath());
        if (!result.ok || !result.registered) throw new Error('registration');
        confirmed = true; error = '';
        if (state.pendingSchedule) await syncSchedule();
        for (const kind of ['rest', 'cardio']) {
          const pending = state.pendingTimers[kind];
          if (pending) await scheduleTimers(kind, pending.events);
        }
      } catch (cause) { reconnectOnFailure(cause); confirmed = false; error = message(cause); }
      emit();
    })().finally(() => { checking = null; });
    return checking;
  }
  function readForm() {
    const card = document.getElementById('af-push-settings');
    if (!card) return null;
    return {
      reminder: { enabled: !!card.querySelector('#af-push-reminder').checked, time: card.querySelector('#af-push-time').value, timeZone: state.reminder.timeZone, days: [...card.querySelectorAll('[name="af-push-day"]:checked')].map((field) => Number(field.value)) },
      timersEnabled: !!card.querySelector('#af-push-timers').checked,
    };
  }
  function renderSettings() {
    const screen = document.getElementById('screen-settings');
    if (!screen) return;
    const legacy = document.getElementById('notif-enable-btn')?.closest('.card');
    if (legacy) {
      legacy.classList.add('af-push-legacy');
      if (legacy.previousElementSibling?.classList.contains('slabel')) legacy.previousElementSibling.classList.add('af-push-legacy');
    }
    let card = document.getElementById('af-push-settings');
    if (!card) {
      card = document.createElement('section');
      card.id = 'af-push-settings'; card.className = 'af-card af-push-settings';
      card.innerHTML = '<h2>Benachrichtigungen</h2><p id="af-push-status" role="status" aria-live="polite"></p><p id="af-push-result" role="status" aria-live="polite"></p>' +
        '<div class="af-push-connect"><label>Einrichtungscode<input id="af-push-code" type="password" autocomplete="off" spellcheck="false" autocapitalize="none" placeholder="Einmalig zum Verbinden"></label><button type="button" id="af-push-enable" class="af-btn af-primary" data-push-action="enable">Push aktivieren</button></div>' +
        '<div class="af-push-controls"><label class="af-push-check"><input id="af-push-reminder" type="checkbox" ' + (state.reminder.enabled ? 'checked' : '') + '>An diesen Tagen ans Training erinnern</label>' +
        '<label class="af-push-time">Uhrzeit<input id="af-push-time" type="time" value="' + esc(state.reminder.time) + '"></label><p class="af-note" id="af-push-zone">Uhrzeit gilt in ' + esc(state.reminder.timeZone) + '.</p><div class="af-push-days" role="group" aria-label="Wochentage">' +
        ['Mo','Di','Mi','Do','Fr','Sa','So'].map((day, i) => '<label><input type="checkbox" name="af-push-day" value="' + (i + 1) + '" ' + (state.reminder.days.includes(i + 1) ? 'checked' : '') + '><span>' + day + '</span></label>').join('') + '</div>' +
        '<label class="af-push-check"><input id="af-push-timers" type="checkbox" ' + (state.timersEnabled ? 'checked' : '') + '>Hinweise für Satzpausen und Cardio-Intervalle</label>' +
        '<p class="af-note">Timer-Hinweise benötigen Internet und können verspätet eintreffen. Sie ersetzen keinen sekundengenauen Alarm.</p><div class="af-toolbar"><button type="button" class="af-btn" data-push-action="save">Erinnerungen speichern</button><button type="button" class="af-btn" data-push-action="zone">Aktuelle Zeitzone verwenden</button></div></div>' +
        '<div class="af-toolbar af-push-connected"><button type="button" class="af-btn" data-push-action="test">Testnachricht senden</button><button type="button" class="af-btn" data-push-action="disable">Push deaktivieren</button></div><p class="af-note">Übermittelt werden nur deine Push-Verbindung und Erinnerungszeiten, keine Trainingswerte.</p>';
      if (legacy) legacy.before(card); else screen.prepend(card);
    }
    const s = support();
    card.querySelector('#af-push-status').textContent = statusText();
    card.querySelector('#af-push-result').textContent = note;
    card.querySelector('#af-push-result').hidden = !note;
    card.dataset.state = isActive() ? 'active' : error || state.pendingDelete ? 'error' : 'inactive';
    const connect = card.querySelector('.af-push-connect');
    connect.hidden = isActive() && !state.pendingDelete;
    card.querySelector('#af-push-enable').disabled = busy || !s.supported || !serviceURL() || permission() === 'denied' || !!state.pendingDelete;
    card.querySelector('#af-push-enable').textContent = state.registered ? 'Erneut verbinden' : 'Push aktivieren';
    card.querySelector('[data-push-action="save"]').disabled = busy || !isActive();
    card.querySelector('[data-push-action="test"]').disabled = busy || !isActive();
    card.querySelector('[data-push-action="disable"]').disabled = busy || (!state.registered && !state.pendingDelete);
    card.querySelector('.af-push-connected').hidden = !state.registered && !state.pendingDelete;
  }

  const oldSettings = window.renderSettings;
  window.renderSettings = function (...args) { const result = oldSettings?.apply(this, args); renderSettings(); return result; };
  try { if (settings._reminderTimeout) clearTimeout(settings._reminderTimeout); } catch (_) {}
  window.scheduleTrainingReminder = function () {
    try { if (settings._reminderTimeout) clearTimeout(settings._reminderTimeout); } catch (_) {}
    // The server schedule is authoritative; a page timer must not duplicate it.
  };
  window.getNotificationStatus = () => ({ supported: support().supported, label: statusText(), color: isActive() ? 'var(--green)' : 'var(--tm)' });
  window.requestNotificationPermission = function () { window.switchTab?.('settings'); renderSettings(); document.getElementById('af-push-enable')?.focus(); };
  window.saveReminderTime = function () { return syncSchedule(readForm() || {}); };
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-push-action]')?.dataset.pushAction;
    if (action === 'enable') enable(document.getElementById('af-push-code')?.value || '');
    if (action === 'disable') disable();
    if (action === 'save') syncSchedule(readForm() || {});
    if (action === 'test') testPush();
    if (action === 'zone') {
      state.reminder.timeZone = zone();
      document.getElementById('af-push-zone').textContent = 'Uhrzeit gilt in ' + state.reminder.timeZone + '. Bitte Erinnerungen speichern.';
    }
  });
  navigator.serviceWorker?.addEventListener?.('message', (event) => {
    if (event.data?.type === 'AF_PUSH_SUBSCRIPTION_CHANGED') {
      confirmed = false; error = 'Die Push-Verbindung hat sich geändert. Bitte erneut verbinden.'; emit();
    }
    if (event.data?.type === 'AF_PUSH_OPEN') window.switchTab?.(String(event.data.notificationType || '').startsWith('cardio') ? 'cardio' : 'workout');
  });
  window.addEventListener('online', refreshConnection);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshConnection(); });
  A.push = { getState: publicState, isActive, enable, disable, syncSchedule, test: testPush, scheduleTimers, renderSettings, refreshConnection, get timersEnabled() { return state.timersEnabled && !state.pendingSchedule; } };
  function openNotificationTarget() {
    const url = new URL(location.href);
    const target = url.searchParams.get('push');
    if (!['cardio', 'training'].includes(target)) return;
    window.switchTab?.(target === 'cardio' ? 'cardio' : 'workout');
    url.searchParams.delete('push');
    history.replaceState(history.state, '', url.href);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openNotificationTarget, { once: true });
  else openNotificationTarget();
  renderSettings();
  if (state.registered) refreshConnection();
})();
