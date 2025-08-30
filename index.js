/* Remove Ellipsis v1.3.0 – safe for Markdown and theme colors
 * - ลบ "..." / ".." (ออปชั่น) / "…" ทั้งฝั่งผู้ใช้และ AI
 * - ข้ามส่วนโค้ด Markdown (```block``` และ `inline`)
 * - ปุ่ม "Remove …" (ลบย้อนหลัง), Toggle "Auto Remove"
 * - Toast แจ้งผล + "overlay highlight" (ไม่แตะสี/สไตล์ของธีม)
 * - Soft refresh ด้วย renderChat/CHAT_CHANGED/saveChat
 */
(() => {
  if (window.__REMOVE_ELLIPSIS_EXT_LOADED__) return;
  window.__REMOVE_ELLIPSIS_EXT_LOADED__ = true;

  const MODULE = 'removeEllipsisExt';
  const DEFAULTS = {
    autoRemove: false,
    treatTwoDots: true,     // ลบ ".." ด้วยหรือไม่ (ดีฟอลต์: ลบ)
    highlight: 'overlay'    // 'overlay' | 'none'
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
  // ไม่แตะคลาสของข้อความ → ใช้ overlay แทน
  function overlayHighlight(node) {
    const settings = ensureSettings();
    if (settings.highlight === 'none' || !node || node.nodeType !== 1) return;
    const rectParent = node.getBoundingClientRect();
    // สร้าง container relative ชั่วคราว
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

  // ----------------- Cleaner (safe for Markdown) -----------------
  // ลบ ellipsis เฉพาะ "นอกโค้ด" (```block``` และ `inline` จะถูกข้าม)
  function cleanOutsideCode(text, treatTwoDots) {
    if (typeof text !== 'string' || !text) return { text, removed: 0 };

    // แยกส่วนโค้ดบล็อก ```...``` ออกมาก่อน
    const blockRegex = /```[\s\S]*?```/g;
    const blocks = [];
    const skeleton1 = text.replace(blockRegex, m => {
      const key = `@@BLOCK${blocks.length}@@`;
      blocks.push(m);
      return key;
    });
    
    // แยก inline code `...`
    const inlineRegex = /`[^`]*`/g;
    const inlines = [];
    const skeleton2 = skeleton1.replace(inlineRegex, m => {
      const key = `@@INLINE${inlines.length}@@`;
      inlines.push(m);
      return key;
    });

    // เลือกแพทเทิร์นลบ
    // - รองรับ "…" เสมอ
    // - ถ้า treatTwoDots=true: ลบลำดับจุดตั้งแต่ 2 ตัวขึ้นไป ยกเว้นบริบทเป็นตัวเลขชิดซ้าย/ขวา
    //   ใช้ (?<!\\d) \\.{2,} (?!\\d) เพื่อลดผลข้างเคียงกับเวอร์ชันเลข, IP ฯลฯ
    // - ถ้า treatTwoDots=false: ลบเฉพาะ \\.{3,} และ …
    const ellipsisPattern = treatTwoDots
      ? /(?<!\d)\.{2,}(?!\d)|…/g
      : /\.{3,}|…/g;

    let removed = 0;
    const cleaned = skeleton2.replace(ellipsisPattern, (m) => {
      removed += m.length;
      return '';
    });

    // ใส่ inline code กลับ
    const restoredInline = cleaned.replace(/@@INLINE(\d+)@@/g, (_, i) => inlines[Number(i)]);
    // ใส่ block code กลับ
    const restoredAll = restoredInline.replace(/@@BLOCK(\d+)@@/g, (_, i) => blocks[Number(i)]);

    return { text: restoredAll, removed };
  }

  // ====== HOOK: ล้างฝั่ง "ผู้ใช้ส่ง" ให้ชัวร์ก่อน ST จะอ่านค่า ======
function getInputEl() {
  // รองรับทั้ง textarea และ contenteditable บางธีม
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

  // ดึงข้อความปัจจุบันจากอินพุต
  const current = ('value' in el) ? el.value : el.textContent;
  const r = cleanOutsideCode(current, !!settings.treatTwoDots);

  // เขียนค่าคืนกลับไปที่อินพุต (ก่อนส่ง)
  if (r.removed > 0) {
    if ('value' in el) el.value = r.text;
    else el.textContent = r.text;
  }
  return r.removed;
}

function hookOutgoingInput() {
  if (hookOutgoingInput._done) return;
  hookOutgoingInput._done = true;

  // 1) ดัก submit ฟอร์ม (capture = true เพื่อให้มาก่อน handler อื่น)
  const form = document.querySelector('form.send-form, #send_form, form');
  if (form) {
    form.addEventListener('submit', () => {
      const removed = sanitizeCurrentInput();
      if (removed) toast(`ลบ … ออกจากข้อความที่ส่ง (${removed})`);
    }, true);
  }

  // 2) ดักปุ่มส่ง (ถ้ามีปุ่ม)
  const sendBtn = document.querySelector('.send-button, button[type="submit"], #send_but, .st-send');
  if (sendBtn) {
    sendBtn.addEventListener('mousedown', () => {
      const removed = sanitizeCurrentInput();
      if (removed) toast(`ลบ … ออกจากข้อความที่ส่ง (${removed})`);
    }, true);
  }

  // 3) ดัก Enter (กรณีส่งด้วย Enter)
  const inputEl = getInputEl();
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      const isEnter = e.key === 'Enter';
      const isSending = isEnter && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
      const composing = e.isComposing; // IME ญี่ปุ่น/จีน
      if (isEnter && composing) return; // อย่ารบกวน IME
      if (isSending) {
        const removed = sanitizeCurrentInput();
        if (removed) toast(`ลบ … ออกจากข้อความที่ส่ง (${removed})`);
      }
    }, true);
  }

  // 4) ดัก paste/drop (ถ้าวางข้อความยาว ๆ มี “…”)
  ['paste', 'drop'].forEach(evt => {
    (inputEl || document).addEventListener(evt, () => {
      // หน่วงนิดให้ค่าถูกใส่ลงอินพุตก่อน แล้วค่อย sanitize
      setTimeout(() => sanitizeCurrentInput(), 0);
    }, true);
  });
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

  // ----------------- Re-render -----------------
  function reRenderAll() {
    const ctx = getCtx();
    try {
      if (typeof ctx?.renderChat === 'function') {
        ctx.renderChat();
        return true;
      }
      ctx?.eventSource?.emit?.(ctx?.event_types?.CHAT_CHANGED, {});
      if (typeof ctx?.saveChat === 'function') {
        ctx.saveChat();
        return true;
      }
    } catch(_) {}
    return false;
  }
  function softRefreshChat() {
    const ok = reRenderAll();
    try { window.requestAnimationFrame(()=> window.dispatchEvent(new Event('resize'))); } catch(_) {}
    return ok;
  }

  // ----------------- Core actions -----------------
  function removeEllipsesFromChat() {
    const ctx = getCtx();
    let removedSum = 0;

    if (ctx?.chat?.forEach) {
      ctx.chat.forEach(msg => { removedSum += cleanMessageObject(msg); });
    }

    const refreshed = softRefreshChat();
    if (refreshed) {
      const last = document.querySelector(
        '.mes:last-child .mes_text, .message:last-child .message-text, .chat-message:last-child, .mes_markdown:last-child, .markdown:last-child'
      );
      overlayHighlight(last);
    }
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

    // ปุ่มลบ
    const btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = 'Remove …';
    btn.title = 'ลบ .../.. / … จากบทสนทนาทั้งหมด (ปลอดภัยต่อ Markdown)';
    btn.style.padding = '6px 10px'; btn.style.borderRadius = '8px';
    btn.style.border = '1px solid var(--border-color,#ccc)'; btn.style.cursor = 'pointer';
    btn.addEventListener('click', removeEllipsesFromChat);

    // Toggle auto
    const label = document.createElement('label');
    label.style.display = 'inline-flex'; label.style.alignItems = 'center'; label.style.gap = '6px';
    label.style.cursor = 'pointer';
    const chk = document.createElement('input'); chk.type = 'checkbox'; chk.id = 'remove-ellipsis-ext__auto';
    const settings = ensureSettings(); chk.checked = !!settings.autoRemove;
    chk.addEventListener('change', ()=>{ settings.autoRemove = chk.checked; saveSettings(); toast(settings.autoRemove ? 'Auto Remove: ON' : 'Auto Remove: OFF'); });
    const span = document.createElement('span'); span.textContent = 'Auto Remove';
    label.append(chk, span);

    // Toggle ลบ ".." ด้วยไหม
    const label2 = document.createElement('label');
    label2.style.display = 'inline-flex'; label2.style.alignItems = 'center'; label2.style.gap = '6px';
    label2.style.cursor = 'pointer';
    const chk2 = document.createElement('input'); chk2.type = 'checkbox'; chk2.id = 'remove-ellipsis-ext__twodots';
    chk2.checked = !!settings.treatTwoDots;
    chk2.addEventListener('change', ()=>{ settings.treatTwoDots = chk2.checked; saveSettings(); toast(`ลบ "..": ${settings.treatTwoDots ? 'ON' : 'OFF'}`); });
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

  // ----------------- Wiring (Event API) -----------------
  function wireWithEvents() {
    const ctx = getCtx(); if (!ctx) return false;
    const { eventSource, event_types } = ctx || {};
    if (!eventSource || !event_types) return false;

    eventSource.on?.(event_types.MESSAGE_SENT, (p) => {
      if (!p) return;
      const settings = ensureSettings();
      let removed = 0;
      if (typeof p.message === 'string') { const r = cleanOutsideCode(p.message, !!settings.treatTwoDots); p.message = r.text; removed += r.removed; }
      if (typeof p.mes === 'string')     { const r = cleanOutsideCode(p.mes,     !!settings.treatTwoDots); p.mes     = r.text; removed += r.removed; }
      if (removed) { toast(`ลบ … ออกจากข้อความที่ส่ง (${removed})`); softRefreshChat(); }
    });

    eventSource.on?.(event_types.MESSAGE_RECEIVED, (p) => {
      const settings = ensureSettings();
      if (!p || !settings.autoRemove) return;
      let removed = 0;
      if (typeof p.message === 'string') { const r = cleanOutsideCode(p.message, !!settings.treatTwoDots); p.message = r.text; removed += r.removed; }
      if (typeof p.mes === 'string')     { const r = cleanOutsideCode(p.mes,     !!settings.treatTwoDots); p.mes     = r.text; removed += r.removed; }
      if (removed) {
        toast(`ลบ … จากข้อความ AI (${removed})`);
        const ok = softRefreshChat();
        if (ok) {
          const last = document.querySelector(
            '.mes:last-child .mes_text, .message:last-child .message-text, .chat-message:last-child, .mes_markdown:last-child, .markdown:last-child'
          );
          overlayHighlight(last);
        }
      }
    });

    if (event_types.APP_READY) {
  eventSource.on(event_types.APP_READY, () => {
    addUI();
    hookOutgoingInput(); // <--- เพิ่มตรงนี้ก็ได้
  });
    } else {
      document.addEventListener('DOMContentLoaded', addUI, { once: true });
      setTimeout(addUI, 800);
    }
    return true;
  }

  // ----------------- Fallback (no Event API) -----------------
  function wireWithFallback() {
    const tryHookForm = () => {
      const form = document.querySelector('form.send-form, #send_form, form');
      if (!form || form.__ellipsis_hooked) return !!form;
      form.__ellipsis_hooked = true;
      form.addEventListener('submit', () => {
        const ta = document.querySelector('textarea, .chat-input textarea');
        if (ta) {
          const r = cleanOutsideCode(ta.value, !!ensureSettings().treatTwoDots);
          ta.value = r.text;
          if (r.removed) { toast(`ลบ … ออกจากข้อความที่ส่ง (${r.removed})`); softRefreshChat(); }
        }
      }, true);
      return true;
    };

    // ไม่แก้ HTML ที่เรนเดอร์แล้ว — แค่ยืนยันให้ re-render จาก raw
    const mo = new MutationObserver(() => {
      if (ensureSettings().autoRemove) softRefreshChat();
    });

    const startObserver = () => {
      const chat = document.querySelector('#chat, .mes, .chat, .dialogues');
      if (!chat) return false;
      mo.observe(chat, { childList: true, subtree: true });
      return true;
    };

    const tick = () => {
      const a = tryHookForm();
      const b = startObserver();
      if (!(a && b)) setTimeout(tick, 500);
    };
    document.addEventListener('DOMContentLoaded', () => { addUI(); tick(); });
    setTimeout(()=>{ addUI(); tick(); }, 800);
  }

  // ----------------- Boot -----------------
  (function boot() {
    ensureSettings();
    const ok = wireWithEvents();
    if (!ok) wireWithFallback();
    hookOutgoingInput();
    
    setTimeout(addUI, 1000);
  })();
})();
