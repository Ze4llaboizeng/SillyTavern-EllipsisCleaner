/* Remove Ellipsis — Refactored & Native UI */
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
        highlight: 'overlay', 
        preserveSpace: true 
    };

    // ========================================================================
    // MODULE: Core (Settings & Context)
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
            
            // Ensure all defaults exist
            for (const key of Object.keys(DEFAULTS)) {
                if (!(key in store[MODULE_NAME])) {
                    store[MODULE_NAME][key] = DEFAULTS[key];
                }
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
    // MODULE: Cleaner (Text Processing)
    // ========================================================================
    const Cleaner = {
        /**
         * Removes ellipses from text, ignoring code blocks and inline code.
         */
        cleanText(text, settings) {
            if (typeof text !== 'string' || !text) return { text, removed: 0 };

            // 1. Protect Code Blocks
            const blockRegex = /```[\s\S]*?```/g;
            const blocks = [];
            const protectedBlocks = text.replace(blockRegex, m => `@@BLOCK${blocks.push(m) - 1}@@`);

            // 2. Protect Inline Code
            const inlineRegex = /`[^`]*`/g;
            const inlines = [];
            const protectedInlines = protectedBlocks.replace(inlineRegex, m => `@@INLINE${inlines.push(m) - 1}@@`);

            // 3. Define Patterns
            const basePattern = settings.treatTwoDots
                ? /(?<!\d)\.{2,}(?!\d)|…/g
                : /(?<!\d)\.{3,}(?!\d)|…/g;

            // 4. Remove around quotes (Special Handling)
            // Remove space+ellipsis before quote end or ellipsis+space after quote start
            const specialAfter = new RegExp(`(?:${basePattern.source})[ \t]*(?=[*"'])`, 'g');
            const specialBefore = new RegExp(`(?<=[*"'])(?:${basePattern.source})[ \t]*`, 'g');
            
            let removedCount = 0;
            let processed = protectedInlines
                .replace(specialBefore, m => { removedCount += m.length; return ''; })
                .replace(specialAfter, m => { removedCount += m.length; return ''; });

            // 5. Main Removal
            const mainPattern = settings.preserveSpace
                ? basePattern
                : new RegExp(`(?:${basePattern.source})[ \t]*`, 'g');

            processed = processed.replace(mainPattern, (match, offset, fullStr) => {
                removedCount += match.length;
                if (!settings.preserveSpace) return '';

                // Smart Spacing Logic
                const prevChar = fullStr[offset - 1];
                const nextChar = fullStr[offset + match.length];
                const hasSpaceBefore = prevChar === undefined ? true : /\s/.test(prevChar);
                const hasSpaceAfter = nextChar === undefined ? true : /\s/.test(nextChar);

                if (hasSpaceBefore || hasSpaceAfter) return '';
                return ' ';
            });

            // 6. Restore Code
            let final = processed.replace(/@@INLINE(\d+)@@/g, (_, i) => inlines[i]);
            final = final.replace(/@@BLOCK(\d+)@@/g, (_, i) => blocks[i]);

            return { text: final, removed: removedCount };
        },

        /**
         * Cleans a SillyTavern message object (mes, display_text, original).
         */
        cleanMessage(msg) {
            if (!msg) return 0;
            const settings = Core.getSettings();
            let totalRemoved = 0;

            const fields = ['mes'];
            // Access nested fields safely
            if (msg.extra) {
                if (typeof msg.extra.display_text === 'string') {
                    const res = this.cleanText(msg.extra.display_text, settings);
                    msg.extra.display_text = res.text;
                    totalRemoved += res.removed;
                }
                if (typeof msg.extra.original === 'string') {
                    const res = this.cleanText(msg.extra.original, settings);
                    msg.extra.original = res.text;
                    totalRemoved += res.removed;
                }
            }

            // Main message content
            if (typeof msg.mes === 'string') {
                const res = this.cleanText(msg.mes, settings);
                msg.mes = res.text;
                totalRemoved += res.removed;
            }

            return totalRemoved;
        }
    };

    // ========================================================================
    // MODULE: UI (Interaction & Notifications)
    // ========================================================================
    const UI = {
        /**
         * Uses SillyTavern's native toastr if available.
         */
        notify(msg, type = 'info') {
            if (typeof toastr !== 'undefined' && toastr[type]) {
                toastr[type](msg, 'Ellipsis Cleaner');
            } else {
                console.log(`[RemoveEllipsis] ${msg}`);
            }
        },

        /**
         * Standard way to close the ST Extensions drawer.
         */
        closeDrawer() {
            if (typeof $ !== 'undefined') {
                $('.drawer-overlay').trigger('click');
            }
        },

        /**
         * Triggers a UI refresh without reloading the page.
         */
        async refreshChat() {
            const ctx = Core.getContext();
            if (!ctx) return;

            // Force internal updates
            try {
                const nonce = Date.now();
                if (Array.isArray(ctx.chat)) {
                    ctx.chat = ctx.chat.map(m => ({ ...m, _rmNonce: nonce }));
                }
                ctx.eventSource?.emit?.(ctx.event_types?.CHAT_CHANGED, { reason: 'rm-rebind' });
                
                // The main render call
                if (typeof ctx.renderChat === 'function') {
                    await ctx.renderChat();
                }
            } catch (e) {
                console.warn('[RemoveEllipsis] Refresh failed', e);
            }
        }
    };

    // ========================================================================
    // MODULE: App (Main Logic & Event Wiring)
    // ========================================================================
    const App = {
        async removeAll() {
            const ctx = Core.getContext();
            if (!ctx?.chat) return;

            let count = 0;
            ctx.chat.forEach(msg => {
                count += Cleaner.cleanMessage(msg);
            });

            await UI.refreshChat();
            
            if (count > 0) UI.notify(`Removed ${count} ellipses.`, 'success');
            else UI.notify('No ellipses found to clean.', 'info');
        },

        async checkAll() {
            const ctx = Core.getContext();
            if (!ctx?.chat) return;

            let count = 0;
            const st = Core.getSettings();

            // Dry run
            ctx.chat.forEach(msg => {
                if (typeof msg.mes === 'string') count += Cleaner.cleanText(msg.mes, st).removed;
                if (msg.extra?.display_text) count += Cleaner.cleanText(msg.extra.display_text, st).removed;
            });

            await UI.refreshChat(); // Re-render to ensure visual sync
            UI.notify(count > 0 ? `Found ${count} ellipses.` : 'No ellipses found.', 'info');
        },

        handleInputEvents() {
            if (typeof document === 'undefined') return;

            const getInput = () => document.querySelector('textarea, .chat-input textarea, .st-user-input [contenteditable="true"]');

            const sanitize = () => {
                const el = getInput();
                if (!el) return 0;
                
                const val = el.value || el.textContent;
                const res = Cleaner.cleanText(val, Core.getSettings());
                
                if (res.removed > 0) {
                    if ('value' in el) el.value = res.text;
                    else el.textContent = res.text;
                    
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return res.removed;
            };

            // Hook send buttons and form submit
            const hook = () => {
                const form = document.querySelector('form.send-form, #send_form');
                const btn = document.querySelector('#send_but, .st-send');

                const action = async () => {
                    const n = sanitize();
                    const st = Core.getSettings();
                    
                    if (st.autoRemove) {
                        setTimeout(() => App.removeAll(), 10);
                    } else if (n > 0) {
                        UI.notify(`Cleaned ${n} from input`, 'info');
                    }
                };

                if (form) form.addEventListener('submit', action, true);
                if (btn) btn.addEventListener('mousedown', action, true);
                
                const input = getInput();
                if (input) {
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) action();
                    });
                }
            };
            
            hook();
        },

        injectSettings() {
            if (typeof $ === 'undefined') return;
            const container = $('#extensions_settings');
            if (!container.length || $('#remove-ellipsis-settings').length) return;

            const html = `
            <div id="remove-ellipsis-settings" class="extension_settings_block">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>Remove Ellipsis Cleaner</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content" style="display:none;">
                        <div style="padding: 10px;">
                            <label class="checkbox_label" style="display: flex; align-items: center; margin-bottom: 5px;">
                                <input type="checkbox" id="rm-ell-auto" />
                                <span style="margin-left: 8px;">Auto Remove (Always Active)</span>
                            </label>
                            
                            <label class="checkbox_label" style="display: flex; align-items: center; margin-bottom: 5px;">
                                <input type="checkbox" id="rm-ell-twodots" />
                                <span style="margin-left: 8px;">Remove ".." (Double dots)</span>
                            </label>
                            
                            <label class="checkbox_label" style="display: flex; align-items: center; margin-bottom: 10px;">
                                <input type="checkbox" id="rm-ell-space" />
                                <span style="margin-left: 8px;">Preserve Space</span>
                            </label>

                            <div style="display: flex; gap: 10px; margin-top: 10px;">
                                <button id="rm-ell-btn-clean" class="menu_button">
                                    Clean Chat Now
                                </button>
                                <button id="rm-ell-btn-check" class="menu_button">
                                    Check Count
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

            container.append(html);

            const st = Core.getSettings();
            
            // Toggle Drawer
            $('#remove-ellipsis-settings .inline-drawer-header').on('click', function() {
                $(this).next('.inline-drawer-content').slideToggle(200);
                $(this).find('.inline-drawer-icon').toggleClass('down');
            });

            // Bind Settings
            $('#rm-ell-auto').prop('checked', st.autoRemove).on('change', (e) => {
                Core.getSettings().autoRemove = e.target.checked;
                Core.saveSettings();
                UI.notify(`Auto Remove: ${e.target.checked ? 'ON' : 'OFF'}`);
            });
            
            $('#rm-ell-twodots').prop('checked', st.treatTwoDots).on('change', (e) => {
                Core.getSettings().treatTwoDots = e.target.checked;
                Core.saveSettings();
            });

            $('#rm-ell-space').prop('checked', st.preserveSpace).on('change', (e) => {
                Core.getSettings().preserveSpace = e.target.checked;
                Core.saveSettings();
            });

            // Actions
            $('#rm-ell-btn-clean').on('click', async () => {
                UI.closeDrawer();
                await App.removeAll();
            });

            $('#rm-ell-btn-check').on('click', async () => {
                UI.closeDrawer();
                await App.checkAll();
            });
        },

        init() {
            const ctx = Core.getContext();
            if (!ctx) return; // Wait for ST

            // Event Listeners
            if (ctx.eventSource) {
                // Incoming messages
                ctx.eventSource.on(ctx.event_types.MESSAGE_RECEIVED, async () => {
                    if (Core.getSettings().autoRemove) await App.removeAll();
                });
                
                // Outgoing messages (pre-process)
                ctx.eventSource.on(ctx.event_types.MESSAGE_SENT, async (data) => {
                    // Logic to clean data before sending if needed, 
                    // though hookOutgoingInput handles the UI input box.
                });
            }

            // Initialize UI
            this.injectSettings();
            this.handleInputEvents();

            // Run once if auto-remove is on
            if (Core.getSettings().autoRemove) App.removeAll();
        }
    };

    // ========================================================================
    // BOOTSTRAP
    // ========================================================================
    (function boot() {
        if (typeof document === 'undefined') return;

        const onReady = () => {
            App.init();
            // Observer for dynamic UI loading (re-inject settings if lost)
            const obs = new MutationObserver(() => App.injectSettings());
            const target = document.querySelector('#content') || document.body;
            obs.observe(target, { childList: true, subtree: true });
        };

        if (window.SillyTavern?.getContext) {
            onReady();
        } else {
            // Fallback wait
            setTimeout(onReady, 2000); 
        }
    })();

    // Export for debugging/tests
    window.RemoveEllipsis = { Core, Cleaner, UI, App };
})();
