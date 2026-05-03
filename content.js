/**
 * Stay — predict before you read
 *
 * Targets claude.ai. When an assistant message lands, blur it and prompt
 * the user to write a one-line prediction first. Reveal lifts the blur,
 * pins the prediction above the response, and offers a calibration tap
 * (Knew it / Partial / Surprised).
 *
 * Tab-switch detection: if the user leaves while a response is forming,
 * on return show "you stepped away mid-thought — anything to add?" Always
 * skippable.
 *
 * Storage: chrome.storage.local. Schema:
 *   stay_predictions: [{ts, prediction, calibration, msgId}, ...]
 *   stay_settings: {enabled: bool}
 *
 * Selector strategy: claude.ai's DOM is React-rendered and class names can
 * shift between releases. We use multiple selector candidates in priority
 * order. The popup exposes attach status so the user can self-diagnose.
 */

(function () {
  'use strict';

  const NS = 'stay';
  const STORAGE_KEY_PREDS = 'stay_predictions';
  const STORAGE_KEY_SETTINGS = 'stay_settings';
  const STORAGE_KEY_DIAG = 'stay_diag';
  const PROCESSED_ATTR = 'data-stay-processed';

  // Candidate selectors for assistant messages on claude.ai, in priority order.
  // First match wins. The data-message-author-role kept for shared content
  // script compatibility with the demo page (which mimics ChatGPT-style attrs).
  const ASSISTANT_SELECTORS = [
    '[data-message-author-role="assistant"]',         // demo page + chatgpt fallback
    '[data-testid="assistant-message"]',              // possible Anthropic test attr
    '.font-claude-response',                          // claude.ai response wrapper (current)
    '.font-claude-message',                           // claude.ai stable class (legacy)
    '[class*="font-claude-message"]',                 // partial class match
    'div[class*="claude-message"]',                   // looser
    '[data-test-render-count]',                       // claude.ai render-tracking attr
  ];

  function findAssistantNodes(root = document) {
    const found = new Set();
    for (const sel of ASSISTANT_SELECTORS) {
      try {
        root.querySelectorAll(sel).forEach((n) => found.add(n));
        if (found.size) break; // first matching selector wins
      } catch (e) {}
    }
    return Array.from(found);
  }

  function nodeMatchesAssistant(node) {
    if (!(node instanceof Element)) return false;
    return ASSISTANT_SELECTORS.some((sel) => {
      try {
        return node.matches(sel);
      } catch (e) {
        return false;
      }
    });
  }

  // ---------- storage helpers ----------
  const storage = {
    async get(key, fallback) {
      try {
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          const r = await chrome.storage.local.get([key]);
          return r[key] ?? fallback;
        }
      } catch (e) {}
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    async set(key, value) {
      try {
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          await chrome.storage.local.set({ [key]: value });
          return;
        }
      } catch (e) {}
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {}
    },
  };

  async function appendPrediction(record) {
    const list = (await storage.get(STORAGE_KEY_PREDS, [])) || [];
    list.push(record);
    await storage.set(STORAGE_KEY_PREDS, list);
  }

  async function setDiag(state) {
    await storage.set(STORAGE_KEY_DIAG, { ...state, ts: Date.now() });
  }

  async function isEnabled() {
    const s = await storage.get(STORAGE_KEY_SETTINGS, { enabled: true });
    return s?.enabled !== false;
  }

  // ---------- DOM helpers ----------
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2), v);
      } else if (v !== false && v !== null && v !== undefined) {
        node.setAttribute(k, v);
      }
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  // ---------- core: attach Stay UI to an assistant message ----------
  function attachStay(messageNode) {
    if (messageNode.getAttribute(PROCESSED_ATTR) === '1') return;
    messageNode.setAttribute(PROCESSED_ATTR, '1');

    setDiag({ attached: true, lastSelector: 'matched', url: location.href });

    messageNode.classList.add(`${NS}-blurred`);

    const msgId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const headline = el('div', { class: `${NS}-headline` }, 'Predict before you read.');
    const sub = el(
      'div',
      { class: `${NS}-sub` },
      'One line is enough. The point is to sit with it before the answer arrives.'
    );

    const input = el('textarea', {
      class: `${NS}-input`,
      placeholder: "What do you think the answer is? Rough is fine.",
      rows: '2',
    });

    const reveal = el('button', { class: `${NS}-btn ${NS}-btn-primary`, type: 'button' }, 'Reveal');
    const skip = el('button', { class: `${NS}-btn ${NS}-btn-ghost`, type: 'button' }, 'Skip this one');
    const actions = el('div', { class: `${NS}-actions` }, reveal, skip);

    const panel = el(
      'div',
      { class: `${NS}-panel`, 'data-stay-msg': msgId },
      headline, sub, input, actions
    );

    messageNode.parentNode.insertBefore(panel, messageNode);
    setTimeout(() => { try { input.focus(); } catch (e) {} }, 60);

    const calBtn = (label, key, msgId, predictionText) => {
      const b = el('button', { class: `${NS}-cal-btn`, 'data-cal': key, type: 'button' }, label);
      b.addEventListener('click', async () => {
        const row = b.parentElement;
        if (row) row.querySelectorAll(`.${NS}-cal-btn`).forEach((x) => x.classList.remove(`${NS}-cal-active`));
        b.classList.add(`${NS}-cal-active`);
        await appendPrediction({ ts: Date.now(), msgId, prediction: predictionText, calibration: key });
        notifyMeterUpdate();
      });
      return b;
    };

    const doReveal = async (predictionText) => {
      const text = (predictionText || '').trim();
      const pinned = el(
        'div',
        { class: `${NS}-pinned`, 'data-stay-msg': msgId },
        el('div', { class: `${NS}-pin-label` }, 'Your prediction'),
        el(
          'div',
          { class: `${NS}-pin-text${text ? '' : ' ' + NS + '-pin-empty'}` },
          text || '(skipped)'
        ),
        el(
          'div',
          { class: `${NS}-cal-row` },
          el('span', { class: `${NS}-cal-q` }, 'How close?'),
          calBtn('Knew it', 'knew_it', msgId, text),
          calBtn('Partial', 'partial', msgId, text),
          calBtn('Surprised', 'surprised', msgId, text)
        )
      );
      panel.replaceWith(pinned);
      messageNode.classList.remove(`${NS}-blurred`);
      messageNode.classList.add(`${NS}-revealed`);
    };

    reveal.addEventListener('click', () => doReveal(input.value));
    skip.addEventListener('click', () => doReveal(''));
    input.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        doReveal(input.value);
      }
    });
  }

  // ---------- observer: watch for new assistant messages ----------
  function startObserving() {
    const seen = new WeakSet();

    const handle = (node) => {
      if (!(node instanceof Element)) return;
      if (seen.has(node)) return;
      seen.add(node);

      if (nodeMatchesAssistant(node)) {
        attachStay(node);
        return;
      }
      // Look for matching descendants
      for (const sel of ASSISTANT_SELECTORS) {
        try {
          node.querySelectorAll(sel).forEach((m) => {
            if (!seen.has(m)) {
              seen.add(m);
              attachStay(m);
            }
          });
        } catch (e) {}
      }
    };

    findAssistantNodes(document).forEach(handle);

    const obs = new MutationObserver((muts) => {
      isEnabled().then((on) => {
        if (!on) return;
        for (const m of muts) m.addedNodes.forEach(handle);
      });
    });

    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- tab-switch nudge ----------
  let leftMidThought = false;
  let lastStreamingAt = 0;

  function isAnyStreaming() {
    return Date.now() - lastStreamingAt < 4000;
  }

  function watchStreaming() {
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node instanceof Element && nodeMatchesAssistant(node)) {
            lastStreamingAt = Date.now();
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isAnyStreaming()) {
      leftMidThought = true;
    } else if (!document.hidden && leftMidThought) {
      leftMidThought = false;
      showTabSwitchNudge();
    }
  });

  function showTabSwitchNudge() {
    if (document.querySelector(`.${NS}-nudge`)) return;
    const nudge = el(
      'div',
      { class: `${NS}-nudge` },
      el('div', { class: `${NS}-nudge-text` }, 'You stepped away mid-thought. Anything to add before you read?'),
      el('button', { class: `${NS}-btn ${NS}-btn-ghost`, type: 'button', onclick: () => nudge.remove() }, 'Dismiss')
    );
    document.body.appendChild(nudge);
    setTimeout(() => nudge.remove(), 12000);
  }

  // ---------- meter widget ----------
  function notifyMeterUpdate() {
    window.dispatchEvent(new CustomEvent(`${NS}-meter-update`));
  }

  async function renderMeter() {
    if (document.querySelector(`.${NS}-meter`)) return;

    const meter = el('div', { class: `${NS}-meter`, title: 'Stay — your growth signal' });
    document.body.appendChild(meter);

    const update = async () => {
      const list = (await storage.get(STORAGE_KEY_PREDS, [])) || [];
      const now = Date.now();
      const windowMs = 7 * 24 * 60 * 60 * 1000;
      const last7 = list.filter((p) => now - p.ts < windowMs);
      const surprised = last7.filter((p) => p.calibration === 'surprised').length;
      const total = last7.length;
      const pct = total ? Math.round((surprised / total) * 100) : 0;

      meter.innerHTML = '';
      meter.appendChild(
        el(
          'div',
          { class: `${NS}-meter-row` },
          el('span', { class: `${NS}-meter-num` }, String(total)),
          el('span', { class: `${NS}-meter-lbl` }, total === 1 ? 'prediction · 7d' : 'predictions · 7d')
        )
      );
      meter.appendChild(
        el(
          'div',
          { class: `${NS}-meter-row ${NS}-meter-row-2` },
          el('span', { class: `${NS}-meter-pct` }, `${pct}%`),
          el('span', { class: `${NS}-meter-lbl` }, 'surprised — your growth signal')
        )
      );
    };

    window.addEventListener(`${NS}-meter-update`, update);
    update();
  }

  // ---------- bootstrap ----------
  function init() {
    setDiag({ attached: false, url: location.href, loaded: true });
    isEnabled().then((on) => {
      if (!on) return;
      startObserving();
      watchStreaming();
      renderMeter();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
