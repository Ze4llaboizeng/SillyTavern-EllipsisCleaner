import { cleanMessageObject, cleanOutsideCode } from './cleaner.js';
import { toast, overlayHighlight } from './ui.js';
import { refreshChatUI, refreshChatUIAndWait } from './refresh.js';

const MODULE = 'removeEllipsisExt';
const DEFAULTS = { autoRemove: false, treatTwoDots: true };

function getCtx() { try { return window.SillyTavern?.getContext?.() || null; } catch (_) { return null; } }
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

async function removeEllipsesFromChat() {
  const ctx = getCtx();
  let removedSum = 0;
  if (ctx?.chat?.forEach) ctx.chat.forEach(m => removedSum += cleanMessageObject(m, ensureSettings()));
  await refreshChatUIAndWait();
  const last = document.querySelector('.mes:last-child .mes_text, .message:last-child .message-text, .chat-message:last-child');
  overlayHighlight(last);
  toast(removedSum>0 ? `ลบแล้ว ${removedSum} ตัว` : 'ไม่มี …');
}

function addUI() {
  if (document.querySelector('#remove-ellipsis-ext__container')) return;
  const mount = document.querySelector('.chat-input-container,.input-group,.send-form,#send_form,.chat-controls,.st-user-input') || document.body;
  const box = document.createElement('div'); box.id='remove-ellipsis-ext__container';
  box.style.display='flex'; box.style.gap='8px'; box.style.margin='6px 0';

  const btn=document.createElement('button'); btn.textContent='Remove …'; btn.onclick=removeEllipsesFromChat;
  const chk=document.createElement('input'); chk.type='checkbox'; chk.checked=ensureSettings().autoRemove;
  chk.onchange=()=>{ensureSettings().autoRemove=chk.checked; saveSettings();};
  const label=document.createElement('label'); label.append(chk,document.createTextNode('Auto Remove'));

  const chk2=document.createElement('input'); chk2.type='checkbox'; chk2.checked=ensureSettings().treatTwoDots;
  chk2.onchange=()=>{ensureSettings().treatTwoDots=chk2.checked; saveSettings();};
  const label2=document.createElement('label'); label2.append(chk2,document.createTextNode('ลบ ".." ด้วย'));

  box.append(btn,label,label2);
  mount.appendChild(box);
}

function wireEvents() {
  const ctx = getCtx(); if (!ctx) return;
  const { eventSource, event_types } = ctx;
  if (!eventSource) return;

  eventSource.on?.(event_types.MESSAGE_SENT, async (p) => {
    if (!p) return;
    const s=ensureSettings();
    let r1=cleanOutsideCode(p.message,s.treatTwoDots), r2=cleanOutsideCode(p.mes,s.treatTwoDots);
    if (r1.removed||r2.removed) { p.message=r1.text; p.mes=r2.text; await refreshChatUIAndWait(); }
  });

  eventSource.on?.(event_types.MESSAGE_RECEIVED, async (p) => {
    if (!p||!ensureSettings().autoRemove) return;
    const s=ensureSettings();
    let r1=cleanOutsideCode(p.message,s.treatTwoDots), r2=cleanOutsideCode(p.mes,s.treatTwoDots);
    if (r1.removed||r2.removed) { p.message=r1.text; p.mes=r2.text; await refreshChatUIAndWait(); }
  });

  if (event_types.APP_READY) eventSource.on(event_types.APP_READY, addUI);
  else { document.addEventListener('DOMContentLoaded', addUI, { once:true }); setTimeout(addUI, 1000); }
}

(function boot(){ ensureSettings(); wireEvents(); })();
