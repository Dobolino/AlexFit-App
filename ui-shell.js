(function () {
  'use strict';
  const icons = {
    dashboard: '<path d="m3 10 9-7 9 7v11H3Z"/><path d="M9 21v-8h6v8"/>',
    workout: '<path d="M7 9h10M7 15h10M4 5v14M7 3v18M17 3v18M20 5v14"/>',
    cardio: '<path d="M20.5 5a5 5 0 0 0-8.5 1A5 5 0 0 0 3.5 5C-.5 10 6 15 12 21c6-6 12.5-11 8.5-16Z"/>',
    stats: '<path d="M4 20v-7m6 7V9m6 11V5m6 15V1"/>'
  };
  const sections = new Set(['dashboard', 'workout', 'cardio', 'stats']);
  function section(tab) {
    if (typeof tab !== "string") return;
    if (sections.has(tab)) document.body.dataset.section = tab;
    else if (tab === 'weight' || tab === 'progress' || tab === 'coach-checkin') document.body.dataset.section = 'stats';
    else if (tab.startsWith('workout') || tab === 'coach-summary') document.body.dataset.section = 'workout';
  }
  const originalNav = setNavActive;
  setNavActive = function (tab) {
    section(tab);
    originalNav(tab === "weight" || tab === "progress" ? "stats" : tab === "calendar" ? "dashboard" : tab);
  };
  const originalSwitch = switchTab;
  switchTab = function (tab) {
    originalSwitch(tab);
    document.getElementById('content').scrollTop = 0;
  };
  const originalScreen = showScreen;
  showScreen = function (id) {
    section(id);
    originalScreen(id);
  };
  const nav = document.getElementById('bottomnav');
  nav.setAttribute('aria-label', 'Hauptnavigation');
  nav.innerHTML = '<div id="nav-glass-indicator" aria-hidden="true"></div>' + [
    ['dashboard', 'Heute'], ['workout', 'Training'], ['cardio', 'Cardio'], ['stats', 'Fortschritt']
  ].map(([id,label]) => `<button type="button" class="navbtn" id="nav-${id}" ${id === 'dashboard' ? 'data-af-action="home"' : `onclick="switchTab('${id}')"`}><span class="nicon"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[id]}</svg></span><span class="nlabel">${label}</span></button>`).join('');
  setNavActive('dashboard');
})();
