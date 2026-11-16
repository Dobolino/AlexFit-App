/* Only the packaged iPhone copy loads this adapter. The website stays unchanged. */
export function setupNativeIntegration(deps, scope = window) {
  const { Capacitor, Filesystem, Directory, Share, Haptics, ImpactStyle, NotificationType } = deps;
  if (!Capacitor.isNativePlatform() || scope.AFNative?.installed) return null;

  const doc = scope.document;
  const objects = new Map();
  const originalCreate = scope.URL.createObjectURL.bind(scope.URL);
  const originalRevoke = scope.URL.revokeObjectURL.bind(scope.URL);
  const originalClick = scope.HTMLAnchorElement.prototype.click;
  let activeShare = false;
  let sequence = 0;
  const state = scope.AFNative = {
    installed: true,
    version: deps.version || '1.0.0',
    lastDownload: Promise.resolve(null),
    shareBlob,
  };
  const toast = (message) => scope.showToast?.(message);
  const filename = (value) => {
    const name = String(value || '').split(/[\\/]/).pop()
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[<>:"|?*]/g, '_').replace(/^\.+/, '').slice(0, 120);
    return name || 'AlexFit_Export.json';
  };
  function asBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new scope.FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error || new Error('Export nicht lesbar'));
      reader.onabort = () => reject(new Error('Export abgebrochen'));
      reader.readAsDataURL(blob);
    });
  }
  async function shareBlob(blob, suggestedName) {
    if (activeShare) {
      toast('Bitte den geöffneten Export zuerst abschliessen.');
      return { shared: false, reason: 'busy' };
    }
    activeShare = true;
    try {
      const name = filename(suggestedName);
      const path = 'exports/' + Date.now() + '-' + (++sequence) + '-' + name;
      const saved = await Filesystem.writeFile({
        path, directory: Directory.Cache, recursive: true, data: await asBase64(blob),
      });
      try {
        await Share.share({
          title: name,
          dialogTitle: 'AlexFit exportieren',
          url: saved.uri,
        });
      } catch (error) {
        // Capacitor's iOS plugin rejects cancellation; only a completed activity resolves.
        if (error?.message === 'Share canceled') return { shared: false, reason: 'cancelled' };
        throw error;
      }
      return { shared: true, reason: 'shared' };
    } finally {
      activeShare = false;
    }
  }
  function beginDownload(blob, name) {
    const task = shareBlob(blob, name).then((result) => {
      if (result.reason === 'cancelled') toast('Export abgebrochen.');
      return result;
    }).catch(() => {
      toast('Export nicht möglich. Bitte erneut versuchen.');
      return { shared: false, reason: 'error' };
    });
    state.lastDownload = task;
    return task;
  }
  scope.URL.createObjectURL = function (blob) {
    const url = originalCreate(blob);
    objects.set(url, blob);
    return url;
  };
  scope.URL.revokeObjectURL = function (url) {
    objects.delete(String(url));
    return originalRevoke(url);
  };
  scope.HTMLAnchorElement.prototype.click = function (...args) {
    const blob = objects.get(this.href);
    if (this.hasAttribute('download') && blob) {
      // Capture now: existing exports revoke their blob URL immediately after click().
      beginDownload(blob, this.download);
      return;
    }
    return originalClick.apply(this, args);
  };
  if (typeof scope.exportJSON === 'function') {
    scope.exportJSON = function () {
      const blob = new scope.Blob([JSON.stringify(scope.collectBackupPayload(), null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const date = typeof scope.todayISO === 'function' ? scope.todayISO() : new Date().toISOString().slice(0, 10);
      const task = beginDownload(blob, 'AlexFit_Backup_' + date + '.json').then((result) => {
        if (result.shared) {
          scope.markBackupDone();
          toast('Backup über das Teilen-Menü exportiert.');
        }
        return result;
      });
      state.lastDownload = task;
      return task;
    };
  }

  doc.documentElement.dataset.native = 'ios';
  const style = doc.createElement('style');
  style.textContent = '#install-banner{display:none!important}';
  doc.head.append(style);
  const notificationMessage = 'Diese iPhone-Version unterstützt keine Erinnerungen oder Hintergrundalarme. Timer laufen bei geöffneter App.';
  scope.getNotificationStatus = () => ({ supported: false, label: 'Keine Hintergrundalarme', color: 'var(--tm)' });
  scope.requestNotificationPermission = () => toast(notificationMessage);
  scope.sendNotification = () => {};
  scope.scheduleTrainingReminder = () => {};
  scope.saveReminderTime = () => toast(notificationMessage);
  scope.haptic = function (pattern = 'light') {
    try {
      const promise = pattern === 'success' || pattern === 'done'
        ? Haptics.notification({ type: NotificationType.Success })
        : Haptics.impact({ style: pattern === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
      Promise.resolve(promise).catch(() => {});
    } catch (_) { /* Haptics are optional on devices without a feedback motor. */ }
  };

  function refreshSettings() {
    const settings = doc.getElementById('screen-settings');
    if (!settings) return;
    const status = doc.getElementById('notif-status');
    if (status) status.textContent = notificationMessage;
    const enable = doc.getElementById('notif-enable-btn');
    if (enable) {
      enable.textContent = 'Nicht verfügbar';
      enable.disabled = true;
    }
    const reminder = doc.getElementById('s-reminder-time');
    if (reminder) reminder.disabled = true;
    for (const button of doc.querySelectorAll('button[onclick="saveReminderTime()"]')) button.disabled = true;
    for (const button of settings.querySelectorAll('[data-af-action="tools-update"]')) button.textContent = 'Versionshinweis';
    const update = doc.getElementById('tools-update-status');
    if (update) update.textContent = 'Neue Versionen installierst du als neue IPA über dein Sideload-Programm. Diese App lädt keine Web-Updates.';
    let info = doc.getElementById('af-native-version');
    if (!info) {
      info = doc.createElement('section');
      info.id = 'af-native-version';
      info.className = 'af-card';
      const heading = doc.createElement('h2');
      heading.textContent = 'AlexFit für iPhone · ' + state.version;
      const migration = doc.createElement('p');
      migration.textContent = 'Deine Daten bleiben lokal in dieser App. Vorhandene Safari-Daten kannst du dort als JSON-Backup exportieren und hier importieren.';
      info.append(heading, migration);
      settings.prepend(info);
    }
  }
  const originalSettings = scope.renderSettings;
  if (typeof originalSettings === 'function') scope.renderSettings = function (...args) {
    const result = originalSettings.apply(this, args);
    refreshSettings();
    return result;
  };
  const originalAction = scope.AF?.handleAction;
  if (scope.AF) scope.AF.handleAction = function (action, target) {
    if (action === 'tools-update' || action === 'tools-reload') {
      refreshSettings();
      toast('Neue Versionen als IPA über dein Sideload-Programm installieren.');
      return;
    }
    return originalAction?.call(this, action, target);
  };
  refreshSettings();
  return state;
}
