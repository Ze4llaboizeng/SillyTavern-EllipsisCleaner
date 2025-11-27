/* Remove Ellipsis — Aggressive Cleaning & Instant Rerender */
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
        removeAllDots: false, // New: Aggressive mode (removes single '.' too)
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

            // --- 1. Protection Phase (Masking) ---
            const blocks = [];
            const inlines = [];
            const scripts = [];
            const styles = [];
            const pres = [];
            const codes = [];
            const tags = []; // Protects attributes inside <tag ...>

            let processed = text;

            if (settings.protectCode) {
                // Protect Code Blocks (Markdown & HTML)
                processed = processed.replace(/```[\s\S]*?```/g, m => `@@BLOCK${blocks.push(m) - 1}@@`);
                processed = processed.replace(/`[^`]*`/g, m => `@@INLINE${inlines.push(m) - 1}@@`);
                
                // Protect content inside specific technical tags
                // We DO NOT protect <p> or <div> content here, or normal text won't be cleaned.
                processed = processed.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => `@@SCRIPT${scripts.push(m) - 1}@@`);
                processed = processed.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, m => `@@STYLE${styles.push(m) - 1}@@`);
                processed = processed.replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, m => `@@PRE${pres.push(m) - 1}@@`);
                processed = processed.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, m => `@@CODE${codes.push(m) - 1}@@`);

                // Protect HTML Tags definition (attributes), but NOT the content between them
                // e.g. <img src="file.jpg"> is protected. 
                processed = processed.replace(/<[^>]+>/g, m => `@@TAG${tags.push(m) - 1}@@`);
            }

            // --- 2. Definition Phase ---
            // If "Remove All Dots" is checked, we match ANY sequence of dots (1 or more)
            // Otherwise, we default to 3 dots (or 2 if requested)
            let patternSource;
            if (settings.removeAllDots) {
                patternSource = "\\.+|…"; // Matches "." ".." "..." "...."
            } else {
                // Normal mode
                patternSource = "(?<!\\d)\\.{3,}(?!\\d)|…"; // Matches "..."
                if (settings.treatTwoDots) {
                    patternSource = "(?<!\\d)\\.{2,}(?!\\d)|…"; // Matches ".." or "..."
                }
            }
            const baseRegex = new RegExp(patternSource, 'g');

            // --- 3. Cleaning Phase ---
            
            // Special handling for quotes to avoid adding weird spaces
            // Remove dots right before/after quotes without spacing
            const specialAfter = new RegExp(`(?:${patternSource})[ \t]*(?=[*"'])`, 'g');
            const specialBefore = new RegExp(`(?<=[*"'])(?:${patternSource})[ \t]*`, 'g');
            
            let removedCount = 0;
            processed = processed
                .replace(specialBefore, m => { removedCount += m.length; return ''; })
                .replace(specialAfter, m => { removedCount += m.length; return ''; });

            // Main Removal
            // If preserveSpace is ON, we look for dots and replace them with a space
            // UNLESS there is already a space.
            const mainPattern = settings.preserveSpace
                ? baseRegex
                : new RegExp(`(?:${patternSource})[ \t]*`, 'g');

            processed = processed.replace(mainPattern, (match, offset, fullStr) => {
                removedCount += match.length;
                
                if (!settings.preserveSpace) return ''; // Just delete

                // Smart Spacing Logic
                const prev = fullStr[offset - 1];
                const next = fullStr[offset + match.length];
                // Check if space exists around the match
                const hasSpaceBefore = prev === undefined ? true : /\s/.test(prev);
                const hasSpaceAfter = next === undefined ? true : /\s/.test(next);

                if (hasSpaceBefore || hasSpaceAfter) return ''; // Space already exists
                return ' '; // Insert space
            });

            // --- 4. Restoration Phase (Unmasking) ---
            if (settings.protectCode) {
                processed = processed.replace(/@@TAG(\d+)@@/g, (_, i) => tags[i]);
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
                // 1. Commit changes to internal database
                if (typeof ctx.saveChat === 'function') await ctx.saveChat();

                // 2. Notify system of change
                const nonce = Date.now();
                if (Array.isArray(ctx.chat)) ctx.chat = ctx.chat.map(m => ({ ...m, _rmNonce: nonce }));
                ctx.eventSource?.emit?.(ctx.event_types?.CHAT_CHANGED, { reason: 'rm-rebind' });

                // 3. Trigger Standard Re-render
                if (typeof ctx.renderChat === 'function') await ctx.renderChat();

                // 4. FORCE DOM UPDATE (Fixes "Not showing immediately")
                if (forceVisualUpdate && typeof document !== 'undefined') {
                    const settings = Core.getSettings();
                    // Broad selector to catch all message text areas
                    const selector = '.mes_text, .message-text, .chat-message .mes';
                    const nodes = document.querySelectorAll(selector);
                    
                    nodes.forEach(node => {
                        // Use TreeWalker to find text nodes deeply nested (e.g. inside <p>)
                        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
                        let tn;
                        while (tn = walker.nextNode()) {
                            // Don't visually break code blocks that we protected earlier
                            if (tn.parentNode.closest('code, pre, script, style')) continue;

                            // Clean the text currently on screen
                            const original = tn.nodeValue;
                            const res = Cleaner.cleanText(original, settings);
                            
                            // Only update if changed
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
            // 1. Clean the data
            ctx.chat.forEach(msg => count += Cleaner.cleanMessage(msg));
            
            // 2. Update the screen immediately
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
                        
                        <label class="checkbox_label" title="Clean automatically when sending/receiving">
                            <input type="checkbox" id="rm-ell-auto" />
                            <span>Auto Remove</span>
                        </label>

                        <label class="checkbox_label" title="DANGER: Removes every single dot '.' in the text">
                            <input type="checkbox" id="rm-ell-all" />
                            <span style="color: #ffaaaa;">Remove ALL Dots (.)</span>
                        </label>
                        
                        <label class="checkbox_label" title="Also remove '..' (2 dots) - Ignored if Remove All is ON">
                            <input type="checkbox" id="rm-ell-twodots" />
                            <span>Remove ".."</span>
                        </label>
                        
                        <label class="checkbox_label" title="Protects Code Blocks, Scripts, Styles">
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

            $('#rm-ell-auto').prop('checked', st.autoRemove);
            $('#rm-ell-all').prop('checked', st.removeAllDots); // Bind new setting
            $('#rm-ell-twodots').prop('checked', st.treatTwoDots);
            $('#rm-ell-space').prop('checked', st.preserveSpace);
            $('#rm-ell-protect').prop('checked', st.protectCode !== false);
        },

        bindEvents() {
            if (this._eventsBound) return;
            this._eventsBound = true;

            // Toggle Drawer
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

            // Bind Inputs
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

            // Buttons
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

            // Hook Input Box
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
