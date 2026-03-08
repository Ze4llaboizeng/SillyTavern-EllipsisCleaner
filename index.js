/**
 * SillyTavern Extension - เขียนใหม่จาก 0
 * ฟังก์ชัน: ลบจุด, ลบ ไทย(อังกฤษ), ข้าม <think>
 */

(function () {
    const EXT_ID = 'cleaner_from_zero';
    let settings = { autoRemove: false };

    // 1. ฟังก์ชันโหลด/เซฟ การตั้งค่า
    function loadSettings() {
        const context = SillyTavern.getContext();
        if (context.extensionSettings && context.extensionSettings[EXT_ID]) {
            settings = Object.assign(settings, context.extensionSettings[EXT_ID]);
        } else {
            context.extensionSettings[EXT_ID] = settings;
        }
    }

    function saveSettings() {
        SillyTavern.getContext().saveSettingsDebounced();
    }

    // 2. ฟังก์ชันทำความสะอาดข้อความ (Core Logic)
    function processText(text) {
        if (!text) return text;
        
        let result = text;
        let thinkBlocks = [];
        let htmlTags = [];

        // A. เก็บซ่อนแท็ก <think>...</think> ไว้ก่อน (ห้ามแตะเด็ดขาด)
        result = result.replace(/<think>[\s\S]*?<\/think>/gi, (match) => {
            thinkBlocks.push(match);
            return `__THINK_${thinkBlocks.length - 1}__`;
        });

        // B. เก็บซ่อนโครงสร้างแท็ก HTML (<...>) เพื่อไม่ให้ Attribute พัง (เช่น .png, .jpg)
        // (ส่วนข้อความที่อยู่นอกแท็กหรือระหว่างแท็ก จะถูกทำความสะอาดตามปกติ)
        result = result.replace(/<[^>]+>/g, (match) => {
            htmlTags.push(match);
            return `__HTML_${htmlTags.length - 1}__`;
        });

        // C. ลบรูปแบบ ไทย(อังกฤษ) เช่น โจมตี(Attack) -> โจมตี
        // อธิบาย Regex: กลุ่ม 1 (ภาษาไทย) + ช่องว่าง(ถ้ามี) + วงเล็บที่มีแต่(อังกฤษ/ตัวเลข/ช่องว่าง)
        const thaiEngRegex = /([\u0E00-\u0E7F]+)\s*\([A-Za-z\s0-9\-_.,]+\)/g;
        result = result.replace(thaiEngRegex, '$1');

        // D. ลบจุด (.) และจุดไข่ปลา (…) ทั้งหมดที่หลงเหลือ
        result = result.replace(/\.+|…/g, '');

        // E. คืนค่าแท็ก HTML
        result = result.replace(/__HTML_(\d+)__/g, (match, index) => {
            return htmlTags[index];
        });

        // F. คืนค่าแท็ก <think>
        result = result.replace(/__THINK_(\d+)__/g, (match, index) => {
            return thinkBlocks[index];
        });

        return result;
    }

    // 3. ฟังก์ชันสั่งล้างข้อความในแชทปัจจุบันทั้งหมด
    function cleanChatHistory() {
        const context = SillyTavern.getContext();
        if (!context || !context.chat) return;

        let hasChanged = false;
        context.chat.forEach(msg => {
            if (msg.mes) {
                const newText = processText(msg.mes);
                if (newText !== msg.mes) {
                    msg.mes = newText;
                    hasChanged = true;
                }
            }
        });

        if (hasChanged) {
            context.saveChat();
            if (context.renderChat) context.renderChat();
            toastr.success('ทำความสะอาดแชทเรียบร้อยแล้ว', 'Cleaner');
        } else {
            toastr.info('ไม่มีข้อความที่ต้องทำความสะอาด', 'Cleaner');
        }
    }

    // 4. สร้างหน้าต่าง UI ควบคุม (ฉีดเข้าไปในหน้า Extensions)
    function buildUI() {
        if (document.getElementById('cleaner-zero-box')) return;

        const uiHTML = `
            <div id="cleaner-zero-box" class="extension_settings_block">
                <div class="inline-drawer">
                    <div class="inline-drawer-header inline-drawer-toggle">
                        <b>✨ Smart Text Cleaner</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
                    </div>
                    <div class="inline-drawer-content" style="display:none;">
                        <div style="margin-bottom: 10px;">
                            <label class="checkbox_label">
                                <input type="checkbox" id="cz_auto_remove" ${settings.autoRemove ? 'checked' : ''} />
                                <span><b>Auto Remove</b> (ลบอัตโนมัติเมื่อ AI ตอบ)</span>
                            </label>
                            <p style="font-size: 0.85em; opacity: 0.7; margin: 5px 0 0 25px;">
                                * ลบ . และ … ใน/นอก HTML<br>
                                * ลบ ไทย(English) ให้เหลือแค่ ไทย<br>
                                * ข้ามแท็ก &lt;think&gt; เสมอ
                            </p>
                        </div>
                        <hr class="sysHR">
                        <button id="cz_btn_clean" class="menu_button" style="width: 100%;">
                            <i class="fa-solid fa-broom"></i> คลีนแชทตอนนี้
                        </button>
                    </div>
                </div>
            </div>
        `;
        $('#extensions_settings').append(uiHTML);

        // ผูก Event ให้ปุ่ม
        $('#cz_auto_remove').on('change', function () {
            settings.autoRemove = $(this).is(':checked');
            saveSettings();
        });

        $('#cz_btn_clean').on('click', function () {
            cleanChatHistory();
        });
    }

    // 5. เริ่มต้นการทำงาน (Boot)
    jQuery(async () => {
        const context = SillyTavern.getContext();
        loadSettings();
        buildUI();

        // ดักจับเมื่อ AI ตอบข้อความเสร็จสิ้น
        if (context.eventSource) {
            context.eventSource.on(context.event_types.MESSAGE_RECEIVED, () => {
                if (!settings.autoRemove) return;
                
                // เช็คข้อความล่าสุดเท่านั้นเพื่อไม่ให้หน่วง
                const lastMsgIndex = context.chat.length - 1;
                const lastMsg = context.chat[lastMsgIndex];
                
                if (lastMsg && lastMsg.mes) {
                    const newText = processText(lastMsg.mes);
                    if (newText !== lastMsg.mes) {
                        lastMsg.mes = newText;
                        context.saveChat();
                        context.eventSource.emit(context.event_types.CHAT_CHANGED);
                    }
                }
            });
        }
    });

})();