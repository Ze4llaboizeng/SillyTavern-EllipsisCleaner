// Ellipsis Cleaner Extension for SillyTavern
// ลบ "..." ออกจากข้อความโมเดล

(function () {
    function cleanEllipsis(text) {
        // ลบทุก "..." หรือมากกว่านั้น
        return text.replace(/\.{3,}/g, "");
    }

    // Hook ก่อนข้อความจะแสดง
    eventSource.on("messageReceived", (data) => {
        if (data?.message?.mes) {
            data.message.mes = cleanEllipsis(data.message.mes);
        }
    });

    console.log("✅ Ellipsis Cleaner (Remove all ...) loaded");
})();
