/* Remove Ellipsis – compatible with old/new ST */
(() => {
  if (window.__REMOVE_ELLIPSIS_EXT_LOADED__) return;
  window.__REMOVE_ELLIPSIS_EXT_LOADED__ = true;

  const MODULE = 'removeEllipsisExt';
  const DEFAULTS = { autoRemove: false };

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

  function cleanText(t) {
    if (typeof t !== 'string') return t;
    let out = t.replace(/\.\.\./g, '').replace(/…/g, '');
    out = out.replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
    return out;
  }
  function cleanMessageObject(msg) {
    if (!msg) return;
    if (typeof msg.mes === 'string') msg.mes = cleanText(msg.mes);
    if (msg.extra) {
      if (typeof msg.extra.display_text === 'string') msg.extra.display_text = cleanText(msg.extra.display_text);
      if (typeof msg.extra.original === 'string') msg.extra.original = cleanText(msg.extra.original);
    }
  }
  function removeEllipsesFromChat() {
    const ctx = getCtx();
    if (ctx?.chat?.forEach) {
      ctx.chat.forEach(cleanMessageObject);
      try {
        ctx.eventSource?.emit?.(ctx.event_types?.CHAT_CHANGED, {});
      } catch(_) {}
      (ctx.saveChat || (()=>{})).call(ctx);
    } else {
      // DOM fallback – แก้ข้อความที่แสดงแล้ว
      document.querySelectorAll('.mes_text, .message, .message-text').forEach(el => {
        el.textContent = cleanText(el.textContent || '');
      });
    }
  }

  // ---- UI ----
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
    btn.title = 'ลบ .../… จากบทสนทนาทั้งหมด';
    btn.style.padding = '6px 10px'; btn.style.borderRadius = '8px';
    btn.style.border = '1px solid var(--border-color,#ccc)'; btn.style.cursor = 'pointer';
    btn.addEventListener('click', removeEllipsesFromChat);

    const label = document.createElement('label');
    label.style.display = 'inline-flex'; label.style.alignItems = 'center'; label.style.gap = '6px';
    const chk = document.createElement('input'); chk.type = 'checkbox'; chk.id = 'remove-ellipsis-ext__auto';
    const settings = ensureSettings(); chk.checked = !!settings.autoRemove;
    chk.addEventListener('change', ()=>{ settings.autoRemove = chk.checked; saveSettings(); });
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

  // ---- Wiring (new API if present) ----
  function wireWithEvents() {
    const ctx = getCtx(); if (!ctx) return false;
    const { eventSource, event_types } = ctx || {};
    if (!eventSource || !event_types) return false;

    eventSource.on?.(event_types.MESSAGE_SENT, (p) => {
      if (!p) return;
      if (typeof p.message === 'string') p.message = cleanText(p.message);
      if (typeof p.mes === 'string') p.mes = cleanText(p.mes);
    });

    eventSource.on?.(event_types.MESSAGE_RECEIVED, (p) => {
      if (!p) return;
      if (ensureSettings().autoRemove) {
        if (typeof p.message === 'string') p.message = cleanText(p.message);
        if (typeof p.mes === 'string') p.mes = cleanText(p.mes);
      }
    });

    if (event_types.APP_READY) {
      eventSource.on(event_types.APP_READY, addUI);
    } else {
      document.addEventListener('DOMContentLoaded', addUI, { once: true });
      setTimeout(addUI, 800);
    }
    return true;
  }

  // ---- Fallback (old builds without Event API) ----
  function wireWithFallback() {
    // ดัก submit ฟอร์มผู้ใช้
    const tryHookForm = () => {
      const form = document.querySelector('form.send-form, #send_form, form');
      if (!form || form.__ellipsis_hooked) return !!form;
      form.__ellipsis_hooked = true;
      form.addEventListener('submit', () => {
        // ลบจุดจากช่องอินพุตก่อนส่ง
        const ta = document.querySelector('textarea, .chat-input textarea');
        if (ta) ta.value = cleanText(ta.value);
      }, true);
      return true;
    };

    // ลบอัตโนมัติเมื่อมีข้อความใหม่โผล่ใน DOM
    const mo = new MutationObserver((list) => {
      if (!ensureSettings().autoRemove) return;
      for (const m of list) {
        m.addedNodes?.forEach?.(node => {
          if (node.nodeType === 1) {
            const el = node.matches?.('.mes_text, .message, .message-text') ? node
                     : node.querySelector?.('.mes_text, .message, .message-text');
            if (el) el.textContent = cleanText(el.textContent || '');
          }
        });
      }
    });
    const startObserver = () => {
      const chat = document.querySelector('#chat, .mes, .chat, .dialogues');
      if (!chat) return false;
      mo.observe(chat, { childList: true, subtree: true });
      return true;
    };

    // พยายาม hook ซ้ำ ๆ จนกว่าจะเจอ
    const tick = () => {
      const a = tryHookForm();
      const b = startObserver();
      if (!(a && b)) setTimeout(tick, 500);
    };
    document.addEventListener('DOMContentLoaded', () => { addUI(); tick(); });
    setTimeout(()=>{ addUI(); tick(); }, 800);
  }

  // Boot
  (function boot() {
    const ok = wireWithEvents();
    if (!ok) wireWithFallback();
    // เผื่อหน้าโหลดก่อน สั่งเพิ่ม UI อีกรอบ
    setTimeout(addUI, 1000);
  })();
})();
