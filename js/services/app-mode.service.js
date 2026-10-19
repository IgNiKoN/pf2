(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    window.RBI.services.appMode = {

        getMode: function () {
            if (window.AppModeManager && window.AppModeManager.currentMode) {
                return window.AppModeManager.currentMode;
            }
            return 'quality';
        },

        setMode: function (mode) {
            if (window.AppModeManager && typeof window.AppModeManager.changeMode === 'function') {
                window.AppModeManager.changeMode(mode);
            }
            if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
                window.RBI.events.emit('appMode:changed', { mode: mode });
            }
        },

        isDemo: function () {
            if (typeof window.isDemoMode !== 'undefined') return window.isDemoMode;
            if (window.AppModeManager && typeof window.AppModeManager.isDemoMode !== 'undefined') {
                return window.AppModeManager.isDemoMode;
            }
            return false;
        },

        isOffline: function () {
            return !navigator.onLine;
        }
    };

    // Фаза 62: обёртка window.changeAppMode для синхронизации EventBus
    // при вызовах из HTML (onclick="changeAppMode(mode)")
    if (typeof window.changeAppMode === 'function') {
        window._rbi_originalChangeAppMode = window.changeAppMode;
    }
    window.changeAppMode = function (mode) {
        if (typeof window._rbi_originalChangeAppMode === 'function') {
            window._rbi_originalChangeAppMode(mode);
        } else if (window.AppModeManager && typeof window.AppModeManager.changeMode === 'function') {
            window.AppModeManager.changeMode(mode);
        }
        if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
            window.RBI.events.emit('appMode:changed', { mode: mode });
        }
    };

    console.log('[AppModeService] app-mode.service.js loaded');
}());
