import { extension_settings, getContext } from "../../../extensions.js";
import { eventSource, event_types } from "../../../../script.js";
import { saveSettingsDebounced } from "../../../../utils.js";
import { updateMessageBlock, saveChat } from "../../../../chat.js";

const extensionName = "st-text-cleaner";

// สร้างค่าเริ่มต้นถ้ายังไม่มี
if (!extension_settings[extensionName]) {
    extension_settings[extensionName] = { autoRemove: true };
}

function cleanText(text) {
    if (!text) return text;

    // 1. ลบคำแปลภาษาอังกฤษในวงเล็บที่ตามหลังภาษาไทย 
    // ตรวจจับ: ภาษาไทย + เว้นวรรค(หรือไม่เว้น) + (วงเล็บที่มีภาษาอังกฤษข้างใน)
    text = text.replace(/([ก-๙]+)\s*\([^)]*[a-zA-Z][^)]*\)/g, '$1');

    // 2. ลบจุด (.) ยกเว้นในแท็ก <think>...</think>
    // ใช้วิธีแยกส่วนข้อความด้วยแท็ก <think> แล้วลบจุดเฉพาะส่วนที่ไม่ใช่ <think>
    const parts = text.split(/(<think>[\s\S]*?<\/think>)/gi);
    for (let i = 0; i < parts.length; i++) {
        // ถ้าส่วนนี้ไม่ได้ขึ้นต้นด้วย <think> ให้ลบจุดออกทั้งหมด
        if (!parts[i].toLowerCase().startsWith('<think>')) {
            parts[i] = parts[i].replace(/\./g, '');
        }
    }
    text = parts.join('');

    return text;
}

function processMessage(messageId) {
    // เช็คสวิตช์ ถ้าปิดไว้ก็ข้ามไป
    if (!extension_settings[extensionName].autoRemove) return;

    const context = getContext();
    const chat = context.chat;
    const msg = chat[messageId];

    // ต้องเป็นข้อความของบอทเท่านั้น
    if (msg && !msg.is_user) {
        const originalText = msg.mes;
        const cleanedText = cleanText(originalText);

        // ถ้ามีจุดหรือคำถูกลบไป ให้เซฟแชทและอัปเดตหน้าจอ
        if (originalText !== cleanedText) {
            msg.mes = cleanedText;
            saveChat();
            updateMessageBlock(messageId, msg);
        }
    }
}

jQuery(async () => {
    // โครงสร้างเมนู UI แบบมาตรฐานของ SillyTavern (Inline Drawer)
    const html = `
        <div class="inline-drawer" id="st-text-cleaner-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🧹 Thai Text & Dot Cleaner</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content" style="display: none;">
                <div class="text-cleaner-container">
                    <label class="checkbox_label">
                        <input type="checkbox" id="tc_auto_remove" ${extension_settings[extensionName].autoRemove ? 'checked' : ''}>
                        <span>เปิดใช้งาน Auto Remove ทันทีที่บอทตอบ</span>
                    </label>
                    <div class="tc-note">
                        <strong>ระบบจะทำการ:</strong><br>
                        1. ลบจุด (.) ทั้งหมด ยกเว้นในแท็ก <code>&lt;think&gt;...&lt;/think&gt;</code><br>
                        2. ลบวงเล็บ (English) ที่ตามหลังภาษาไทย เช่น <i>แอปเปิ้ล(Apple)</i> &rarr; <i>แอปเปิ้ล</i>
                    </div>
                </div>
            </div>
        </div>
    `;

    // ยัด HTML ใส่หน้าต่างตั้งค่า Extensions (เมนูจิ๊กซอว์)
    $("#extensions_settings").append(html);

    // ทำงานเมื่อกดสวิตช์เปิด/ปิด
    $("#tc_auto_remove").on("change", function() {
        extension_settings[extensionName].autoRemove = !!$(this).prop("checked");
        saveSettingsDebounced();
    });

    // ดักจับการทำงานเมื่อบอทตอบกลับ
    eventSource.on(event_types.MESSAGE_RECEIVED, processMessage);
    eventSource.on(event_types.MESSAGE_UPDATED, processMessage);
    
    console.log("[Text Cleaner] Extension Loaded and UI Injected!");
});