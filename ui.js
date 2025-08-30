export function ensureFeedbackUI() {
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

export function toast(msg) {
  ensureFeedbackUI();
  const el = document.getElementById('rm-ellipsis-toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ el.style.opacity = '0'; }, 1200);
}

export function overlayHighlight(node) {
  if (!node || node.nodeType !== 1) return;
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
