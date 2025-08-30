// ดึง context และ Event API ออกมาใช้งาน
const { eventSource, event_types, extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();

// กำหนดชื่อ Module สำหรับ settings ของเรา
const MODULE_NAME = 'removeEllipsisExt';
// ค่าตั้งต้น (default) สำหรับโหมดอัตโนมัติ
const defaultSettings = { autoRemove: false };

// ฟังก์ชันอ่านและสร้างค่า settings
function getSettings() {
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}
const settings = getSettings();

// ฟังก์ชันลบจุดไข่ปลาในข้อความ
function cleanText(text) {
    return text.replace(/\.\.\./g, '').replace(/…/g, '');  // ลบ "..." และเครื่องหมาย ellipsis
}

// จับเหตุการณ์เมื่อผู้ใช้ส่งข้อความ (ยังไม่แสดงใน UI)
eventSource.on(event_types.MESSAGE_SENT, (data) => {
    // ลบ ... ออกจากข้อความผู้ใช้ก่อนเก็บลง chat
    data.message = cleanText(data.message);
});

// จับเหตุการณ์เมื่อ AI ส่งข้อความ (ยังไม่แสดงใน UI)
eventSource.on(event_types.MESSAGE_RECEIVED, (data) => {
    // ถ้าเปิดโหมดอัตโนมัติ ลบ ... จากข้อความ AI
    if (settings.autoRemove) {
        data.message = cleanText(data.message);
    }
});

// ฟังก์ชันลบ ... จากข้อความทั้งหมดในประวัติการสนทนา (เรียกใช้เมื่อกดปุ่ม)
function removeEllipsesFromChat() {
    const context = SillyTavern.getContext();
    // วนแก้ไขทุกข้อความใน context.chat (อ็อบเจ็กต์ข้อความเป็นแบบ mutable):contentReference[oaicite:11]{index=11}
    context.chat.forEach(msgObj => {
        msgObj.mes = cleanText(msgObj.mes);
    });
    // บันทึกหรือรีเฟรชหากจำเป็น (ตัวอย่างเช่น emit CHAT_CHANGED)
}
