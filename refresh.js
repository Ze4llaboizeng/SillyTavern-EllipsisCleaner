export function refreshChatUI() {
  const ctx = window.SillyTavern?.getContext?.();
  if (!ctx) return;

  try {
    const nonce = Date.now();
    if (Array.isArray(ctx.chat)) {
      ctx.chat = ctx.chat.map(m => ({ ...m, _rmNonce: nonce, ...(m.extra ? { extra: { ...m.extra } } : {}) }));
    }
  } catch (e) {}

  try { ctx?.eventSource?.emit?.(ctx?.event_types?.CHAT_CHANGED, { reason: 'remove-ellipsis-rebind' }); } catch(_) {}
  try { if (typeof ctx?.renderChat === 'function') ctx.renderChat(); } catch(_) {}
  try { ctx?.saveChat?.(); } catch(_) {}
  try { window.dispatchEvent(new Event('resize')); } catch(_) {}
  const sc = document.querySelector('#chat, .chat, .dialogues');
  if (sc) { const y = sc.scrollTop; sc.scrollTop = y + 1; sc.scrollTop = y; }
}

export function refreshChatUIAndWait() {
  refreshChatUI();
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  });
}
