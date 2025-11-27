/* Remove Ellipsis — Visual & Data Sync Fix */
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
    // MODULE: Cleaner (Text Logic)
    // ========================================================================
    const Cleaner = {
        cleanText(text, settings) {
            if (typeof text !== 'string' || !text) return { text, removed: 0 };

            // Storage for masked content
            const protectedItems = [];
            let processed = text;

            if (settings.protectCode) {
                // Helper to mask content
                const mask = (regex, type) => {
                    processed = processed.replace(regex, m => `@@${type}${protectedItems.push(m) - 1}@@`);
                };

                // 1. Markdown Blocks
                mask(/```[\s\S]*?```/g, 'BLOCK');
                mask(/`[^`]*`/g, 'INLINE');

                // 2. Technical HTML Blocks (Always protect these)
                mask(/<script\b[^>]*>[\s\S]*?<\/script>/gi, 'SCRIPT');
                mask(/<style\b[^>]*>[\s\S]*?<\/style>/gi, 'STYLE');
                mask(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, 'PRE');
                mask(/<code\b[^>]*>[\s\S]*?<\/code>/gi, 'CODE');

                // 3. Structural HTML Blocks (Protect content inside these too)
                mask(/<p\b[^>]*>[\s\S]*?<\/p>/gi, 'PARA');
                mask(/<div\b[^>]*>[\s\S]*?<\/div>/gi, 'DIV');
                mask(/<span\b[^>]*>[\s\S]*?<\/span>/gi, 'SPAN');

                // 4. Generic Tag Attributes (e.g. <img src="...">)
                mask(/<[^>]+>/g, 'TAG');
            }

            // --- Pattern Definition ---
            let patternSource;
            if (settings.removeAllDots) {
                patternSource = "\\.+|…"; // Any dot
            } else {
                patternSource = settings.treatTwoDots ? "(?<!\\d)\\.{2,}(?!\\d)|…" : "(?<!\\d)\\.{3,}(?!\\d)|…";
            }
            const baseRegex = new RegExp(patternSource, 'g');

            // --- Cleaning ---
            // Quote Protection
            const specialAfter = new RegExp(`(?:${patternSource})[ \t]*(?=[*"'])`, 'g');
            const specialBefore = new RegExp(`(?<=[*"'])(?:${patternSource})[ \t]*`, 'g');
            
            let removedCount = 0;
            processed = processed
                .replace(specialBefore, m => { removedCount += m.length; return ''; })
                .replace(specialAfter, m => { removedCount += m.length; return ''; });

            // Main Replacement
            const mainPattern = settings.preserveSpace ? baseRegex : new RegExp(`(?:${patternSource})[ \t]*`, 'g');

            processed = processed.replace(mainPattern, (match, offset, fullStr) => {
                removedCount += match.length;
                if (!settings.preserveSpace) return '';
                // Smart Space Check
                const prev = fullStr[offset - 1];
                const next = fullStr[offset + match.length];
                const hasSpaceBefore = prev === undefined ? true : /\s/.test(prev);
                const hasSpaceAfter = next === undefined ? true : /\s/.test(next);
                if (hasSpaceBefore || hasSpaceAfter) return '';
                return ' '; 
            });

            // --- Restoration ---
            if (settings.protectCode) {
                // Restore in reverse order or simply by key
                processed = processed.replace(/@@TAG(\d+)@@/g, (_, i) => protectedItems[i]);
                processed = processed.replace(/@@SPAN(\d+)@@/g, (_, i) => protectedItems[i]);
                processed = processed.replace(/@@DIV(\d+)@@/g, (_, i) => protectedItems[i]);
                processed = processed.replace(/@@PARA(\d+)@@/g, (_, i) => protectedItems[i]);
                processed = processed.replace(/@@CODE(\d+)@@/g, (_, i) => protectedItems[i]);
                processed = processed.replace(/@@PRE(\d+)@@/g, (_, i) => protectedItems[i]);
                processed = processed.replace(/@@STYLE(\d+)@@/g, (_, i) => protectedItems[i]);
                processed = processed.replace(/@@SCRIPT(\d+)@@/g, (_, i) => protectedItems[i]);
                processed = processed.replace(/@@INLINE(\d+)@@/g, (_, i) => protectedItems[i]);
                processed = processed.replace(/@@BLOCK(\d+)@@/g, (_, i) => protectedItems[i]);
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
    // MODULE: UI (Visuals)
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
                // 1. Commit Data
                if (typeof ctx.saveChat === 'function') await ctx.saveChat();
                const nonce = Date.now();
                if (Array.isArray(ctx.chat)) ctx.chat = ctx.chat.map(m => ({ ...m, _rmNonce: nonce }));
                ctx.eventSource?.emit?.(ctx.event_types?.CHAT_CHANGED, { reason: 'rm-rebind' });
                
                // 2. Standard Render
                if (typeof ctx.renderChat === 'function') await ctx.renderChat();

                // 3. FORCE VISUAL UPDATE (With Protection Sync)
                if (forceVisualUpdate && typeof document !== 'undefined') {
                    const settings = Core.getSettings();
                    const selector = '.mes_text, .message-text, .chat-message .mes';
                    const nodes = document.querySelectorAll(selector);
                    
                    nodes.forEach(node => {
                        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
                        let tn;
                        while (tn = walker.nextNode()) {
                            const parent = tn.parentNode;
                            const tagName = parent.nodeName;

                            // VISUAL PROTECTION LOGIC:
                            // If code protection is ON, we must NOT clean text inside specific tags.
                            if (settings.protectCode) {
                                // Always protect technical tags
                                if (['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(tagName)) continue;
                                
                                // Protect HTML Structure tags (P, DIV, SPAN) ONLY if they are nested 
                                // (i.e., not the main SillyTavern message container)
                                if (['P', 'DIV', 'SPAN'].includes(tagName)) {
                                    // Check if this tag is the main message container.
                                    // If it HAS the class 'mes_text' (or similar), it's the root, so CLEAN IT.
                                    // If it does NOT have that class, it's a nested user tag, so PROTECT IT.
                                    const isRootContainer = parent.classList.contains('mes_text') || 
                                                          parent.classList.contains('message-text') || 
                                                          parent.classList.contains('mes');
                                    
                                    if (!isRootContainer) continue; // Skip/Protect this nested tag
                                }
                            }

                            // If allowed, clean the text node
                            const original = tn.nodeValue;
                            // Note: cleanText is called on raw text here, so its internal regex protection 
                            // won't trigger (no tags in raw text), which is why the parent check above is crucial.
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
            await UI.refreshChat(true); 
            
            if (count > 0) UI.notify(`Removed ${count} dots.`, 'success');
            else UI.notify('No dots found (or protected).', 'info');
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

                        <label class="checkbox_label" title="DANGER: Removes every single dot '.'">
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
