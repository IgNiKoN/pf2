/* Файл: js/services/analytics.service.js */
/* Analytics Service v0.1 — обёртка над глобальными функциями аналитики */
/* Делегирует вызовы в analytics.js, app.js, math.js — ничего не копирует */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    window.RBI.services.analytics = {

        /* Возвращает массив проверок по режиму 'local' | 'cloud' */
        getAnalyticsDataSource: function (mode) {
            if (typeof getAnalyticsDataSource === 'function') {
                return getAnalyticsDataSource(mode);
            }
            return [];
        },

        /* Возвращает отфильтрованные данные с учётом активных фильтров и периода */
        getFilteredAnalyticsData: function () {
            if (typeof getFilteredAnalyticsData === 'function') {
                return getFilteredAnalyticsData();
            }
            return [];
        },

        /* Рассчитывает аналитику по группе проверок */
        getContractorAnalytics: function (data, filters) {
            if (typeof getContractorAnalytics === 'function') {
                return getContractorAnalytics(data, filters);
            }
            return null;
        },

        /* Возвращает текущие активные фильтры аналитики */
        getAnalyticsFilters: function () {
            if (typeof activeMultiFilters !== 'undefined' && activeMultiFilters.analytics) {
                return activeMultiFilters.analytics;
            }
            return { project: [], contractor: [], inspector: [], template: [] };
        },

        /* Обновляет фильтры аналитики и перерисовывает панель */
        setAnalyticsFilters: function (filters) {
            if (typeof activeMultiFilters !== 'undefined' && activeMultiFilters.analytics) {
                Object.assign(activeMultiFilters.analytics, filters);
            }
            if (typeof updateAnalyticsFilters === 'function') {
                updateAnalyticsFilters();
            }
        },

        /* Сбрасывает фильтры аналитики (namespace 'analytics' и 'history') до начального пустого состояния.
         * Мутируем существующий объект window.activeMultiFilters — не подменяем ссылку,
         * чтобы ES-модуль multi-filter.js и сервисы не расходились (current_plan B1). */
        resetAnalyticsFilters: function () {
            var af = window.activeMultiFilters;
            if (!af || typeof af !== 'object') {
                window.activeMultiFilters = {
                    history: { project: [], contractor: [], inspector: [] },
                    analytics: { project: [], contractor: [], inspector: [], template: [] }
                };
                return;
            }
            af.history = { project: [], contractor: [], inspector: [] };
            af.analytics = { project: [], contractor: [], inspector: [], template: [] };
        },

        /* Возвращает текущий режим источника данных ('local' | 'cloud') */
        getAnalyticsMode: function () {
            return window.analyticsDataMode || 'local';
        },

        /* Устанавливает режим источника данных и перерисовывает переключатель */
        setAnalyticsMode: function (mode) {
            window.analyticsDataMode = mode === 'cloud' ? 'cloud' : 'local';
            if (typeof renderAnalyticsModeSwitcher === 'function') {
                renderAnalyticsModeSwitcher();
            }
        },

        /* Возвращает id текущей открытой подвкладки аналитики (window.currentActiveAnalyticsTab — зеркало) */
        getActiveSubTab: function () {
            return window.currentActiveAnalyticsTab || null;
        },

        /* Возвращает уникальные названия объектов из истории проверок */
        getAvailableProjects: function () {
            if (!Array.isArray(window.contractorArray)) return [];
            var seen = {};
            var result = [];
            window.contractorArray.forEach(function (item) {
                var name = item.project_display_name || item.projectName || item.project_canonical_key || '';
                if (name && !seen[name]) {
                    seen[name] = true;
                    result.push(name);
                }
            });
            return result.sort();
        },

        /* Возвращает уникальные названия подрядчиков из истории проверок */
        getAvailableContractors: function () {
            if (!Array.isArray(window.contractorArray)) return [];
            var seen = {};
            var result = [];
            window.contractorArray.forEach(function (item) {
                var name = item.contractorName || '';
                if (name && !seen[name]) {
                    seen[name] = true;
                    result.push(name);
                }
            });
            return result.sort();
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.analytics', window.RBI.services.analytics);
    }

    console.log('[RBI Service] analytics loaded');
}());
