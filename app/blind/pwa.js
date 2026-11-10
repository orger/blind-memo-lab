// The macOS shell owns offline resources itself and must never install a worker.
if (!window.cornerlabNative && ['https:', 'http:'].includes(location.protocol)) {
  startOfflineSupport();
}

async function startOfflineSupport() {
  const status = document.createElement('div');
  status.id = 'offline-status';
  status.className = 'offline-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const label = document.createElement('span');
  const updateButton = document.createElement('button');
  updateButton.type = 'button';
  updateButton.className = 'offline-update';
  updateButton.textContent = 'Update';
  updateButton.hidden = true;
  status.append(label, updateButton);
  // Stay above the content; the phone's fixed bottom navigation must not cover it.
  document.body.insertBefore(status, document.getElementById('app'));
  const style = document.createElement('style');
  style.textContent = `.offline-status{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:8px;padding:6px max(12px,env(safe-area-inset-right)) 6px max(12px,env(safe-area-inset-left));background:#edf2e9;color:#657c65;font-size:12px;line-height:1.5;text-align:center;min-height:30px}.offline-update{background:#345b44;color:#fff;border-radius:7px;min-height:44px;padding:8px 16px;font-size:13px;font-weight:600}.offline-update[hidden]{display:none}.offline-update:disabled{opacity:.55}.offline-status[data-state="unavailable"]{color:#8b6b37}@media(max-width:600px){.offline-status{padding-top:calc(6px + env(safe-area-inset-top))}body:has(>.offline-status) .app-header{padding-top:12px}}`;
  document.head.append(style);

  let registration;
  let ready = false;
  let activeTimer = false;
  let applying = false;
  let reloadPending = false;
  let unavailable = false;
  let persistenceRequested = false;
  let updateError = '';
  let updateTimeout;
  const timerActive = () => Boolean(window.cornerlabTimerActive?.() || activeTimer || document.querySelector('.timer-zone.running,.timer-zone.inspecting'));

  function render() {
    const updateReady = Boolean(registration?.waiting || reloadPending);
    status.dataset.state = unavailable ? 'unavailable' : ready ? 'ready' : 'preparing';
    if (updateReady) label.textContent = timerActive() ? 'Finish timing to update' : updateError || 'Update ready';
    else if (ready) label.textContent = navigator.onLine ? 'Ready offline' : 'Offline · ready to practise';
    else if (unavailable) label.textContent = navigator.onLine ? 'Offline setup unavailable · reconnect or reload to retry' : 'Connect to finish offline setup';
    else label.textContent = 'Preparing offline practice…';
    updateButton.hidden = !updateReady;
    updateButton.disabled = timerActive() || applying;
    updateButton.textContent = applying ? 'Updating…' : 'Update';
  }

  async function askWorker(worker, type) {
    if (!worker) return { ready: false };
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { channel.port1.close(); resolve({ ready: false }); }, 15000);
      channel.port1.onmessage = event => {
        clearTimeout(timeout);
        channel.port1.close();
        resolve(event.data);
      };
      try { worker.postMessage({ type }, [channel.port2]); }
      catch {
        clearTimeout(timeout);
        channel.port1.close();
        channel.port2.close();
        resolve({ ready: false });
      }
    });
  }

  async function checkReady(repair = false) {
    const response = await askWorker(registration?.active, repair ? 'REPAIR_OFFLINE' : 'OFFLINE_STATUS');
    ready = Boolean(response?.ready);
    unavailable = !ready;
    render();
    window.dispatchEvent(new CustomEvent('cornerlab-offline-state', { detail: { ready } }));
    // Browsers may grant this silently. A refusal does not prevent practice or backups.
    if (ready && !persistenceRequested && navigator.storage?.persist) {
      persistenceRequested = true;
      Promise.resolve().then(() => navigator.storage.persist()).catch(() => {});
    }
  }

  function finishUpdate() {
    if (!applying) return;
    clearTimeout(updateTimeout);
    applying = false;
    reloadPending = true;
    if (!timerActive()) location.reload();
    else render();
  }

  updateButton.addEventListener('click', () => {
    if (timerActive() || applying) return;
    if (reloadPending) return location.reload();
    if (!registration?.waiting) return;
    applying = true;
    updateError = '';
    render();
    const recover = () => {
      clearTimeout(updateTimeout);
      applying = false;
      reloadPending = !registration?.waiting;
      updateError = 'Update paused · tap Update to try again';
      render();
    };
    updateTimeout = setTimeout(recover, 15000);
    try { registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' }); }
    catch { recover(); }
  });
  window.addEventListener('cornerlab-timer-state', event => { activeTimer = Boolean(event.detail?.active); render(); });
  window.addEventListener('offline', render);
  window.addEventListener('online', () => {
    render();
    if (registration) {
      if (!ready) checkReady(true).catch(() => {});
      registration.update().catch(() => {});
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine && registration) registration.update().catch(() => {});
  });
  render();
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    unavailable = true;
    label.textContent = 'Offline practice needs HTTPS or localhost';
    status.dataset.state = 'unavailable';
    return;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    finishUpdate();
    if (!applying && !reloadPending) checkReady().catch(() => {});
  });
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    const watchInstalling = () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') render();
        if (worker.state === 'redundant' && !ready) { unavailable = true; render(); }
      });
    };
    registration.addEventListener('updatefound', watchInstalling);
    watchInstalling();
    render();
    await navigator.serviceWorker.ready;
    await checkReady();
    if (!ready && navigator.onLine) await checkReady(true);
  } catch {
    unavailable = !ready;
    render();
  }
}
