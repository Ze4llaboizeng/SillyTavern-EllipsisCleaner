import { cleanMessageObject, cleanOutsideCode } from './cleaner.js';
import { toast, overlayHighlight } from './ui.js';
import { refreshChatUI, refreshChatUIAndWait } from './refresh.js';

const MODULE = 'removeEllipsisExt';
const DEFAULTS = {
  autoRemove: false,
  treatTwoDots: true,
};

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
  const label=document.createElement('label'); const chk=document.createElement('input'); chk.type='checkbox';
  chk.checked=ensureSettings().autoRemove; chk.onchange=()=>{ensureSettings().autoRemove=chk.checked; saveSettings();};
  label.append(chk,document.createTextNode('Auto Remove'));

  const label2=document.createElement('label'); const chk2=document.createElement('input'); chk2.type='checkbox';
  chk2.checked=ensureSettings().treatTwoDots; chk2.onchange=()=>{ensureSettings().treatTwoDots=chk2.checked; saveSettings();};
  label2.append(chk2,document.createTextNode('ลบ ".." ด้วย'));

  box.append(btn,label,label2);
  mount.appendChild(box);
}

(function boot(){
  ensureSettings();
  document.addEventListener('DOMContentLoaded', addUI);
  setTimeout(addUI, 1000);
})();
