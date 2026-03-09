/* Remove Ellipsis — Added Notification Toggle & Thai-English Bracket Removal */
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
        treatTwoDots: false,
        preserveSpace: true,
        protectCode: true,
        notifications: true,
        removeEngParens: false // ฟังก์ชันใหม่: ลบวงเล็บภาษาอังกฤษหลังคำไทย
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

            const protectedItems = [];
            let processed = text;
            let removedCount = 0;

            // --- PROTECT CODE BLOCKS ---
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

            // --- 1. REMOVE ENGLISH PARENTHESES AFTER THAI ---
            if (settings.removeEngParens) {
                // อธิบาย Regex: 
                // (?<=[\u0E00-\u0E7F]) = ต้องตามหลังตัวอักษรไทย
                // \s* = มีหรือไม่มีเว้นวรรคก็ได้
                // \([0-9\s\-\.,'_]*[A-Za-z][A-Za-z0-9\s\-\.,'_]*\) = เป็นวงเล็บที่ข้างในต้องมีภาษาอังกฤษอย่างน้อย 1 ตัว (เพื่อไม่ให้ลบวงเล็บตัวเลขล้วน)
                const engParenRegex = /(?<=[\u0E00-\u0E7F])\s*\([0-9\s\-\.,'_]*[A-Za-z][A-Za-z0-9\s\-\.,'_]*\)/g;
                processed = processed.replace(engParenRegex, (match) => {
                    removedCount += match.length;
                    return ''; // ลบทิ้งทั้งหมดรวมถึงช่องว่างก่อนหน้าวงเล็บ
                });
            }

            // --- 2. REMOVE ELLIPSIS ---
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

            // --- UNPROTECT CODE BLOCKS ---
            if (settings.protectCode) {
                processed = processed.replace(/@@PT(\d+)@@/g, (_, i) => protectedItems[i]);
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
            if (!Core.getSettings().notifications) return; 
            if (typeof toastr !== 'undefined' && toastr[type]) toastr[type](msg, 'Cleaner Ext');
            else console.log(`[CleanerExt] ${msg}`);
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
                            const tagName = parent.nodeName;

                            if (settings.protectCode) {
                                if (['CODE', 'PRE', 'SCRIPT', 'STYLE'].includes(tagName)) continue;
                                if (['P', 'DIV', 'SPAN'].includes(tagName)) {
                                    const isRootContainer = parent.classList.contains('mes_text') || 
                                                          parent.classList.contains('message-text') || 
                                                          parent.classList.contains('mes');
                                    if (!isRootContainer) continue; 
                                }
                            }

                            const original = tn.nodeValue;
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
            
            if (count > 0) UI.notify(`Removed ${count} elements.`, 'success');
            else UI.notify('No elements found (or protected).', 'info');
        },

        async checkAll() {
            const ctx = Core.getContext();
            if (!ctx?.chat) return;
            let count = 0;
            const st = Core.getSettings();
            ctx.chat.forEach(msg => {
                if (typeof msg.mes === 'string') count += Cleaner.cleanText(msg.mes, st).removed;
            });
            if (st.notifications) UI.notify(count > 0 ? `Found ${count} elements.` : 'No elements found.', 'info');
            else if (typeof toastr !== 'undefined') toastr.info(count > 0 ? `Found ${count} elements.` : 'No elements found.', 'Check Result');
        },

        injectSettings() {
            if (typeof $ === 'undefined') return;
            
            if ($('#remove-ellipsis-settings').length > 0) return;
            const container = $('#extensions_settings');
            if (!container.length) return;

            const st = Core.getSettings();

            container.append(`
                <div id="remove-ellipsis-settings" class="extension_settings_block">
                    <div class="inline-drawer">
                        <div class="inline-drawer-toggle inline-drawer-header">
                            <b><i class="fa-solid fa-broom"></i> Text Cleaner Ext</b>
                            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                        </div>
                        <div class="inline-drawer-content" style="display:none;">
                            
                            <div class="styled_description_block">Extension by Zealllll</div>
                            
                            <label class="checkbox_label">
                                <input type="checkbox" id="rm-ell-auto" ${st.autoRemove ? 'checked' : ''} />
                                <span>Auto Remove</span>
                            </label>

                            <hr style="margin: 10px 0; border-color: var(--grey-60); opacity: 0.5;">

                            <label class="checkbox_label" title="ลบวงเล็บภาษาอังกฤษที่ตามหลังภาษาไทย เช่น แชท(chat) ให้เหลือแค่ แชท">
                                <input type="checkbox" id="rm-ell-engparens" ${st.removeEngParens ? 'checked' : ''} />
                                <span><b>Remove English in ( )</b></span>
                            </label>

                            <hr style="margin: 10px 0; border-color: var(--grey-60); opacity: 0.5;">

                            <label class="checkbox_label" title="อันตราย: ตัวเลือกนี้จะลบจุด (.) ทุกตัวในข้อความ!">
                                <input type="checkbox" id="rm-ell-all" ${st.removeAllDots ? 'checked' : ''} />
                                <span>Remove ALL Dots (.)</span>
                            </label>
                            
                            <label class="checkbox_label">
                                <input type="checkbox" id="rm-ell-twodots" ${st.treatTwoDots ? 'checked' : ''} />
                                <span>Remove ".."</span>
                            </label>

                            <hr style="margin: 10px 0; border-color: var(--grey-60); opacity: 0.5;">
                            
                            <label class="checkbox_label">
                                <input type="checkbox" id="rm-ell-protect" ${st.protectCode !== false ? 'checked' : ''} />
                                <span>Protect Code & HTML</span>
                            </label>

                            <label class="checkbox_label">
                                <input type="checkbox" id="rm-ell-space" ${st.preserveSpace ? 'checked' : ''} />
                                <span>Preserve Space</span>
                            </label>

                            <label class="checkbox_label" title="แสดงแจ้งเตือนเมื่อทำการลบจุดหรือวงเล็บ">
                                <input type="checkbox" id="rm-ell-notify" ${st.notifications !== false ? 'checked' : ''} />
                                <span>Show Notifications</span>
                            </label>

                            <div style="display: flex; gap: 10px; margin-top: 15px;">
                                <div id="rm-ell-btn-clean" class="menu_button" style="flex: 1;" title="ลบสิ่งสกปรกในแชทปัจจุบันทันที">
                                    <i class="fa-solid fa-broom"></i> Clean Now
                                </div>
                                <div id="rm-ell-btn-check" class="menu_button" style="flex: 1;" title="ตรวจสอบจำนวนที่ต้องลบ">
                                    <i class="fa-solid fa-magnifying-glass"></i> Check
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            `);
        },

        bindEvents() {
            if (this._eventsBound) return;
            this._eventsBound = true;

            const updateSetting = (key, val) => {
                Core.getSettings()[key] = val;
                Core.saveSettings();
            };

            $(document).on('change', '#rm-ell-auto', (e) => {
                updateSetting('autoRemove', e.target.checked);
                UI.notify(`Auto Remove: ${e.target.checked ? 'ON' : 'OFF'}`);
            });
            $(document).on('change', '#rm-ell-engparens', (e) => { // ผูก Event ใหม่
                updateSetting('removeEngParens', e.target.checked);
                UI.notify(`Remove English in ( ): ${e.target.checked ? 'ON' : 'OFF'}`);
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
            
            $(document).on('change', '#rm-ell-notify', (e) => {
                updateSetting('notifications', e.target.checked);
                if(e.target.checked) UI.notify('Notifications Enabled', 'success');
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
