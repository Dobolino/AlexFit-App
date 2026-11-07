(function () {
  "use strict";
  const A = window.AF;
  if (!A || A.cardioSession) return;
  const KEY = "af_cardio_session";
  const labels = {
    walking: "Gehen / Walkingpad",
    cycling: "Radfahren",
    rowing: "Rudern",
    jogging: "Joggen",
    hiit: "Freies Ausdauertraining",
  };
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const typeLabel = (type) =>
    labels[type] || CARDIO_TYPES[type]?.label || "Cardio";
  const formatTime = (ms) => {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(seconds / 3600),
      m = Math.floor(seconds / 60) % 60,
      s = seconds % 60;
    return (
      (h ? h + ":" + String(m).padStart(2, "0") : String(m).padStart(2, "0")) +
      ":" +
      String(s).padStart(2, "0")
    );
  };
  const copy = (value) => (value ? JSON.parse(JSON.stringify(value)) : null);
  let clock = () => Date.now(),
    session = null,
    view = "",
    lastPersistAt = 0;
  let lastError = "";

  function persist(force = true) {
    if (!session) return;
    const now = clock();
    if (!force && now - lastPersistAt < 1000) return;
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ version: 1, ...session, savedAt: now }),
      );
      lastPersistAt = now;
    } catch (_) {
      // The live timer remains usable if browser storage is unavailable.
    }
  }
  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (
        !saved ||
        saved.version !== 1 ||
        !CARDIO_TYPES[saved.type] ||
        !["free", "intervals"].includes(saved.mode) ||
        !["running", "paused", "finished", "saved"].includes(saved.status)
      )
        return;
      if (
        !Number.isFinite(saved.elapsedMs) ||
        saved.elapsedMs < 0 ||
        !Number.isFinite(saved.remainingMs) ||
        saved.remainingMs < 0
      )
        return;
      if (
        !Number.isInteger(saved.rounds) ||
        saved.rounds < 1 ||
        saved.rounds > 100 ||
        !Number.isInteger(saved.round) ||
        saved.round < 1 ||
        saved.round > saved.rounds
      )
        return;
      if (
        !Number.isInteger(saved.workSeconds) ||
        saved.workSeconds < 1 ||
        saved.workSeconds > 3600 ||
        !Number.isInteger(saved.restSeconds) ||
        saved.restSeconds < 0 ||
        saved.restSeconds > 3600 ||
        !["work", "rest", "free"].includes(saved.phase)
      )
        return;
      session = saved;
      if (session.status === "running") {
        session.status = "paused";
        session.restored = true;
      }
      session.anchorAt = null;
      session.deadlineAt = null;
    } catch (_) {
      /* A corrupt session must not prevent opening Cardio. */
    }
  }
  function phaseDuration() {
    return (
      (session.phase === "rest" ? session.restSeconds : session.workSeconds) *
      1000
    );
  }
  function endAt(at, reason) {
    session.status = "finished";
    session.finishedAt = at;
    session.anchorAt = null;
    session.deadlineAt = null;
    session.complete = reason === "complete";
    session.finishReason = reason;
  }
  function advancePhase(at, skipped = false) {
    if (skipped) session.skippedPhases++;
    if (session.phase === "work") {
      if (!skipped) session.completedRounds++;
      if (session.round === session.rounds) {
        session.remainingMs = 0;
        endAt(
          at,
          session.completedRounds === session.rounds ? "complete" : "ended",
        );
        return;
      }
      if (session.restSeconds > 0) session.phase = "rest";
      else session.round++;
    } else {
      session.round++;
      session.phase = "work";
    }
    session.remainingMs = phaseDuration();
    session.deadlineAt = at + session.remainingMs;
  }
  function sync(now = clock()) {
    if (!session || session.status !== "running") return;
    let delta = Math.max(0, now - session.anchorAt);
    if (session.mode === "free") {
      session.elapsedMs += delta;
      session.anchorAt = now;
      return;
    }
    let changed = false;
    // Consume elapsed time using timestamps, even after a throttled background tab.
    while (session.status === "running" && delta >= session.remainingMs) {
      const consumed = session.remainingMs;
      delta -= consumed;
      session.elapsedMs += consumed;
      session.anchorAt += consumed;
      advancePhase(session.anchorAt);
      changed = true;
    }
    if (session.status === "running") {
      session.elapsedMs += delta;
      session.remainingMs -= delta;
      session.anchorAt = now;
      session.deadlineAt = now + session.remainingMs;
    }
    if (changed && !document.hidden && typeof haptic === "function")
      haptic("medium");
  }
  function getState() {
    sync();
    return copy(session);
  }
  function integer(value, min, max, label) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max)
      throw new RangeError(
        label +
          ": Bitte eine ganze Zahl zwischen " +
          min +
          " und " +
          max +
          " wählen.",
      );
    return n;
  }
  function start(options = {}) {
    if (session && ["running", "paused"].includes(session.status))
      throw new Error("Bitte zuerst die laufende Einheit beenden.");
    const type = options.type || "rowing",
      mode = options.mode || "intervals";
    if (!CARDIO_TYPES[type] || !["free", "intervals"].includes(mode))
      throw new Error("Bitte Sportart und Trainingsform wählen.");
    const workSeconds =
      mode === "free"
        ? 60
        : integer(options.workSeconds ?? 60, 1, 3600, "Belastung (Sekunden)");
    const restSeconds =
      mode === "free"
        ? 0
        : integer(options.restSeconds ?? 60, 0, 3600, "Erholung (Sekunden)");
    const rounds =
      mode === "free" ? 1 : integer(options.rounds ?? 8, 1, 100, "Intervalle");
    const now = clock();
    session = {
      version: 1,
      id:
        "cs-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 9),
      date: todayISO(),
      type,
      mode,
      workSeconds,
      restSeconds,
      rounds,
      round: 1,
      phase: mode === "free" ? "free" : "work",
      status: "running",
      elapsedMs: 0,
      remainingMs: mode === "free" ? 0 : workSeconds * 1000,
      anchorAt: now,
      deadlineAt: mode === "free" ? null : now + workSeconds * 1000,
      startedAt: now,
      completedRounds: 0,
      skippedPhases: 0,
      complete: false,
    };
    lastError = "";
    persist();
    render();
    return getState();
  }
  function pause() {
    sync();
    if (session?.status === "running") {
      session.status = "paused";
      session.anchorAt = null;
      session.deadlineAt = null;
    }
    persist();
    render();
    return getState();
  }
  function resume() {
    if (session?.status === "paused") {
      session.status = "running";
      session.restored = false;
      session.anchorAt = clock();
      session.deadlineAt =
        session.mode === "intervals"
          ? session.anchorAt + session.remainingMs
          : null;
    }
    persist();
    render();
    return getState();
  }
  function skip() {
    sync();
    if (
      !session ||
      session.mode !== "intervals" ||
      !["running", "paused"].includes(session.status)
    )
      return getState();
    const paused = session.status === "paused",
      now = clock();
    advancePhase(now, true);
    if (session.status !== "finished") {
      session.anchorAt = paused ? null : now;
      session.deadlineAt = paused ? null : now + session.remainingMs;
    }
    persist();
    render();
    return getState();
  }
  function finish() {
    sync();
    if (session && ["running", "paused"].includes(session.status))
      endAt(clock(), "ended");
    persist();
    render();
    return getState();
  }
  function save(options = {}) {
    if (!session || !["finished", "saved"].includes(session.status))
      throw new Error("Bitte zuerst die Einheit beenden.");
    const id = "cardio-" + session.id;
    const existing = cardioLog.find((entry) => entry.id === id);
    if (existing) {
      session.status = "saved";
      session.savedEntry = copy(existing);
      persist();
      render();
      return copy(existing);
    }
    if (session.status === "saved") return copy(session.savedEntry);
    if (!(session.elapsedMs > 0))
      throw new Error(
        "Noch keine Trainingszeit erfasst. Starte eine neue Einheit.",
      );
    const entry = {
      id,
      type: session.type,
      date: session.date,
      time: session.elapsedMs / 60000,
      note: String(options.note || "")
        .trim()
        .slice(0, 1000),
      source: "live-timer",
    };
    if (["easy", "moderate", "hard"].includes(options.intensity))
      entry.intensity = options.intensity;
    cardioLog.push(entry);
    cardioLog.sort((a, b) => a.date.localeCompare(b.date));
    try {
      saveC();
    } catch (error) {
      cardioLog.splice(cardioLog.indexOf(entry), 1);
      throw new Error(
        "Speichern fehlgeschlagen. Bitte freien Gerätespeicher prüfen und erneut versuchen.",
      );
    }
    session.status = "saved";
    session.savedEntry = copy(entry);
    persist();
    if (typeof showToast === "function") showToast("Aktivität gespeichert ✓");
    renderCardio();
    return copy(entry);
  }
  function reset() {
    if (session && ["running", "paused"].includes(session.status))
      throw new Error("Bitte zuerst die Einheit beenden.");
    session = null;
    lastError = "";
    try {
      localStorage.removeItem(KEY);
    } catch (_) {}
    render();
  }
  function ensureHost() {
    const screen = document.getElementById("screen-cardio");
    if (!screen) return null;
    let host = document.getElementById("af-cardio-live");
    if (host) return host;
    const head = screen.querySelector(".af-pagehead"),
      intro = head?.nextElementSibling;
    const manual = document.createElement("details");
    manual.className = "af-cardio-manual";
    manual.id = "af-cardio-manual";
    manual.innerHTML =
      '<summary>Aktivität nachtragen <span>Einträge & Verlauf</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div class="af-cardio-manual-body"></div>';
    const body = manual.lastElementChild;
    for (const child of [...screen.children])
      if (child !== head && child !== intro) body.append(child);
    if (intro?.classList.contains("af-note"))
      intro.textContent = "Dein Tempo. Dein Rhythmus.";
    host = document.createElement("section");
    host.id = "af-cardio-live";
    host.className = "af-cardio-live";
    host.setAttribute("aria-label", "Cardio-Training");
    screen.append(host, manual);
    return host;
  }
  const icon = (name) =>
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    ({
      play: '<path d="m9 5 10 7-10 7Z"/>',
      pause: '<path d="M8 5v14M16 5v14"/>',
      next: '<path d="m5 5 10 7-10 7ZM19 5v14"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
    }[name] || "") +
    "</svg>";
  function renderSetup(host) {
    host.innerHTML =
      '<form id="af-cardio-start-form" class="af-cardio-panel">' +
      '<div class="af-cardio-heading"><p class="af-cardio-kicker">BEREIT, WENN DU ES BIST</p><h2>Deine nächste Einheit</h2><p>Zeit direkt erfassen oder deinen Intervalltimer einstellen.</p></div>' +
      '<label class="af-cardio-field">Sportart<select id="af-cardio-session-type" name="type">' +
      Object.keys(CARDIO_TYPES)
        .map(
          (type) =>
            '<option value="' +
            esc(type) +
            '"' +
            (type === "rowing" ? " selected" : "") +
            ">" +
            esc(typeLabel(type)) +
            "</option>",
        )
        .join("") +
      "</select></label>" +
      '<label class="af-cardio-field">Trainingsform<select id="af-cardio-session-mode" name="mode"><option value="intervals">Intervalle</option><option value="free">Freies Training</option></select></label>' +
      '<div id="af-cardio-interval-options"><div class="af-cardio-input-grid"><label class="af-cardio-field">Belastung <span>(Sekunden)</span><input id="af-cardio-work" name="workSeconds" type="number" inputmode="numeric" min="1" max="3600" value="60" required></label><label class="af-cardio-field">Erholung <span>(Sekunden)</span><input id="af-cardio-rest" name="restSeconds" type="number" inputmode="numeric" min="0" max="3600" value="60" required></label></div><label class="af-cardio-field">Anzahl Intervalle<input id="af-cardio-rounds" name="rounds" type="number" inputmode="numeric" min="1" max="100" value="8" required></label><p class="af-cardio-help">Passe Dauer und Tempo an dich an. Nach dem letzten Intervall endet der Timer ohne zusätzliche Erholungsphase.</p></div>' +
      '<p class="af-cardio-error" id="af-cardio-error" role="alert"></p><button class="af-cardio-button af-cardio-primary" type="submit">' +
      icon("play") +
      'Training starten</button><p class="af-cardio-help af-cardio-device-note">Timer und manuelles Protokoll · keine Verbindung zu Gerät, GPS oder Pulssensor.</p></form>';
  }
  function renderLive(host) {
    host.innerHTML =
      '<div class="af-cardio-panel af-cardio-timer-panel"><div class="af-cardio-heading"><p class="af-cardio-kicker" id="af-cardio-session-label"></p><h2>' +
      esc(typeLabel(session.type)) +
      "</h2><p>" +
      (session.mode === "intervals" ? "Intervalltraining" : "Freies Training") +
      "</p></div>" +
      '<div class="af-cardio-phase-row"><span id="af-cardio-round-label"></span><span class="af-cardio-phase" id="af-cardio-phase" role="status"></span></div>' +
      '<div class="af-cardio-ring"><svg class="af-cardio-ring-svg" viewBox="0 0 240 240" aria-hidden="true"><circle class="af-cardio-ring-track" cx="120" cy="120" r="104"/><circle id="af-cardio-ring-progress" class="af-cardio-ring-progress" cx="120" cy="120" r="104"/></svg><div class="af-cardio-ring-content"><div id="af-cardio-countdown" role="timer" aria-label="Timer"></div><span id="af-cardio-countdown-label"></span></div></div>' +
      '<p class="af-cardio-next" id="af-cardio-next"></p><div class="af-cardio-metrics"><div><span>Gesamtzeit</span><strong id="af-cardio-elapsed"></strong></div><div><span id="af-cardio-rounds-caption">Weitere Intervalle</span><strong id="af-cardio-remaining-rounds"></strong></div></div>' +
      '<p id="af-cardio-restored" class="af-cardio-help" role="status"></p><button type="button" class="af-cardio-button af-cardio-primary" data-cardio-action="toggle" id="af-cardio-toggle"></button>' +
      (session.mode === "intervals"
        ? '<button type="button" class="af-cardio-button af-cardio-secondary" data-cardio-action="skip">' +
          icon("next") +
          'Phase überspringen</button><div class="af-cardio-plan"><span>DEIN ABLAUF</span><strong>' +
          session.rounds +
          " × " +
          session.workSeconds +
          " s Belastung</strong><p>" +
          session.restSeconds +
          " s Erholung zwischen den Intervallen</p></div>"
        : '<p class="af-cardio-help">Bewege dich in deinem Tempo. Der Timer läuft, bis du pausierst oder beendest.</p>') +
      '<button type="button" class="af-cardio-button af-cardio-finish" data-cardio-action="finish">Training beenden</button><p class="af-cardio-help af-cardio-device-note">Phasenwechsel wird angezeigt. Vibration nur, wenn dein Gerät sie unterstützt.</p></div>';
  }
  function renderSummary(host) {
    const saved = session.status === "saved";
    host.innerHTML =
      '<div class="af-cardio-panel af-cardio-summary"><div class="af-cardio-summary-mark">' +
      icon("check") +
      '</div><p class="af-cardio-kicker">' +
      (saved
        ? "IM VERLAUF GESPEICHERT"
        : session.complete
          ? "ABLAUF ABGESCHLOSSEN"
          : "EINHEIT BEENDET") +
      "</p><h2>" +
      (saved ? "Gut gemacht." : "Deine Einheit") +
      "</h2><p>" +
      esc(typeLabel(session.type)) +
      '</p><strong class="af-cardio-summary-time">' +
      formatTime(session.elapsedMs) +
      '</strong><p class="af-cardio-help">Trainingszeit ohne Unterbrechungen' +
      (session.mode === "intervals"
        ? ", inklusive der Erholung zwischen den Intervallen."
        : ".") +
      "</p>" +
      (session.mode === "intervals"
        ? '<div class="af-cardio-plan"><strong>' +
          session.completedRounds +
          " von " +
          session.rounds +
          " Belastungsintervallen vollständig</strong>" +
          (session.skippedPhases
            ? "<p>" +
              session.skippedPhases +
              " Phase" +
              (session.skippedPhases === 1 ? "" : "n") +
              " übersprungen</p>"
            : "") +
          "</div>"
        : "") +
      (saved
        ? '<button type="button" class="af-cardio-button af-cardio-primary" data-cardio-action="new">Neue Einheit</button><button type="button" class="af-cardio-button af-cardio-secondary" data-cardio-action="history">Verlauf ansehen</button>'
        : '<form id="af-cardio-save-form"><label class="af-cardio-field">Wie war die Einheit? <span>(optional)</span><select name="intensity" id="af-cardio-session-intensity"><option value="">Bitte wählen</option><option value="easy">Locker</option><option value="moderate">Mittel</option><option value="hard">Anstrengend</option></select></label><label class="af-cardio-field">Notiz <span>(optional)</span><textarea id="af-cardio-session-note" name="note" rows="2" maxlength="1000" placeholder="Wie hat es sich angefühlt?"></textarea></label><p class="af-cardio-error" id="af-cardio-error" role="alert"></p><button type="submit" class="af-cardio-button af-cardio-primary"' +
          (session.elapsedMs > 0 ? "" : " disabled") +
          ">" +
          icon("check") +
          'Aktivität speichern</button></form><button type="button" class="af-cardio-button af-cardio-finish" data-cardio-action="discard">Ohne Speichern verwerfen</button>') +
      "</div>";
  }
  function updateLive() {
    if (!session || !["running", "paused"].includes(session.status)) return;
    const text = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    const paused = session.status === "paused",
      free = session.mode === "free";
    text(
      "af-cardio-session-label",
      paused ? "DEIN TIMER IST PAUSIERT" : "IN DEINEM RHYTHMUS",
    );
    text(
      "af-cardio-round-label",
      free
        ? "ZEIT ERFASSEN"
        : "INTERVALL " + session.round + " VON " + session.rounds,
    );
    text(
      "af-cardio-phase",
      paused
        ? "PAUSIERT"
        : free
          ? "LÄUFT"
          : session.phase === "rest"
            ? "ERHOLUNG"
            : "BELASTUNG",
    );
    const countdown = formatTime(
      free ? session.elapsedMs : Math.ceil(session.remainingMs / 1000) * 1000,
    );
    text("af-cardio-countdown", countdown);
    document
      .getElementById("af-cardio-countdown")
      ?.classList.toggle("af-cardio-long-time", countdown.length > 5);
    text(
      "af-cardio-countdown-label",
      free ? "Gesamtzeit" : paused ? "pausiert" : "verbleibend",
    );
    let next = "Bewege dich in deinem Tempo.";
    if (!free)
      next =
        session.phase === "rest"
          ? "Danach: " + session.workSeconds + " s Belastung"
          : session.round === session.rounds
            ? "Danach: Training abgeschlossen"
            : session.restSeconds > 0
              ? "Danach: " + session.restSeconds + " s locker"
              : "Danach: nächstes Belastungsintervall";
    text("af-cardio-next", next);
    text("af-cardio-elapsed", formatTime(session.elapsedMs));
    text("af-cardio-rounds-caption", free ? "Erfassung" : "Weitere Intervalle");
    text(
      "af-cardio-remaining-rounds",
      free ? "Nur Zeit" : session.rounds - session.round,
    );
    text(
      "af-cardio-restored",
      session.restored
        ? "Unterbrochene Einheit pausiert wiederhergestellt. Mit Fortsetzen geht es weiter."
        : "",
    );
    const toggle = document.getElementById("af-cardio-toggle");
    if (toggle && toggle.dataset.state !== session.status) {
      toggle.innerHTML =
        icon(paused ? "play" : "pause") + (paused ? "Fortsetzen" : "Pause");
      toggle.dataset.state = session.status;
    }
    const progress = document.getElementById("af-cardio-ring-progress");
    if (progress) {
      const circumference = 2 * Math.PI * 104;
      progress.style.strokeDasharray = String(circumference);
      progress.style.strokeDashoffset = String(
        circumference *
          (1 -
            (free
              ? 1
              : Math.max(
                  0,
                  Math.min(1, session.remainingMs / phaseDuration()),
                ))),
      );
    }
    document
      .getElementById("af-cardio-live")
      ?.classList.toggle("is-paused", paused);
  }
  function render() {
    const host = ensureHost();
    if (!host) return;
    document
      .getElementById("screen-cardio")
      ?.classList.toggle(
        "af-cardio-session-active",
        !!session && ["running", "paused"].includes(session.status),
      );
    const nextView = !session
      ? "setup"
      : ["running", "paused"].includes(session.status)
        ? "live:" + session.id
        : "summary:" + session.id + ":" + session.status;
    if (view !== nextView || !host.children.length) {
      view = nextView;
      if (!session) renderSetup(host);
      else if (["running", "paused"].includes(session.status)) renderLive(host);
      else renderSummary(host);
      host.classList.toggle("is-paused", session?.status === "paused");
      if (document.getElementById("screen-cardio")?.classList.contains("active"))
        document.getElementById("content").scrollTop = 0;
    }
    updateLive();
    const error = document.getElementById("af-cardio-error");
    if (error) error.textContent = lastError;
  }
  function tick() {
    sync();
    persist(false);
    render();
    return getState();
  }
  function reportError(error) {
    lastError = error.message || String(error);
    render();
  }
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!["af-cardio-start-form", "af-cardio-save-form"].includes(form.id))
      return;
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(form));
      if (form.id === "af-cardio-start-form") start(values);
      else save(values);
    } catch (error) {
      reportError(error);
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id !== "af-cardio-session-mode") return;
    const free = event.target.value === "free",
      options = document.getElementById("af-cardio-interval-options");
    if (options) {
      options.hidden = free;
      options
        .querySelectorAll("input")
        .forEach((input) => (input.disabled = free));
    }
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cardio-action]");
    if (!button) return;
    const action = button.dataset.cardioAction;
    try {
      if (action === "toggle")
        session?.status === "paused" ? resume() : pause();
      if (action === "skip") skip();
      if (action === "finish") {
        pause();
        showConfirm(
          "Training beenden und Zusammenfassung ansehen?",
          finish,
          "Training beenden",
        );
        // Staying paused while the confirmation is open excludes interruption time.
        // Cancelling leaves an explicit Fortsetzen button in the timer.
      }
      if (action === "new") reset();
      if (action === "discard")
        showConfirm("Einheit ohne Speichern verwerfen?", reset, "Verwerfen");
      if (action === "history") {
        const details = document.getElementById("af-cardio-manual");
        if (details) {
          details.open = true;
          document
            .getElementById("cardio-log")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    } catch (error) {
      reportError(error);
    }
  });
  document.addEventListener("visibilitychange", tick);
  window.addEventListener("pagehide", () => {
    sync();
    persist();
  });
  const originalRender = renderCardio;
  renderCardio = function () {
    originalRender.apply(this, arguments);
    render();
  };
  restore();
  A.cardioSession = {
    getState,
    start,
    pause,
    resume,
    skip,
    finish,
    save,
    reset,
    tick,
    render,
    setClock(provider) {
      if (typeof provider !== "function")
        throw new TypeError("Clock must be a function");
      clock = provider;
    },
  };
  render();
  setInterval(tick, 250);
})();
