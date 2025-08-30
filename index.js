/* Remove Ellipsis Extension for SillyTavern
 * - ลบ "..." และ "…" จากข้อความทั้งฝั่งผู้ใช้และ AI
 * - มีปุ่ม Remove ... และ Toggle Auto Remove
 * - รองรับทั้ง stable และ staging โดยใช้ API พื้นฐาน (event + context)
 */
(() => {
  // ป้องกันโหลดซ้ำ
  if (window.__REMOVE_ELLIPSIS_EXT_LOADED__) return;
  window.__REMOVE_ELLIPSIS_EXT_LOADED__ = true;

  // รอให้ SillyTavern พร้อม (ทั้ง stable/staging)
  function whenReady(fn) {
    const tryRun = () => {
      const ctx = getCtx();
      if (ctx && ctx.eventSource && ctx.event_types) {
        fn();
        return true;
      }
      return false;
    };
    if (tryRun()) return;
    const timer = setInterval(() => {
      if (tryRun()) clearInterval(timer);
    }, 300);
    // เผื่อ DOMContentLoaded แล้วค่อยลองอีกที
    document.addEventListener('DOMContentLoaded', tryRun, { once: true });
  }

  // ดึง context จาก SillyTavern ให้ปลอดภัย
  function getCtx() {
    try {
      if (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
        return window.SillyTavern.getContext();
      }
    } catch (_) {}
    return null;
  }

  const MODULE = 'removeEllipsisExt';
  const DEFAULTS = {
    autoRemove: false
  };

  // ---- settings helpers ----
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
    // ใช้ตัวที่มี ถ้าไม่มีก็ fallback
    if (typeof ctx.saveSettingsDebounced === 'function') ctx.saveSettingsDebounced();
    else if (typeof ctx.saveSettings === 'function') ctx.saveSettings();
  }

  // ---- core text cleaner ----
  function cleanText(text) {
    if (!text || typeof text !== 'string') return text;
    // ลบ ... และ … แล้วเก็บช่องว่างให้เรียบ
    // 1) ลบ "..." ทั้งหมด
    let out = text.replace(/\.\.\./g, '');
    // 2) ลบอักขระ ellipsis เดี่ยวๆ "…"
    out = out.replace(/…/g, '');
    // 3) เก็บช่องว่างซ้ำๆ ให้เหลือช่องเดียว (ไม่บังคับ ถ้าไม่ต้องการให้คอมเมนต์บรรทัดนี้)
    out = out.replace(/ {2,}/g, ' ');
    // 4) เก็บเว้นบรรทัดส่วนเกิน
    out = out.replace(/\n{3,}/g, '\n\n');
    return out;
  }

  // ลบจากอ็อบเจ็กต์ข้อความ 1 ชิ้น (รองรับฟิลด์ที่ต่างเวอร์ชันอาจใช้)
  function cleanMessageObject(msgObj) {
    if (!msgObj) return;
    // ฟิลด์หลักที่ ST ใช้บ่อยคือ mes
    if (typeof msgObj.mes === 'string') msgObj.mes = cleanText(msgObj.mes);
    // เผื่อมีฟิลด์อื่นที่ใช้แสดงผล
    if (typeof msgObj.extra === 'object' && msgObj.extra) {
      if (typeof msgObj.extra.display_text === 'string') {
        msgObj.extra.display_text = cleanText(msgObj.extra.display_text);
      }
      if (typeof msgObj.extra.original === 'string') {
        msgObj.extra.original = cleanText(msgObj.extra.original);
      }
    }
  }

  // ลบจากแชททั้งหมด (กดปุ่ม)
  function removeEllipsesFromChat() {
    const ctx = getCtx();
    if (!ctx || !Array.isArray(ctx.chat)) return;
    ctx.chat.forEach(cleanMessageObject);

    // แจ้ง UI ให้รีเฟรช ถ้ามีอีเวนต์ให้ใช้
    try {
      if (ctx.eventSource && ctx.event_types && ctx.event_types.CHAT_CHANGED) {
        ctx.eventSource.emit(ctx.event_types.CHAT_CHANGED, {});
      }
    } catch (_) {}

    // เผื่อไว้: บันทึกแชทเฉยๆ ก็พอให้ UI เด้งได้ในบางเวอร์ชัน
    if (typeof ctx.saveChat === 'function') {
      ctx.saveChat();
    }
  }

  // ---- UI ----
  function addUI() {
    // ป้องกันสร้าง UI ซ้ำ
    if (document.querySelector('#remove-ellipsis-ext__container')) return;

    // หาที่วางปุ่ม: พยายามหาใกล้แถบอินพุต
    const candidates = [
      '.chat-input-container',
      '.input-group',
      '.send-form',
      '#send_form',
      '.chat-controls',
      '.st-user-input'
    ];
    let mountPoint = null;
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) { mountPoint = el; break; }
    }
    if (!mountPoint) {
      // ถ้าไม่เจอ ให้ลองแทรกบนสุดของ body (กรณีพิเศษ)
      mountPoint = document.body;
    }

    // สร้าง container
    const wrap = document.createElement('div');
    wrap.id = 'remove-ellipsis-ext__container';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';
    wrap.style.margin = '6px 0';

    // ปุ่มกดลบทันที
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Remove …';
    btn.title = 'ลบ .../… จากบทสนทนาทั้งหมด';
    btn.style.padding = '6px 10px';
    btn.style.borderRadius = '8px';
    btn.style.border = '1px solid var(--border-color, #ccc)';
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', removeEllipsesFromChat);

    // Toggle auto
    const label = document.createElement('label');
    label.style.display = 'inline-flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.cursor = 'pointer';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = 'remove-ellipsis-ext__auto';
    const settings = ensureSettings();
    chk.checked = !!settings.autoRemove;
    chk.addEventListener('change', () => {
      settings.autoRemove = chk.checked;
      saveSettings();
    });
    const span = document.createElement('span');
    span.textContent = 'Auto Remove';
    label.appendChild(chk);
    label.appendChild(span);

    wrap.appendChild(btn);
    wrap.appendChild(label);

    // แทรก UI
    // ถ้าเป็นแถบอินพุต ให้แปะท้าย; ถ้าเป็น body ให้แปะมุมบน
    if (mountPoint === document.body) {
      wrap.style.position = 'fixed';
      wrap.style.bottom = '12px';
      wrap.style.right = '12px';
      wrap.style.zIndex = '9999';
      document.body.appendChild(wrap);
    } else {
      mountPoint.appendChild(wrap);
    }
  }

  // ---- event wiring ----
  function wireEvents() {
    const ctx = getCtx();
    if (!ctx) return;
    const { eventSource, event_types } = ctx;

    // ผู้ใช้ส่งข้อความ -> ลบก่อนเก็บ
    eventSource.on(event_types.MESSAGE_SENT, (payload) => {
      if (!payload) return;
      if (typeof payload.message === 'string') {
        payload.message = cleanText(payload.message);
      }
      // บางเวอร์ชันอาจใช้ฟิลด์อื่น
      if (typeof payload.mes === 'string') {
        payload.mes = cleanText(payload.mes);
      }
    });

    // AI ส่งข้อความ -> ถ้าเปิด auto ให้ลบทันที
    eventSource.on(event_types.MESSAGE_RECEIVED, (payload) => {
      const settings = ensureSettings();
      if (!payload) return;

      if (settings.autoRemove) {
        if (typeof payload.message === 'string') {
          payload.message = cleanText(payload.message);
        }
        if (typeof payload.mes === 'string') {
          payload.mes = cleanText(payload.mes);
        }
      }
    });

    // เมื่อแอปพร้อม ให้ใส่ UI
    if (event_types.APP_READY) {
      eventSource.on(event_types.APP_READY, addUI);
    } else {
      // เผื่อเวอร์ชันที่ไม่มี APP_READY
      document.addEventListener('DOMContentLoaded', addUI, { once: true });
      setTimeout(addUI, 1000);
    }
  }

  // เริ่มทำงานเมื่อ ST พร้อม
  whenReady(() => {
    ensureSettings();
    wireEvents();
  });
})();
