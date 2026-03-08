/**
 * SillyTavern Extension: Ellipsis Cleaner (Refactored)
 * จัดการลบจุดไข่ปลา (..., .., .) ทั้งในและนอกแท็ก HTML ยกเว้นในแท็ก <think>
 */

(() => {
    // ป้องกันการโหลดซ้ำ
    if (window.__ZEAL_ELLIPSIS_LOADED__) return;
    window.__ZEAL_ELLIPSIS_LOADED__ = true;

    const MODULE_ID = 'zeal_ellipsis_cleaner';

    // 1. การตั้งค่าเริ่มต้น (Default Settings)
    const DEFAULT_SETTINGS = {
        enabled: true,
        autoRemove: false,        // ลบอัตโนมัติเมื่อได้รับข้อความ
        removeTwoDots: true,      // ลบ '..'
        removeAllDots: false,     // ลบจุดเดียว '.' (อันตราย)
        preserveSpace: true,      // เว้นวรรคแทนที่จุด
        protectThink: true,       // ไม่ลบจุดในแท็ก <think>...</think>
        protectCode: true         // ไม่ลบจุดใน Code blocks
    };

    // 2. ระบบจัดการการตั้งค่า (Settings Manager)
    const Settings = {
        get() {
            const ctx = window.SillyTavern?.getContext?.();
            if (!ctx) return { ...DEFAULT_SETTINGS };
            
            ctx.extensionSettings = ctx.extensionSettings || {};
            ctx.extensionSettings[MODULE_ID] = ctx.extensionSettings[MODULE_ID] || {};
            
            const current = ctx.extensionSettings[MODULE_ID];
            // ผสานค่าเริ่มต้นเข้ากับค่าที่บันทึกไว้
            for (const key in DEFAULT_SETTINGS) {
                if (current[key] === undefined) {
                    current[key] = DEFAULT_SETTINGS[key];
                }
            }
            return current;
        },
        save() {
            const ctx = window.SillyTavern?.getContext?.();
            if (ctx?.saveSettingsDebounced) ctx.saveSettingsDebounced();
            else if (ctx?.saveSettings) ctx.saveSettings();
        },
        update(key, value) {
            const st = this.get();
            st[key] = value;
            this.save();
        }
    };

    // 3. ระบบจัดการข้อความ (Cleaner Core)
    const Cleaner = {
        processText(text) {
            const st = Settings.get();
            if (!st.enabled || typeof text !== 'string' || !text) {
                return { text: text, removed: 0 };
            }

            let processedText = text;
            let protectedItems = [];
            let removedCount = 0;

            // ฟังก์ชันสำหรับซ่อนข้อความที่ไม่อยากให้โดนลบจุด
            const mask = (regex) => {
                processedText = processedText.replace(regex, (match) => {
                    const index = protectedItems.length;
                    protectedItems.push(match);
                    return `@@ZEAL_PROT_${index}@@`;
                });
            };

            // --- ส่วนที่ได้รับการปกป้อง (จะไม่ถูกลบจุด) ---
            if (st.protectThink) {
                mask(/<think>[\s\S]*?<\/think>/gi); // ปกป้องเนื้อหาในแท็ก <think>
            }
            if (st.protectCode) {
                mask(/```[\s\S]*?```/g); // Code block
                mask(/`[^`]*`/g);        // Inline code
                mask(/<(script|style|pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi); // โค้ดเฉพาะ
            }
            // หมายเหตุ: เราไม่ใช้ mask(/<[^>]+>/g) แล้ว เพื่อให้ลบจุดใน <b>, <i>, <p> ได้

            // --- กำหนดรูปแบบการลบจุด ---
            let dotPattern;
            if (st.removeAllDots) {
                dotPattern = '\\.+|…'; // ลบจุดทุกรูปแบบ
            } else if (st.removeTwoDots) {
                dotPattern = '\\.{2,}|…'; // ลบตั้งแต่ 2 จุดขึ้นไป หรือ …
            } else {
                dotPattern = '\\.{3,}|…'; // ลบเฉพาะ 3 จุดขึ้นไป หรือ …
            }

            // Regex: ไม่จับจุดที่เป็นทศนิยม (เช่น 1.5, 2.0)
            const regexStr = `(?<!\\d)(?:${dotPattern})(?!\\d)`;
            const mainRegex = new RegExp(regexStr, 'g');

            // --- ทำการลบ ---
            processedText = processedText.replace(mainRegex, (match) => {
                removedCount += match.length;
                return st.preserveSpace ? ' ' : '';
            });

            // จัดการช่องว่างที่ซ้ำซ้อนกัน (ถ้าระบุให้เว้นวรรค)
            if (st.preserveSpace) {
                processedText = processedText.replace(/ +/g, ' '); 
            }

            // --- คืนค่าส่วนที่ถูกปกป้องกลับมา ---
            processedText = processedText.replace(/@@ZEAL_PROT_(\d+)@@/g, (_, index) => {
                return protectedItems[parseInt(index, 10)];
            });

            return { text: processedText, removed: removedCount };
        },

        cleanMessage(msg) {
            if (!msg) return 0;
            let totalRemoved = 0;

            if (msg.extra) {
                ['display_text', 'original'].forEach(field => {
                    if (typeof msg.extra[field] === 'string') {
                        const res = this.processText(msg.extra[field]);
                        msg.extra[field] = res.text;
                        totalRemoved += res.removed;
                    }
                });
            }
            
            if (typeof msg.mes === 'string') {
                const res = this.processText(msg.mes);
                msg.mes = res.text;
                totalRemoved += res.removed;
            }

            return totalRemoved;
        }
    };

    // 4. ระบบจัดการหน้าจอและ UI (User Interface)
    const UI = {
        toast(msg, type = 'info') {
            if (typeof toastr !== 'undefined' && toastr[type]) {
                toastr[type](msg, 'Ellipsis Cleaner');
            } else {
                console.log(`[EllipsisCleaner] ${msg}`);
            }
        },

        async renderSettings() {
            const container = document.getElementById('extensions_settings');
            if (!container || document.getElementById('zeal-ellipsis-ui')) return;

            const st = Settings.get();
            const html = `
            <div id="zeal-ellipsis-ui" class="extension_settings_block">
                <div class="inline-drawer">
                    <div class="inline-drawer-header inline-drawer-toggle">
                        <b>Ellipsis Cleaner 🧹</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                    </div>
                    
                    <div class="inline-drawer-content" style="display:none;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <span><b>Enable Extension</b></span>
                            <label class="checkbox_label">
                                <input type="checkbox" id="zec-enabled" ${st.enabled ? 'checked' : ''} />
                            </label>
                        </div>
                        <hr class="sysHR">

                        <label class="checkbox_label">
                            <input type="checkbox" id="zec-auto" ${st.autoRemove ? 'checked' : ''} />
                            <span>Auto Remove on Message (ลบอัตโนมัติ)</span>
                        </label>

                        <label class="checkbox_label">
                            <input type="checkbox" id="zec-twodots" ${st.removeTwoDots ? 'checked' : ''} />
                            <span>Remove ".." (ลบแบบ 2 จุด)</span>
                        </label>

                        <label class="checkbox_label" title="DANGER: ลบจุดทศนิยมและจุดจบประโยคทั้งหมด">
                            <input type="checkbox" id="zec-alldots" ${st.removeAllDots ? 'checked' : ''} />
                            <span style="color: var(--smart-theme-color-red, #ff5555);">Remove ALL Dots (.)</span>
                        </label>
                        
                        <label class="checkbox_label">
                            <input type="checkbox" id="zec-space" ${st.preserveSpace ? 'checked' : ''} />
                            <span>Preserve Space (แทนที่ด้วยช่องว่าง)</span>
                        </label>

                        <hr class="sysHR">
                        
                        <label class="checkbox_label" title="จุดในแท็ก <think> จะไม่ถูกลบ">
                            <input type="checkbox" id="zec-protect-think" ${st.protectThink ? 'checked' : ''} />
                            <span style="color: var(--smart-theme-color-green, #55ff55);">Protect &lt;think&gt; tags</span>
                        </label>

                        <label class="checkbox_label">
                            <input type="checkbox" id="zec-protect-code" ${st.protectCode ? 'checked' : ''} />
                            <span>Protect Code Blocks</span>
                        </label>

                        <div style="display: flex; gap: 5px; margin-top: 15px;">
                            <button id="zec-btn-clean" class="menu_button">Clean Chat Now</button>
                            <button id="zec-btn-check" class="menu_button">Check Only</button>
                        </div>
                    </div>
                </div>
            </div>`;

            if (typeof $ !== 'undefined') {
                $(container).append(html);
            } else {
                container.insertAdjacentHTML('beforeend', html);
            }

            this.bindEvents();
        },

        bindEvents() {
            const bindToggle = (id, key, msgCallback) => {
                $(document).on('change', `#${id}`, (e) => {
                    const isChecked = e.target.checked;
                    Settings.update(key, isChecked);
                    if (msgCallback) this.toast(msgCallback(isChecked));
                });
            };

            bindToggle('zec-enabled', 'enabled', v => v ? 'Extension Enabled' : 'Extension Disabled');
            bindToggle('zec-auto', 'autoRemove', v => `Auto Remove: ${v ? 'ON' : 'OFF'}`);
            bindToggle('zec-twodots', 'removeTwoDots');
            bindToggle('zec-alldots', 'removeAllDots', v => v ? "WARNING: Removing ALL periods!" : null);
            bindToggle('zec-space', 'preserveSpace');
            bindToggle('zec-protect-think', 'protectThink', v => `Think Protection: ${v ? 'ON' : 'OFF'}`);
            bindToggle('zec-protect-code', 'protectCode');

            $(document).on('click', '#zec-btn-clean', async () => await Core.cleanAllChats());
            $(document).on('click', '#zec-btn-check', async () => await Core.checkAllChats());
        },

        async refreshChatView() {
            const ctx = window.SillyTavern?.getContext?.();
            if (!ctx) return;
            try {
                if (typeof ctx.saveChat === 'function') await ctx.saveChat();
                if (typeof ctx.renderChat === 'function') await ctx.renderChat();
            } catch (e) { console.error('Error refreshing chat:', e); }
        }
    };

    // 5. ระบบแกนกลาง (Main Core)
    const Core = {
        async cleanAllChats() {
            const ctx = window.SillyTavern?.getContext?.();
            const st = Settings.get();
            if (!st.enabled) return UI.toast('Extension is Disabled.', 'warning');
            if (!ctx?.chat || !Array.isArray(ctx.chat)) return;
            
            let totalRemoved = 0;
            ctx.chat.forEach(msg => {
                totalRemoved += Cleaner.cleanMessage(msg);
            });
            
            if (totalRemoved > 0) {
                await UI.refreshChatView();
                UI.toast(`ทำความสะอาดเรียบร้อย! ลบไปทั้งหมด ${totalRemoved} ตัวอักษร`, 'success');
            } else {
                UI.toast('ไม่พบจุดไข่ปลาให้ลบ', 'info');
            }
        },

        async checkAllChats() {
            const ctx = window.SillyTavern?.getContext?.();
            const st = Settings.get();
            if (!st.enabled) return UI.toast('Extension is Disabled.', 'warning');
            if (!ctx?.chat || !Array.isArray(ctx.chat)) return;

            let count = 0;
            ctx.chat.forEach(msg => {
                if (typeof msg.mes === 'string') {
                    // ใช้ test แทนการลบจริงเพื่อนับ
                    count += Cleaner.processText(msg.mes).removed;
                }
            });

            if (count > 0) {
                UI.toast(`ตรวจพบจุดที่สามารถลบได้จำนวน ${count} ตัวอักษร`, 'warning');
            } else {
                UI.toast('ข้อความสะอาดดี ไม่มีจุดให้ลบ', 'success');
            }
        },

        init() {
            const ctx = window.SillyTavern?.getContext?.();
            
            // รอให้โหลด UI ST เสร็จก่อนแทรก
            const observer = new MutationObserver(() => {
                if (document.getElementById('extensions_settings')) {
                    UI.renderSettings();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            // ผูก Event เมื่อมีการส่งข้อความใหม่ (Auto Remove)
            if (ctx?.eventSource) {
                ctx.eventSource.on(ctx.event_types.MESSAGE_RECEIVED, async () => {
                    if (Settings.get().autoRemove) {
                        // หน่วงเวลาเล็กน้อยเพื่อให้ข้อความเขียนลง Data เสร็จก่อน
                        setTimeout(async () => await this.cleanAllChats(), 100);
                    }
                });
            }

            // จัดการเวลาผู้ใช้กดปุ่ม Send ด้วยตัวเอง
            const sendForms = document.querySelectorAll('form.send-form, #send_form');
            sendForms.forEach(form => {
                form.addEventListener('submit', () => {
                   if (Settings.get().autoRemove) {
                       setTimeout(async () => await this.cleanAllChats(), 100);
                   }
                });
            });
        }
    };

    // 6. เริ่มการทำงาน (Boot)
    if (typeof document !== 'undefined') {
        const bootloader = () => {
            if (window.SillyTavern?.getContext) {
                Core.init();
            } else {
                setTimeout(bootloader, 1000); // รอจนกว่า ST จะพร้อม
            }
        };
        bootloader();
    }
})();
