/**
 * history.state.js
 * Изолированное состояние модуля History.
 *
 * Единый источник правды для данных истории проверок.
 * Все модули читают данные через window.HistoryState.allRecords.
 */

export const HistoryState = {

    records: [],
    allRecords: [],
    selectedIds: [],

    filters: {
        period: 'all',
        contractor: '',
        object: '',
        status: '',
        searchText: ''
    },

    visibleGroupCount: 20,
    hasMore: false,

    // Постраничная (курсорная) загрузка Журнала (см. отчёт по оптимизации
    // журнала/аналитики). pageCursorKey — значение поля `date` последней
    // полученной записи, pageCursorPrimaryKey — её id (используются ВМЕСТЕ как
    // точная граница для следующей страницы через индекс by_date — см.
    // dbGetPageByIndex, storage-db.core.js: одного только значения даты
    // недостаточно при совпадающих датах у нескольких записей).
    // pageHasMore — есть ли ещё записи в базе за текущим курсором.
    // isLoadingPage — защита от повторного параллельного запроса следующей страницы.
    // initialObjectTarget — сколько верхнеуровневых объектов (площадок) набрать
    // при первом заходе, докручивая страницы без участия пользователя.
    pageCursorKey: null,
    pageCursorPrimaryKey: null,
    pageHasMore: false,
    isLoadingPage: false,
    pageSize: 50,
    initialObjectTarget: 20,

    /* ── Сеттеры ─────────────────────────────────────────────────────── */

    setRecords(arr) {
        this.allRecords = arr || [];
        this.records = this.allRecords;
    },

    appendRecords(arr) {
        var toAppend = arr || [];
        this.allRecords = this.allRecords.concat(toAppend);
        this.records = this.allRecords;
    },

    setPageState(patch) {
        if (patch && typeof patch === 'object') {
            Object.assign(this, patch);
        }
    },

    resetPagination() {
        this.pageCursorKey = null;
        this.pageCursorPrimaryKey = null;
        this.pageHasMore = false;
        this.isLoadingPage = false;
    },

    setFilters(patch) {
        if (patch && typeof patch === 'object') {
            Object.assign(this.filters, patch);
        }
    },

    resetFilters() {
        this.filters = {
            period: 'all',
            contractor: '',
            object: '',
            status: '',
            searchText: ''
        };
    },

    setSelectedIds(ids) {
        this.selectedIds = Array.isArray(ids) ? ids : [];
    },

    setVisibleGroupCount(n) {
        this.visibleGroupCount = typeof n === 'number' && n > 0 ? n : 20;
    }
};

if (typeof window !== 'undefined') {
    window.HistoryState = HistoryState;
}

console.log('[HistoryState] history.state.js loaded');
