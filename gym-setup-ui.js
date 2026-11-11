(function () {
  "use strict";
  if (!window.AF || window.AF.gymSetup) return;
  window.AF.gymSetup = true;

  const GYM_EQUIPMENT = [
    {key: "freigewichte", label: "Freie Gewichte", icon: "🏋️", items: [
      {id: "kurzhantel", label: "Kurzhantel"},
      {id: "langhantel", label: "Langhantel"},
      {id: "ez-bar", label: "EZ-Bar"},
      {id: "kettlebell", label: "Kettlebell"},
    ]},
    {key: "stationen", label: "Stationen & Racks", icon: "🏗️", items: [
      {id: "squat-rack", label: "Squat Rack"},
      {id: "smith-machine", label: "Smith Machine"},
      {id: "dip-station", label: "Dip-Station"},
      {id: "klimmzugstange", label: "Klimmzugstange"},
      {id: "preacher-bank", label: "Preacher Curl Bank"},
    ]},
    {key: "baenke", label: "Bänke", icon: "🛋️", items: [
      {id: "flachbank", label: "Flachbank"},
      {id: "schraegbank", label: "Schrägbank"},
      {id: "verstellbare-bank", label: "Verstellbare Bank"},
    ]},
    {key: "kabelzug", label: "Kabelzug", icon: "🔗", items: [
      {id: "kabelzug-hoch", label: "Kabelzug hoch"},
      {id: "kabelzug-tief", label: "Kabelzug tief"},
      {id: "funktionsturm", label: "Funktionsturm"},
    ]},
    {key: "masch-ob", label: "Maschinen — Oberkörper", icon: "💪", items: [
      {id: "chest-press-maschine", label: "Chest Press"},
      {id: "pec-deck", label: "Pec Deck"},
      {id: "latzug-maschine", label: "Latzug"},
      {id: "seated-row-maschine", label: "Seated Row"},
      {id: "assisted-pullup-maschine", label: "Assisted Pull-Up / Dip"},
      {id: "shoulder-press-maschine", label: "Shoulder Press"},
      {id: "reverse-pec-deck", label: "Reverse Pec Deck"},
      {id: "trizeps-maschine", label: "Trizeps Maschine"},
    ]},
    {key: "masch-ub", label: "Maschinen — Unterkörper", icon: "🦵", items: [
      {id: "leg-press", label: "Leg Press"},
      {id: "leg-extension", label: "Leg Extension"},
      {id: "leg-curl", label: "Leg Curl"},
      {id: "hip-thrust-maschine", label: "Hip Thrust"},
      {id: "calf-raise-maschine", label: "Calf Raise"},
      {id: "hack-squat", label: "Hack Squat"},
    ]},
    {key: "cardio", label: "Cardio", icon: "🏃", items: [
      {id: "laufband", label: "Laufband"},
      {id: "crosstrainer", label: "Crosstrainer"},
      {id: "ruderergometer", label: "Ruderergometer"},
      {id: "fahrradergometer", label: "Fahrrad"},
      {id: "stairmaster", label: "Stairmaster"},
    ]},
  ];

  function getGymSetup() {
    return (window.settings && window.settings.gymSetup) ? window.settings.gymSetup : [];
  }

  function updateCount() {
    const el = document.getElementById("gym-setup-count");
    if (el) el.textContent = getGymSetup().length + " Geräte";
  }

  function renderGymSetupScroll() {
    const scroll = document.getElementById("gym-setup-scroll");
    if (!scroll) return;
    const selected = new Set(getGymSetup());
    scroll.innerHTML = GYM_EQUIPMENT.map(cat => {
      const itemsHtml = cat.items.map(item => {
        const on = selected.has(item.id);
        return `<button onclick="toggleGymEquipment('${item.id}')" id="gym-eq-btn-${item.id}" style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;border:1.5px solid ${on ? "#8B5CF6" : "var(--border)"};background:${on ? "rgba(139,92,246,.18)" : "var(--cardElev)"};margin:4px;touch-action:manipulation">
          <span class="bc" style="font-size:13px;font-weight:700;color:${on ? "#C4B5FD" : "var(--ts)"}">${item.label}</span>
        </button>`;
      }).join("");
      return `<div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <span style="font-size:16px">${cat.icon}</span>
          <span class="bc" style="font-size:13px;font-weight:800;color:var(--tm);text-transform:uppercase;letter-spacing:.06em">${cat.label}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;margin:-4px">${itemsHtml}</div>
      </div>`;
    }).join("");
    updateCount();
  }

  window.openGymSetup = function () {
    renderGymSetupScroll();
    const ov = document.getElementById("gym-setup-overlay");
    if (ov) {
      ov.style.display = "flex";
    }
  };

  window.closeGymSetup = function () {
    const ov = document.getElementById("gym-setup-overlay");
    if (ov) ov.style.display = "none";
  };

  window.toggleGymEquipment = function (id) {
    if (!window.settings) return;
    if (!window.settings.gymSetup) window.settings.gymSetup = [];
    const idx = window.settings.gymSetup.indexOf(id);
    if (idx === -1) {
      window.settings.gymSetup.push(id);
    } else {
      window.settings.gymSetup.splice(idx, 1);
    }
    const btn = document.getElementById("gym-eq-btn-" + id);
    const on = window.settings.gymSetup.includes(id);
    if (btn) {
      btn.style.border = "1.5px solid " + (on ? "#8B5CF6" : "var(--border)");
      btn.style.background = on ? "rgba(139,92,246,.18)" : "var(--cardElev)";
      const label = btn.querySelector("span.bc");
      if (label) label.style.color = on ? "#C4B5FD" : "var(--ts)";
    }
    updateCount();
  };

  window.selectAllGymEquipment = function () {
    if (!window.settings) return;
    const all = GYM_EQUIPMENT.flatMap(cat => cat.items.map(i => i.id));
    window.settings.gymSetup = all;
    renderGymSetupScroll();
  };

  window.saveGymSetup = function () {
    if (typeof saveSettings === "function") saveSettings();
    window.closeGymSetup();
    if (typeof showToast === "function") showToast("Gym-Ausstattung gespeichert ✓");
    if (typeof renderWorkoutSelect === "function") renderWorkoutSelect();
  };

  window.getFilteredGymExercises = function (exercises) {
    const setup = getGymSetup();
    if (!setup || setup.length === 0) return exercises;
    const setupSet = new Set(setup);
    return exercises.filter(ex => {
      if (!ex.equipment || ex.equipment.length === 0) return true;
      if (ex.equipment.includes("bodyweight")) return true;
      return ex.equipment.some(e => setupSet.has(e));
    });
  };
})();
