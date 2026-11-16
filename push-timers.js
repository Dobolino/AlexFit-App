/* Synchronise optional server hints; the local workout clocks stay authoritative. */
(function () {
  'use strict';
  const A = window.AF;
  if (!A || A.pushTimers || window.Capacitor?.isNativePlatform?.()) return;
  const accepted = { rest: '', cardio: '' };
  const pending = { rest: '', cardio: '' };
  let enabledBefore = false;
  function eligible() { return !!A.push?.isActive() && !!A.push.timersEnabled; }
  async function transmit(kind, events) {
    if (!eligible()) return;
    const value = JSON.stringify(events);
    if (pending[kind] === value || (!pending[kind] && accepted[kind] === value)) return;
    pending[kind] = value;
    try {
      const result = await A.push.scheduleTimers(kind, events);
      if (result !== false && result?.ok !== false && result?.ignored !== true) accepted[kind] = value;
    } catch (_) {
      // The push settings report connectivity. Local timers never wait on the service.
    } finally {
      if (pending[kind] === value) pending[kind] = '';
    }
  }
  function restEvents(now = Date.now()) {
    const deadline = Number(_restTimerStartTS) + Number(restTimerMax) * 1000;
    if (!(restTimerSec > 0) || !Number.isFinite(deadline) || deadline <= now || deadline > now + 86400000) return [];
    return [{ id: 'rest', at: deadline, type: 'rest' }];
  }
  function cardioEvents(state, now = Date.now()) {
    if (!state || state.status !== 'running' || state.mode !== 'intervals' || !Number.isFinite(state.deadlineAt)) return [];
    let at = state.deadlineAt, round = state.round, phase = state.phase;
    const events = [];
    for (let i = 0; i < 200 && at <= now + 86400000; i++) {
      let type;
      if (phase === 'work') {
        if (round >= state.rounds) type = 'cardio-finish';
        else if (state.restSeconds > 0) type = 'cardio-rest';
        else type = 'cardio-work';
      } else if (phase === 'rest') type = 'cardio-work';
      else break;
      if (at > now) events.push({ id: String(round) + '-' + phase, at, type });
      if (type === 'cardio-finish') break;
      if (type === 'cardio-rest') { phase = 'rest'; at += state.restSeconds * 1000; }
      else { phase = 'work'; round++; at += state.workSeconds * 1000; }
    }
    return events;
  }
  function syncRest() { if (eligible()) void transmit('rest', restEvents()); }
  function syncCardio(state) {
    if (eligible()) void transmit('cardio', cardioEvents(state === undefined ? A.cardioSession?.getState() : state));
  }
  function syncAll() {
    const enabled = eligible();
    if (enabled && !enabledBefore) { accepted.rest = ''; accepted.cardio = ''; }
    enabledBefore = enabled;
    if (enabled) { syncRest(); syncCardio(); }
  }
  const oldRestUI = updateRestTimerUI;
  updateRestTimerUI = function (...args) {
    const result = oldRestUI.apply(this, args);
    syncRest();
    return result;
  };
  const oldDismiss = dismissRestTimer;
  dismissRestTimer = function (...args) {
    const result = oldDismiss.apply(this, args);
    syncRest();
    return result;
  };
  const oldNotification = sendNotification;
  sendNotification = function (title, body, tag, ...args) {
    // The existing in-app toast and haptic remain immediate; avoid a second banner.
    if (eligible() && /Pause vorbei|Intervall beendet|Nächstes Intervall/.test(String(title))) return;
    return oldNotification.call(this, title, body, tag, ...args);
  };
  document.addEventListener('af:cardio-state', (event) => syncCardio(event.detail));
  document.addEventListener('af:push-state', syncAll);
  window.addEventListener('online', syncAll);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncAll(); });
  A.pushTimers = { restEvents, cardioEvents, syncAll };
  syncAll();
})();
