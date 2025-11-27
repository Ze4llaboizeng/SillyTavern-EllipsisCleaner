/* Remove Ellipsis — Instant Update & Fixed UI */
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
        preserveSpace: true,
        protectCode: true 
    };

    // ========================================================================
    // MODULE: Core (Settings)
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

            // 1. Protection Phase
            const blocks = [];
            const inlines = [];
            const htmlTags = [];
            let processed = text;

            if (settings.protectCode) {
                // Protect ```code blocks```
                processed = processed.replace(/```[\s\S]*?```/g, m => `@@BLOCK${blocks.push(m) - 1}@@`);
                // Protect `inline code`
                processed = processed.replace(/`[^`]*`/g, m => `@@INLINE${inlines.push(m) - 1}@@`);
                // Protect <HTML tags>
                processed = processed.replace(/<[^>]+>/g, m => `@@HTML${htmlTags.push(m) - 1}@@`);
            }

            // 2. Cleaning Phase
            const basePattern = settings.treatTwoDots
                ? /(?<!\d)\.{2,}(?!\d)|…/g
                : /(?<!\d)\.{3,}(?!\d)|…/g;

            // Remove dots near quotes "..." -> "
            const specialAfter = new RegExp(`(?:${basePattern.source})[ \t]*(?=[*"'])`, 'g');
            const specialBefore = new RegExp(`(?<=[*"'])(?:${basePattern.source})[ \t]*`, 'g');
            
            let removedCount = 0;
            processed = processed
                .replace(specialBefore, m => { removedCount += m.length; return ''; })
                .replace(specialAfter, m => { removedCount += m.length; return ''; });

            // Main removal
            const mainPattern = settings.preserveSpace
                ? basePattern
                : new RegExp(`(?:${basePattern.source})[ \t]*`, 'g');

            processed = processed.replace(mainPattern, (match, offset, fullStr) => {
                removedCount += match.length;
                if (!settings.preserveSpace) return '';

                // Smart Space
                const prev = fullStr[offset - 1];
                const next = fullStr[offset + match.length];
                const hasSpaceBefore = prev === undefined ? true : /\s/.test(prev);
                const hasSpaceAfter = next === undefined ? true : /\s/.test(next);

                if (hasSpaceBefore || hasSpaceAfter) return '';
                return ' ';
            });

            // 3. Restoration Phase
            if (settings.protectCode) {
                processed = processed.replace(/@@HTML(\d+)@@/g, (_, i) => htmlTags[i]);
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
    // MODULE: UI (Interaction)
    // ========================================================================
    const UI = {
        notify(msg, type = 'info') {
            if (typeof toastr !== 'undefined' && toastr[type]) toastr[type](msg, 'Ellipsis Cleaner');
            else console.log(`[EllipsisCleaner] ${msg}`);
        },

        closeDrawer() {
            if (typeof $ !== 'undefined') $('.drawer-overlay').trigger('click');
        },

        /**
         * INSTANTLY cleans the text visible in the HTML DOM.
         * This ensures the user sees changes immediately without waiting for a re-render.
         */
        forceDOMRefresh() {
            if (typeof document === 'undefined') return;
            const st = Core.getSettings();
            
            // Select all potential message containers
            const selectors = '.mes_text, .message-text, .chat-message, .mes_markdown, .markdown';
            const nodes = document.querySelectorAll(selectors);

            nodes.forEach(node => {
                // Use TreeWalker to find text nodes safely (skipping code blocks)
                const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
                let textNode;
                while ((textNode = walker.nextNode())) {
                    let parent = textNode.parentNode;
                    let skip = false;
                    
                    // Don't clean inside Code blocks or Preformatted text if protection is on
                    if (st.protectCode) {
                        while (parent && parent !== node) {
                            if (parent.nodeName === 'CODE' || parent.nodeName === 'PRE') { 
                                skip = true; 
                                break; 
                            }
                            parent = parent.parentNode;
                        }
                    }
                    if (skip) continue;

                    // Apply cleaning to the visual text node
                    const r = Cleaner.cleanText(textNode.nodeValue, st);
                    if (r.removed > 0) {
                        textNode.nodeValue = r.text;
                    }
                }
            });
        },

        async refreshChat() {
            const ctx = Core.getContext();
            if (!ctx) return;
            try {
                // 1. Force React/Vue reactivity by updating nonce
                const nonce = Date.now();
                if (Array.isArray(ctx.chat)) ctx.chat = ctx.chat.map(m => ({ ...m, _rmNonce: nonce }));
                
                // 2. Save changes to storage
                if (ctx.saveChat) await ctx.saveChat();

                // 3. Emit update events
                ctx.eventSource?.emit?.(ctx.event_types?.CHAT_CHANGED, { reason: 'rm-rebind' });
                
                // 4. Trigger standard render
                if (typeof ctx.renderChat === 'function') await ctx.renderChat();
                
                // 5. Hard Reload (fallback) if available
                if (typeof ctx.reloadCurrentChat === 'function') await ctx.reloadCurrentChat();
            } catch (e) { console.warn(e); }
        }
    };

    // ========================================================================
    // MODULE: App (Logic & Wiring)
    // ========================================================================
    const App = {
        async removeAll() {
            const ctx = Core.getContext();
            if (!ctx?.chat) return;
            
            let count = 0;
            // 1. Clean internal data
            ctx.chat.forEach(msg => count += Cleaner.cleanMessage(msg));
            
            // 2. Clean visual DOM immediately (Instant Feedback)
            UI.forceDOMRefresh();

            // 3. Persist and Refresh in background
            await UI.refreshChat();

            if (count > 0) UI.notify(`Removed ${count} ellipses.`, 'success');
            else UI.notify('No ellipses found.', 'info');
        },

        async checkAll() {
            const ctx = Core.getContext();
            if (!ctx?.chat) return;
            let count = 0;
            const st = Core.getSettings();
            ctx.chat.forEach(msg => {
                if (typeof msg.mes === 'string') count += Cleaner.cleanText(msg.mes, st).removed;
            });
            UI.notify(count > 0 ? `Found ${count} ellipses.` : 'No ellipses found.', 'info');
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
                        <label class="checkbox_label" title="Clean automatically when sending/receiving">
                            <input type="checkbox" id="rm-ell-auto" />
                            <span>Auto Remove</span>
                        </label>
                        <label class="checkbox_label" title="Also remove '..' (2 dots)">
                            <input type="checkbox" id="rm-ell-twodots" />
                            <span>Remove ".."</span>
                        </label>
                        <label class="checkbox_label" title="Don't touch HTML tags or Code blocks">
                            <input type="checkbox" id="rm-ell-protect" />
                            <span>Protect Code & HTML</span>
                        </label>
                        <label class="checkbox_label" title="Leave a space where dots were removed">
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

            // Bind Settings
            $('#rm-ell-auto').prop('checked', st.autoRemove);
            $('#rm-ell-twodots').prop('checked', st.treatTwoDots);
            $('#rm-ell-space').prop('checked', st.preserveSpace);
            $('#rm-ell-protect').prop('checked', st.protectCode !== false);
        },

        bindEvents() {
            if (this._eventsBound) return;
            this._eventsBound = true;

            // Global Click Delegation (Fixes "Click does nothing")
            $(document).on('click', '#remove-ellipsis-settings .rm-settings-header', function(e) {
                e.preventDefault();
                e.stopPropagation();
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

            // Settings Changes
            $(document).on('change', '#rm-ell-auto', (e) => {
                Core.getSettings().autoRemove = e.target.checked;
                Core.saveSettings();
                UI.notify(`Auto Remove: ${e.target.checked ? 'ON' : 'OFF'}`);
            });
            $(document).on('change', '#rm-ell-twodots', (e) => {
                Core.getSettings().treatTwoDots = e.target.checked;
                Core.saveSettings();
            });
            $(document).on('change', '#rm-ell-space', (e) => {
                Core.getSettings().preserveSpace = e.target.checked;
                Core.saveSettings();
            });
            $(document).on('change', '#rm-ell-protect', (e) => {
                Core.getSettings().protectCode = e.target.checked;
                Core.saveSettings();
                UI.notify(`Code Protection: ${e.target.checked ? 'ON' : 'OFF'}`);
            });

            // Action Buttons
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

            const hookInput = () => {
                const form = document.querySelector('form.send-form, #send_form');
                if (form) form.addEventListener('submit', () => {
                   if (Core.getSettings().autoRemove) setTimeout(() => App.removeAll(), 50);
                }, true);
            };
            hookInput();

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
