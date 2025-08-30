/* Remove Ellipsis v1.5.0
 * - ลบ "..." / ".." (ตัวเลือก) / "…" ทั้งฝั่งผู้ใช้และ AI
 * - ปุ่ม Remove … (ลบย้อนหลัง), Toggle Auto Remove, Toggle ลบ ".."
 * - ไม่แก้ HTML ที่เรนเดอร์แล้ว -> ปลอดภัยต่อ Markdown/ธีม
 * - Toast + Overlay Highlight (ไม่รบกวนสีธีม)
 * - Hard Refresh UI: rebind chat + emit หลายอีเวนต์ + renderChat/saveChat/resize/nudge scroll + multi-tick
 */
(() => {
  if (window.__REMOVE_ELLIPSIS_EXT_LOADED__) return;
  window.__REMOVE_ELLIPSIS_EXT_LOADED__ = true;

  const MODULE = 'removeEllipsisExt';
  const DEFAULTS = {
    autoRemove: false,
    treatTwoDots: true,     // ลบ ".." ด้วยไหม (ดีฟอลต์เปิด)
    highlight: 'overlay'    // 'overlay' | 'none'
  };

  // ---------------- Context ----------------
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

  // ---------------- Feedback UI ----------------
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

  // ---------------- Cleaner (safe for Markdown) ----------------
  // ลบเฉพาะนอกโค้ด: ข้าม ```block``` และ `inline`
  function cleanOutsideCode(text, treatTwoDots) {
    if (typeof text !== 'string' || !text) return { text, removed: 0 };

    // protect code blocks
    const blockRegex = /```[\s\S]*?```/g;
    const blocks = [];
    const sk1 = text.replace(blockRegex, m => `@@BLOCK${blocks.push(m)-1}@@`);

    // protect inline code
    const inlineRegex = /`[^`]*`/g;
    const inlines = [];
    const sk2 = sk1.replace(inlineRegex, m => `@@INLINE${inlines.push(m)-1}@@`);

    // pattern: “…” เสมอ + จุดติดกัน
    const pattern = treatTwoDots ? /(?<!\d)\.{2,}(?!\d)|…/g : /\.{3,}|…/g;

    let removed = 0;
    const cleaned = sk2.replace(pattern, m => { removed += m.length; return ''; });

    // restore back
    let restored = cleaned.replace(/@@INLINE(\d+)@@/g, (_,i)=>inlines[i]);
    restored = restored.replace(/@@BLOCK(\d+)@@/g,  (_,i)=>blocks[i]);
    return { text: restored, removed };
  }
  function cleanMessageObject(msg) {
    if (!msg) return 0;
    const settings = ensureSettings();
    let total = 0;
    if (typeof msg.mes === 'string') {
      const r = cleanOutsideCode(msg.mes, settings.treatTwoDots);
      msg.mes = r.text; total += r.removed;
    }
    if (msg.extra) {
      if (typeof msg.extra.display_text === 'string') {
        const r = cleanOutsideCode(msg.extra.display_text, settings.treatTwoDots);
        msg.extra.display_text = r.text; total += r.removed;
      }
      if (typeof msg.extra.original === 'string') {
        const r = cleanOutsideCode(msg.extra.original, settings.treatTwoDots);
        msg.extra.original = r.text; total += r.removed;
      }
    }
    return total;
  }

  // ---------------- Hard Refresh UI ----------------
  function refreshChatUI() {
    const ctx = getCtx();
    if (!ctx) return;

    // 1) Rebind chat array + inject nonce เพื่อให้ reactive system เห็นการเปลี่ยน
    try {
      const nonce = Date.now();
      if (Array.isArray(ctx.chat)) {
        ctx.chat = ctx.chat.map(m => {
          const clone = { ...m, _rmNonce: nonce };
          if (clone.extra && typeof clone.extra === 'object') clone.extra = { ...clone.extra };
          return clone;
        });
      }
    } catch (e) {
      console.warn('rebind chat failed', e);
    }

    // 2) ยิงหลาย event/วิธี
    try { ctx?.eventSource?.emit?.(ctx?.event_types?.CHAT_CHANGED, { reason: 'remove-ellipsis-rebind' }); } catch(_) {}
    try { ctx?.eventSource?.emit?.(ctx?.event_types?.MESSAGE_LIST_UPDATED, {}); } catch(_) {}
    try { if (typeof ctx?.renderChat === 'function') ctx.renderChat(); } catch(_) {}
    try { ctx?.saveChat?.(); } catch(_) {}

    // 3) เขย่า layout/virtual list
    try { window.dispatchEvent(new Event('resize')); } catch(_) {}
    const scrollEl = document.querySelector('#chat, .chat, .dialogues');
    if (scrollEl) {
      const y = scrollEl.scrollTop;
      scrollEl.scrollTop = y + 1;
      scrollEl.scrollTop = y;
    }

    // 4) ยิงซ้ำแบบ multi-tick (กันคิวช้า)
    requestAnimationFrame(() => {
      try { ctx?.eventSource?.emit?.(ctx?.event_types?.CHAT_CHANGED, { reason: 'raf' }); } catch(_) {}
      try { if (typeof ctx?.renderChat === 'function') ctx.renderChat(); } catch(_) {}
      setTimeout(() => {
        try { ctx?.saveChat?.(); } catch(_) {}
        try { window.dispatchEvent(new Event('resize')); } catch(_) {}
      }, 50);
    });
  }

  // ---------------- Core ----------------
  function removeEllipsesFromChat() {
    const ctx = getCtx();
    let removedSum = 0;

    if (ctx?.chat?.forEach) {
      ctx.chat.forEach(msg => { removedSum += cleanMessageObject(msg); });
    }

    refreshChatUI();

    const last = document.querySelector(
      '.mes:last-child .mes_text, .message:last-child .message-text, .chat-message:last-child, .mes_markdown:last-child, .markdown:last-child'
    );
    overlayHighlight(last);

    toast(removedSum > 0 ? `ลบแล้ว ${removedSum} ตัว` : 'ไม่มี …');
  }

  // ---------------- Input Hook (ฝั่ง "ผู้ใช้ส่ง") ----------------
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
    const val = ('value' in el) ? el.value : el.textContent;
    const r = cleanOutsideCode(val, settings.treatTwoDots);
    if (r.removed > 0) {
      if ('value' in el) el.value = r.text; else el.textContent = r.text;
      const ev = { bubbles: true, cancelable: false };
      el.dispatchEvent(new Event('input', ev));
      el.dispatchEvent(new Event('change', ev));
      // เผื่อ contenteditable
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
    }
    return r.removed;
  }
  function hookOutgoingInput() {
    if (hookOutgoingInput._done) return; hookOutgoingInput._done = true;

    const form = document.querySelector('form.send-form, #send_form, form');
    if (form) form.addEventListener('submit', ()=>{ const n=sanitizeCurrentInput(); if(n)toast(`ลบ … ${n}`); refreshChatUI(); }, true);

    const btn = document.querySelector('.send-button, button[type="submit"], #send_but, .st-send');
    if (btn) btn.addEventListener('mousedown', ()=>{ const n=sanitizeCurrentInput(); if(n)toast(`ลบ … ${n}`); refreshChatUI(); }, true);

    const input = getInputEl();
    if (input) input.addEventListener('keydown', e=>{
      const isEnter = e.key==='Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing;
      if (isEnter) { const n=sanitizeCurrentInput(); if(n)toast(`ลบ … ${n}`); refreshChatUI(); }
    }, true);

    // paste/drop → sanitize หลังระบบใส่ค่าลงอินพุต
    ['paste','drop'].forEach(evt=>{
      (input||document).addEventListener(evt, ()=> setTimeout(()=>{ const n=sanitizeCurrentInput(); if(n)toast(`ลบ … ${n}`); }, 0), true);
    });
  }

  // ---------------- UI ----------------
  function addUI() {
    if (document.querySelector('#remove-ellipsis-ext__container')) return;

    const mount = document.querySelector('.chat-input-container,.input-group,.send-form,#send_form,.chat-controls,.st-user-input') || document.body;

    const box = document.createElement('div');
    box.id='remove-ellipsis-ext__container';
    box.style.display='flex';
    box.style.alignItems='center';
    box.style.gap='8px';
    box.style.margin='6px 0';

    // ปุ่มลบย้อนหลัง
    const btn=document.createElement('button');
    btn.type='button';
    btn.textContent='Remove …';
    btn.title='ลบ .../.. / … จากบทสนทนาทั้งหมด (ปลอดภัยต่อ Markdown)';
    btn.style.padding='6px 10px';
    btn.style.borderRadius='8px';
    btn.style.border='1px solid var(--border-color,#ccc)';
    btn.style.cursor='pointer';
    btn.addEventListener('click', removeEllipsesFromChat);

    // Toggle Auto Remove
    const label=document.createElement('label');
    label.style.display='inline-flex'; label.style.alignItems='center'; label.style.gap='6px'; label.style.cursor='pointer';
    const chk=document.createElement('input'); chk.type='checkbox';
    chk.checked=ensureSettings().autoRemove;
    chk.onchange=()=>{ ensureSettings().autoRemove=chk.checked; saveSettings(); toast(`Auto Remove: ${chk.checked?'ON':'OFF'}`); };

    const span=document.createElement('span'); span.textContent='Auto Remove';
    label.append(chk,span);

    // Toggle ลบ ".."
    const label2=document.createElement('label');
    label2.style.display='inline-flex'; label2.style.alignItems='center'; label2.style.gap='6px'; label2.style.cursor='pointer';
    const chk2=document.createElement('input'); chk2.type='checkbox';
    chk2.checked=ensureSettings().treatTwoDots;
    chk2.onchange=()=>{ ensureSettings().treatTwoDots=chk2.checked; saveSettings(); toast(`ลบ "..": ${chk2.checked?'ON':'OFF'}`); };
    const span2=document.createElement('span'); span2.textContent='ลบ ".." ด้วย';
    label2.append(chk2, span2);

    box.append(btn, label, label2);

    if (mount === document.body) {
      box.style.position='fixed'; box.style.bottom='12px'; box.style.right='12px'; box.style.zIndex='9999';
      document.body.appendChild(box);
    } else {
      mount.appendChild(box);
    }
  }

  // ---------------- Wiring ----------------
  function wireWithEvents() {
    const ctx = getCtx(); if (!ctx) return false;
    const { eventSource, event_types } = ctx || {};
    if (!eventSource || !event_types) return false;

    // ผู้ใช้ส่ง → ลบ raw ก่อนบันทึก/เรนเดอร์
    eventSource.on?.(event_types.MESSAGE_SENT, (p) => {
      if (!p) return;
      const settings = ensureSettings();
      let removed = 0;
      if (typeof p.message === 'string') { const r = cleanOutsideCode(p.message, settings.treatTwoDots); p.message = r.text; removed += r.removed; }
      if (typeof p.mes === 'string')     { const r = cleanOutsideCode(p.mes,     settings.treatTwoDots); p.mes     = r.text; removed += r.removed; }
      if (removed) refreshChatUI();
    });

    // AI ตอบ → ถ้าเปิด Auto Remove ให้ลบ raw แล้วค่อยรีเฟรช
    eventSource.on?.(event_types.MESSAGE_RECEIVED, (p) => {
      const settings = ensureSettings();
      if (!p || !settings.autoRemove) return;
      let removed = 0;
      if (typeof p.message === 'string') { const r = cleanOutsideCode(p.message, settings.treatTwoDots); p.message = r.text; removed += r.removed; }
      if (typeof p.mes === 'string')     { const r = cleanOutsideCode(p.mes,     settings.treatTwoDots); p.mes     = r.text; removed += r.removed; }
      if (removed) {
        refreshChatUI();
        const last = document.querySelector(
          '.mes:last-child .mes_text, .message:last-child .message-text, .chat-message:last-child, .mes_markdown:last-child, .markdown:last-child'
        );
        overlayHighlight(last);
      }
    });

    // APP_READY → วาง UI + hook อินพุต
    if (event_types.APP_READY) {
      eventSource.on(event_types.APP_READY, () => { addUI(); hookOutgoingInput(); });
    } else {
      document.addEventListener('DOMContentLoaded', () => { addUI(); hookOutgoingInput(); }, { once: true });
      setTimeout(() => { addUI(); hookOutgoingInput(); }, 800);
    }
    return true;
  }

  function wireWithFallback() {
    // ไม่มี Event API → วาง UI + hook อินพุต อย่างน้อยให้ฝั่งผู้ใช้สะอาดเสมอ
    document.addEventListener('DOMContentLoaded', () => { addUI(); hookOutgoingInput(); });
    setTimeout(() => { addUI(); hookOutgoingInput(); }, 800);
  }

  // ---------------- Boot ----------------
  (function boot() {
    ensureSettings();
    const ok = wireWithEvents();
    if (!ok) wireWithFallback();
    setTimeout(addUI, 1000); // เผื่อหน้าโหลดก่อน
  })();
})();
