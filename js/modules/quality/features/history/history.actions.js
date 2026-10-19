/**
 * history.actions.js
 * Бизнес-действия модуля History.
 *
 * Все операции с данными — через ctx.inspections (после bindCtx)/ctx.storage,
 * с fallback на window.dbPut/STORES для обратной совместимости (пока storage
 * не гарантированно доступен на момент вызова из inline-обработчиков).
 */

import { HistoryState } from './history.state.js';
import { HistoryRender } from './history.render.js';

// Фаза 91 (перенесено из history.legacy.js): единая точка доступа к IndexedDB
// через StorageService или fallback на глобальные dbPut/STORES.
function _storage(ctx) {
    if (ctx && ctx.storage) {
        return ctx.storage;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.storage) {
        return window.RBI.services.storage;
    }
    return {
        stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
        get: function (store, key) { return dbGet(store, key); },
        getAll: function (store) { return dbGetAll(store); },
        put: function (store, data) { return dbPut(store, data); }
    };
}

// Фаза 121 (перенесено из history.legacy.js): единая точка вызова
// синхронизации через SyncService или fallback на глобальный triggerSync.
function _sync(mode) {
    var m = mode || 'silent';
    if (HistoryActions._ctx && HistoryActions._ctx.sync) {
        return HistoryActions._ctx.sync.trigger(m);
    }
    if (window.RBI && window.RBI.services && window.RBI.services.sync) {
        return window.RBI.services.sync.trigger(m);
    }
    if (typeof triggerSync === 'function') return triggerSync(m);
    return Promise.resolve(false);
}

// Единая точка доступа к permissions: приоритет ctx.permissions,
// затем fallback на window.RBI.services.permissions.
function _permissions(ctx) {
    return (ctx && ctx.permissions) || (window.RBI && window.RBI.services && window.RBI.services.permissions);
}

export const HistoryActions = {

    _ctx: null,

    bindCtx(ctx) {
        this._ctx = ctx;
    },

    /**
     * Загрузить ПЕРВУЮ страницу Журнала через InspectionService.getPage()
     * (курсор по индексу by_date — DB_VERSION 21, storage-db.core.js), а не
     * весь стор app_history через getActive()/getAll(). Заменяет предыдущий
     * подход «достать всё сразу» — см. отчёт по оптимизации журнала/аналитики.
     * Обновляет HistoryState и эмитит history:loaded.
     */
    async loadRecords() {
        try {
            const svc = this._ctx && this._ctx.inspections;
            if (!svc) {
                console.warn('[HistoryActions] inspection service недоступен');
                return;
            }
            HistoryState.resetPagination();

            // Первая прогрузка: добираем страницы, пока не наберём
            // initialObjectTarget уникальных объектов (площадок) или не кончатся
            // записи — чтобы верхний список открывался сразу с ~20 объектами
            // без ручной пагинации.
            const targetObjects = HistoryState.initialObjectTarget || 20;
            const maxPages = 12;
            let collected = [];
            let cursorKey = null;
            let cursorPrimaryKey = null;
            let hasMore = false;

            const uniqueObjectCount = (arr) => {
                const names = Object.create(null);
                let n = 0;
                for (let i = 0; i < arr.length; i++) {
                    const p = (arr[i] && (arr[i].projectName || arr[i].project_display_name)) || 'Без объекта';
                    if (!names[p]) {
                        names[p] = true;
                        n++;
                    }
                }
                return n;
            };

            for (let pageNo = 0; pageNo < maxPages; pageNo++) {
                const page = await svc.getPage({
                    limit: HistoryState.pageSize,
                    cursorKey: cursorKey,
                    cursorPrimaryKey: cursorPrimaryKey
                });
                const items = page.items || [];
                if (items.length) collected = collected.concat(items);
                cursorKey = page.nextCursorKey;
                cursorPrimaryKey = page.nextCursorPrimaryKey;
                hasMore = !!page.hasMore;
                if (!hasMore) break;
                if (uniqueObjectCount(collected) >= targetObjects) break;
            }

            HistoryState.setRecords(collected);
            HistoryState.setPageState({
                pageCursorKey: cursorKey,
                pageCursorPrimaryKey: cursorPrimaryKey,
                pageHasMore: hasMore
            });

            const events = this._ctx && this._ctx.events;
            if (events && typeof events.emit === 'function') {
                events.emit('history:loaded', { count: HistoryState.allRecords.length });
            }
        } catch (e) {
            console.error('[HistoryActions] ошибка loadRecords:', e);
        }
    },

    /**
     * Дозагрузить СЛЕДУЮЩУЮ страницу Журнала (курсор продолжается с места,
     * где остановилась предыдущая страница) и добросить её к уже показанным
     * записям. Не перечитывает весь массив — append в state + DOM-patch
     * (HistoryRender.appendPage), без полной пересборки списка.
     */
    async loadNextPage() {
        if (HistoryState.isLoadingPage || !HistoryState.pageHasMore) return;
        const svc = this._ctx && this._ctx.inspections;
        if (!svc) return;

        try {
            HistoryState.setPageState({ isLoadingPage: true });
            const page = await svc.getPage({
                limit: HistoryState.pageSize,
                cursorKey: HistoryState.pageCursorKey,
                cursorPrimaryKey: HistoryState.pageCursorPrimaryKey
            });
            const newItems = page.items || [];
            HistoryState.appendRecords(newItems);
            HistoryState.setPageState({
                pageCursorKey: page.nextCursorKey,
                pageCursorPrimaryKey: page.nextCursorPrimaryKey,
                pageHasMore: page.hasMore,
                isLoadingPage: false
            });
            if (typeof HistoryRender.appendPage === 'function') {
                HistoryRender.appendPage(newItems);
            } else {
                HistoryRender.render();
            }
        } catch (e) {
            console.error('[HistoryActions] ошибка loadNextPage:', e);
            HistoryState.setPageState({ isLoadingPage: false });
        }
    },

    /**
     * Мягкое удаление записей по заданным ID (программный вызов, минуя чекбоксы).
     * Делегирует в this.deleteSelectedHistory, которая читает выбор из DOM
     * (getSelectedHistoryIds) — полный переход на явную передачу ids
     * без чтения DOM внутри deleteSelectedHistory — следующая фаза.
     */
    async softDeleteSelected(ids) {
        try {
            if (!Array.isArray(ids) || ids.length === 0) return;
            HistoryState.setSelectedIds(ids);

            await HistoryActions.deleteSelectedHistory();

            const events = this._ctx && this._ctx.events;
            if (events && typeof events.emit === 'function') {
                events.emit('history:deleted', { ids });
            }
        } catch (e) {
            console.error('[HistoryActions] ошибка softDeleteSelected:', e);
        }
    },

    /**
     * Загрузить больше групп (пагинация).
     * Увеличивает visibleGroupCount и перерисовывает.
     */
    loadMore() {
        HistoryState.setVisibleGroupCount(HistoryState.visibleGroupCount + 15);
        HistoryRender.render();
    },

    /**
     * Возвращает массив ID выбранных (отмеченных галочками) проверок.
     * Перенесено из history.legacy.js (бывший app.js, строка 2483).
     * ID — текстовые строки (UUID из облака).
     */
    getSelectedHistoryIds() {
        return Array.from(document.querySelectorAll('.hist-checkbox:checked')).map(function (cb) {
            return cb.value;
        });
    },

    /**
     * Ставит/снимает все галочки в списке истории.
     * Перенесено из history.legacy.js (бывший app.js, строка 2478).
     * Вызывается из inline handler: onchange="toggleAllHistory(this)"
     */
    toggleAllHistory(checkbox) {
        var checkboxes = document.querySelectorAll('.hist-checkbox');
        checkboxes.forEach(function (cb) {
            cb.checked = checkbox.checked;
        });
    },

    /**
     * Экспортирует выбранные проверки в CSV-файл.
     * Перенесено из history.legacy.js (бывший app.js, строка 2566).
     * Вызывается из inline handler: onclick="exportSelectedCsv()"
     * Зависимости: getSelectedHistoryIds, HistoryState.allRecords, exportToCSV, downloadFile, showToast
     */
    exportSelectedCsv() {
        var ids = HistoryActions.getSelectedHistoryIds();
        if (ids.length === 0) return showToast('Выберите элементы для выгрузки');
        var selectedData = HistoryState.allRecords.filter(function (i) { return ids.includes(i.id); });
        var csv = exportToCSV(selectedData);
        if (csv) downloadFile(csv, 'rbi_selected_' + new Date().toLocaleDateString() + '.csv', 'text/csv');
    },

    /**
     * Печать PDF «Акт осмотра» по выбранным проверкам.
     */
    printSelectedInspectionActs() {
        var ids = HistoryActions.getSelectedHistoryIds();
        if (ids.length === 0) return showToast('Выберите проверки для печати акта');
        if (typeof window.printInspectionActs === 'function') {
            return window.printInspectionActs(ids, 'browser');
        }
        return showToast('⚠️ Модуль печати недоступен');
    },

    /**
     * Soft delete выбранных проверок.
     * Перенесено из history.legacy.js (бывший app.js, строка 2488).
     * Вызывается из inline handler: onclick="deleteSelectedHistory()"
     * Зависимости: getSelectedHistoryIds, HistoryState.allRecords, RbiRoles,
     *              this._ctx.storage/dbPut/STORES, HistoryRender.render, renderCurrentAnalyticsTab,
     *              updateDataSummary, triggerSync, gameForceUpdatePlan, showToast
     */
    async deleteSelectedHistory() {
        var ids = HistoryActions.getSelectedHistoryIds();
        if (ids.length === 0) return showToast('Сначала выберите элементы галочками');

        var perm = _permissions(HistoryActions._ctx);

        if (perm && !perm.canCreate()) {
            return showToast('⛔ Ваша роль не позволяет удалять проверки');
        }

        var canDeleteAll = true;
        for (var k = 0; k < ids.length; k++) {
            var id = ids[k];
            var found = HistoryState.allRecords.find(function (i) { return String(i.id) === String(id); });
            if (!found) continue;
            var ownerName = found.inspectorName || found.inspector_name || '';
            if (perm && !perm.canDelete(ownerName)) {
                canDeleteAll = false;
                break;
            }
        }

        if (!canDeleteAll) {
            return showToast('⚠️ Инженер может удалить только свои проверки. Снимите галочки с чужих актов.');
        }

        if (!confirm('Удалить выбранные проверки (' + ids.length + ' шт)?')) return;

        var storage = _storage(HistoryActions._ctx);
        var contractorMetricsSvc = (HistoryActions._ctx && HistoryActions._ctx.contractorMetrics)
            || (window.RBI && window.RBI.services && window.RBI.services.contractorMetrics);

        for (var j = 0; j < ids.length; j++) {
            var delId = ids[j];
            var item = HistoryState.allRecords.find(function (i) { return String(i.id) === String(delId); });
            if (item) {
                var now = new Date().toISOString();
                item._deleted = true;
                item.is_deleted = true;
                item._deletedAt = now;
                item.updatedAt = now;
                item.updated_at = now;
                item.source = 'local';
                item.syncStatus = 'not_synced';
                item.sync_status = 'not_synced';
                item.syncBlockReason = '';
                await storage.put(storage.stores().HISTORY, item);
                if (contractorMetricsSvc) contractorMetricsSvc.recalcTouched(item);
            }
        }

        HistoryState.setRecords(HistoryState.allRecords.filter(function (i) { return !i._deleted; }));
        if (Array.isArray(window.contractorArray)) {
            window.contractorArray = window.contractorArray.filter(function (i) { return !i._deleted; });
        }

        var selectAllCb = document.getElementById('hist-select-all');
        if (selectAllCb) selectAllCb.checked = false;

        HistoryRender.render();

        if (typeof renderCurrentAnalyticsTab === 'function') {
            renderCurrentAnalyticsTab();
        }
        updateDataSummary();

        localStorage.setItem('rbi_cloud_dirty', '1');
        _sync('silent');

        if (typeof renderCurrentAnalyticsTab === 'function') renderCurrentAnalyticsTab();
        if (typeof gameForceUpdatePlan === 'function') gameForceUpdatePlan(true);
        updateDataSummary();
        showToast('✅ Удалено успешно (' + ids.length + ' шт)');
    },

    /**
     * Делегирование: loadHistoryData → HistoryActions.loadRecords.
     * Перенесено из history.legacy.js (Блок 12 Integration).
     */
    loadHistoryData() {
        return HistoryActions.loadRecords();
    }
};

if (typeof window !== 'undefined') {
    window.HistoryActions = HistoryActions;

    // Прокси для обратной совместимости: inline-обработчики index.html
    // и внешние вызовы из game.js/export.js/sync.js используют глобальные имена.
    window.getSelectedHistoryIds = HistoryActions.getSelectedHistoryIds;
    window.toggleAllHistory = HistoryActions.toggleAllHistory;
    window.exportSelectedCsv = HistoryActions.exportSelectedCsv;
    window.printSelectedInspectionActs = HistoryActions.printSelectedInspectionActs;
    window.deleteSelectedHistory = HistoryActions.deleteSelectedHistory;
    window.loadHistoryData = HistoryActions.loadHistoryData;
}

console.log('[HistoryActions] history.actions.js loaded');
