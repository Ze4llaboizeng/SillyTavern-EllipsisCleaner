import { extension_settings, getContext } from "../../../extensions.js";
import { eventSource, event_types } from "../../../../script.js";
import { saveSettingsDebounced } from "../../../../utils.js";
import { updateMessageBlock, saveChat } from "../../../../chat.js";

const extensionName = "st-text-cleaner";

// ค่าเริ่มต้น: เปิดใช้งานอัตโนมัติ
const defaultSettings = {
    autoRemove: true
};

if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = defaultSettings;
}

function cleanText(text) {
    if (!text) return text;

    // 1. ลบจุด (.) ยกเว้นใน <think>...</think>
    // regex จับ <think>...</think> ไว้ใน group 1 ถ้าเจอจะข้ามไป ถ้าเจอ . เดี่ยวๆ จะลบทิ้ง
    text = text.replace(/(<think>[\s\S]*?<\/think>)|(\.)/gi, (match, p1) => {
        if (p1) return p1; // คืนค่า <think>... กลับไปเหมือนเดิม
        return ''; // ลบจุด
    });

    // 2. ลบคำที่เป็น ไทย(English)
    // จับคู่ภาษาไทย ตามด้วยวงเล็บที่มีภาษาอังกฤษข้างใน แล้วแทนที่ด้วยคำไทยคำแรก
    text = text.replace(/([ก-๙]+)\s*\([A-Za-z0-9\s\-_.,'"]+\)/g, '$1');

    return text;
}

async function processMessage(messageId) {
    // ถ้าปิดสวิตช์ไว้ ให้ข้ามไปไม่ต้องทำอะไร
    if (!extension_settings[extensionName].autoRemove) return;

    const context = getContext();
    const chat = context.chat;
    const msg = chat[messageId];

    // ตรวจสอบว่าเป็นข้อความจากบอท (ไม่ใช่จาก user)
    if (msg && !msg.is_user) {
        const originalText = msg.mes;
        const cleanedText = cleanText(originalText);

        // ถ้าข้อความมีการเปลี่ยนแปลง (ลบจุด หรือลบคำสำเร็จ)
        if (originalText !== cleanedText) {
            msg.mes = cleanedText;
            saveChat(); // เซฟแชท
            updateMessageBlock(messageId, msg); // รีเฟรชหน้าต่างแชทให้ข้อความเปลี่ยนทันที
        }
    }
}

async function setupUI() {
    // สร้างหน้าต่าง UI ในเมนู Extensions ของ SillyTavern
    const html = `
        <div class="text-cleaner-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Thai Text & Dot Cleaner</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content" style="display: none;">
                    <label class="checkbox_label">
                        <input type="checkbox" id="tc_auto_remove" ${extension_settings[extensionName].autoRemove ? 'checked' : ''}>
                        เปิดใช้งาน Auto Remove อัตโนมัติ
                    </label>
                    <small style="display:block; margin-top:5px; color:var(--SmartThemeQuoteColor);">
                        * ลบจุด (.) ทั้งหมด ยกเว้นในแท็ก &lt;think&gt;<br>
                        * ลบคำแปล (ภาษาอังกฤษ) ที่ตามหลังภาษาไทย
                    </small>
                </div>
            </div>
        </div>
    `;

    $("#extensions_settings").append(html);

    // บันทึกการตั้งค่าเมื่อกดเปิด/ปิดสวิตช์
    $("#tc_auto_remove").on("change", function() {
        extension_settings[extensionName].autoRemove = !!$(this).prop("checked");
        saveSettingsDebounced();
    });
}

jQuery(async () => {
    await setupUI();
    
    // ทำงานเมื่อมีข้อความใหม่ตอบกลับมา
    eventSource.on(event_types.MESSAGE_RECEIVED, processMessage);
    // ทำงานเมื่อเรากด Swipe (ปัดขวาหาข้อความใหม่) หรือข้อความถูกแก้ไข
    eventSource.on(event_types.MESSAGE_UPDATED, processMessage);
});