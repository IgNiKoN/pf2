/* Файл: js/services/storage/storage-converters.utils.js — перенесено из js/storage.js без изменения логики */
/**
 /**
 * Вспомогательные функции для работы с ArrayBuffer/Blob/Base64
 */
function base64ToBlob(base64, mimeType = 'image/jpeg') {
    if (!base64 || !base64.includes('base64,')) return null;
    const byteCharacters = atob(base64.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// НОВЫЕ ФУНКЦИИ ДЛЯ v16.8.7 (Конвертация в бинарный формат ArrayBuffer)
async function blobToArrayBuffer(blob) {
    return await blob.arrayBuffer();
}
// RBI NEW: сетевое получение облачного файла без использования HTTP-кэша браузера.
// Это нужно, чтобы после очистки IndexedDB файл не "воскресал" офлайн из браузерного cache.
async function rbiFetchCloudFileNoBrowserCache(url) {
    if (!url || !String(url).startsWith('http')) {
        throw new Error('Некорректная облачная ссылка');
    }

    // Если браузер сам считает, что офлайн — сразу запрещаем восстановление.
    if (navigator.onLine === false) {
        throw new Error('Нет интернета для загрузки файла из облака');
    }

    return await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors'
    });
}

function arrayBufferToBlob(buffer, mimeType = 'image/webp') {
    return new Blob([buffer], { type: mimeType });
}

/**
 * Отчёты в IDB: на iOS PWA Blob в IndexedDB часто «умирает» после перезапуска,
 * поэтому пишем ArrayBuffer (как PhotoManager). Читатели принимают оба формата.
 */
function rbiReportPayloadBytes(payload) {
    if (!payload) return 0;
    try {
        if (typeof payload.byteLength === 'number' && payload.byteLength > 0) return payload.byteLength;
        if (typeof payload.size === 'number' && payload.size > 0) return payload.size;
    } catch (_) { /* ignore */ }
    return 0;
}

function rbiReportPayloadToBlob(payload, mimeType) {
    if (!payload) return null;
    const mime = mimeType || 'application/pdf';
    if (typeof Blob !== 'undefined' && payload instanceof Blob) {
        return payload.size > 0 ? payload : null;
    }
    if (payload instanceof ArrayBuffer) {
        return payload.byteLength > 0 ? new Blob([payload], { type: mime }) : null;
    }
    if (ArrayBuffer.isView && ArrayBuffer.isView(payload)) {
        return payload.byteLength > 0 ? new Blob([payload], { type: mime }) : null;
    }
    return null;
}

function rbiHasReportPayload(payload) {
    return rbiReportPayloadBytes(payload) > 0;
}

async function base64ToArrayBuffer(base64) {
    const mimeType = base64.match(/data:(.*?);/)[1] || 'image/webp';
    const blob = base64ToBlob(base64, mimeType);
    return await blobToArrayBuffer(blob);
}

async function arrayBufferToBase64(buffer, mimeType = 'image/webp') {
    const blob = arrayBufferToBlob(buffer, mimeType);
    return await blobToBase64(blob);
}

/**
 * Экспорт и Импорт данных (JSON и CSV)
 */
function exportToCSV(historyArray) {
    if (!historyArray || historyArray.length === 0) return null;

    // Добавляем BOM для правильного отображения кириллицы в Excel
    let csvContent = "\uFEFF";

    // Заголовки столбцов
    const headers = ['ID', 'Дата', 'Подрядчик', 'Вид работ', 'Локация', 'Инспектор', 'УрК Физика (%)', 'УрК Докум. (%)', 'Статус', 'Ошибки B1', 'Ошибки B2', 'Ошибки B3', 'Причина снижения'];
    csvContent += headers.join(";") + "\r\n";

    historyArray.forEach(item => {
        const dateStr = new Date(item.date).toLocaleString('ru-RU').replace(/,/g, '');
        const reason = item.metrics.reason ? item.metrics.reason.replace(/;/g, ',').replace(/\n/g, ' ') : '';
        const loc = item.location ? item.location.replace(/;/g, ',').replace(/\n/g, ' ') : '';

        // Документарный УрК: у старых записей поле metrics.documentary может отсутствовать —
        // CSV-экспорт истории не имеет доступа к актуальному чек-листу для lazy recalculation
        // (в отличие от history.render.js/analytics.render.js), поэтому здесь только читаем
        // сохранённое значение, без досчёта на лету.
        const docScore = (item.metrics.documentary !== null && item.metrics.documentary !== undefined) ? item.metrics.documentary : '—';

        const row = [
            item.id,
            dateStr,
            item.contractorName,
            item.templateTitle,
            loc,
            item.inspectorName,
            item.metrics.final,
            docScore,
            item.metrics.statusTxt,
            item.metrics.n_B1_fail,
            item.metrics.n_B2_fail,
            item.metrics.n_B3_fail,
            reason
        ];
        csvContent += row.join(";") + "\r\n";
    });

    return csvContent;
}

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.blobToBase64 = blobToBase64;
window.blobToArrayBuffer = blobToArrayBuffer;
window.rbiFetchCloudFileNoBrowserCache = rbiFetchCloudFileNoBrowserCache;
window.arrayBufferToBlob = arrayBufferToBlob;
window.base64ToArrayBuffer = base64ToArrayBuffer;
window.arrayBufferToBase64 = arrayBufferToBase64;
window.rbiReportPayloadBytes = rbiReportPayloadBytes;
window.rbiReportPayloadToBlob = rbiReportPayloadToBlob;
window.rbiHasReportPayload = rbiHasReportPayload;
window.exportToCSV = exportToCSV;
window.downloadFile = downloadFile;
