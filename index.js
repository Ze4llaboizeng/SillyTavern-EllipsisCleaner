/* Remove Ellipsis — Native UI Integration */
(() => {
    if (typeof window === 'undefined') { global.window = {}; }
    if (window.__REMOVE_ELLIPSIS_EXT_LOADED__) return;
    window.__REMOVE_ELLIPSIS_EXT_LOADED__ = true;

    const MODULE_NAME = 'removeEllipsisExt';
    const DEFAULTS = { 
        enabled: true,          
        autoRemove: false, 
        removeAllDots: false, 
        preserveSpace: true,
        protectCode: true,
        notifications: true,
        removeEnglishParentheses: false 
    };

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

    const Cleaner = {
        cleanText(text, settings) {
            if (!settings.enabled) return { text, removed: 0 };
            if (typeof text !== 'string' || !text) return { text, removed: 0 };

            const protectedItems = [];
            let processed = text;
            let removedCount = 0;

            if (settings.protectCode) {
                const mask = (regex) => {
                    processed = processed.replace(regex, m => `@@PT${protectedItems.push(m) - 1}@@`);
                };
                mask(/```[\s\S]*?```/g);
                mask(/`[^`]*`/g);
                mask(/<script\b[^>]*>[\s\S]*?<\/script>/gi);
                mask(/<style\b[^>]*>[\s\S]*?<\/style>/gi);
                mask(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi);
                mask(/<code\b[^>]*>[\s\S]*?<\/code>/gi);
                mask(/<[^>]+>/g);
            }

            if (settings.removeEnglishParentheses) {
                const parensRegex = /\s*\([^\u0E00-\u0E7F]+\)/g;
                processed = processed.replace(parensRegex, (match) => {
                    removedCount += match.length;
                    return '';
                });
            }

            let patternSource;
            if (settings.removeAllDots) {
                patternSource = "\\.+|…";
            } else {
                patternSource = settings.treatTwoDots ? "(?<!\\d)\\.{2,}(?!\\d)|…" : "(?<!\\d)\\.{3,}(?!\\d)|…";
            }
            const baseRegex = new RegExp(patternSource, 'g');
            const specialAfter = new RegExp(`(?:${patternSource})[ \t]*(?=[*"'])`, 'g');
            const specialBefore = new RegExp(`(?<=[*"'])(?:${patternSource})[ \t]*`, 'g');
            
            processed = processed
                .replace(specialBefore, m => { removedCount += m.length; return ''; })
                .replace(specialAfter, m => { removedCount += m.length; return ''; });

            const mainPattern = settings.preserveSpace ? baseRegex : new RegExp(`(?:${patternSource})[ \t]*`, 'g');

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

            if (settings.protectCode) {
                processed = processed.replace(/@@PT(\d+)@@/g, (_, i) => protectedItems[i]);
            }

            return { text: processed, removed: removedCount };
        },

        cleanMessage(msg) {
            if (!msg) return 0;
            const settings = Core.getSettings();
            if (!settings.enabled) return 0;

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

    const UI = {
        notify(msg, type = 'info') {
            if (!Core.getSettings().notifications) return; 
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
                if (typeof ctx.saveChat === 'function') await ctx.saveChat();
                const nonce = Date.now();
                if (Array.isArray(ctx.chat)) ctx.chat = ctx.chat.map(m => ({ ...m, _rmNonce: nonce }));
                ctx.eventSource?.emit?.(ctx.event_types?.CHAT_CHANGED, { reason: 'rm-rebind' });
                if (typeof ctx.renderChat === 'function') await ctx.renderChat();

                if (forceVisualUpdate && typeof document !== 'undefined') {
                    const settings = Core.getSettings();
                    const selector = '.mes_text, .message-text, .chat-message .mes';
                    const nodes = document.querySelectorAll(selector);
                    nodes.forEach(node => {
                        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
                        let tn;
                        while (tn = walker.nextNode()) {
                            const parent = tn.parentNode;
                            if (settings.protectCode && ['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(parent.nodeName)) continue;
                            const original = tn.nodeValue;
                            const res = Cleaner.cleanText(original, settings);
                            if (res.removed > 0) tn.nodeValue = res.text;
                        }
                    });
                }
            } catch (e) { console.warn('Refresh error:', e); }
        }
    };

    const App = {
        async removeAll() {
            const ctx = Core.getContext();
            const st = Core.getSettings();
            if (!st.enabled) return UI.notify('Extension is Disabled.', 'warning');
            if (!ctx?.chat) return;
            
            let count = 0;
            ctx.chat.forEach(msg => count += Cleaner.cleanMessage(msg));
            await UI.refreshChat(true); 
            
            if (count > 0) UI.notify(`Removed ${count} chars.`, 'success');
            else UI.notify('Nothing found.', 'info');
        },

        async checkAll() {
            const ctx = Core.getContext();
            if (!ctx?.chat) return;
            let count = 0;
            const st = Core.getSettings();
            if (!st.enabled) return UI.notify('Extension is Disabled.', 'warning');

            ctx.chat.forEach(msg => {
                if (typeof msg.mes === 'string') count += Cleaner.cleanText(msg.mes, st).removed;
            });
            const msg = count > 0 ? `Found ${count} chars to clean.` : 'Nothing to clean.';
            if (st.notifications) UI.notify(msg, 'info');
            else if (typeof toastr !== 'undefined') toastr.info(msg, 'Check Result');
        },

        injectSettings() {
            const container = document.getElementById('extensions_settings');
            if (!container) return;
            if (document.getElementById('remove-ellipsis-settings')) return;

            // HTML Structure: คืนค่า 'inline-drawer-toggle' เพื่อให้ UI เหมือนต้นฉบับ
            const html = `
            <div id="remove-ellipsis-settings" class="extension_settings_block">
                <div class="inline-drawer">
                    <div class="inline-drawer-header inline-drawer-toggle">
                        <b>Remove Ellipsis & Cleaner</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                    </div>
                    
                    <div class="inline-drawer-content" style="display:none;">
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                            <span><b>Enable Extension</b></span>
                            <label class="checkbox_label">
                                <input type="checkbox" id="rm-ell-enabled" />
                            </label>
                        </div>
                        <hr class="sysHR">

                        <label class="checkbox_label">
                            <input type="checkbox" id="rm-ell-auto" />
                            <span>Auto Remove on Message</span>
                        </label>

                        <label class="checkbox_label" title="Removes (English text) but keeps (Thai text)">
                            <input type="checkbox" id="rm-ell-parens" />
                            <span>Remove (Non-Thai)</span>
                        </label>

                        <label class="checkbox_label">
                            <input type="checkbox" id="rm-ell-twodots" />
                            <span>Remove ".."</span>
                        </label>
                        
                        <label class="checkbox_label">
                            <input type="checkbox" id="rm-ell-space" />
                            <span>Preserve Space</span>
                        </label>

                        <label class="checkbox_label" title="DANGER: Removes every single dot '.'">
                            <input type="checkbox" id="rm-ell-all" />
                            <span style="color: var(--smart-theme-color-red, #ffaaaa);">Remove ALL Dots (.)</span>
                        </label>

                        <hr class="sysHR">
                        
                        <label class="checkbox_label">
                            <input type="checkbox" id="rm-ell-protect" />
                            <span>Protect Code & HTML</span>
                        </label>

                        <label class="checkbox_label">
                            <input type="checkbox" id="rm-ell-notify" />
                            <span>Show Notifications</span>
                        </label>

                        <div style="display: flex; gap: 5px; margin-top: 10px;">
                            <button id="rm-ell-btn-clean" class="menu_button">Clean Now</button>
                            <button id="rm-ell-btn-check" class="menu_button">Check</button>
                        </div>
                    </div>
                </div>
            </div>`;

            if (typeof $ !== 'undefined') {
                $(container).append(html);
            } else {
                container.insertAdjacentHTML('beforeend', html);
            }

            const st = Core.getSettings();
            const setChecked = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

            setChecked('rm-ell-enabled', st.enabled);
            setChecked('rm-ell-auto', st.autoRemove);
            setChecked('rm-ell-all', st.removeAllDots);
            setChecked('rm-ell-twodots', st.treatTwoDots);
            setChecked('rm-ell-space', st.preserveSpace);
            setChecked('rm-ell-protect', st.protectCode !== false);
            setChecked('rm-ell-notify', st.notifications !== false);
            setChecked('rm-ell-parens', st.removeEnglishParentheses);
        },

        bindEvents() {
            if (this._eventsBound) return;
            this._eventsBound = true;

            // REMOVED: Custom click handler for .inline-drawer-header
            // เพราะเราใช้ class 'inline-drawer-toggle' แล้ว SillyTavern จะจัดการคลิกให้เองแบบ Native

            const updateSetting = (key, val) => {
                Core.getSettings()[key] = val;
                Core.saveSettings();
            };

            const bindCheck = (id, key, msg) => {
                $(document).on('change', `#${id}`, (e) => {
                    updateSetting(key, e.target.checked);
                    if (msg) UI.notify(typeof msg === 'function' ? msg(e.target.checked) : msg);
                });
            };

            bindCheck('rm-ell-enabled', 'enabled', v => `Extension ${v ? 'Enabled' : 'Disabled'}`);
            bindCheck('rm-ell-auto', 'autoRemove', v => `Auto Remove: ${v ? 'ON' : 'OFF'}`);
            bindCheck('rm-ell-all', 'removeAllDots', v => v ? "Warning: Will remove ALL periods!" : null);
            bindCheck('rm-ell-twodots', 'treatTwoDots', null);
            bindCheck('rm-ell-space', 'preserveSpace', null);
            bindCheck('rm-ell-protect', 'protectCode', v => `Code Protection: ${v ? 'ON' : 'OFF'}`);
            bindCheck('rm-ell-notify', 'notifications', v => v ? 'Notifications Enabled' : null);
            bindCheck('rm-ell-parens', 'removeEnglishParentheses', v => `Remove Non-Thai Parentheses: ${v ? 'ON' : 'OFF'}`);

            $(document).on('click', '#rm-ell-btn-clean', async (e) => { e.preventDefault(); await App.removeAll(); });
            $(document).on('click', '#rm-ell-btn-check', async (e) => { e.preventDefault(); await App.checkAll(); });
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
            setInterval(() => { this.injectSettings(); }, 2000);
        }
    };

    (function boot() {
        if (typeof document === 'undefined') return;
        const onReady = () => {
            App.init();
            const obs = new MutationObserver(() => App.injectSettings());
            const target = document.querySelector('#content') || document.body;
            if (target) obs.observe(target, { childList: true, subtree: true });
        };
        if (window.SillyTavern?.getContext) setTimeout(onReady, 500);
        else setTimeout(onReady, 2000); 
    })();

    window.RemoveEllipsis = { Core, Cleaner, UI, App };
})();
