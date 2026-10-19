/* Файл: js/shared/error-log.utils.js */
/* Observability: отправка логов ошибок в Supabase + глобальные обработчики error/unhandledrejection — перенесено из js/app.js */

// --- Глобальный отлов ошибок для разработчика ---
async function sendErrorLogToCloud(message, stack) {
    // ЗАЩИТА: Если нет интернета - не пытаемся отправить ошибку, иначе будет бесконечный цикл
    if (!navigator.onLine || !window.supabaseClient || !window.syncConfig || !window.syncConfig.enabled) return;
    try {
        // Оборачиваем объект в массив [] - это надежнее для Supabase
        await window.supabaseClient.from('rbi_error_logs').insert([{
            device_id: window.syncConfig.deviceId,
            project_code: window.syncConfig.projectCode || 'N/A',
            message: String(message).slice(0, 300),
            stack: String(stack || '').slice(0, 500),
            app_version: 'v17.8.188',
            created_at: new Date().toISOString()
        }]);
    } catch (e) { console.error('Ошибка записи лога', e); }
}

// Ловим ошибки промисов (асинхронные)
window.addEventListener('unhandledrejection', event => {
    const msg = String(event.reason?.message || event.reason || '');
    const stack = String(event.reason?.stack || '');
    
    // Игнорируем фоновые ошибки от расширений Chrome (AdBlock, Adobe, VPN и т.д.)
    if (msg.includes('message channel closed') || stack.includes('chrome-extension://')) return;
    
    sendErrorLogToCloud(msg, stack);
});

// Ловим обычные ошибки интерфейса (синхронные)
window.addEventListener('error', event => {
    const msg = String(event.message || '');
    const stack = String(event.error?.stack || '');
    const filename = String(event.filename || '');
    
    // Игнорируем чужой код плагинов (чтобы не засорять консоль и нашу базу)
    if (filename.includes('chrome-extension://') || 
        msg.includes('showOneChild') || 
        msg.includes('ActionableCoachmark')) {
        return;
    }

    sendErrorLogToCloud(msg, stack);
});
