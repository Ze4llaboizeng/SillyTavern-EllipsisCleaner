/* Remove Ellipsis — index.js (boot & wiring) */
(() => {
  if (window.__REMOVE_ELLIPSIS_EXT_LOADED__) return;
  window.__REMOVE_ELLIPSIS_EXT_LOADED__ = true;

  // ---------- Core & Namespace ----------
  const MODULE = 'removeEllipsisExt';
  const DEFAULTS = { autoRemove: false, treatTwoDots: true, highlight: 'overlay' };

  function getCtx() {
    try { return window.SillyTavern?.getContext?.() || null; } catch (_) { return null; }
  }
  function ensureSettings() {
    const ctx = getCtx();
    if (!ctx) return structuredClone(DEFAULTS);
    const store = ctx.extensionSettings || (ctx.extensionSettings = {});
    if (!store[MODULE]) store[MODULE] = {};
    for (const k of Object.keys(DEFAULTS)) if (!(k in store[MODULE])) store[MODULE][k] = DEFAULTS[k];
    return store[MODULE];
  }
  function saveSettings() {
    const ctx = getCtx();
    (ctx?.saveSettingsDebounced || ctx?.saveSettings || (()=>{})).call(ctx);
  }

  // Expose core to other files
  window.RemoveEllipsis = Object.assign(window.RemoveEllipsis || {}, {
    core: { MODULE, DEFAULTS, getCtx, ensureSettings, saveSettings }
  });

  // ---------- Loader (load sibling files relative to this script) ----------
  function getBasePath() {
    try {
      const tag = [...document.getElementsByTagName('script')]
        .find(s => s.src && s.src.endsWith('/index.js') && s.src.includes('RemoveEllipsis'));
      if (tag) return tag.src.slice(0, tag.src.lastIndexOf('/') + 1);
    } catch (_){}
    return ''; // ฟอลแบ็ก (หวังพึ่งเส้นทางสัมพัทธ์ของเว็บได้ในบางเซ็ตอัพ)
  }
  const BASE = getBasePath();
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = BASE + src;
      s.async = false;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  async function loadAll() {
    // โหลดตามลำดับให้แน่ใจว่า core พร้อมก่อน
    await loadScript('cleaner.js');
    await loadScript('refresh.js');
    await loadScript('ui.js');
  }

  // ---------- Wiring after modules loaded ----------
  function wireWithEvents() {
    const ctx = getCtx(); if (!ctx) return false;
    const { eventSource, event_types } = ctx || {};
    if (!eventSource || !event_types) return false;

    const { cleanOutsideCode } = window.RemoveEllipsis.cleaner;
    const { refreshChatUIAndWait } = window.RemoveEllipsis.refresh;
    const { addUI, hookOutgoingInput } = window.RemoveEllipsis.ui;
    const settings = ensureSettings();

    // ผู้ใช้ส่ง → ลบ raw ก่อน render แล้ว "รอ UI วาดเสร็จ" ค่อยโชว์ toast
    eventSource.on?.(event_types.MESSAGE_SENT, (p) => {
      (async () => {
        if (!p) return;
        const st = ensureSettings();
        let removed = 0;
        if (typeof p.message === 'string') { const r = cleanOutsideCode(p.message, st.treatTwoDots); p.message = r.text; removed += r.removed; }
        if (typeof p.mes === 'string')     { const r = cleanOutsideCode(p.mes,     st.treatTwoDots); p.mes     = r.text; removed += r.removed; }
        if (removed) await refreshChatUIAndWait(() => window.RemoveEllipsis.ui.toast(`ลบ … ${removed}`));
      })();
    });

    // AI ตอบ → ถ้าเปิด Auto Remove ให้ลบ + รอ UI วาดเสร็จ + ไฮไลต์/แจ้งผล
    eventSource.on?.(event_types.MESSAGE_RECEIVED, (p) => {
      (async () => {
        const st = ensureSettings();
        if (!p || !st.autoRemove) return;
        let removed = 0;
        if (typeof p.message === 'string') { const r = cleanOutsideCode(p.message, st.treatTwoDots); p.message = r.text; removed += r.removed; }
        if (typeof p.mes === 'string')     { const r = cleanOutsideCode(p.mes,     st.treatTwoDots); p.mes     = r.text; removed += r.removed; }
        if (removed) {
          await refreshChatUIAndWait(() => {
            const last = document.querySelector('.mes:last-child .mes_text, .message:last-child .message-text, .chat-message:last-child, .mes_markdown:last-child, .markdown:last-child');
            window.RemoveEllipsis.ui.overlayHighlight(last);
            window.RemoveEllipsis.ui.toast(`ลบ … ${removed}`);
          });
        }
      })();
    });

    if (event_types.APP_READY) {
      eventSource.on(event_types.APP_READY, () => { addUI(); hookOutgoingInput(); });
    } else {
      document.addEventListener('DOMContentLoaded', () => { addUI(); hookOutgoingInput(); }, { once: true });
      setTimeout(() => { addUI(); hookOutgoingInput(); }, 800);
    }
    return true;
  }

  function wireWithFallback() {
    const { addUI, hookOutgoingInput } = window.RemoveEllipsis.ui;
    document.addEventListener('DOMContentLoaded', () => { addUI(); hookOutgoingInput(); });
    setTimeout(() => { addUI(); hookOutgoingInput(); }, 800);
  }

  // ---------- Boot ----------
  (async function boot() {
    try { await loadAll(); } catch (e) { console.error('[RemoveEllipsis] module load failed', e); }
    window.RemoveEllipsis.core.ensureSettings();

    const ok = wireWithEvents();
    if (!ok) wireWithFallback();

    setTimeout(() => window.RemoveEllipsis.ui?.addUI?.(), 1000);
  })();
})();
