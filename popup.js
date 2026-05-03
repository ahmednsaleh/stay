(async () => {
  const KEY_PREDS = 'stay_predictions';
  const KEY_SETTINGS = 'stay_settings';

  const get = (k, fallback) =>
    new Promise((r) => {
      try {
        chrome.storage.local.get([k], (out) => r(out[k] ?? fallback));
      } catch (e) {
        r(fallback);
      }
    });
  const set = (k, v) =>
    new Promise((r) => {
      try {
        chrome.storage.local.set({ [k]: v }, r);
      } catch (e) {
        r();
      }
    });

  const list = (await get(KEY_PREDS, [])) || [];
  const settings = (await get(KEY_SETTINGS, { enabled: true })) || { enabled: true };

  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const last7 = list.filter((p) => now - p.ts < week);
  const surprised = last7.filter((p) => p.calibration === 'surprised').length;
  const pct = last7.length ? Math.round((surprised / last7.length) * 100) : 0;

  document.getElementById('count').textContent = String(last7.length);
  document.getElementById('surprised').textContent = `${pct}%`;

  const recent = document.getElementById('recent');
  if (!list.length) {
    recent.innerHTML = `<div class="empty-state">No predictions yet.<br/>Open ChatGPT and ask something.</div>`;
  } else {
    const fmtAgo = (ts) => {
      const m = Math.floor((now - ts) / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    };
    const labelFor = (k) => ({ knew_it: 'Knew it', partial: 'Partial', surprised: 'Surprised' }[k] || '—');

    recent.innerHTML = list
      .slice(-12)
      .reverse()
      .map((p) => {
        const txt = p.prediction
          ? p.prediction.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))
          : '';
        return `
          <div class="pred">
            <div class="pred-text${txt ? '' : ' empty'}">${txt || '(skipped)'}</div>
            <div class="pred-meta">
              <span>${fmtAgo(p.ts)}</span>
              <span class="cal-tag cal-${p.calibration}">${labelFor(p.calibration)}</span>
            </div>
          </div>`;
      })
      .join('');
  }

  const toggle = document.getElementById('enabled');
  toggle.checked = settings.enabled !== false;
  toggle.addEventListener('change', async () => {
    await set(KEY_SETTINGS, { enabled: toggle.checked });
  });
})();
