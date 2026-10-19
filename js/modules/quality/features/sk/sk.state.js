/**
 * sk.state.js
 * Изолированное состояние модуля SK (Стройконтроль).
 *
 * Единый источник правды для данных СК.
 * Глобальные переменные window.skRecords, window.skVolumes и т.д.
 * остаются для обратной совместимости, но заполняются через этот объект.
 */

export const SKState = {

    records:             [],
    volumes:             {},
    contractorMap:       {},
    categoryMap:         {},
    mapping:             null,
    currentSubTab:       'dashboard',
    currentPeriodFilter: 'ALL',
    hrSortBy:            'kpi',
    hrSortDesc:          true,

    /* ── Сеттеры ─────────────────────────────────────────────────────── */

    setRecords(arr) {
        this.records = arr || [];
        window.skRecords = this.records;
    },

    setVolumes(obj) {
        this.volumes = obj || {};
        window.skVolumes = this.volumes;
    },

    setContractorMap(obj) {
        this.contractorMap = obj || {};
        window.skContractorMap = this.contractorMap;
    },

    setCategoryMap(obj) {
        this.categoryMap = obj || {};
        window.skCategoryMap = this.categoryMap;
    },

    setMapping(obj) {
        this.mapping = obj || null;
        window.skMapping = this.mapping;
    },

    setSubTab(tab) {
        this.currentSubTab = tab || 'dashboard';
        window.skCurrentSubTab = this.currentSubTab;
    },

    setPeriodFilter(f) {
        this.currentPeriodFilter = f || 'ALL';
        window.skCurrentPeriodFilter = this.currentPeriodFilter;
    },

    /* ── Геттеры ─────────────────────────────────────────────────────── */

    getActiveRecords() {
        return this.records.filter(function (r) {
            return !r._deleted && !r.is_deleted;
        });
    }
};

console.log('[SKState] sk.state.js loaded');
