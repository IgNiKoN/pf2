/* Файл: js/services/game.service.js */
/* Game Service v0.1 — синхронная обёртка над живыми глобалами gamification */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    /* SoT календарных хелперов (Фаза B++): копия game.state.js — работает без game.module / window.* */
    function _getWeekId(date) {
        if (date == null) date = new Date();
        var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        var dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return d.getUTCFullYear() + '-W' + weekNo;
    }

    function _getStartOfWeek(date) {
        if (date == null) date = new Date();
        var d = new Date(date);
        var day = d.getDay() || 7;
        if (day !== 1) d.setHours(-24 * (day - 1));
        d.setHours(0, 0, 0, 0);
        return d;
    }

    window.RBI.services.game = {

        getWeeklyPlanSync: function () {
            return window.weeklyPlanData || { weekId: null, tasks: [], completed: false };
        },
        setWeeklyPlanSync: function (obj) {
            window.weeklyPlanData = obj;
            return window.weeklyPlanData;
        },
        getContractorStatusesSync: function () {
            return window.contractorStatuses || {};
        },
        ensureContractorStatusesSync: function () {
            if (!window.contractorStatuses || typeof window.contractorStatuses !== 'object') {
                window.contractorStatuses = {};
            }
            return window.contractorStatuses;
        },
        getGameActionLogsSync: function () {
            return window.gameActionLogs || [];
        },
        setGameActionLogsSync: function (arr) {
            window.gameActionLogs = Array.isArray(arr) ? arr : [];
            return window.gameActionLogs;
        },
        getEngineerAbsenceSync: function () {
            return window.engineerAbsence || { isActive: false, reason: '', startDate: null, endDate: null };
        },
        getCurrentProfileDataSync: function () {
            return window.currentProfileData || null;
        },

        logAction: function (actionType, targetId, inspectorOverride) {
            if (typeof window.gameLogAction !== 'function') {
                console.warn('[RBI Game Service] window.gameLogAction недоступен');
                return;
            }
            return window.gameLogAction(actionType, targetId, inspectorOverride);
        },
        calculateImpact: function (inspector, contractor, template) {
            if (typeof window.calculateImpactScore !== 'function') {
                console.warn('[RBI Game Service] window.calculateImpactScore недоступен');
                return 0;
            }
            return window.calculateImpactScore(inspector, contractor, template);
        },
        startInspection: function (contractor, templateKey, statusKey, project, originalAuditId) {
            if (typeof window.startInspectionWithValues !== 'function') {
                console.warn('[RBI Game Service] window.startInspectionWithValues недоступен');
                return;
            }
            return window.startInspectionWithValues(contractor, templateKey, statusKey, project, originalAuditId);
        },
        calculateAllProfiles: function () {
            if (typeof window.gameCalculateAllProfiles !== 'function') {
                console.warn('[RBI Game Service] window.gameCalculateAllProfiles недоступен');
                return {};
            }
            return window.gameCalculateAllProfiles();
        },
        calculateManagerMetrics: function () {
            if (typeof window.gameCalculateManagerMetrics !== 'function') {
                console.warn('[RBI Game Service] window.gameCalculateManagerMetrics недоступен');
                return [];
            }
            return window.gameCalculateManagerMetrics();
        },
        renderDashboard: function () {
            if (typeof window.gameRenderDashboard !== 'function') {
                console.warn('[RBI Game Service] window.gameRenderDashboard недоступен');
                return;
            }
            window.gameRenderDashboard();
        },
        updatePlanProgress: function () {
            if (typeof window.gameUpdatePlanProgress !== 'function') {
                console.warn('[RBI Game Service] window.gameUpdatePlanProgress недоступен');
                return;
            }
            window.gameUpdatePlanProgress();
        },
        toggleAbsence: function () {
            if (typeof window.gameToggleAbsence !== 'function') {
                console.warn('[RBI Game Service] window.gameToggleAbsence недоступен');
                return;
            }
            window.gameToggleAbsence();
        },
        saveWeeklyPlan: function () {
            if (typeof window.saveWeeklyPlan !== 'function') {
                console.warn('[RBI Game Service] window.saveWeeklyPlan недоступен');
                return;
            }
            window.saveWeeklyPlan();
        },
        getWeekId: function (date) {
            if (typeof window.getWeekId === 'function') {
                return window.getWeekId(date);
            }
            return _getWeekId(date);
        },
        getStartOfWeek: function (date) {
            if (typeof window.getStartOfWeek === 'function') {
                return window.getStartOfWeek(date);
            }
            return _getStartOfWeek(date);
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.game', window.RBI.services.game);
    }

    console.log('[RBI Service] game loaded');
}());
