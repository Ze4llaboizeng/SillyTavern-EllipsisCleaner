/* Remove Ellipsis — Instant Visual Update Fix */
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
        removeAllDots: false, 
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
    // MODULE: Cleaner
    // ========================================================================
    const Cleaner = {
        cleanText(text, settings) {
            if (typeof text !== 'string' || !text) return { text, removed: 0 };

            // Protection Storage
            const blocks = [];
            const inlines = [];
            const scripts = [];
            const styles = [];
            const pres = [];
            const codes = [];
            const paras = [];
            const divs = [];
            const spans = [];
            const tags = [];

            let processed = text;

            if (settings.protectCode) {
                // 1. Protect Markdown
                processed = processed.replace(/```[\s\S]*?```/g, m => `@@BLOCK${blocks.push(m) - 1}@@`);
                processed = processed.replace(/`[^`]*`/g, m => `@@INLINE${inlines.push(m) - 1}@@`);
                
                // 2. Protect Technical HTML (Script, Style, Pre, Code)
                processed = processed.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => `@@SCRIPT${scripts.push(m) - 1}@@`);
                processed = processed.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, m => `@@STYLE${styles.push(m) - 1}@@`);
                processed = processed.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, m => `@@PRE${pres.push(m) - 1}@@`);
                processed = processed.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, m => `@@CODE${codes.push(m) - 1}@@`);

                // 3. Protect HTML Content Blocks (<p>, <div>, <span>) - IF EXPLICITLY TYPED
                processed = processed.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, m => `@@PARA${paras.push(m) - 1}@@`);
                processed = processed.replace(/<div\b[^>]*>[\s\S]*?<\/div>/gi, m => `@@DIV${divs.push(m) - 1}@@`);
                processed = processed.replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi, m => `@@SPAN${spans.push(m) - 1}@@`);

                // 4. Protect Attributes
                processed = processed.replace(/<[^>]+>/g, m => `@@TAG${tags.push(m) - 1}@@`);
            }

            // Pattern Selection
            let patternSource;
            if (settings.removeAllDots) {
                patternSource = "\\.+|…"; // Any dot
            } else {
                patternSource = settings.treatTwoDots ? "(?<!\\d)\\.{2,}(?!\\d)|…" : "(?<!\\d)\\.{3,}(?!\\d)|…";
            }
            const baseRegex = new RegExp(patternSource, 'g');

            // Quote Protection
            const specialAfter = new RegExp(`(?:${patternSource})[ \t]*(?=[*"'])`, 'g');
            const specialBefore = new RegExp(`(?<=[*"'])(?:${patternSource})[ \t]*`, 'g');
            
            let removedCount = 0;
            processed = processed
                .replace(specialBefore, m => { removedCount += m.length; return ''; })
                .replace(specialAfter, m => { removedCount += m.length; return ''; });

            // Main Replacement
            const mainPattern = settings.preserveSpace
                ? baseRegex
                : new RegExp(`(?:${patternSource})[ \t]*`, 'g');

            processed = processed.replace(mainPattern, (match, offset, fullStr) => {
                removedCount += match.length;
                if (!settings.preserveSpace) return '';
                const prev = fullStr[offset - 1];
                const next = fullStr[offset + match.length];
                const hasSpaceBefore = prev === undefined ? true : /\s/.test(prev);
                const hasSpaceAfter = next === undefined ? true : /\s/.test(next);
                if (hasSpaceBefore || hasSpaceAfter) return '';
                return ' '; 
            });

            // Restoration
            if (settings.protectCode) {
                processed = processed.replace(/@@TAG(\d+)@@/g, (_, i) => tags[i]);
                processed = processed.replace(/@@SPAN(\d+)@@/g, (_, i) => spans[i]);
                processed = processed.replace(/@@DIV(\d+)@@/g, (_, i) => divs[i]);
                processed = processed.replace(/@@PARA(\d+)@@/g, (_, i) => paras[i]);
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
            if (!msg) return 0;
            const settings = Core.getSettings();
            let total = 0;
            if (msg.extra) {
                ['display_text', 'original'].forEach(f => {
                    if (typeof msg.extra[f] === 'string') {
                        const r = this.cleanText(msg.extra[f], settings);
                        msg.extra[f] = r.text;
                        total += r.removed;
                    }
                });
            }
            if (typeof msg.mes === 'string') {
                const r = this.cleanText(msg.mes, settings);
                msg.mes = r.text;
                total += r.removed;
            }
            return total;
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

        async refreshChat(forceVisualUpdate = false) {
            const ctx = Core.getContext();
            if (!ctx) return;

            try {
                // 1. Save Data
                if (typeof ctx.saveChat === 'function') await ctx.saveChat();

                // 2. Notify System
                const nonce = Date.now();
                if (Array.isArray(ctx.chat)) ctx.chat = ctx.chat.map(m => ({ ...m, _rmNonce: nonce }));
                ctx.eventSource?.emit?.(ctx.event_types?.CHAT_CHANGED, { reason: 'rm-rebind' });

                // 3. Trigger Render
                if (typeof ctx.renderChat === 'function') await ctx.renderChat();

                // 4. Force Visual Update (FIXED)
                if (forceVisualUpdate && typeof document !== 'undefined') {
                    const settings = Core.getSettings();
                    // Select all message text areas
                    const selector = '.mes_text, .message-text, .chat-message .mes';
                    const nodes = document.querySelectorAll(selector);
                    
                    nodes.forEach(node => {
                        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
                        let tn;
                        while (tn = walker.nextNode()) {
                            // !!! KEY FIX: Do NOT skip 'p', 'div', or 'span' here, or nothing updates.
                            // Only skip technical code blocks.
                            if (tn.parentNode.closest('code, pre, script, style')) continue;

                            const original = tn.nodeValue;
                            // Clean the visual text (cleanText handles internal HTML protection)
                            const res = Cleaner.cleanText(original, settings);
                            
                            if (res.removed > 0) {
                                tn.nodeValue = res.text;
                            }
                        }
                    });
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
            
            let count = 0;
            ctx.chat.forEach(msg => count += Cleaner.cleanMessage(msg));
            
            // Pass 'true' to force visual update
            await UI.refreshChat(true); 
            
            if (count > 0) UI.notify(`Removed ${count} dots.`, 'success');
            else UI.notify('No dots found.', 'info');
        },

        async checkAll() {
            const ctx = Core.getContext();
            if (!ctx?.chat) return;
            let count = 0;
            const st = Core.getSettings();
            ctx.chat.forEach(msg => {
                if (typeof msg.mes === 'string') count += Cleaner.cleanText(msg.mes, st).removed;
            });
            UI.notify(count > 0 ? `Found ${count} dots.` : 'No dots found.', 'info');
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
                        
                        <label class="checkbox_label">
                            <input type="checkbox" id="rm-ell-auto" />
                            <span>Auto Remove</span>
                        </label>

                        <label class="checkbox_label">
                            <input type="checkbox" id="rm-ell-all" />
                            <span style="color: #ffaaaa;">Remove ALL Dots (.)</span>
                        </label>
                        
                        <label class="checkbox_label">
                            <input type="checkbox" id="rm-ell-twodots" />
                            <span>Remove ".."</span>
                        </label>
                        
                        <label class="checkbox_label" title="Protects content inside <p>, <div>, <span>, <code>...">
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

            $('#rm-ell-auto').prop('checked', st.autoRemove);
            $('#rm-ell-all').prop('checked', st.removeAllDots);
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

            $(document).on('change', '#rm-ell-auto', (e) => {
                updateSetting('autoRemove', e.target.checked);
                UI.notify(`Auto Remove: ${e.target.checked ? 'ON' : 'OFF'}`);
            });
            $(document).on('change', '#rm-ell-all', (e) => {
                updateSetting('removeAllDots', e.target.checked);
                if(e.target.checked) UI.notify("Warning: Will remove ALL periods!", 'warning');
            });
            $(document).on('change', '#rm-ell-twodots', (e) => updateSetting('treatTwoDots', e.target.checked));
            $(document).on('change', '#rm-ell-space', (e) => updateSetting('preserveSpace', e.target.checked));
            $(document).on('change', '#rm-ell-protect', (e) => {
                updateSetting('protectCode', e.target.checked);
                UI.notify(`Code Protection: ${e.target.checked ? 'ON' : 'OFF'}`);
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
