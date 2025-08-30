/* Remove Ellipsis v1.4.0
 * - ลบ "..." / ".." (ถ้าเปิดตัวเลือก) / "…" ทั้งฝั่งผู้ใช้และ AI
 * - ปุ่ม Remove … (ลบย้อนหลัง), Toggle Auto Remove, Toggle ลบ ".."
 * - Toast + Overlay Highlight (ไม่แตะธีม)
 * - Refresh UI ด้วย renderChat/CHAT_CHANGED/saveChat/scroll resize
 * - ไม่ทำลาย Markdown: ลบแค่ raw message
 */
(() => {
  if (window.__REMOVE_ELLIPSIS_EXT_LOADED__) return;
  window.__REMOVE_ELLIPSIS_EXT_LOADED__ = true;

  const MODULE = 'removeEllipsisExt';
  const DEFAULTS = {
    autoRemove: false,
    treatTwoDots: true,     // ลบ ".." ด้วยไหม
    highlight: 'overlay'
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

  // ---------------- Cleaner ----------------
  function cleanOutsideCode(text, treatTwoDots) {
    if (typeof text !== 'string' || !text) return { text, removed: 0 };
    // protect code blocks
    const blockRegex = /```[\s\S]*?```/g;
    const blocks = [];
    const sk1 = text.replace(blockRegex, m => `@@BLOCK${blocks.push(m)-1}@@`);
    const inlineRegex = /`[^`]*`/g;
    const inlines = [];
    const sk2 = sk1.replace(inlineRegex, m => `@@INLINE${inlines.push(m)-1}@@`);

    const pattern = treatTwoDots ? /(?<!\d)\.{2,}(?!\d)|…/g : /\.{3,}|…/g;
    let removed = 0;
    const cleaned = sk2.replace(pattern, m => { removed += m.length; return ''; });

    let restored = cleaned.replace(/@@INLINE(\d+)@@/g, (_,i)=>inlines[i]);
    restored = restored.replace(/@@BLOCK(\d+)@@/g, (_,i)=>blocks[i]);
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

  // ---------------- Force Refresh UI ----------------
  function refreshChatUI() {
    const ctx = getCtx();
    try {
      if (typeof ctx?.renderChat === 'function') { ctx.renderChat(); return; }
      ctx?.eventSource?.emit?.(ctx?.event_types?.CHAT_CHANGED, {});
      ctx?.saveChat?.();
      window.dispatchEvent(new Event('resize'));
      const chat = document.querySelector('#chat, .chat, .dialogues');
      if (chat) { const y = chat.scrollTop; chat.scrollTop = y+1; chat.scrollTop = y; }
    } catch(e){ console.warn('refreshChatUI failed', e); }
  }

  // ---------------- Core ----------------
  function removeEllipsesFromChat() {
    const ctx = getCtx();
    let removedSum = 0;
    if (ctx?.chat?.forEach) ctx.chat.forEach(m => removedSum += cleanMessageObject(m));
    refreshChatUI();
    const last = document.querySelector(
      '.mes:last-child .mes_text, .message:last-child .message-text, .chat-message:last-child, .mes_markdown:last-child, .markdown:last-child'
    );
    overlayHighlight(last);
    toast(removedSum>0 ? `ลบแล้ว ${removedSum} ตัว` : 'ไม่มี …');
  }

  // ---------------- Input Hook ----------------
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
      const evOpts = { bubbles:true, cancelable:false };
      el.dispatchEvent(new Event('input', evOpts));
      el.dispatchEvent(new Event('change', evOpts));
    }
    return r.removed;
  }
  function hookOutgoingInput() {
    if (hookOutgoingInput._done) return; hookOutgoingInput._done = true;
    const form = document.querySelector('form.send-form, #send_form, form');
    if (form) form.addEventListener('submit', ()=>{ const n=sanitizeCurrentInput(); if(n)toast(`ลบ … ${n}`); refreshChatUI();}, true);
    const btn = document.querySelector('.send-button, button[type="submit"], #send_but, .st-send');
    if (btn) btn.addEventListener('mousedown', ()=>{ const n=sanitizeCurrentInput(); if(n)toast(`ลบ … ${n}`); refreshChatUI();}, true);
    const input = getInputEl();
    if (input) input.addEventListener('keydown', e=>{
      if (e.key==='Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing) {
        const n=sanitizeCurrentInput(); if(n)toast(`ลบ … ${n}`); refreshChatUI();
      }
    }, true);
  }

  // ---------------- UI ----------------
  function addUI() {
    if (document.querySelector('#remove-ellipsis-ext__container')) return;
    const mount = document.querySelector('.chat-input-container,.input-group,.send-form,#send_form,.chat-controls,.st-user-input') || document.body;
    const box = document.createElement('div'); box.id='remove-ellipsis-ext__container';
    box.style.display='flex'; box.style.gap='8px'; box.style.margin='6px 0';

    const btn=document.createElement('button'); btn.textContent='Remove …'; btn.onclick=removeEllipsesFromChat;
    const label=document.createElement('label'); const chk=document.createElement('input'); chk.type='checkbox';
    chk.checked=ensureSettings().autoRemove; chk.onchange=()=>{ensureSettings().autoRemove=chk.checked; saveSettings();};
    label.append(chk,document.createTextNode('Auto Remove'));
    const label2=document.createElement('label'); const chk2=document.createElement('input'); chk2.type='checkbox';
    chk2.checked=ensureSettings().treatTwoDots; chk2.onchange=()=>{ensureSettings().treatTwoDots=chk2.checked; saveSettings();};
    label2.append(chk2,document.createTextNode('ลบ ".." ด้วย'));
    box.append(btn,label,label2);
    if(mount===document.body){box.style.position='fixed';box.style.bottom='12px';box.style.right='12px';box.style.zIndex='9999';}
    mount.appendChild(box);
  }

  // ---------------- Wiring ----------------
  function wireWithEvents() {
    const ctx=getCtx(); if(!ctx)return false;
    const {eventSource,event_types}=ctx||{}; if(!eventSource||!event_types)return false;
    eventSource.on?.(event_types.MESSAGE_SENT,p=>{
      if(!p)return; let r1=cleanOutsideCode(p.message,ensureSettings().treatTwoDots);
      if(r1.removed)p.message=r1.text;
      let r2=cleanOutsideCode(p.mes,ensureSettings().treatTwoDots);
      if(r2.removed)p.mes=r2.text;
      if(r1.removed||r2.removed)refreshChatUI();
    });
    eventSource.on?.(event_types.MESSAGE_RECEIVED,p=>{
      if(!p||!ensureSettings().autoRemove)return; let r1=cleanOutsideCode(p.message,ensureSettings().treatTwoDots);
      if(r1.removed)p.message=r1.text; let r2=cleanOutsideCode(p.mes,ensureSettings().treatTwoDots);
      if(r2.removed)p.mes=r2.text; if(r1.removed||r2.removed){refreshChatUI();}
    });
    if(event_types.APP_READY){
      eventSource.on(event_types.APP_READY,()=>{addUI(); hookOutgoingInput();});
    } else {
      document.addEventListener('DOMContentLoaded',()=>{addUI(); hookOutgoingInput();},{once:true});
      setTimeout(()=>{addUI(); hookOutgoingInput();},800);
    }
    return true;
  }
  function wireWithFallback(){
    document.addEventListener('DOMContentLoaded',()=>{addUI(); hookOutgoingInput();});
    setTimeout(()=>{addUI(); hookOutgoingInput();},800);
  }

  // ---------------- Boot ----------------
  (function boot(){
    ensureSettings();
    const ok=wireWithEvents(); if(!ok)wireWithFallback();
    setTimeout(addUI,1000);
  })();
})();
