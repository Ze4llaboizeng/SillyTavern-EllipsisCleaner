/**
 * SillyTavern Extension: Reworked Text Cleaner
 * ลบจุด (.) และ วงเล็บภาษาอังกฤษหลังภาษาไทย โดยเว้นแท็ก <think>
 */

(function () {
    const EXT_NAME = 'st-cleaner-reworked';

    // ==========================================
    // 1. Settings Management
    // ==========================================
    const Settings = {
        data: {
            autoRemove: false
        },
        load() {
            const context = getContext();
            if (!context) return;
            context.extensionSettings = context.extensionSettings || {};
            if (context.extensionSettings[EXT_NAME]) {
                Object.assign(this.data, context.extensionSettings[EXT_NAME]);
            } else {
                context.extensionSettings[EXT_NAME] = this.data;
            }
        },
        save() {
            const context = getContext();
            if (context && context.saveSettingsDebounced) {
                context.saveSettingsDebounced();
            }
        }
    };

    // ==========================================
    // 2. Text Processor (Core Logic)
    // ==========================================
    const Processor = {
        cleanText(text) {
            if (typeof text !== 'string' || !text) return text;

            let processedText = text;
            const protectedThinkBlocks = [];
            const protectedHtmlTags = [];

            // Step 1: ซ่อนแท็ก <think>...</think> ทั้งหมด
            processedText = processedText.replace(/<think>[\s\S]*?<\/think>/gi, (match) => {
                protectedThinkBlocks.push(match);
                return `__THINK_BLOCK_${protectedThinkBlocks.length - 1}__`;
            });

            // Step 2: ซ่อน HTML Tags (<...>) เพื่อไม่ให้ Attribute พัง (เช่น .png, .css)
            processedText = processedText.replace(/<[^>]+>/g, (match) => {
                protectedHtmlTags.push(match);
                return `__HTML_TAG_${protectedHtmlTags.length - 1}__`;
            });

            // Step 3: ลบรูปแบบ ไทย(อังกฤษ) หรือ ไทย(ไม่ใช่ไทย)
            // จับคู่: (ตัวอักษรไทย) + (ช่องว่างถ้ามี) + (วงเล็บที่ข้างในไม่มีตัวอักษรไทย)
            const thaiEngRegex = /([\u0E00-\u0E7F]+)(\s*)\([^)\u0E00-\u0E7F]+\)/g;
            processedText = processedText.replace(thaiEngRegex, '$1$2');

            // Step 4: ลบจุด (.) และจุดไข่ปลา (…) ทั้งหมด
            processedText = processedText.replace(/\.+|…/g, '');

            // Step 5: คืนค่า HTML Tags
            processedText = processedText.replace(/__HTML_TAG_(\d+)__/g, (match, index) => {
                return protectedHtmlTags[index];
            });

            // Step 6: คืนค่าแท็ก <think>
            processedText = processedText.replace(/__THINK_BLOCK_(\d+)__/g, (match, index) => {
                return protectedThinkBlocks[index];
            });

            return processedText;
        }
    };

    // ==========================================
    // 3. Chat Handler
    // ==========================================
    const Chat = {
        cleanAllMessages() {
            const context = getContext();
            if (!context || !context.chat) return;

            let isModified = false;

            context.chat.forEach(msg => {
                if (msg.mes) {
                    const newMes = Processor.cleanText(msg.mes);
                    if (newMes !== msg.mes) {
                        msg.mes = newMes;
                        isModified = true;
                    }
                }
            });

            if (isModified) {
                context.saveChat();
                if (context.renderChat) context.renderChat();
                toastr.success('Cleaned messages successfully.', 'Text Cleaner');
            } else {
                toastr.info('No text needed cleaning.', 'Text Cleaner');
            }
        },

        handleAutoRemove() {
            if (!Settings.data.autoRemove) return;
            const context = getContext();
            if (!context || !context.chat || context.chat.length === 0) return;

            // ตรวจสอบข้อความล่าสุด
            const lastMsg = context.chat[context.chat.length - 1];
            if (lastMsg && lastMsg.mes) {
                const newMes = Processor.cleanText(lastMsg.mes);
                if (newMes !== lastMsg.mes) {
                    lastMsg.mes = newMes;
                    context.saveChat();
                    // บังคับให้หน้าจออัปเดตข้อความใหม่
                    if (context.eventSource) {
                        context.eventSource.emit(context.event_types.CHAT_CHANGED);
                    }
                }
            }
        }
    };

    // ==========================================
    // 4. UI Injection & Events
    // ==========================================
    const UI = {
        inject() {
            if (document.getElementById('reworked-cleaner-settings')) return;

            const html = `
            <div id="reworked-cleaner-settings" class="extension_settings_block">
                <div class="inline-drawer">
                    <div class="inline-drawer-header inline-drawer-toggle">
                        <b>Text Cleaner (Reworked)</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                    </div>
                    <div class="inline-drawer-content" style="display:none;">
                        
                        <label class="checkbox_label">
                            <input type="checkbox" id="cleaner-auto-remove" ${Settings.data.autoRemove ? 'checked' : ''} />
                            <span>Auto Remove on New Message</span>
                        </label>
                        
                        <p style="font-size: 0.85em; opacity: 0.8; margin-top: 5px;">
                            - ลบจุด (.) และ (…) ทั้งหมด<br>
                            - ลบวงเล็บภาษาอังกฤษที่ต่อท้ายภาษาไทย<br>
                            - ข้ามแท็ก &lt;think&gt; เสมอ
                        </p>

                        <hr class="sysHR">

                        <div style="display: flex; justify-content: center; margin-top: 10px;">
                            <button id="cleaner-btn-clean-now" class="menu_button">Clean Chat Now</button>
                        </div>
                    </div>
                </div>
            </div>`;

            $('#extensions_settings').append(html);
            this.bindEvents();
        },

        bindEvents() {
            $('#cleaner-auto-remove').on('change', (e) => {
                Settings.data.autoRemove = e.target.checked;
                Settings.save();
                if (Settings.data.autoRemove) {
                    Chat.cleanAllMessages(); // ทำความสะอาดทันทีเมื่อเปิดใช้งาน
                }
            });

            $('#cleaner-btn-clean-now').on('click', () => {
                Chat.cleanAllMessages();
            });
        }
    };

    // ==========================================
    // 5. Initialization
    // ==========================================
    function getContext() {
        return typeof SillyTavern !== 'undefined' && SillyTavern.getContext ? SillyTavern.getContext() : null;
    }

    jQuery(async () => {
        Settings.load();
        UI.inject();

        const context = getContext();
        if (context && context.eventSource) {
            // ดักจับเมื่อ AI ตอบเสร็จ หรือเมื่อโหลดข้อความใหม่
            context.eventSource.on(context.event_types.MESSAGE_RECEIVED, () => Chat.handleAutoRemove());
            context.eventSource.on(context.event_types.USER_MESSAGE_SENT, () => Chat.handleAutoRemove());
            context.eventSource.on(context.event_types.MESSAGE_UPDATED, () => Chat.handleAutoRemove());
        }
    });

})();