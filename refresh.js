/* Remove Ellipsis — refresh.js (Hard refresh + wait) */
(() => {
  const core = window.RemoveEllipsis?.core;
  if (!core) return console.warn('[RemoveEllipsis] core missing for refresh');
  const { getCtx } = core;

  function hardRefreshOnce() {
    const ctx = getCtx();
    if (!ctx) return;

    // rebind chat array + nonce เพื่อบังคับ reactive update
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
    const sc = document.querySelector('#chat, .chat, .dialogues');
    if (sc) { const y = sc.scrollTop; sc.scrollTop = y + 1; sc.scrollTop = y; }
  }

  function refreshChatUI() { hardRefreshOnce(); }

  // รอให้ UI วาดเสร็จจริง: 2x RAF + macrotask, แล้วยิง callback (เช่น toast/ไฮไลต์)
  function refreshChatUIAndWait(after) {
    return new Promise(resolve => {
      hardRefreshOnce();
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
    });
  }

  window.RemoveEllipsis = Object.assign(window.RemoveEllipsis || {}, {
    refresh: { refreshChatUI, refreshChatUIAndWait }
  });
})();
