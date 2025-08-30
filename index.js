/* Remove Ellipsis — single-file index.js */
(() => {
  if (typeof window === 'undefined') { global.window = {}; }
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

  window.RemoveEllipsis = Object.assign(window.RemoveEllipsis || {}, {
    core: { MODULE, DEFAULTS, getCtx, ensureSettings, saveSettings }
  });

  // ---------- Cleaner ----------
  function cleanOutsideCode(text, treatTwoDots) {
    if (typeof text !== 'string' || !text) return { text, removed: 0 };

    const blockRegex = /```[\s\S]*?```/g;
    const blocks = [];
    const sk1 = text.replace(blockRegex, m => `@@BLOCK${blocks.push(m)-1}@@`);

    const inlineRegex = /`[^`]*`/g;
    const inlines = [];
    const sk2 = sk1.replace(inlineRegex, m => `@@INLINE${inlines.push(m)-1}@@`);

    const pattern = treatTwoDots ? /(?<!\d)\.{2,}(?!\d)|…/g : /(?<!\d)\.{3,}(?!\d)|…/g;

    let removed = 0;
    const cleaned = sk2.replace(pattern, m => { removed += m.length; return ''; });

    let restored = cleaned.replace(/@@INLINE(\d+)@@/g, (_,i)=>inlines[i]);
    restored = restored.replace(/@@BLOCK(\d+)@@/g,  (_,i)=>blocks[i]);
    return { text: restored, removed };
  }

  function cleanMessageObject(msg) {
    if (!msg) return 0;
    const st = ensureSettings();
    let total = 0;
    if (typeof msg.mes === 'string') {
      const r = cleanOutsideCode(msg.mes, st.treatTwoDots); msg.mes = r.text; total += r.removed;
    }
    if (msg.extra) {
      if (typeof msg.extra.display_text === 'string') {
        const r = cleanOutsideCode(msg.extra.display_text, st.treatTwoDots); msg.extra.display_text = r.text; total += r.removed;
      }
      if (typeof msg.extra.original === 'string') {
        const r = cleanOutsideCode(msg.extra.original, st.treatTwoDots); msg.extra.original = r.text; total += r.removed;
      }
    }
    return total;
  }

  window.RemoveEllipsis.cleaner = { cleanOutsideCode, cleanMessageObject };

  // ---------- Refresh ----------
  function hardRefreshOnce() {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      const nonce = Date.now();
      if (Array.isArray(ctx.chat)) {
        ctx.chat = ctx.chat.map(m => {
          const clone = { ...m, _rmNonce: nonce };
          if (clone.extra && typeof clone.extra === 'object') clone.extra = { ...clone.extra };
          return clone;
        });
      }
    } catch (e) { console.warn('rebind chat failed', e); }

    try { ctx?.eventSource?.emit?.(ctx?.event_types?.CHAT_CHANGED, { reason: 'rm-rebind' }); } catch(_) {}
    try { ctx?.eventSource?.emit?.(ctx?.event_types?.MESSAGE_LIST_UPDATED, {}); } catch(_) {}
    try { if (typeof ctx?.renderChat === 'function') ctx.renderChat(); } catch(_) {}
    try { ctx?.saveChat?.(); } catch(_) {}

    try { window.dispatchEvent(new Event('resize')); } catch(_) {}
    const sc = typeof document !== 'undefined' ? document.querySelector('#chat, .chat, .dialogues') : null;
    if (sc) { const y = sc.scrollTop; sc.scrollTop = y + 1; sc.scrollTop = y; }

    try {
      const st = ensureSettings();
      const { cleanOutsideCode } = window.RemoveEllipsis.cleaner || {};
      if (cleanOutsideCode && typeof document !== 'undefined') {
        document
          .querySelectorAll('.mes_text, .message-text, .chat-message, .mes_markdown, .markdown')
          .forEach(node => {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
            let tn;
            while ((tn = walker.nextNode())) {
              let p = tn.parentNode;
              let skip = false;
              while (p && p !== node) {
                if (p.nodeName === 'CODE' || p.nodeName === 'PRE') { skip = true; break; }
                p = p.parentNode;
              }
              if (skip) continue;
              const r = cleanOutsideCode(tn.nodeValue, st.treatTwoDots);
              if (r.removed) tn.nodeValue = r.text;
            }
          });
      }
    } catch(_) {}
  }

  function refreshChatUI() { hardRefreshOnce(); }

  function refreshChatUIAndWait(after) {
    return new Promise(resolve => {
      hardRefreshOnce();
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          hardRefreshOnce();
          requestAnimationFrame(() => {
            setTimeout(() => {
              hardRefreshOnce();
              try { typeof after === 'function' && after(); } catch(_) {}
              resolve();
            }, 0);
          });
        });
      } else {
        hardRefreshOnce();
        setTimeout(() => { try { typeof after === 'function' && after(); } catch(_) {}; resolve(); }, 0);
      }
    });
  }

  window.RemoveEllipsis.refresh = { refreshChatUI, refreshChatUIAndWait };

  // ---------- UI ----------
  function ensureFeedbackUI() {
    if (typeof document === 'undefined') return;
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
    if (typeof document === 'undefined') return;
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

  function getInputEl() {
    if (typeof document === 'undefined') return null;
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
    const r = cleanOutsideCode(val, st.treatTwoDots);
    if (r.removed > 0) {
      if ('value' in el) el.value = r.text; else el.textContent = r.text;
      const ev = { bubbles: true, cancelable: false };
      el.dispatchEvent(new Event('input', ev));
      el.dispatchEvent(new Event('change', ev));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
    }
    return r.removed;
  }
  function hookOutgoingInput() {
    if (hookOutgoingInput._done || typeof document === 'undefined') return; hookOutgoingInput._done = true;

    const form = document.querySelector('form.send-form, #send_form, form');
    if (form) form.addEventListener('submit', async () => {
      const n = sanitizeCurrentInput();
      await refreshChatUIAndWait();
      if (n) toast(`ลบ … ${n}`);
    }, true);

    const btn = document.querySelector('.send-button, button[type="submit"], #send_but, .st-send');
    if (btn) btn.addEventListener('mousedown', async () => {
      const n = sanitizeCurrentInput();
      await refreshChatUIAndWait();
      if (n) toast(`ลบ … ${n}`);
    }, true);

    const input = getInputEl();
    if (input) input.addEventListener('keydown', async (e) => {
      const isEnter = e.key==='Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing;
      if (isEnter) {
        const n = sanitizeCurrentInput();
        await refreshChatUIAndWait();
        if (n) toast(`ลบ … ${n}`);
      }
    }, true);

    ['paste','drop'].forEach(evt=>{
      (input||document).addEventListener(evt, () => setTimeout(sanitizeCurrentInput, 0), true);
    });
  }

  async function removeEllipsesFromChat() {
    const ctx = getCtx();
    let removedSum = 0;
    if (ctx?.chat?.forEach) ctx.chat.forEach(msg => { removedSum += cleanMessageObject(msg); });

    await refreshChatUIAndWait();

    const last = document.querySelector(
      '.mes:last-child .mes_text, .message:last-child .message-text, .chat-message:last-child, .mes_markdown:last-child, .markdown:last-child'
    );
    overlayHighlight(last);
    toast(removedSum > 0 ? `ลบแล้ว ${removedSum} ตัว` : 'ไม่มี …');
  }

  function observeUI() {
    if (observeUI._observer || typeof document === 'undefined') return;
    const mo = new MutationObserver(() => {
      if (!document.getElementById('remove-ellipsis-ext__container')) {
        addUI();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    observeUI._observer = mo;
  }

  function countEllipsesInChat() {
    const ctx = getCtx();
    let count = 0;
    const st = ensureSettings();
    if (ctx?.chat?.forEach) ctx.chat.forEach(msg => {
      if (typeof msg.mes === 'string') count += cleanOutsideCode(msg.mes, st.treatTwoDots).removed;
      if (msg.extra) {
        if (typeof msg.extra.display_text === 'string') count += cleanOutsideCode(msg.extra.display_text, st.treatTwoDots).removed;
        if (typeof msg.extra.original === 'string') count += cleanOutsideCode(msg.extra.original, st.treatTwoDots).removed;
      }
    });
    toast(count > 0 ? `พบ … ${count} ตัว` : 'ไม่พบ …');
  }

  function addUI() {
    if (typeof document === 'undefined') return;
    if (document.querySelector('#remove-ellipsis-ext__container')) return;

    const mount = document.querySelector(
      '.chat-input-container,.input-group,.send-form,#send_form,.chat-controls,.st-user-input'
    ) || document.body;

    const box = document.createElement('div');
    box.id='remove-ellipsis-ext__container';
    box.style.display='flex';
    box.style.alignItems='center';
    box.style.gap='8px';
    box.style.margin='6px 0';
    box.style.padding='6px 10px';
    box.style.background='var(--accent-bg,#f7f7f7)';
    box.style.border='1px solid var(--border-color,#ccc)';
    box.style.borderRadius='8px';
    box.style.flexWrap='wrap';

    const btn=document.createElement('button');
    btn.type='button';
    btn.textContent='Remove …';
    btn.title='ลบ .../.. / … จากบทสนทนาทั้งหมด (ปลอดภัยต่อ Markdown)';
    btn.style.padding='6px 10px';
    btn.style.borderRadius='6px';
    btn.style.border='1px solid var(--border-color,#ccc)';
    btn.style.cursor='pointer';
    btn.addEventListener('click', () => removeEllipsesFromChat());

    const label=document.createElement('label');
    label.style.display='inline-flex'; label.style.alignItems='center'; label.style.gap='6px'; label.style.cursor='pointer';
    const chk=document.createElement('input'); chk.type='checkbox';
    chk.checked=ensureSettings().autoRemove;
    chk.onchange=()=>{ ensureSettings().autoRemove=chk.checked; saveSettings(); toast(`Auto Remove: ${chk.checked?'ON':'OFF'}`); };
    const span=document.createElement('span'); span.textContent='Auto Remove';
    label.append(chk,span);

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

    function adaptUI() {
      const mobile = typeof window !== 'undefined' && window.innerWidth <= 600;
      [btn, label, label2].forEach(el => { el.style.width = mobile ? '100%' : ''; });
      if (mount === document.body) {
        if (mobile) {
          box.style.left = '50%';
          box.style.right = '';
          box.style.transform = 'translateX(-50%)';
          box.style.maxWidth = 'calc(100% - 24px)';
        } else {
          box.style.left = '';
          box.style.right = '12px';
          box.style.transform = '';
          box.style.maxWidth = '';
        }
      }
    }
    window.addEventListener('resize', adaptUI);
    adaptUI();

    observeUI();
  }

  window.RemoveEllipsis.ui = { addUI, hookOutgoingInput, toast, overlayHighlight, checkEllipsesInChat: countEllipsesInChat };

  // ---------- Wiring & Boot ----------
  function wireWithEvents() {
    const ctx = getCtx(); if (!ctx) return false;
    const { eventSource, event_types } = ctx || {};
    if (!eventSource || !event_types) return false;

    const { cleanOutsideCode } = window.RemoveEllipsis.cleaner;
    const { refreshChatUIAndWait } = window.RemoveEllipsis.refresh;
    const { addUI, hookOutgoingInput } = window.RemoveEllipsis.ui;

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
    if (typeof document === 'undefined') return;
    document.addEventListener('DOMContentLoaded', () => { addUI(); hookOutgoingInput(); });
    setTimeout(() => { addUI(); hookOutgoingInput(); }, 800);
  }

  function boot() {
    try { /* all modules already bundled */ } catch (e) { console.error('[RemoveEllipsis] init failed', e); }
    window.RemoveEllipsis.core.ensureSettings();

    const ok = wireWithEvents();
    if (!ok) wireWithFallback();

    setTimeout(() => window.RemoveEllipsis.ui?.addUI?.(), 1000);
  }

  if (typeof document !== 'undefined') {
    boot();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.RemoveEllipsis;
  }
})();

