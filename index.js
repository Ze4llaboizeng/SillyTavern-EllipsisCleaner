/* Remove Ellipsis – safe for Markdown (new/old SillyTavern)
 * คุณสมบัติ:
 * - ลบ "..." และ "…" จากข้อความทั้งฝั่งผู้ใช้และ AI
 * - ปุ่ม "Remove …" เพื่อทำความสะอาดย้อนหลัง
 * - Toggle "Auto Remove" เพื่อลบอัตโนมัติเมื่อมีข้อความใหม่
 * - Toast แจ้งผล + ไฮไลต์ข้อความที่ถูกแก้ + softRefreshChat() ให้ UI รีเฟรชแบบนุ่ม
 * - ที่สำคัญ: "ไม่แก้ HTML ที่เรนเดอร์แล้ว" เพื่อไม่ให้ Markdown เพี้ยน
 */
(() => {
  if (window.__REMOVE_ELLIPSIS_EXT_LOADED__) return;
  window.__REMOVE_ELLIPSIS_EXT_LOADED__ = true;

  const MODULE = 'removeEllipsisExt';
  const DEFAULTS = { autoRemove: false };

  // ----------------- Context helpers -----------------
  function getCtx() {
    try { return window.SillyTavern?.getContext?.() || null; } catch (_) { return null; }
  }
  function ensureSettings() {
    const ctx = getCtx();
    if (!ctx) return DEFAULTS;
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
      .rm-ellipsis-flash {
        animation: rmEllFlash 900ms ease;
        outline: 2px solid rgba(255,200,0,.7);
        outline-offset: 2px;
        border-radius: 6px;
      }
      @keyframes rmEllFlash {
        0% { background: rgba(255,230,140,.5); }
        100% { background: transparent; }
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
  function flashNode(node) {
    if (!node) return;
    node.classList.add('rm-ellipsis-flash');
    setTimeout(()=> node.classList.remove('rm-ellipsis-flash'), 900);
  }

  // ----------------- Cleaner (safe for Markdown) -----------------
  // คืนค่า {text, removed} เพื่อใช้แสดง feedback
  function cleanText(t) {
    if (typeof t !== 'string') return { text: t, removed: 0 };
    const before = t;
    let out = t.replace(/\.\.\./g, '').replace(/…/g, '');
    out = out.replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
    const removed = Math.max(0, before.length - out.length);
    return { text: out, removed };
  }
  function cleanMessageObject(msg) {
    if (!msg) return 0;
    let total = 0;
    if (typeof msg.mes === 'string') {
      const r = cleanText(msg.mes);
      msg.mes = r.text; total += r.removed;
    }
    if (msg.extra) {
      if (typeof msg.extra.display_text === 'string') {
        const r = cleanText(msg.extra.display_text);
        msg.extra.display_text = r.text; total += r.removed;
      }
      if (typeof msg.extra.original === 'string') {
        const r = cleanText(msg.extra.original);
        msg.extra.original = r.text; total += r.removed;
      }
    }
    return total;
  }

  // ----------------- Re-render (ไม่ทำลาย Markdown) -----------------
  function reRenderAll() {
    const ctx = getCtx();
    try {
      if (typeof ctx?.renderChat === 'function') { // ตัวเรนเดอร์ใน build ใหม่ ๆ
        ctx.renderChat();
        return true;
      }
      // บาง build จะ re-render เองเมื่อ emit / save
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

    // 1) แก้ในแหล่งข้อมูล (raw) เท่านั้น
    if (ctx?.chat?.forEach) {
      ctx.chat.forEach(msg => { removedSum += cleanMessageObject(msg); });
    }

    // 2) re-render จาก raw ใหม่ (Markdown ปลอดภัย)
    const refreshed = softRefreshChat();

    // 3) ไฮไลต์บับล่าสุดเพื่อ feedback สายตา
    if (refreshed) {
      const last = document.querySelector(
        '.mes:last-child .mes_text, .message:last-child .message-text, .chat-message:last-child, .mes_markdown:last-child, .markdown:last-child'
      );
      if (last) flashNode(last);
    }

    // 4) Toast
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
    btn.title = 'ลบ .../… จากบทสนทนาทั้งหมด (ปลอดภัยต่อ Markdown)';
    btn.style.padding = '6px 10px'; btn.style.borderRadius = '8px';
    btn.style.border = '1px solid var(--border-color,#ccc)'; btn.style.cursor = 'pointer';
    btn.addEventListener('click', removeEllipsesFromChat);

    const label = document.createElement('label');
    label.style.display = 'inline-flex'; label.style.alignItems = 'center'; label.style.gap = '6px';
    label.style.cursor = 'pointer';
    const chk = document.createElement('input'); chk.type = 'checkbox'; chk.id = 'remove-ellipsis-ext__auto';
    const settings = ensureSettings(); chk.checked = !!settings.autoRemove;
    chk.addEventListener('change', ()=>{ settings.autoRemove = chk.checked; saveSettings(); toast(settings.autoRemove ? 'Auto Remove: ON' : 'Auto Remove: OFF'); });

    const span = document.createElement('span'); span.textContent = 'Auto Remove';
    label.append(chk, span);

    box.append(btn, label);

    if (mount === document.body) {
      box.style.position = 'fixed'; box.style.bottom = '12px'; box.style.right = '12px'; box.style.zIndex = '9999';
      document.body.appendChild(box);
    } else {
      mount.appendChild(box);
    }
  }

  // ----------------- Wiring (new API if present) -----------------
  function wireWithEvents() {
    const ctx = getCtx(); if (!ctx) return false;
    const { eventSource, event_types } = ctx || {};
    if (!eventSource || !event_types) return false;

    // ผู้ใช้ส่งข้อความ -> ลบ "…" จาก raw ก่อนเรนเดอร์
    eventSource.on?.(event_types.MESSAGE_SENT, (p) => {
      if (!p) return;
      let removed = 0;
      if (typeof p.message === 'string') { const r = cleanText(p.message); p.message = r.text; removed += r.removed; }
      if (typeof p.mes === 'string')     { const r = cleanText(p.mes);     p.mes     = r.text; removed += r.removed; }
      if (removed) { toast(`ลบ … ออกจากข้อความที่ส่ง (${removed})`); softRefreshChat(); }
    });

    // AI ส่งข้อความ -> ถ้าเปิด Auto Remove ให้ลบ "…" จาก raw ก่อนเรนเดอร์
    eventSource.on?.(event_types.MESSAGE_RECEIVED, (p) => {
      const settings = ensureSettings();
      if (!p || !settings.autoRemove) return;
      let removed = 0;
      if (typeof p.message === 'string') { const r = cleanText(p.message); p.message = r.text; removed += r.removed; }
      if (typeof p.mes === 'string')     { const r = cleanText(p.mes);     p.mes     = r.text; removed += r.removed; }
      if (removed) {
        toast(`ลบ … จากข้อความ AI (${removed})`);
        const ok = softRefreshChat();
        if (ok) {
          const last = document.querySelector(
            '.mes:last-child .mes_text, .message:last-child .message-text, .chat-message:last-child, .mes_markdown:last-child, .markdown:last-child'
          );
          flashNode(last);
        }
      }
    });

    // เมื่อแอปพร้อม ให้ใส่ UI
    if (event_types.APP_READY) {
      eventSource.on(event_types.APP_READY, addUI);
    } else {
      document.addEventListener('DOMContentLoaded', addUI, { once: true });
      setTimeout(addUI, 800);
    }
    return true;
  }

  // ----------------- Fallback (no Event API) -----------------
  // หมายเหตุ: โหมด fallback จะ "ไม่แก้ HTML ตรง ๆ" เช่นกัน
  function wireWithFallback() {
    const tryHookForm = () => {
      const form = document.querySelector('form.send-form, #send_form, form');
      if (!form || form.__ellipsis_hooked) return !!form;
      form.__ellipsis_hooked = true;
      form.addEventListener('submit', () => {
        const ta = document.querySelector('textarea, .chat-input textarea');
        if (ta) {
          const r = cleanText(ta.value);
          ta.value = r.text;
          if (r.removed) { toast(`ลบ … ออกจากข้อความที่ส่ง (${r.removed})`); softRefreshChat(); }
        }
      }, true);
      return true;
    };

    // แทนที่จะแก้ HTML ข้อความ AI ที่เพิ่งโผล่ ให้สั่ง re-render จาก raw
    const mo = new MutationObserver(() => {
      // ถ้าเปิด Auto Remove: ให้ logic ฝั่ง raw จัดการ (ถ้า build มี)
      // ที่นี่เราทำเพียง "ยืนยันการวาดใหม่" เพื่อไม่ยุ่ง HTML ตรง ๆ
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
    setTimeout(addUI, 1000); // เผื่อหน้าโหลดก่อน
  })();
})();
