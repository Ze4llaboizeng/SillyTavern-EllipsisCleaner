function removeEllipsesFromChat() {
  const ctx = getCtx();

  // 1) แก้ในแชทที่เก็บใน context (ถ้ามี)
  if (ctx?.chat?.forEach) {
    ctx.chat.forEach(cleanMessageObject);

    // 2) พยายามบังคับให้ UI re-render ให้ครบทุกเวอร์ชัน
    try {
      // ตัวเลือก A: มีฟังก์ชัน render ให้เรียกเลย
      if (typeof ctx.renderChat === 'function') {
        ctx.renderChat();
      }
      // ตัวเลือก B: emit อีเวนต์ให้ระบบรู้ว่าแชทเปลี่ยน
      ctx.eventSource?.emit?.(ctx.event_types?.CHAT_CHANGED, {});
      // ตัวเลือก C: เซฟแชท (หลายธีมจะรีเฟรชหลัง save)
      (ctx.saveChat || (() => {})).call(ctx);
    } catch (_) {}
  }

  // 3) ซ้ำด้วยการแก้ DOM ที่แสดงอยู่แล้ว (เผื่อ virtualization/แคช)
  const textSelectors = [
    '.mes_text', '.message-text', '.message', '.mes .text', 
    '.chat-message', '.chat .text'
  ];
  const nodes = document.querySelectorAll(textSelectors.join(','));
  nodes.forEach(el => {
    // ใช้ textContent/innerText อย่างใดอย่างหนึ่งตามที่มี
    const raw = (el.textContent ?? el.innerText ?? '');
    const cleaned = cleanText(raw);
    if (raw !== cleaned) {
      // ใช้ textContent เพื่อไม่ปะปน HTML
      el.textContent = cleaned;
    }
  });

  // 4) เผื่อบางธีมต้อง trigger reflow
  try { window.dispatchEvent(new Event('resize')); } catch (_) {}
}
