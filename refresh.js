export function refreshChatUI() {
  const ctx = window.SillyTavern?.getContext?.();
  if (!ctx) return;

  // rebind ctx.chat เพื่อให้ reference ใหม่
  try {
    const nonce = Date.now();
    if (Array.isArray(ctx.chat)) {
      ctx.chat = ctx.chat.map(m => ({ ...m, _rmNonce: nonce, ...(m.extra ? { extra: { ...m.extra } } : {}) }));
    }
  } catch (e) {}

  // 🔑 ยิง event ที่มีใน build คุณ
  try { ctx?.eventSource?.emit?.(ctx?.event_types?.MESSAGE_UPDATED, {}); } catch(_) {}
  try { ctx?.eventSource?.emit?.(ctx?.event_types?.CHARACTER_MESSAGE_RENDERED, {}); } catch(_) {}
  try { ctx?.eventSource?.emit?.(ctx?.event_types?.USER_MESSAGE_RENDERED, {}); } catch(_) {}

  // เผื่อ: renderChat ถ้ามี
  try { if (typeof ctx?.renderChat === 'function') ctx.renderChat(); } catch(_) {}

  // เผื่อ: save + resize + scroll nudge
  try { ctx?.saveChat?.(); } catch(_) {}
  try { window.dispatchEvent(new Event('resize')); } catch(_) {}
  const sc = document.querySelector('#chat, .chat, .dialogues');
  if (sc) { const y = sc.scrollTop; sc.scrollTop = y + 1; sc.scrollTop = y; }
}
