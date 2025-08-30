/* Remove Ellipsis — ui.js (buttons, toggles, toast, overlay, hooks, actions) */
(() => {
  const core = window.RemoveEllipsis?.core;
  const cleaner = window.RemoveEllipsis?.cleaner;
  const refresh = window.RemoveEllipsis?.refresh;
  if (!core || !cleaner || !refresh) return console.warn('[RemoveEllipsis] missing modules for ui');

  const { getCtx, ensureSettings, saveSettings } = core;
  const { cleanMessageObject } = cleaner;
  const { refreshChatUIAndWait } = refresh;

  // ---------- Toast & Overlay ----------
  function ensureFeedbackUI() {
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

  // ---------- Input Hook (ฝั่งผู้ใช้ส่ง) ----------
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
    const st = ensureSettings();
    const val = ('value' in el) ? el.value : el.textContent;
    const r = window.RemoveEllipsis.cleaner.cleanOutsideCode(val, st.treatTwoDots);
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
    if (hookOutgoingInput._done) return; hookOutgoingInput._done = true;

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

  // ---------- ปุ่ม/Toggle + Action "Remove …" ----------
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

  function addUI() {
    if (document.querySelector('#remove-ellipsis-ext__container')) return;

    const mount = document.querySelector(
      '.chat-input-container,.input-group,.send-form,#send_form,.chat-controls,.st-user-input'
    ) || document.body;

    const box = document.createElement('div');
    box.id='remove-ellipsis-ext__container';
    box.style.display='flex';
    box.style.alignItems='center';
    box.style.gap='10px';
    box.style.margin='6px 0';

    const btn=document.createElement('button');
    btn.type='button';
    btn.textContent='Remove …';
    btn.title='ลบ .../.. / … จากบทสนทนาทั้งหมด (ปลอดภัยต่อ Markdown)';
    btn.style.padding='6px 10px';
    btn.style.borderRadius='8px';
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
  }

  // export ui module
  window.RemoveEllipsis = Object.assign(window.RemoveEllipsis || {}, {
    ui: { addUI, hookOutgoingInput, toast, overlayHighlight }
  });
})();
