/* Remove Ellipsis — Instant UI Update & Thai-English Bracket Removal */
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
        removeEngParens: false 
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
                const engParenRegex = /([\u0E00-\u0E7F][*_"']*)(\s*\([^)]*[A-Za-z][^)]*\))/g;
                processed = processed.replace(engParenRegex, (match, g1, g2) => {
                    removedCount += g2.length;
                    return g1; 
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
            
            if (typeof msg.mes === 'string') {
                const r = this.cleanText(msg.mes, settings);
                if (r.removed > 0) {
                    msg.mes = r.text;
                    total += r.removed;
                }
            }

            if (msg.extra && typeof msg.extra.display_text === 'string') {
                const r = this.cleanText(msg.extra.display_text, settings);
                if (r.removed > 0) {
                    msg.extra.display_text = r.text;
                }
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

        injectQuickButton() {
            if (typeof $ === 'undefined') return;
            if ($('#rm-ell-quick-btn').length > 0) return;

            const sendForm = $('#send_form');
            if (!sendForm.length) return;

            const st = Core.getSettings();

            const quickBtn = $(`
                <div id="rm-ell-quick-btn-wrapper" class="rm-ell-quick-btn-wrapper">
                    <div id="rm-ell-quick-btn" class="rm-ell-quick-btn" title="Text Cleaner - Click for options">
                        <i class="fa-solid fa-broom"></i>
                    </div>
                    <div id="rm-ell-popup-menu" class="rm-ell-popup-menu">
                        <div class="rm-ell-popup-header">
                            <i class="fa-solid fa-broom"></i> Text Cleaner
                        </div>
                        <div class="rm-ell-popup-item" id="rm-ell-popup-clean">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Clean Now
                        </div>
                        <div class="rm-ell-popup-item" id="rm-ell-popup-check">
                            <i class="fa-solid fa-magnifying-glass"></i> Check
                        </div>
                        <div class="rm-ell-popup-divider"></div>
                        <div class="rm-ell-popup-item rm-ell-popup-toggle" id="rm-ell-popup-auto">
                            <span class="rm-ell-toggle-label">
                                <i class="fa-solid fa-robot"></i> Auto Remove
                            </span>
                            <span class="rm-ell-toggle-status ${st.autoRemove ? 'on' : 'off'}">${st.autoRemove ? 'ON' : 'OFF'}</span>
                        </div>
                        <div class="rm-ell-popup-item rm-ell-popup-toggle" id="rm-ell-popup-engparens">
                            <span class="rm-ell-toggle-label">
                                <i class="fa-solid fa-language"></i> Remove ( )
                            </span>
                            <span class="rm-ell-toggle-status ${st.removeEngParens ? 'on' : 'off'}">${st.removeEngParens ? 'ON' : 'OFF'}</span>
                        </div>
                        <div class="rm-ell-popup-divider"></div>
                        <div class="rm-ell-popup-item" id="rm-ell-popup-settings">
                            <i class="fa-solid fa-gear"></i> More Settings...
                        </div>
                    </div>
                </div>
            `);

            const sendBut = $('#send_but');
            if (sendBut.length) {
                sendBut.before(quickBtn);
            } else {
                sendForm.append(quickBtn);
            }

            $('#rm-ell-quick-btn').on('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.togglePopupMenu();
            });

            $('#rm-ell-popup-clean').on('click', async (e) => {
                e.stopPropagation();
                this.hidePopupMenu();
                await App.removeAll();
            });

            $('#rm-ell-popup-check').on('click', async (e) => {
                e.stopPropagation();
                this.hidePopupMenu();
                await App.checkAll();
            });

            $('#rm-ell-popup-auto').on('click', (e) => {
                e.stopPropagation();
                const st = Core.getSettings();
                st.autoRemove = !st.autoRemove;
                Core.saveSettings();
                this.updatePopupMenuState();
                this.updateQuickButtonState();
                this.updateDrawerHeaderStatus();
                $('#rm-ell-auto').prop('checked', st.autoRemove);
                UI.notify(`Auto Remove: ${st.autoRemove ? 'ON' : 'OFF'}`);
            });

            $('#rm-ell-popup-engparens').on('click', (e) => {
                e.stopPropagation();
                const st = Core.getSettings();
                st.removeEngParens = !st.removeEngParens;
                Core.saveSettings();
                this.updatePopupMenuState();
                $('#rm-ell-engparens').prop('checked', st.removeEngParens);
                UI.notify(`Remove English in ( ): ${st.removeEngParens ? 'ON' : 'OFF'}`);
            });

            $('#rm-ell-popup-settings').on('click', (e) => {
                e.stopPropagation();
                this.hidePopupMenu();
                this.openExtensionSettings();
            });

            $(document).on('click.rmellpopup', (e) => {
                if (!$(e.target).closest('#rm-ell-quick-btn-wrapper').length) {
                    this.hidePopupMenu();
                }
            });

            this.updateQuickButtonState();
        },

        togglePopupMenu() {
            const popup = $('#rm-ell-popup-menu');
            if (popup.hasClass('show')) {
                this.hidePopupMenu();
            } else {
                this.updatePopupMenuState();
                popup.addClass('show');
            }
        },

        hidePopupMenu() {
            $('#rm-ell-popup-menu').removeClass('show');
        },

        updatePopupMenuState() {
            const st = Core.getSettings();
            const autoStatus = $('#rm-ell-popup-auto .rm-ell-toggle-status');
            autoStatus.text(st.autoRemove ? 'ON' : 'OFF');
            autoStatus.removeClass('on off').addClass(st.autoRemove ? 'on' : 'off');
            
            const engStatus = $('#rm-ell-popup-engparens .rm-ell-toggle-status');
            engStatus.text(st.removeEngParens ? 'ON' : 'OFF');
            engStatus.removeClass('on off').addClass(st.removeEngParens ? 'on' : 'off');
        },

        openExtensionSettings() {
            const extensionsBtn = $('#extensionsMenuButton, #extensions_button, [data-i18n="Extensions"]').first();
            if (extensionsBtn.length) {
                extensionsBtn.trigger('click');
                setTimeout(() => {
                    const settingsBlock = $('#remove-ellipsis-settings');
                    if (settingsBlock.length) {
                        const drawerContent = settingsBlock.find('.inline-drawer-content');
                        if (drawerContent.css('display') === 'none') {
                            settingsBlock.find('.inline-drawer-toggle').trigger('click');
                        }
                        settingsBlock[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 300);
            }
        },

        updateQuickButtonState() {
            const btn = $('#rm-ell-quick-btn');
            if (!btn.length) return;
            const st = Core.getSettings();
            if (st.autoRemove) {
                btn.addClass('rm-ell-auto-active');
                btn.attr('title', 'Text Cleaner (Auto: ON) - Click for options');
            } else {
                btn.removeClass('rm-ell-auto-active');
                btn.attr('title', 'Text Cleaner (Auto: OFF) - Click for options');
            }
        },

        updateDrawerHeaderStatus() {
            const st = Core.getSettings();
            let statusBadge = $('#rm-ell-header-status');
            
            if (!statusBadge.length) {
                const header = $('#remove-ellipsis-settings .inline-drawer-toggle b');
                if (header.length) {
                    // แทรก span ในกรณีที่ยังไม่มี
                    header.append(`<span id="rm-ell-header-status" class="rm-ell-header-status ${st.autoRemove ? 'on' : 'off'}">${st.autoRemove ? 'ON' : 'OFF'}</span>`);
                    statusBadge = $('#rm-ell-header-status');
                }
            }
            
            if (statusBadge.length) {
                const newStateText = st.autoRemove ? 'ON' : 'OFF';
                const newStateClass = st.autoRemove ? 'on' : 'off';
                
                // 🛑 แก้บั๊ก Infinite Loop: อัปเดตก็ต่อเมื่อข้อความเปลี่ยนจริงๆ เท่านั้น 🛑
                if (statusBadge.text() !== newStateText) {
                    statusBadge.text(newStateText);
                }
                if (!statusBadge.hasClass(newStateClass)) {
                    statusBadge.removeClass('on off').addClass(newStateClass);
                }
            }
        }
    };

    // ========================================================================
    // MODULE: App
    // ========================================================================
    const App = {
        async removeAll(silent = false) {
            const ctx = Core.getContext();
            if (!ctx?.chat) return;
            
            let count = 0;
            let updatedIndexes = [];
            
            ctx.chat.forEach((msg, index) => {
                const removed = Cleaner.cleanMessage(msg);
                if (removed > 0) {
                    count += removed;
                    updatedIndexes.push(index); 
                }
            });
            
            if (updatedIndexes.length > 0) {
                updatedIndexes.forEach(index => {
                    if (typeof window.updateMessageBlock === 'function') {
                        window.updateMessageBlock(index, ctx.chat[index]);
                    } else if (typeof ctx.updateMessageBlock === 'function') {
                        ctx.updateMessageBlock(index, ctx.chat[index]);
                    } else if (ctx.eventSource) {
                        ctx.eventSource.emit(ctx.event_types.MESSAGE_UPDATED, index);
                    }
                });
                if (typeof ctx.saveChat === 'function') await ctx.saveChat();
            }
            
            if (!silent) {
                if (count > 0) UI.notify(`Cleaned ${count} elements instantly.`, 'success');
                else UI.notify('No elements found (or protected).', 'info');
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
            if (st.notifications) UI.notify(count > 0 ? `Found ${count} elements to clean.` : 'All clean.', 'info');
            else if (typeof toastr !== 'undefined') toastr.info(count > 0 ? `Found ${count} elements.` : 'All clean.', 'Check Result');
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
                            <b><i class="fa-solid fa-broom"></i> Text Cleaner Ext <span id="rm-ell-header-status" class="rm-ell-header-status ${st.autoRemove ? 'on' : 'off'}">${st.autoRemove ? 'ON' : 'OFF'}</span></b>
                            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                        </div>
                        <div class="inline-drawer-content" style="display:none;">
                            
                            <div class="styled_description_block">Extension by Zealllll</div>
                            
                            <label class="checkbox_label">
                                <input type="checkbox" id="rm-ell-auto" ${st.autoRemove ? 'checked' : ''} />
                                <span>Auto Remove (After Generation)</span>
                            </label>

                            <hr style="margin: 10px 0; border-color: var(--grey-60); opacity: 0.5;">

                            <label class="checkbox_label" title="ลบวงเล็บภาษาอังกฤษที่ตามหลังภาษาไทย เช่น แชท(chat) ให้เหลือแค่ แชท">
                                <input type="checkbox" id="rm-ell-engparens" ${st.removeEngParens ? 'checked' : ''} />
                                <span style="color:var(--smart-blue);"><b>Remove English in ( )</b></span>
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
                                    <i class="fa-solid fa-wand-magic-sparkles"></i> Clean Now
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
                UI.updateQuickButtonState(); 
                UI.updatePopupMenuState(); 
                UI.updateDrawerHeaderStatus(); 
                UI.notify(`Auto Remove: ${e.target.checked ? 'ON' : 'OFF'}`);
            });
            $(document).on('change', '#rm-ell-engparens', (e) => {
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
                    if (Core.getSettings().autoRemove) await App.removeAll(true);
                });
            }
            this.injectSettings();
            UI.injectQuickButton();
        }
    };

    (function boot() {
        if (typeof document === 'undefined') return;
        const onReady = () => {
            App.init();
            
            const obs = new MutationObserver(() => {
                App.injectSettings();
                UI.injectQuickButton();
                // 🛑 เราเอา UI.updateDrawerHeaderStatus() ออกจากตรงนี้แล้ว
                // เพราะมันไม่จำเป็นต้องเช็คทุกครั้งที่มีการขยับเมาส์/เลื่อนหน้าจอ
            });
            const target = document.querySelector('#content') || document.body;
            obs.observe(target, { childList: true, subtree: true });
        };
        if (window.SillyTavern?.getContext) onReady();
        else setTimeout(onReady, 2000); 
    })();

    window.RemoveEllipsis = { Core, Cleaner, UI, App };
})();
