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
    // regex จับ <think>...</think> ไว้ใน group 1 ถ้าเจอจะข้ามไป ถ้าเจอ . นอกแท็ก จะลบทิ้ง
    text = text.replace(/(<think>[\s\S]*?<\/think>)|(\.)/gi, (match, p1) => {
        if (p1) return p1; // คืนค่า <think>... กลับไปเหมือนเดิม
        return ''; // ลบจุด
    });

    // 2. ลบคำที่เป็น ไทย(English)
    // จับคู่ภาษาไทย ตามด้วยวงเล็บที่มีภาษาอังกฤษข้างใน แล้วแทนที่ด้วยคำไทยคำแรก
    text = text.replace(/([ก-๙]+)\s*\([A-Za-z0-9\s\-_.,'"]+\)/g, '$1');

    return text;
}

function processMessage(messageId) {
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
    // โครงสร้าง HTML สำหรับเมนูตั้งค่า
    const html = `
        <div class="text-cleaner-settings">
            <div class="cleaner-header">
                <span>🧹 Thai Text & Dot Cleaner</span>
            </div>
            <div class="cleaner-content">
                <label class="checkbox_label">
                    <input type="checkbox" id="tc_auto_remove" ${extension_settings[extensionName].autoRemove ? 'checked' : ''}>
                    <span>เปิดใช้งาน Auto Remove อัตโนมัติ</span>
                </label>
                <div class="cleaner-desc">
                    <strong>การทำงาน:</strong><br>
                    • ลบจุด (.) ทั้งหมด ยกเว้นข้อความในแท็ก &lt;think&gt;...&lt;/think&gt;<br>
                    • ลบวงเล็บภาษาอังกฤษที่ตามหลังภาษาไทย เช่น "แอปเปิ้ล(Apple)" จะเหลือแค่ "แอปเปิ้ล"
                </div>
            </div>
        </div>
    `;

    // นำไปใส่ในหน้าต่าง Extensions (เมนูรูปจิ๊กซอว์)
    $("#extensions_settings").append(html);

    // บันทึกการตั้งค่าเมื่อผู้ใช้กดติ๊กเปิด/ปิดสวิตช์
    $("#tc_auto_remove").on("change", function() {
        extension_settings[extensionName].autoRemove = !!$(this).prop("checked");
        saveSettingsDebounced();
    });
}

jQuery(async () => {
    await setupUI();
    
    // ดักจับ Event เมื่อมีข้อความใหม่ตอบกลับมา
    eventSource.on(event_types.MESSAGE_RECEIVED, processMessage);
    // ดักจับ Event เมื่อผู้ใช้กด Swipe ปัดขวาหาข้อความใหม่ หรือทำการแก้ไขข้อความ (Edit)
    eventSource.on(event_types.MESSAGE_UPDATED, processMessage);
});