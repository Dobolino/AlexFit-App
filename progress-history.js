(function () {
  'use strict';
  const number = (value) => {
    if (value === '' || value == null || typeof value === 'boolean') return null;
    const n = Number(typeof value === 'string' ? value.replace(',', '.') : value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const fmtNumber = (n) => new Intl.NumberFormat('de-CH', { maximumFractionDigits: 1 }).format(n);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function duration(seconds) {
    if (seconds == null) return '—';
    const n = Math.floor(seconds), ss = String(n % 60).padStart(2, '0');
    return n >= 3600 ? Math.floor(n / 3600) + ':' + String(Math.floor(n / 60) % 60).padStart(2, '0') + ':' + ss : Math.floor(n / 60) + ':' + ss;
  }
  function definition(name) {
    try {
      const def = typeof getExDef === 'function' ? getExDef(name) || {} : {};
      // Core supplies a generic guessed weight basis even for an unknown name.
      // Only infer a historical basis from an actual exercise definition.
      return def.id || def.muscle || Array.isArray(def.equipment) || typeof def.bw === 'boolean' ? def : {};
    } catch (_) { return {}; }
  }
  function dateInfo(entry) {
    const stamp = [entry.startedAt, entry.startTime, entry.endedAt, entry.completedAt, entry.date].find((s) => typeof s === 'string' && /T\d\d:\d\d/.test(s) && Number.isFinite(Date.parse(s)));
    const iso = typeof entry.date === 'string' ? entry.date : '';
    const day = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00') : new Date(stamp || iso);
    const valid = Number.isFinite(day.getTime());
    return {
      sortTime: stamp ? Date.parse(stamp) : valid ? day.getTime() : 0,
      dateLabel: valid ? day.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Datum nicht hinterlegt',
      timeLabel: stamp ? new Date(stamp).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : 'Uhrzeit nicht hinterlegt'
    };
  }
  function normalizeStrength(entry, index = 0, resolve = definition) {
    if (!entry || typeof entry !== 'object') return null;
    const trustedPR = entry.prVersion === 1;
    const exercises = (Array.isArray(entry.exercises) ? entry.exercises : []).filter((e) => e && typeof e === 'object').map((exercise) => {
      const def = resolve(exercise.name) || {};
      const bw = typeof exercise.bw === 'boolean' ? exercise.bw : def.bw === true;
      const basis = exercise.weightBasis || def.weightBasis || 'unknown';
      const timed = exercise.unit === 'seconds' || (!exercise.unit && def.unit === 'seconds');
      const unsupportedLoad = /assist|unterstütz|band|resistance/i.test(basis + ' ' + (exercise.name || ''));
      const validBasis = ['perHand', 'external', 'total', 'barbell', 'machine'].includes(basis);
      const sets = (Array.isArray(exercise.sets) ? exercise.sets : []).filter((s) => s && typeof s === 'object' && s.done !== false).map((set, setIndex) => {
        const seconds = number(set.seconds), reps = number(set.reps), weight = number(set.weight ?? set.kg);
        const isTime = timed || seconds != null;
        const amount = isTime ? seconds ?? reps : reps;
        const valid = amount != null && amount > 0 && (bw || isTime || weight != null && weight > 0);
        const pr = trustedPR && set.pr === true && valid && !isTime && !unsupportedLoad;
        const value = isTime ? (amount == null ? 'Zeit fehlt' : fmtNumber(amount) + ' s')
          : (reps == null ? 'Wiederholungen fehlen' : fmtNumber(reps) + ' Wdh');
        const load = bw ? 'Körpergewicht' + (weight > 0 ? ' + ' + fmtNumber(weight) + ' kg' : '') : weight != null ? fmtNumber(weight) + ' kg' : 'Last nicht hinterlegt';
        const extra = [];
        const rpe = number(set.rpe);
        if (rpe != null && rpe > 0 && rpe <= 10) extra.push('RPE ' + fmtNumber(rpe));
        if (set.leverageDrop) {
          const drops = [number(set.drop2reps), number(set.drop3reps)].filter((n) => n != null && n > 0);
          if (drops.length) extra.push('Dropsatz: ' + drops.map(fmtNumber).join(' + ') + ' Wdh');
        }
        return {
          index: setIndex + 1, load, value, pr, extra: extra.join(' · '),
          volume: !bw && !isTime && !unsupportedLoad && validBasis && weight > 0 && reps > 0 && Number.isFinite(weight * reps) ? weight * reps : 0
        };
      });
      const planned = number(exercise.plannedSets);
      return {
        name: String(exercise.name || 'Übung'), sets, planned,
        basisLabel: bw ? 'Körpergewicht' : unsupportedLoad ? 'Unterstützung / Widerstand' : basis === 'perHand' ? 'Last je Hantel' : basis === 'unknown' ? 'Gespeicherte Last · Bezug unbekannt' : 'Eingetragene Last',
        volume: sets.reduce((n, s) => n + s.volume, 0)
      };
    });
    const detailedCount = exercises.reduce((n, e) => n + e.sets.length, 0);
    const done = detailedCount || number(entry.sets) || 0;
    const planned = number(entry.totalSets ?? entry.plannedSets) ?? (exercises.length && exercises.every((e) => e.planned != null) ? exercises.reduce((n, e) => n + e.planned, 0) : null);
    const status = entry.status === 'partial' || planned != null && done < planned ? 'Teiltraining' : entry.status === 'completed' ? 'Abgeschlossen' : 'Gespeichert';
    return {
      key: 'strength-' + String(entry.id || index) + '-' + index, sequence: index,
      kind: ['rowing', 'cardio', 'running', 'cycling', 'walking'].includes(entry.energyType) ? 'cardio' : 'strength',
      title: String(entry.name || entry.title || 'Krafttraining'),
      ...dateInfo(entry), status, partial: status === 'Teiltraining', exercises, done, planned,
      durationSeconds: number(entry.durationSeconds) ?? (number(entry.duration) != null ? number(entry.duration) * 60 : null),
      volume: exercises.reduce((n, e) => n + e.volume, 0),
      note: String(entry.note || ''), mode: entry.mode === 'gym' || /^g/.test(entry.dayId || '') ? 'Gym' : entry.mode === 'home' ? 'Zuhause' : ''
    };
  }
  function normalizeCardio(entry, index = 0, types = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const config = types[entry.type] || {};
    const metrics = [];
    for (const [field, label, unit] of [['dist', 'Strecke', 'km'], ['meters', 'Strecke', 'm'], ['hr', 'Ø Puls', 'bpm'], ['kcal', 'Energie', 'kcal'], ['watts', 'Leistung', 'W'], ['strokeRate', 'Schlagfrequenz', '/min']]) {
      const n = number(entry[field]);
      if (n != null && n > 0) metrics.push({ label, value: fmtNumber(n) + ' ' + unit });
    }
    return {
      key: 'cardio-' + String(entry.id || index) + '-' + index, sequence: index, kind: 'cardio', title: String(config.label || entry.type || 'Cardio'),
      ...dateInfo(entry), status: entry.status === 'partial' ? 'Teiltraining' : 'Gespeichert', partial: entry.status === 'partial',
      durationSeconds: number(entry.durationSeconds) ?? (number(entry.time) != null ? number(entry.time) * 60 : null),
      note: String(entry.note || ''), metrics, intensity: ({ easy: 'Locker', moderate: 'Moderat', hard: 'Intensiv' })[entry.intensity] || ''
    };
  }
  if (typeof window === 'undefined') {
    if (typeof module === 'object') module.exports = { normalizeStrength, normalizeCardio, duration, dateInfo };
    return;
  }
  if (window.AFProgressHistory) return;
  const state = { filter: 'all', query: '', limit: 30, open: new Set() };
  const legacyStats = renderProgress, legacyHistory = renderHistory;
  function list() {
    const strength = typeof history !== 'undefined' && Array.isArray(history) ? history : [];
    const cardio = typeof cardioLog !== 'undefined' && Array.isArray(cardioLog) ? cardioLog : [];
    const types = typeof CARDIO_TYPES !== 'undefined' ? CARDIO_TYPES : {};
    return [...strength.map((e, i) => normalizeStrength(e, i)), ...cardio.map((e, i) => normalizeCardio(e, i, types))].filter(Boolean).sort((a, b) => b.sortTime - a.sortTime || b.sequence - a.sequence);
  }
  function setRows(exercise) {
    return '<section class="ph-exercise"><h3>' + esc(exercise.name) + '</h3><p class="ph-muted">' + esc(exercise.basisLabel) + ' · ' + exercise.sets.length + (exercise.planned != null ? ' / ' + exercise.planned : '') + ' Sätze</p>'
      + (exercise.sets.length ? '<ol class="ph-sets">' + exercise.sets.map((set) => '<li><span class="ph-set-no">Satz ' + set.index + '</span><div><strong>' + esc(set.load) + '</strong><span>' + esc(set.value) + '</span>' + (set.extra ? '<small>' + esc(set.extra) + '</small>' : '') + '</div>' + (set.pr ? '<span class="ph-pr" aria-label="Persönlicher Rekord">★ PR</span>' : '') + '</li>').join('') + '</ol>' : '<p class="ph-muted">Keine Sätze erfasst.</p>') + '</section>';
  }
  function card(entry) {
    const strength = Array.isArray(entry.exercises);
    const info = strength ? '<span><strong>' + entry.done + (entry.planned != null ? ' / ' + entry.planned : '') + '</strong><span>' + (entry.planned != null ? 'Sätze · erledigt / geplant' : 'Sätze · Plan nicht hinterlegt') + '</span></span><span><strong>' + fmtNumber(entry.volume) + '</strong><span>kg·Wdh Eingabelast</span></span>'
      : '<span><strong>' + esc(entry.metrics.find((m) => m.label === 'Strecke')?.value || '—') + '</strong><span>Strecke</span></span><span><strong>Cardio</strong><span>' + esc(entry.intensity || 'Ausdauer & Bewegung') + '</span></span>';
    const details = strength ? entry.exercises.map(setRows).join('') || '<p class="ph-muted">Für diesen älteren Eintrag sind keine einzelnen Sätze hinterlegt.</p>'
      : '<div class="ph-cardio-metrics">' + (entry.metrics.length ? entry.metrics.map((m) => '<p><span>' + esc(m.label) + '</span><strong>' + esc(m.value) + '</strong></p>').join('') : '<p class="ph-muted">Für diese Einheit wurden keine weiteren Messwerte erfasst.</p>') + '</div>';
    return '<details class="ph-session" data-ph-key="' + esc(entry.key) + '"' + (state.open.has(entry.key) ? ' open' : '') + '><summary><span class="ph-session-date">' + esc(entry.dateLabel) + ' · ' + esc(entry.timeLabel) + '</span><span class="ph-session-top"><span class="ph-title">' + esc(entry.title) + '</span><span class="ph-status' + (entry.partial ? ' is-partial' : '') + '">' + esc(entry.status) + '</span></span>'
      + '<span class="ph-session-stats"><span><strong>' + duration(entry.durationSeconds) + '</strong><span>Dauer</span></span>' + info + '</span><span class="ph-disclosure"><span>' + (strength ? entry.exercises.length + ' Übungen · Sätze ansehen' : 'Details ansehen') + (entry.mode ? ' · ' + entry.mode : '') + '</span><span class="ph-disclosure-icon" aria-hidden="true">+</span></span></summary><div class="ph-session-details">' + details + (entry.note ? '<p class="ph-session-note"><strong>Notiz</strong><br>' + esc(entry.note) + '</p>' : '') + '</div></details>';
  }
  function captureOpen() {
    document.querySelectorAll('#ph-results details[data-ph-key]').forEach((el) => { if (el.open) state.open.add(el.dataset.phKey); else state.open.delete(el.dataset.phKey); });
  }
  function renderResults(entries = list()) {
    const box = document.getElementById('ph-results');
    if (!box) return;
    captureOpen();
    const q = state.query.trim().toLocaleLowerCase('de');
    const filtered = entries.filter((entry) => (state.filter === 'all' || entry.kind === state.filter) && (!q || [entry.title, entry.note, entry.dateLabel, ...(entry.exercises || []).map((e) => e.name)].join(' ').toLocaleLowerCase('de').includes(q)));
    box.innerHTML = filtered.length ? '<p class="ph-muted" role="status">' + filtered.length + ' ' + (filtered.length === 1 ? 'Einheit' : 'Einheiten') + ' · neueste zuerst</p>' + filtered.slice(0, state.limit).map(card).join('') + (filtered.length > state.limit ? '<button type="button" class="ph-action" data-ph-more>Weitere Einheiten anzeigen (' + (filtered.length - state.limit) + ')</button>' : '')
      : '<div class="ph-empty"><h2>Keine passenden Einheiten</h2><p>Ändere die Suche oder wähle einen anderen Filter.</p></div>';
    document.querySelectorAll('[data-ph-filter]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.phFilter === state.filter)));
  }
  function render() {
    const target = document.getElementById('history-list');
    if (!target) return;
    captureOpen();
    const entries = list(), strength = entries.filter((e) => e.kind === 'strength'), cardio = entries.filter((e) => e.kind === 'cardio');
    target.classList.add('ph-root');
    target.innerHTML = '<div class="af-pagehead"><div><p class="af-eyebrow">DEINE GESPEICHERTEN EINHEITEN</p><h1>Trainingsverlauf</h1></div></div>'
      + (entries.length ? '<div class="ph-overview"><div><strong>' + strength.length + '</strong><span>Krafttrainings</span></div><div><strong>' + cardio.length + '</strong><span>Cardio-Einheiten</span></div><div><strong>' + strength.reduce((n, e) => n + e.done, 0) + '</strong><span>Absolvierte Sätze</span></div></div><div class="ph-filters" aria-label="Trainingsart">' + [['all', 'Alle'], ['strength', 'Kraft'], ['cardio', 'Cardio']].map(([value, label]) => '<button type="button" data-ph-filter="' + value + '" aria-pressed="' + (state.filter === value) + '">' + label + '</button>').join('') + '</div><label class="ph-search"><span>Training oder Übung suchen</span><input type="search" id="ph-search" value="' + esc(state.query) + '" placeholder="z. B. Bankdrücken" autocomplete="off"></label><div id="ph-results"></div><p class="ph-volume-note">Volumen = eingetragene Last × Wiederholungen. Bei Kurzhanteln je Hantel; keine pauschale Verdopplung. Körpergewicht, Haltezeiten und Unterstützung sind ausgenommen. Historische Lastbezüge können abweichen. ★ PR erscheint nur bei verlässlich gespeicherten Rekorden.</p>'
      : '<div class="ph-empty"><h2>Noch kein Training gespeichert</h2><p>Speichere dein Kraft- oder Cardiotraining nach der Einheit. Hier findest du danach Übungen, Sätze, Lasten und Zeiten.</p><button type="button" class="ph-action" data-ph-start="workout">Krafttraining beginnen</button><button type="button" class="ph-action" data-ph-start="cardio">Cardio öffnen</button></div>');
    if (entries.length) renderResults(entries);
  }
  function show(tab) {
    const mode = tab === 'stats' ? 'stats' : tab === 'archive' ? 'archive' : 'history';
    activeStatsTab = mode;
    document.getElementById('stats-content').style.display = mode === 'stats' ? 'block' : 'none';
    document.getElementById('history-content').style.display = mode === 'stats' ? 'none' : 'block';
    for (const [id, value] of [['seg-history', 'history'], ['seg-stats', 'stats'], ['seg-archive', 'archive']]) {
      const button = document.getElementById(id);
      if (button) { button.classList.toggle('active', mode === value); button.setAttribute('aria-pressed', String(mode === value)); }
    }
    document.getElementById('screen-stats').dataset.progressView = mode;
    if (mode === 'stats') legacyStats();
    else if (mode === 'archive') { document.getElementById('history-list').classList.remove('ph-root'); legacyHistory(); }
    else render();
  }
  const segments = document.querySelector('#screen-stats > .seg-ctrl');
  if (segments) {
    segments.classList.add('ph-sections');
    segments.innerHTML = '<button type="button" class="seg-btn active" id="seg-history" data-ph-view="history">Trainingsverlauf</button><button type="button" class="seg-btn" id="seg-stats" data-ph-view="stats">Auswertungen</button><button type="button" class="seg-btn" id="seg-archive" data-ph-view="archive">Archiv</button>';
  }
  activeStatsTab = 'history';
  switchStatsTab = show;
  renderHistory = function () { if (activeStatsTab === 'archive') legacyHistory(); else render(); };
  renderProgress = function () { if (activeStatsTab === 'stats') legacyStats(); else if (activeStatsTab === 'archive') legacyHistory(); else render(); };
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ph-view],[data-ph-filter],[data-ph-more],[data-ph-start]');
    if (!button) return;
    if (button.dataset.phView) show(button.dataset.phView);
    else if (button.dataset.phFilter) { state.filter = button.dataset.phFilter; state.limit = 30; renderResults(); }
    else if (button.hasAttribute('data-ph-more')) { state.limit += 30; renderResults(); }
    else if (button.dataset.phStart) switchTab(button.dataset.phStart);
  });
  document.addEventListener('input', (event) => {
    if (event.target.id !== 'ph-search') return;
    state.query = event.target.value; state.limit = 30; renderResults();
  });
  window.AFProgressHistory = { list, render, show, normalizeStrength, normalizeCardio };
})();
