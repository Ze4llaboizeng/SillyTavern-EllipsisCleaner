/* Remove Ellipsis — Code Protected & Fixed UI */
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
        protectCode: true // New default to protect HTML/JS/CSS
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
        cleanText(text, settings) {
            if (typeof text !== 'string' || !text) return { text, removed: 0 };

            // --- 1. Protection Phase (Masking) ---
            const blocks = [];
            const inlines = [];
            const htmlTags = [];

            let protectedText = text;

            if (settings.protectCode) {
                // A. Protect Markdown Code Blocks (``` code ```)
                protectedText = protectedText.replace(/```[\s\S]*?```/g, m => `@@BLOCK${blocks.push(m) - 1}@@`);

                // B. Protect Inline Code (` code `)
                protectedText = protectedText.replace(/`[^`]*`/g, m => `@@INLINE${inlines.push(m) - 1}@@`);

                // C. Protect HTML Tags (<script src="...">, <div class="...">)
                // This regex finds things that look like tags <...>
                protectedText = protectedText.replace(/<[^>]+>/g, m => `@@HTML${htmlTags.push(m) - 1}@@`);
            }

            // --- 2. Definition Phase ---
            // Define what counts as an ellipsis to remove
            const basePattern = settings.treatTwoDots
                ? /(?<!\d)\.{2,}(?!\d)|…/g  // Matches .. or ... or …
                : /(?<!\d)\.{3,}(?!\d)|…/g; // Matches ... or …

            // --- 3. Cleaning Phase ---
            
            // Special case: Remove ellipses immediately before/after quotes without adding spaces
            // e.g. "Hello..." -> "Hello" (not "Hello ")
            const specialAfter = new RegExp(`(?:${basePattern.source})[ \t]*(?=[*"'])`, 'g');
            const specialBefore = new RegExp(`(?<=[*"'])(?:${basePattern.source})[ \t]*`, 'g');
            
            let removedCount = 0;
            let processed = protectedText
                .replace(specialBefore, m => { removedCount += m.length; return ''; })
                .replace(specialAfter, m => { removedCount += m.length; return ''; });

            // Main cleaning pattern
            const mainPattern = settings.preserveSpace
                ? basePattern
                : new RegExp(`(?:${basePattern.source})[ \t]*`, 'g');

            processed = processed.replace(mainPattern, (match, offset, fullStr) => {
                removedCount += match.length;
                if (!settings.preserveSpace) return '';

                // Logic: Only add a space if there isn't one already around it
                const prevChar = fullStr[offset - 1];
                const nextChar = fullStr[offset + match.length];
                const hasSpaceBefore = prevChar === undefined ? true : /\s/.test(prevChar);
                const hasSpaceAfter = nextChar === undefined ? true : /\s/.test(nextChar);

                if (hasSpaceBefore || hasSpaceAfter) return '';
                return ' '; // Replace ellipsis with a single space
            });

            // --- 4. Restoration Phase (Unmasking) ---
            if (settings.protectCode) {
                // Restore in reverse order of protection usually safe, but specific order here:
                // Restore HTML tags first
                processed = processed.replace(/@@HTML(\d+)@@/g, (_, i) => htmlTags[i]);
                // Restore Inline code
                processed = processed.replace(/@@INLINE(\d+)@@/g, (_, i) => inlines[i]);
                // Restore Blocks
                processed = processed.replace(/@@BLOCK(\d+)@@/g, (_, i) => blocks[i]);
            }

            return { text: processed, removed: removedCount };
        },

        cleanMessage(msg) {
            if (!msg) return 0;
            const settings = Core.getSettings();
            let totalRemoved = 0;

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
        notify(msg, type = 'info') {
            if (typeof toastr !== 'undefined' && toastr[type]) {
                toastr[type](msg, 'Ellipsis Cleaner');
            } else {
                console.log(`[RemoveEllipsis] ${msg}`);
            }
        },

        closeDrawer() {
            if (typeof $ !== 'undefined') {
                $('.drawer-overlay').trigger('click');
            }
        },

        async refreshChat() {
            const ctx = Core.getContext();
            if (!ctx) return;
            try {
                const nonce = Date.now();
                if (Array.isArray(ctx.chat)) {
                    ctx.chat = ctx.chat.map(m => ({ ...m, _rmNonce: nonce }));
                }
                ctx.eventSource?.emit?.(ctx.event_types?.CHAT_CHANGED, { reason: 'rm-rebind' });
                if (typeof ctx.renderChat === 'function') {
                    await ctx.renderChat();
                }
            } catch (e) { console.warn(e); }
        }
    };

    // ========================================================================
    // MODULE: App (Main Logic)
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
            await UI.refreshChat();
            UI.notify(count > 0 ? `Found ${count} ellipses.` : 'No ellipses found.', 'info');
        },

        handleInputEvents() {
            if (typeof document === 'undefined') return;
            // (Same input hook logic as before, abbreviated for clarity)
            const hook = () => {
                const form = document.querySelector('form.send-form, #send_form');
                if (form) form.addEventListener('submit', () => {
                   if (Core.getSettings().autoRemove) setTimeout(() => App.removeAll(), 50);
                }, true);
            };
            hook();
        },

        injectSettings() {
            if (typeof $ === 'undefined') return;
            const container = $('#extensions_settings');
            if (!container.length || $('#remove-ellipsis-settings').length) return;

            // Added color: var(--SmartThemeBodyColor) to ensure text is visible
            const html = `
            <div id="remove-ellipsis-settings" class="extension_settings_block">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>Remove Ellipsis Cleaner</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content" style="display:none; color: var(--SmartThemeBodyColor, #fff);">
                        <div style="padding: 10px;">
                            <label class="checkbox_label" title="Clean automatically when sending/receiving">
                                <input type="checkbox" id="rm-ell-auto" />
                                <span style="margin-left: 8px;">Auto Remove</span>
                            </label>
                            
                            <label class="checkbox_label" title="Also remove '..' (2 dots)">
                                <input type="checkbox" id="rm-ell-twodots" />
                                <span style="margin-left: 8px;">Remove ".." (2 dots)</span>
                            </label>
                            
                            <label class="checkbox_label" title="Don't touch HTML tags or Code blocks">
                                <input type="checkbox" id="rm-ell-protect" />
                                <span style="margin-left: 8px;">Protect Code & HTML</span>
                            </label>

                            <label class="checkbox_label" title="Leave a space where dots were removed">
                                <input type="checkbox" id="rm-ell-space" />
                                <span style="margin-left: 8px;">Preserve Space</span>
                            </label>

                            <div style="display: flex; gap: 10px; margin-top: 15px;">
                                <button id="rm-ell-btn-clean" class="menu_button">
                                    Clean Now
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
            
            // Drawer Logic
            $('#remove-ellipsis-settings .inline-drawer-header').on('click', function() {
                $(this).next('.inline-drawer-content').slideToggle(200);
                $(this).find('.inline-drawer-icon').toggleClass('down');
            });

            // Bindings
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
            // NEW: Protect Code Binding
            $('#rm-ell-protect').prop('checked', st.protectCode !== false).on('change', (e) => {
                Core.getSettings().protectCode = e.target.checked;
                Core.saveSettings();
                UI.notify(`Code Protection: ${e.target.checked ? 'ON' : 'OFF'}`);
            });

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
            if (!ctx) return;
            
            if (ctx.eventSource) {
                ctx.eventSource.on(ctx.event_types.MESSAGE_RECEIVED, async () => {
                    if (Core.getSettings().autoRemove) await App.removeAll();
                });
            }

            this.injectSettings();
            this.handleInputEvents();
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
