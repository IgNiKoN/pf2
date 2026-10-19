/**
 * analytics.state.js
 * Изолированное состояние модуля Analytics.
 *
 * Единый источник правды для данных аналитики.
 * Глобальные переменные window.analyticsDataMode, window.activeMultiFilters.analytics,
 * window.chartInstances остаются для обратной совместимости,
 * но заполняются через этот объект.
 */

export const AnalyticsState = {

    dataSource: [],
    mode: 'local',
    chartInstances: {},

    filters: {
        project: [],
        contractor: [],
        inspector: [],
        template: [],
        period: null
    },

    activeSubTab: null,

    /* ── Сеттеры ─────────────────────────────────────────────────────── */

    setDataSource(arr) {
        this.dataSource = arr || [];
    },

    setMode(mode) {
        this.mode = mode === 'cloud' ? 'cloud' : 'local';
        window.analyticsDataMode = this.mode;
    },

    setFilters(filters) {
        if (filters && typeof filters === 'object') {
            Object.assign(this.filters, filters);
        }
        if (window.RBI && window.RBI.services && window.RBI.services.analytics) {
            window.RBI.services.analytics.setAnalyticsFilters(this.filters);
        } else if (window.activeMultiFilters && window.activeMultiFilters.analytics) {
            Object.assign(window.activeMultiFilters.analytics, this.filters);
        }
    },

    setChartInstances(instances) {
        this.chartInstances = instances || {};
        window.chartInstances = this.chartInstances;
    },

    setActiveSubTab(tab) {
        this.activeSubTab = tab || null;
        if (tab) {
            try { localStorage.setItem('rbi_active_analytics_tab', tab); } catch (_) {}
        }
    }
};

if (typeof window !== 'undefined') {
    window.AnalyticsState = AnalyticsState;
    // Владение chartInstances (Реальная изоляция модулей, часть 3, Группа A):
    // ранее устанавливалось в js/core/bootstrap.js module-scope переменной.
    // Теперь AnalyticsState — единственный владелец, синхронизация с window
    // выполняется сразу при загрузке модуля (раньше bootstrap.js по порядку
    // тегов в index.html), не только внутри setChartInstances().
    window.chartInstances = AnalyticsState.chartInstances;
}

// Перенесено из app.js 1:1 (плоские переменные, не встроены в AnalyticsState,
// т.к. потребители (analytics.render.js/analytics.actions.js) мутируют их через
// window.trendGroupings[type] = .../window.selectedChartFilters[type] = ... —
// оборачивание в объект потребовало бы правки потребителей, что вне объёма).
let trendGroupings = { contrs: 'MONTH', works: 'MONTH', global: 'MONTH', onepager: 'WEEK' };
window.trendGroupings = trendGroupings;
let selectedChartFilters = { contrs: [], works: [], onepager: [] }; // Пустой массив = Авто
window.selectedChartFilters = selectedChartFilters;
let currentEditingExpertKey = null;
window.currentEditingExpertKey = currentEditingExpertKey;
let currentEditingTextAreaId = null;
window.currentEditingTextAreaId = currentEditingTextAreaId;
let currentContractorsFilter = 'ALL'; // Состояние чипсов (Все, Критичные и т.д.)
window.currentContractorsFilter = currentContractorsFilter;
let currentDetailedContractor = null; // Какой подрядчик сейчас открыт
window.currentDetailedContractor = currentDetailedContractor;

console.log('[AnalyticsState] analytics.state.js loaded');
