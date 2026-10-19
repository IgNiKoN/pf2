/* Файл: js/services/storage/storage-diagnostics.render.js — перенесено из js/storage.js без изменения логики */
/**
 * ОТОБРАЖЕНИЕ СТАТИСТИКИ ХРАНИЛИЩА (Для вкладки Настройки)
 */

/** Размер payload файла: ArrayBuffer / Blob / base64-строка / meta.size. */
function _rbiPayloadBytes(data, meta) {
    if (meta) {
        const metaSize = Number(meta.sizeBytes || meta.size_bytes || 0);
        if (metaSize > 0) return metaSize;
    }
    if (!data) return 0;
    if (typeof data.byteLength === 'number') return data.byteLength;
    if (typeof data.size === 'number') return data.size; // Blob / File
    if (typeof data === 'string') {
        // dataURL / base64 — грубая оценка полезной нагрузки
        if (data.startsWith('data:')) {
            const b64 = data.split(',')[1] || '';
            return Math.floor(b64.length * 0.75);
        }
        return data.length;
    }
    return 0;
}

/** iPhone/iPad (WebKit): estimate.usage часто занижен; quota — доля диска (процент ≈ 0%). */
function _rbiIsAppleMobileWebKit() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    // iPadOS 13+ иногда как Macintosh + touch
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    return false;
}

async function _rbiMeasureLocalFileCache() {
    const empty = {
        totalFiles: 0,
        totalBytes: 0,
        imageFiles: 0,
        pdfFiles: 0,
        recoverableFiles: 0,
        recoverableBytes: 0,
        localOnlyFiles: 0,
        localOnlyBytes: 0,
        reportPdfBytes: 0,
        reportPdfCount: 0,
        ok: false
    };
    if (typeof dbForEachCursor !== 'function' || typeof STORES === 'undefined') return empty;

    try {
        const out = { ...empty, ok: true };

        await dbForEachCursor(STORES.PHOTOS, (f) => {
            if (!f || !f.id || !f.data) return;
            out.totalFiles++;
            const id = String(f.id || '');
            const sizeBytes = _rbiPayloadBytes(f.data, f);
            const mime = f.mimeType || f.mime_type || '';
            const sourceUrl = f.sourceUrl || f.source_url || f.public_url || f.publicUrl || '';
            out.totalBytes += sizeBytes;
            if (String(mime).includes('image')) out.imageFiles++;
            if (String(mime).includes('pdf')) out.pdfFiles++;
            const hasCloudSource = id.startsWith('http') || String(sourceUrl).startsWith('http');
            const isLocalOnly = id.startsWith('local://') && !hasCloudSource;
            if (hasCloudSource) {
                out.recoverableFiles++;
                out.recoverableBytes += sizeBytes;
            } else if (isLocalOnly) {
                out.localOnlyFiles++;
                out.localOnlyBytes += sizeBytes;
            }
        });

        if (STORES.REPORTS) {
            await dbForEachCursor(STORES.REPORTS, (rep) => {
                if (!rep || !rep.file_blob) return;
                const reportSize = _rbiPayloadBytes(rep.file_blob, rep);
                out.reportPdfCount++;
                out.reportPdfBytes += reportSize;
                out.totalFiles++;
                out.totalBytes += reportSize;
                out.pdfFiles++;
            });
        }
        return out;
    } catch (_) {
        return empty;
    }
}

/**
 * ОТОБРАЖЕНИЕ СТАТИСТИКИ ХРАНИЛИЩА (Для вкладки Настройки)
 */
async function updateStorageInfo() {
    const sUsed = document.getElementById('storage-used');
    const sFree = document.getElementById('storage-free');
    const sPercent = document.getElementById('storage-percent');
    const sBar = document.getElementById('storage-bar');

    if (!sUsed) return;

    try {
        const fileStats = await _rbiMeasureLocalFileCache();
        const measuredBytes = fileStats.totalBytes || 0;

        let estimate = null;
        let estimateUsage = 0;
        let quotaBytes = 0;
        if (navigator.storage && typeof navigator.storage.estimate === 'function') {
            try {
                estimate = await navigator.storage.estimate();
                estimateUsage = estimate.usage || 0;
                quotaBytes = estimate.quota || 0;
            } catch (_) { /* ignore */ }
        }

        // Как в getStorageSnapshot: файлы — нижняя граница (критично для iOS, где usage занижен)
        const usageBytes = Math.max(measuredBytes, estimateUsage);
        const actualUsedMB = usageBytes / 1024 / 1024;
        const measuredMB = measuredBytes / 1024 / 1024;
        const estimateMB = estimateUsage / 1024 / 1024;
        const quotaMB = quotaBytes / 1024 / 1024;
        const freeMBNum = Math.max(0, quotaMB - actualUsedMB);
        let percentUsed = quotaBytes > 0 ? ((usageBytes / quotaBytes) * 100) : 0;

        const appleMobile = _rbiIsAppleMobileWebKit();
        // На iPhone квота часто = десятки ГБ → «Исп 0.1%» при реальных сотнях МБ файлов
        const quotaLooksInflated = appleMobile && quotaMB > 4096 && percentUsed < 2 && actualUsedMB > 1;

        sUsed.innerText = actualUsedMB.toFixed(1);
        if (quotaLooksInflated || !quotaBytes) {
            sFree.innerText = quotaBytes ? ('~' + freeMBNum.toFixed(0)) : 'н/д';
            sPercent.innerText = quotaLooksInflated ? 'н/д*' : (quotaBytes ? `${percentUsed.toFixed(1)}%` : 'н/д');
            // Полоска: доля от мягкого ориентира (файлы / max(512МБ, файлы×2)), не от «всего диска»
            const softCapBytes = Math.max(512 * 1024 * 1024, usageBytes * 2);
            const softPct = Math.min(100, (usageBytes / softCapBytes) * 100);
            if (sBar) {
                sBar.style.width = softPct.toFixed(1) + '%';
                sBar.className = softPct > 80 ? 'h-full bg-red-500 transition-all'
                    : softPct > 50 ? 'h-full bg-yellow-500 transition-all'
                        : 'h-full bg-indigo-500 transition-all';
            }
            percentUsed = softPct;
        } else {
            sFree.innerText = freeMBNum.toFixed(1);
            sPercent.innerText = `${percentUsed.toFixed(1)}%`;
            if (sBar) {
                sBar.style.width = `${Math.min(100, percentUsed).toFixed(1)}%`;
                if (percentUsed > 80) sBar.className = 'h-full bg-red-500 transition-all';
                else if (percentUsed > 50) sBar.className = 'h-full bg-yellow-500 transition-all';
                else sBar.className = 'h-full bg-indigo-500 transition-all';
            }
        }

        // --- ПАНЕЛЬ ДИАГНОСТИКИ ---
        let diagBlock = document.getElementById('rbi-diagnostics-block');
        if (!diagBlock && sBar) {
            const storageContainer = sBar.closest('.p-4');
            if (storageContainer) {
                storageContainer.insertAdjacentHTML('beforeend', '<div id="rbi-diagnostics-block" class="mt-4 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] text-slate-500 font-mono leading-relaxed"></div>');
                diagBlock = document.getElementById('rbi-diagnostics-block');
            }
        }
        if (diagBlock) {
            const histCount = typeof contractorArray !== 'undefined' ? contractorArray.length : 0;
            const notSyncedCount = typeof contractorArray !== 'undefined'
                ? contractorArray.filter(c => c.syncStatus !== 'synced' && c.sync_status !== 'synced').length
                : 0;

            const lastSync = localStorage.getItem('rbi_sync_last_push_at');
            const syncText = lastSync ? new Date(lastSync).toLocaleString('ru-RU') : 'Никогда';

            const versionInfo = window.RBI_APP_VERSION || {};
            const appVersion = versionInfo.app || '—';
            const swVersion = versionInfo.sw || '—';
            const dbVersion = window.RBI_DB_VERSION || '—';
            const buildDate = versionInfo.buildDate || '—';

            const details = (estimate && estimate.usageDetails) || {};
            const detailLine = (label, key) => {
                if (details[key] == null) return '';
                return `${label}: ${(details[key] / 1024 / 1024).toFixed(1)} МБ<br>`;
            };
            const appleNote = appleMobile
                ? `<br><span style="opacity:0.9">iOS: «Исп» = max(файлы ${(measuredMB).toFixed(1)} МБ, estimate ${(estimateMB).toFixed(1)} МБ). Квота браузера часто завышена — % может быть н/д*.</span><br>`
                : '';
            const usageBreakdownHtml = `
            <br><b>Занято:</b><br>
            В дашборде: ${actualUsedMB.toFixed(1)} МБ<br>
            Файлы (photos+отчёты): ${measuredMB.toFixed(1)} МБ<br>
            estimate.usage: ${estimateMB.toFixed(1)} МБ / квота ${quotaMB > 0 ? quotaMB.toFixed(1) : 'н/д'} МБ<br>
            ${detailLine('IndexedDB', 'indexedDB')}
            ${detailLine('Cache API (SW)', 'caches')}
            ${detailLine('Service Worker', 'serviceWorkerRegistrations')}
            ${appleNote}
        `;

            let cacheStatsHtml = '';
            if (fileStats.ok) {
                cacheStatsHtml = `
            <br><b>Файловый кэш (полезная нагрузка в IDB):</b><br>
            Всего локальных файлов: ${fileStats.totalFiles} шт. / ${measuredMB.toFixed(1)} МБ<br>
            Фото: ${fileStats.imageFiles} шт.; PDF в photos: ${fileStats.pdfFiles - fileStats.reportPdfCount} шт.; PDF-отчёты: ${fileStats.reportPdfCount} шт. / ${(fileStats.reportPdfBytes / 1024 / 1024).toFixed(1)} МБ<br>
            Можно безопасно очистить: ${fileStats.recoverableFiles} шт. / ${(fileStats.recoverableBytes / 1024 / 1024).toFixed(1)} МБ<br>
            Только локальные, не удаляются: ${fileStats.localOnlyFiles} шт. / ${(fileStats.localOnlyBytes / 1024 / 1024).toFixed(1)} МБ<br>
            <span style="opacity:0.85">Разница «браузер − файлы» ≈ оверхед IDB, записи проверок и кэш SW.</span><br>
        `;
            } else {
                cacheStatsHtml = '<br><b>Файловый кэш:</b><br>Статистика временно недоступна<br>';
            }

            const lastCleanupText = appSettings && appSettings.storageLastCleanupAt
                ? new Date(appSettings.storageLastCleanupAt).toLocaleString('ru-RU')
                : 'Не выполнялась';

            diagBlock.innerHTML = `
        <b>Диагностика системы:</b><br>
        Версия приложения: v${appVersion}<br>
        Service Worker: v${swVersion}<br>
        БД IndexedDB: v${dbVersion}<br>
        Сборка: ${buildDate}<br>
        Последняя очистка кэша:<br>${lastCleanupText}<br>
        База проверок: ${histCount} шт.<br>
        Ожидают отправки: ${notSyncedCount} шт.<br>
        Последний контакт с облаком:<br>${syncText}
        ${usageBreakdownHtml}
        ${cacheStatsHtml}
    `;
        }
    } catch (e) {
        sUsed.innerText = 'н/д';
        sFree.innerText = 'н/д';
    }
}

window.updateStorageInfo = updateStorageInfo;

