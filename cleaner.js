/* Remove Ellipsis — cleaner.js */
(() => {
  const core = window.RemoveEllipsis?.core;
  if (!core) return console.warn('[RemoveEllipsis] core missing for cleaner');

  // ลบเฉพาะนอกโค้ด: ข้าม ```block``` และ `inline`
  function cleanOutsideCode(text, treatTwoDots) {
    if (typeof text !== 'string' || !text) return { text, removed: 0 };

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
    restored = restored.replace(/@@BLOCK(\d+)@@/g,  (_,i)=>blocks[i]);
    return { text: restored, removed };
  }

  function cleanMessageObject(msg) {
    if (!msg) return 0;
    const st = core.ensureSettings();
    let total = 0;
    if (typeof msg.mes === 'string') {
      const r = cleanOutsideCode(msg.mes, st.treatTwoDots); msg.mes = r.text; total += r.removed;
    }
    if (msg.extra) {
      if (typeof msg.extra.display_text === 'string') {
        const r = cleanOutsideCode(msg.extra.display_text, st.treatTwoDots); msg.extra.display_text = r.text; total += r.removed;
      }
      if (typeof msg.extra.original === 'string') {
        const r = cleanOutsideCode(msg.extra.original, st.treatTwoDots); msg.extra.original = r.text; total += r.removed;
      }
    }
    return total;
  }

  window.RemoveEllipsis = Object.assign(window.RemoveEllipsis || {}, {
    cleaner: { cleanOutsideCode, cleanMessageObject }
  });
})();
