/* Remove Ellipsis v1.4.0 – safe for Markdown and theme colors
 * - ลบ "..." / ".." (ถ้าเปิดตัวเลือก) / "…"
 * - ข้ามส่วนโค้ด Markdown (```block``` และ `inline`)
 * - ปุ่ม "Remove …" (ลบย้อนหลัง), Toggle "Auto Remove", Toggle "ลบ .. ด้วย"
 * - Toast แจ้งผล + Overlay highlight (ไม่แตะสไตล์ของธีม)
 * - Soft refresh ด้วย renderChat/CHAT_CHANGED/saveChat
 * - Hook input ฝั่งผู้ใช้ (Enter/ปุ่ม/submit) ให้ลบก่อนส่งจริง
 */
(() => {
  if (window.__REMOVE_ELLIPSIS_EXT_LOADED__) return;
  window.__REMOVE_ELLIPSIS_EXT_LOADED__ = true;

  const MODULE = 'removeEllipsisExt';
  const DEFAULTS = {
    autoRemove: false,
    treatTwoDots: true,
    highlight: 'overlay'
  };

  // ----------------- Context helpers -----------------
  function getCtx() {
    try { return window.SillyTavern?.getContext?.() || null; } catch (_) { return null; }
  }
  function ensureSettings() {
    const ctx = getCtx();
    if (!ctx) return structuredClone(DEFAULTS);
    const { extensionSettings } = ctx;
    if (!extensionSettings[MODULE]) extensionSettings[MODULE] = {};
    for (const k of Object.keys(DEFAULTS)) {
      if (!(k in extensionSettings[MODULE])) extensionSettings[MODULE][k] = DEFAULTS[k];
    }
    return extensionSettings[MODULE];
  }
  function saveSettings() {
    const ctx = getCtx();
    if (!ctx) return;
    (ctx.saveSettingsDebounced || ctx.saveSettings || (()=>{})).call(ctx);
  }

  // ----------------- Feedback UI -----------------
  function ensureFeedbackUI() {
    if (document.getElementById('rm-ellipsis-toast')) return;
    const style = document.createElement('style');
    style.textContent = `
      #rm-ellipsis-toast {
        position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
        padding: 8px 12px; background: rgba(0,0,0,.8); color: #fff; border-radius: 10px;
        font-size: 12px; z-index: 99999; opacity: 0; transition: opacity .2s ease;
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
    const settings = ensureSettings();
    if (settings.highlight === 'none' || !node || node.nodeType !== 1) return;
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

  // ----------------- Cleaner -----------------
  function cleanOutsideCode(text, treatTwoDots) {
    if (typeof text !== 'string' || !text) return { text, removed: 0 };
    const blockRegex = /```[\s\S]*?```/g;
    const blocks = [];
    const skeleton1 = text.replace(blockRegex, m => {
      const key = `@@BLOCK${blocks.length}@@`;
      blocks.push(m);
      return key;
    });
    const inlineRegex = /`[^`]*`/g;
    const inlines = [];
    const skeleton2 = skeleton1.replace(inlineRegex, m => {
      const key = `@@INLINE${inlines.length}@@`;
      inlines.push(m);
      return key;
    });
    const ellipsisPattern = treatTwoDots
      ? /(?<!\d)\.{2,}(?!\d)|…/g
      : /\.{3,}|…/g;
    let removed = 0;
    const cleaned = skeleton2.replace(ellipsisPattern, (m) => {
      removed += m.length;
      return '';
    });
    const restoredInline = cleaned.replace(/@@INLINE(\d+)@@/g, (_, i) => inlines[Number(i)]);
    const restoredAll = restoredInline.replace(/@@BLOCK(\d+)@@/g, (_, i) => blocks[Number(i)]);
    return { text: restoredAll, removed };
  }

  function cleanMessageObject(msg) {
    if (!msg) return 0;
    const settings = ensureSettings();
    let total = 0;
    if (typeof msg.mes === 'string') {
      const r = cleanOutsideCode(msg.mes, !!settings.treatTwoDots);
      msg.mes = r.text; total += r.removed;
    }
    if (msg.extra) {
      if (typeof msg.extra.display_text === 'string') {
        const r = cleanOutsideCode(msg.extra.display_text, !!settings.treatTwoDots);
        msg.extra.display_text = r.text; total += r.removed;
      }
      if (typeof msg.extra.original === 'string') {
        const r = cleanOutsideCode(msg.extra.original, !!settings.treatTwoDots);
        msg.extra.original = r.text; total += r.removed;
      }
    }
    return total;
  }

  // ----------------- Refresh -----------------
  function forceUpdateUI() {
    const ctx = getCtx();
    try { ctx?.eventSource?.emit?.(ctx?.event_types?.CHAT_CHANGED, {}); } catch(_) {}
    try { if (typeof ctx?.renderChat === 'function') ctx.renderChat(); } catch(_) {}
    try { (ctx?.saveChat || (()=>{})).call(ctx); } catch(_) {}
    try { window.dispatchEvent(new Event('resize')); } catch(_) {}
  }
  function scheduleRefresh() {
    forceUpdateUI();
    requestAnimationFrame(() => forceUpdateUI());
    setTimeout(forceUpdateUI, 0);
    setTimeout(forceUpdateUI, 50);
    setTimeout(forceUpdateUI, 200);
  }

  // ----------------- Core actions -----------------
  function removeEllipsesFromChat() {
    const ctx = getCtx();
    let removedSum = 0;
    if (ctx?.chat?.forEach) {
      ctx.chat.forEach(msg => { removedSum += cleanMessageObject(msg); });
    }
    scheduleRefresh();
    const last = document.querySelector(
      '.mes:last-child .mes_text, .message:last-child .message-text, .chat-message:last-child, .mes_markdown:last-child, .markdown:last-child'
    );
    overlayHighlight(last);
    toast(removedSum > 0 ? `ลบสัญลักษณ์แล้ว ${removedSum} ตัว` : 'ไม่มี … ให้ลบ');
  }

  // ----------------- UI -----------------
  function addUI() {
    if (document.querySelector('#remove-ellipsis-ext__container')) return;
    const candidates = [
      '.chat-input-container','.input-group','.send-form','#send_form',
      '.chat-controls','.st-user-input'
    ];
    let mount = candidates.map(s=>document.querySelector(s)).find(Boolean) || document.body;
    const box = document.createElement('div');
    box.id = 'remove-ellipsis-ext__container';
    box.style.display = 'flex'; box.style.alignItems = 'center';
    box.style.gap = '8px'; box.style.margin = '6px 0';

    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = 'Remove …';
    btn.title = 'ลบ .../.. / … จากบทสนทนาทั้งหมด';
    btn.style.padding = '6px 10px'; btn.style.borderRadius = '8px';
    btn.style.border = '1px solid var(--border-color,#ccc)'; btn.style.cursor = 'pointer';
    btn.addEventListener('click', removeEllipsesFromChat);

    const label = document.createElement('label');
    label.style.display = 'inline-flex'; label.style.alignItems = 'center'; label.style.gap = '6px';
    label.style.cursor = 'pointer';
    const chk = document.createElement('input'); chk.type = 'checkbox';
    chk.checked = !!ensureSettings().autoRemove;
    chk.addEventListener('change', ()=>{ ensureSettings().autoRemove = chk.checked; saveSettings(); toast(chk.checked ? 'Auto Remove: ON' : 'Auto Remove: OFF'); });
    const span = document.createElement('span'); span.textContent = 'Auto Remove';
    label.append(chk, span);

    const label2 = document.createElement('label');
    label2.style.display = 'inline-flex'; label2.style.alignItems = 'center'; label2.style.gap = '6px';
    label2.style.cursor = 'pointer';
    const chk2 = document.createElement('input'); chk2.type = 'checkbox';
    chk2.checked = !!ensureSettings().treatTwoDots;
    chk2.addEventListener('change', ()=>{ ensureSettings().treatTwoDots = chk2.checked; saveSettings(); toast(`ลบ "..": ${chk2.checked ? 'ON' : 'OFF'}`); });
    const span2 = document.createElement('span'); span2.textContent = 'ลบ ".." ด้วย';
    label2.append(chk2, span2);

    box.append(btn, label, label2);

    if (mount === document.body) {
      box.style.position = 'fixed'; box.style.bottom = '12px'; box.style.right = '12px'; box.style.zIndex = '9999';
      document.body.appendChild(box);
    } else {
      mount.appendChild(box);
    }
  }

  // ----------------- Outgoing hook -----------------
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
    const settings = ensureSettings();
    const current = ('value' in el) ? el.value : el.textContent;
    const r = cleanOutsideCode(current, !!settings.treatTwoDots);
    if (r.removed > 0) {
      if ('value' in el) el.value = r.text; else el.textContent = r.text;
      const evOpts = { bubbles: true, cancelable: false };
      el.dispatchEvent(new Event('input', evOpts));
      el.dispatchEvent(new Event('change', evOpts));
    }
    return r.removed;
  }
  function hookOutgoingInput() {
    if (hookOutgoingInput._done) return;
    hookOutgoingInput._done = true;
    const form = document.querySelector('form.send-form, #send_form, form');
    if (form) {
      form.addEventListener('submit', () => {
        const removed = sanitizeCurrentInput();
        if (removed) { toast(`ลบ … ออกจากข้อความที่ส่ง (${removed})`); scheduleRefresh(); }
      }, true);
    }
    const sendBtn = document.querySelector('.send-button, button[type="submit"], #send_but, .st-send');
    if (sendBtn) {
      sendBtn.addEventListener('mousedown', () => {
        const removed = sanitizeCurrentInput();
        if (removed) { toast(`ลบ … ออกจากข้อความที่ส่ง (${removed})`); scheduleRefresh(); }
      }, true);
    }
    const inputEl = getInputEl();
    if (inputEl) {
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing) {
          const removed = sanitizeCurrentInput();
          if (removed) { toast(`ลบ … ออกจากข้อความที่ส่ง (${removed})`); scheduleRefresh(); }
        }
      }, true);
    }
  }

  // ----------------- Boot -----------------
  (function boot() {
    ensureSettings();
    const ok = (getCtx()?.eventSource) ? true : false;
    if (!ok) setTimeout(addUI, 1000);
    hookOutgoingInput(); // สำคัญ! ทำให้ฝั่งส่งโดนล้างจริง
    setTimeout(addUI, 1000);
  })();
})();
