/* Remove Ellipsis — Aggressive Cleaning & Instant Update */
(() => {
    if (typeof window === 'undefined') { global.window = {}; }
    if (window.__REMOVE_ELLIPSIS_EXT_LOADED__) return;
    window.__REMOVE_ELLIPSIS_EXT_LOADED__ = true;

    // ========================================================================
    // MODULE: Constants & Defaults
    // ========================================================================
    const MODULE_NAME = 'removeEllipsisExt';
    const DEFAULTS = { 
        autoRemove: false, 
        treatTwoDots: true, 
        removeAllDots: false, // New: Aggressive Mode
        preserveSpace: true,
        protectCode: true 
    };

    // ========================================================================
    // MODULE: Core
    // ========================================================================
    const Core = {
        getContext() {
            try { return window.SillyTavern?.getContext?.() || null; } catch (_) { return null; }
        },
        getSettings() {
            const ctx = this.getContext();
            if (!ctx) return structuredClone(DEFAULTS);
            const store = ctx.extensionSettings || (ctx.extensionSettings = {});
            if (!store[MODULE_NAME]) store[MODULE_NAME] = {};
            for (const key of Object.keys(DEFAULTS)) {
                if (!(key in store[MODULE_NAME])) store[MODULE_NAME][key] = DEFAULTS[key];
            }
            return store[MODULE_NAME];
        },
        saveSettings() {
            const ctx = this.getContext();
            if (ctx?.saveSettingsDebounced) ctx.saveSettingsDebounced();
            else if (ctx?.saveSettings) ctx.saveSettings();
        }
    };

    // ========================================================================
    // MODULE: Cleaner (Logic)
    // ========================================================================
    const Cleaner = {
        cleanText(text, settings) {
            if (typeof text !== 'string' || !text) return { text, removed: 0 };

            // --- 1. Protection Phase (Save Code/HTML) ---
            const blocks = [];
            const inlines = [];
            const scripts = [];
            const styles = [];
            const pres = [];
            const codes = [];
            const paragraphs = [];
            const divs = [];
            const spans = [];
            const tags = [];

            let processed = text;

            if (settings.protectCode) {
                // Markdown
                processed = processed.replace(/```[\s\S]*?```/g, m => `@@BLOCK${blocks.push(m) - 1}@@`);
                processed = processed.replace(/`[^`]*`/g, m => `@@INLINE${inlines.push(m) - 1}@@`);

                // HTML Blocks (Keep Content)
                processed = processed.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => `@@SCRIPT${scripts.push(m) - 1}@@`);
                processed = processed.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, m => `@@STYLE${styles.push(m) - 1}@@`);
                processed = processed.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, m => `@@PRE${pres.push(m) - 1}@@`);
                processed = processed.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, m => `@@CODE${codes.push(m) - 1}@@`);
                
                // HTML Text Blocks (Keep Text inside)
                processed = processed.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, m => `@@PARA${paragraphs.push(m) - 1}@@`);
                processed = processed.replace(/<div\b[^>]*>[\s\S]*?<\/div>/gi, m => `@@DIV${divs.push(m) - 1}@@`);
                processed = processed.replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi, m => `@@SPAN${spans.push(m) - 1}@@`);

                // Generic Tags (Keep Attributes)
                processed = processed.replace(/<[^>]+>/g, m => `@@TAG${tags.push(m) - 1}@@`);
            }

            // --- 2. Definition Phase ---
            let pattern;
            
            if (settings.removeAllDots) {
                // AGGRESSIVE: Match ANY single dot
                pattern = /\./g;
            } else {
                // STANDARD: Match sequences
                const base = settings.treatTwoDots
                    ? /(?<!\d)\.{2,}(?!\d)|…/g
                    : /(?<!\d)\.{3,}(?!\d)|…/g;
                pattern = base;
            }

            // --- 3. Cleaning Phase ---
            let removedCount = 0;
            
            // Special handling only needed if we aren't nuking everything
            if (!settings.removeAllDots) {
                const specialAfter = new RegExp(`(?:${pattern.source})[ \t]*(?=[*"'])`, 'g');
                const specialBefore = new RegExp(`(?<=[*"'])(?:${pattern.source})[ \t]*`, 'g');
                
                processed = processed
                    .replace(specialBefore, m => { removedCount += m.length; return ''; })
                    .replace(specialAfter, m => { removedCount += m.length; return ''; });
            }

            const mainPattern = settings.preserveSpace && !settings.removeAllDots
                ? pattern
                : new RegExp(`(?:${settings.removeAllDots ? '\\.' : pattern.source})[ \t]*`, 'g');

            processed = processed.replace(mainPattern, (match, offset, fullStr) => {
                removedCount += match.length;
                if (!settings.preserveSpace) return '';

                // If removing all dots, we usually don't want to add spaces for every single period 
                // unless user specifically requested "Preserve Space".
                // Logic: If "Remove All" is ON, adding space might break words (e.g. node.js -> node js).
                // But we respect the setting.
                
                const prev = fullStr[offset - 1];
                const next = fullStr[offset + match.length];
                const hasSpaceBefore = prev === undefined ? true : /\s/.test(prev);
                const hasSpaceAfter = next === undefined ? true : /\s/.test(next);

                if (hasSpaceBefore || hasSpaceAfter) return '';
                return ' ';
            });

            // --- 4. Restoration Phase ---
            if (settings.protectCode) {
                processed = processed.replace(/@@TAG(\d+)@@/g, (_, i) => tags[i]);
                processed = processed.replace(/@@SPAN(\d+)@@/g, (_, i) => spans[i]);
                processed = processed.replace(/@@DIV(\d+)@@/g, (_, i) => divs[i]);
                processed = processed.replace(/@@PARA(\d+)@@/g, (_, i) => paragraphs[i]);
                processed = processed.replace(/@@CODE(\d+)@@/g, (_, i) => codes[i]);
                processed = processed.replace(/@@PRE(\d+)@@/g, (_, i) => pres[i]);
                processed = processed.replace(/@@STYLE(\d+)@@/g, (_, i) => styles[i]);
                processed = processed.replace(/@@SCRIPT(\d+)@@/g, (_, i) => scripts[i]);
                processed = processed.replace(/@@INLINE(\d+)@@/g, (_, i) => inlines[i]);
                processed = processed.replace(/@@BLOCK(\d+)@@/g, (_, i) => blocks[i]);
            }

            return { text: processed, removed: removedCount };
        },

        cleanMessage(msg) {
            if (!msg) return { count: 0, changed: false };
            const settings = Core.getSettings();
            let total = 0;
            let hasChanges = false;

            // Helper to clean a field
            const processField = (val) => {
                if (typeof val !== 'string') return { val, diff: 0 };
                const res = this.cleanText(val, settings);
                return { val: res.text, diff: res.removed };
            };

            // Main Text
            if (typeof msg.mes === 'string') {
                const r = processField(msg.mes);
                if (r.diff > 0) {
                    msg.mes = r.val;
                    total += r.diff;
                    hasChanges = true;
                }
            }

            // Extras
            if (msg.extra) {
                if (typeof msg.extra.display_text === 'string') {
                    const r = processField(msg.extra.display_text);
                    if (r.diff > 0) {
                        msg.extra.display_text = r.val;
                        total += r.diff;
                        hasChanges = true;
                    }
                }
                if (typeof msg.extra.original === 'string') {
                    const r = processField(msg.extra.original);
                    if (r.diff > 0) {
                        msg.extra.original = r.val;
                        total += r.diff;
                        hasChanges = true;
                    }
                }
            }

            return { count: total, changed: hasChanges };
        }
    };

    // ========================================================================
    // MODULE: UI
    // ========================================================================
    const UI = {
        notify(msg, type = 'info') {
            if (typeof toastr !== 'undefined' && toastr[type]) toastr[type](msg, 'Ellipsis Cleaner');
            else console.log(`[EllipsisCleaner] ${msg}`);
        },

        closeDrawer() {
            if (typeof $ !== 'undefined') $('.drawer-overlay').trigger('click');
        },

        async refreshChat(force = false) {
            const ctx = Core.getContext();
            if (!ctx) return;

            try {
                // 1. Save Chat
                if (typeof ctx.saveChat === 'function') await ctx.saveChat();

                // 2. Trigger Reactivity (New Nonce)
                const nonce = Date.now();
                if (Array.isArray(ctx.chat)) {
                    // We must replace the array to force some frameworks to notice
                    // But ST relies on the object reference usually.
                    // We simply map the nonce.
                    ctx.chat = ctx.chat.map(m => ({ ...m, _rmNonce: nonce }));
                }

                // 3. Emit Changed Event
                ctx.eventSource?.emit?.(ctx.event_types?.CHAT_CHANGED, { reason: 'rm-clean' });
                
                // 4. Force Render
                if (typeof ctx.renderChat === 'function') {
                    await ctx.renderChat();
                }

                // 5. Hard DOM Force (Fallback)
                if (force && typeof document !== 'undefined') {
                    setTimeout(() => {
                        // If render didn't catch it, we manually scrub visible nodes
                        const settings = Core.getSettings();
                        const selector = '.mes_text, .message-text, .chat-message .mes';
                        document.querySelectorAll(selector).forEach(node => {
                            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
                            let tn;
                            while (tn = walker.nextNode()) {
                                if (tn.parentNode.closest('code, pre, script, style, p, div, span')) continue;
                                const original = tn.nodeValue;
                                const res = Cleaner.cleanText(original, settings);
                                if (res.removed > 0) tn.nodeValue = res.text;
                            }
                        });
                    }, 50);
                }

            } catch (e) { console.warn('Refresh error:', e); }
        }
    };

    // ========================================================================
    // MODULE: App
    // ========================================================================
    const App = {
        async removeAll() {
            const ctx = Core.getContext();
            if (!ctx?.chat) return;
            
            let totalRemoved = 0;
            let anyChange = false;

            // IMPORTANT: Create a NEW array to force reactivity
            const newChat = ctx.chat.map(msg => {
                // Clone message to avoid reference staleness
                const clone = structuredClone(msg);
                const res = Cleaner.cleanMessage(clone);
                if (res.changed) {
                    totalRemoved += res.count;
                    anyChange = true;
                    return clone; // Return cleaned copy
                }
                return msg; // Return original if no change
            });

            if (anyChange) {
                ctx.chat = newChat; // Swap the array
                await UI.refreshChat(true); // Aggressive refresh
                UI.notify(`Cleaned ${totalRemoved} dots.`, 'success');
            } else {
                UI.notify('No dots found to clean.', 'info');
            }
        },

        async checkAll() {
            const ctx = Core.getContext();
            if (!ctx?.chat) return;
            let count = 0;
            const st = Core.getSettings();
            ctx.chat.forEach(msg => {
                if (typeof msg.mes === 'string') count += Cleaner.cleanText(msg.mes, st).removed;
            });
            UI.notify(count > 0 ? `Found ${count} dots.` : 'Clean.', 'info');
        },

        injectSettings() {
            if (typeof $ === 'undefined') return;
            const container = $('#extensions_settings');
            if (!container.length || $('#remove-ellipsis-settings').length) return;

            const html = `
            <div id="remove-ellipsis-settings" class="extension_settings_block">
                <div class="rm-settings-drawer">
                    <div class="rm-settings-header" title="Click to open/close">
                        <span class="rm-label">Remove Ellipsis Cleaner</span>
                        <div class="rm-icon fa-solid fa-circle-chevron-down"></div>
                    </div>
                    <div class="rm-settings-content" style="display:none;">
                        
                        <label class="checkbox_label" style="background: rgba(255,0,0,0.1); padding:5px; border-radius:4px;" title="WARNING: Removes EVERY SINGLE DOT in text">
                            <input type="checkbox" id="rm-ell-all" />
                            <span style="margin-left:8px; font-weight:bold; color: #ff8888;">REMOVE ALL DOTS (.)</span>
                        </label>

                        <div style="height:1px; background:#444; margin:5px 0;"></div>

                        <label class="checkbox_label">
                            <input type="checkbox" id="rm-ell-auto" />
                            <span>Auto Remove</span>
                        </label>
                        <label class="checkbox_label">
                            <input type="checkbox" id="rm-ell-twodots" />
                            <span>Remove ".."</span>
                        </label>
                        <label class="checkbox_label" title="Protects HTML blocks like <p>, <div>, <span>, <code>">
                            <input type="checkbox" id="rm-ell-protect" />
                            <span>Protect Code & HTML</span>
                        </label>
                        <label class="checkbox_label">
                            <input type="checkbox" id="rm-ell-space" />
                            <span>Preserve Space</span>
                        </label>
                        <div style="display: flex; gap: 5px; margin-top: 10px;">
                            <button id="rm-ell-btn-clean" class="menu_button">Clean Now</button>
                            <button id="rm-ell-btn-check" class="menu_button">Check</button>
                        </div>
                    </div>
                </div>
            </div>`;

            container.append(html);
            const st = Core.getSettings();

            $('#rm-ell-all').prop('checked', st.removeAllDots);
            $('#rm-ell-auto').prop('checked', st.autoRemove);
            $('#rm-ell-twodots').prop('checked', st.treatTwoDots);
            $('#rm-ell-space').prop('checked', st.preserveSpace);
            $('#rm-ell-protect').prop('checked', st.protectCode !== false);
        },

        bindEvents() {
            if (this._eventsBound) return;
            this._eventsBound = true;

            $(document).on('click', '#remove-ellipsis-settings .rm-settings-header', function(e) {
                e.preventDefault();
                const content = $(this).next('.rm-settings-content');
                const icon = $(this).find('.rm-icon');
                if (content.is(':visible')) {
                    content.slideUp(150);
                    icon.removeClass('down');
                } else {
                    content.slideDown(150);
                    icon.addClass('down');
                }
            });

            const updateSetting = (key, val) => {
                Core.getSettings()[key] = val;
                Core.saveSettings();
            };
            
            // NEW: Remove All Dots Setting
            $(document).on('change', '#rm-ell-all', (e) => {
                updateSetting('removeAllDots', e.target.checked);
                if (e.target.checked) UI.notify('WARNING: This will remove every period in the text!', 'warning');
            });

            $(document).on('change', '#rm-ell-auto', (e) => {
                updateSetting('autoRemove', e.target.checked);
                UI.notify(`Auto Remove: ${e.target.checked ? 'ON' : 'OFF'}`);
            });
            $(document).on('change', '#rm-ell-twodots', (e) => updateSetting('treatTwoDots', e.target.checked));
            $(document).on('change', '#rm-ell-space', (e) => updateSetting('preserveSpace', e.target.checked));
            $(document).on('change', '#rm-ell-protect', (e) => {
                updateSetting('protectCode', e.target.checked);
                UI.notify(`HTML Protection: ${e.target.checked ? 'ON' : 'OFF'}`);
            });

            $(document).on('click', '#rm-ell-btn-clean', async (e) => {
                e.preventDefault();
                UI.closeDrawer();
                await App.removeAll();
            });
            $(document).on('click', '#rm-ell-btn-check', async (e) => {
                e.preventDefault();
                UI.closeDrawer();
                await App.checkAll();
            });
        },

        init() {
            const ctx = Core.getContext();
            this.bindEvents(); 
            if (ctx?.eventSource) {
                ctx.eventSource.on(ctx.event_types.MESSAGE_RECEIVED, async () => {
                    if (Core.getSettings().autoRemove) await App.removeAll();
                });
            }
            const form = document.querySelector('form.send-form, #send_form');
            if (form) form.addEventListener('submit', () => {
               if (Core.getSettings().autoRemove) setTimeout(() => App.removeAll(), 50);
            }, true);
            this.injectSettings();
        }
    };

    (function boot() {
        if (typeof document === 'undefined') return;
        const onReady = () => {
            App.init();
            const obs = new MutationObserver(() => App.injectSettings());
            const target = document.querySelector('#content') || document.body;
            obs.observe(target, { childList: true, subtree: true });
        };
        if (window.SillyTavern?.getContext) onReady();
        else setTimeout(onReady, 2000); 
    })();

    window.RemoveEllipsis = { Core, Cleaner, UI, App };
})();
