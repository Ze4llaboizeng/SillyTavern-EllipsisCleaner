/* Remove Ellipsis — ui.js (buttons, toggles, toast, overlay, hooks, actions) */
(() => {
  const core = window.RemoveEllipsis?.core;
  const cleaner = window.RemoveEllipsis?.cleaner;
  const refresh = window.RemoveEllipsis?.refresh;
  if (!core || !cleaner || !refresh) return console.warn('[RemoveEllipsis] missing modules for ui');

  const { getCtx, ensureSettings, saveSettings } = core;
  const { cleanMessageObject } = cleaner;
  const { refreshChatUIAndWait } = refresh;

  // ---------- Toast & Overlay ----------
  function ensureFeedbackUI() {
    if (document.getElementById('rm-ellipsis-toast')) return;
    const style = document.createElement('style');
    style.textContent = `
      #rm-ellipsis-toast {
        position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
        padding: 8px 12px; background: rgba(0,0,0,.85); color: #fff; border-radius: 10px;
        font-size: 12px; z-index: 99999; opacity: 0; transition: opacity .18s ease;
        pointer-events: none;
      }
      .rm-ellipsis-overlay {
        position: absolute; border-radius: 6px; inset: 0;
        box-shadow: 0 0 0 2px rgba(255,200,0,.75);
        animation: rmEllPulse 900ms ease 1;
        pointer-events: none;
      }
      @keyframes rmEllPulse {
        0% { box-shadow: 0 0 0 3px rgba(255,200,0,.85); }
        100% { box-shadow: 0 0 0 0 rgba(255,200,0,0); }
      }
    `;
    document.head.appendChild(style);
    const toast = document.createElement('div');
    toast.id = 'rm-ellipsis-toast';
    document.body.appendChild(toast);
  }
  function toast(msg) {
    ensureFeedbackUI();
    const el = document.getElementById('rm-ellipsis-toast');
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(()=>{ el.style.opacity = '0'; }, 1200);
  }
  function overlayHighlight(node) {
    const st = ensureSettings();
    if (st.highlight === 'none' || !node || node.nodeType !== 1) return;
    const anchor = node;
    const prevPos = getComputedStyle(anchor).position;
    if (prevPos === 'static') anchor.style.position = 'relative';
    const ov = document.createElement('div');
    ov.className = 'rm-ellipsis-overlay';
    anchor.appendChild(ov);
    setTimeout(() => {
      ov.remove();
      if (prevPos === 'static') anchor.style.position = '';
    }, 900);
  }

  // ---------- Input Hook (ฝั่งผู้ใช้ส่ง) ----------
  function getInputEl() {
    return (
      document.querySelector('textarea, .chat-input textarea') ||
      document.querySelector('[contenteditable="true"].chat-input, .st-user-input [contenteditable="true"]') ||
      null
    );
  }
  function sanitizeCurrentInput() {
    const el = getInputEl();
    if (!el) return 0;
    const st = ensureSettings();
    const val = ('value' in el) ? el.value : el.textContent;
    const r = window.RemoveEllipsis.cleaner.cleanOutsideCode(val, st.treatTwoDots);
    if (r.removed > 0) {
      if ('value' in el) el.value = r.text; else el.textContent = r.text;
      const ev = { bubbles: true, cancelable: false };
      el.dispatchEvent(new Event('input', ev));
      el.dispatchEvent(new Event('change', ev));
      el.dispatchEvent(new KeyboardEvent('ke
