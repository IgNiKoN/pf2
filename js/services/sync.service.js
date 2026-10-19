/* Файл: js/services/sync.service.js */
/* Sync Service v0.1 — legacy wrapper над sync.js */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    window.RBI.services.sync = {

        getConfig: function () {
            return window.syncConfig || { enabled: false };
        },

        isEnabled: function () {
            return !!(window.syncConfig && window.syncConfig.enabled);
        },

        isSyncing: function () {
            return !!window.isSyncing;
        },

        init: async function () {
            if (typeof window.initSync === 'function') return window.initSync();
            return false;
        },

        trigger: async function (mode) {
            var m = mode || 'silent';
            if (typeof window.triggerSync === 'function') return window.triggerSync(m);
            return false;
        },

        enqueue: function (type, payload) {
            if (window.SyncQueueManager && typeof window.SyncQueueManager.enqueue === 'function') {
                return window.SyncQueueManager.enqueue(type, payload);
            }
            return false;
        },

        markDirty: function (flag) {
            var f = flag || 'general';
            localStorage.setItem('rbi_cloud_dirty', '1');
            if (window.syncDirtyFlags && f in window.syncDirtyFlags) {
                window.syncDirtyFlags[f] = true;
            }
            return true;
        },

        // Канонические статусы синхронизации.
        // В новом коде писать ctx.sync.STATUS.PENDING, не строкой 'pending'.
        STATUS: Object.freeze({
            LOCAL:    'local',
            PENDING:  'pending',
            SYNCED:   'synced',
            CONFLICT: 'conflict',
            ERROR:    'error'
        }),

        // Выставляет оба поля (camelCase + snake_case) в 'synced'
        markSynced: function (record) {
            record.syncStatus  = 'synced';
            record.sync_status = 'synced';
            return record;
        },

        // Выставляет оба поля в 'pending'
        markPending: function (record) {
            record.syncStatus  = 'pending';
            record.sync_status = 'pending';
            return record;
        },

        // Возвращает канонический статус записи (читает оба поля)
        getStatus: function (record) {
            return record.syncStatus || record.sync_status || 'local';
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.sync', window.RBI.services.sync);
    }

    console.log('[RBI Service] sync loaded');
}());
