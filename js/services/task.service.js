/* Файл: js/services/task.service.js */
/* Task Service v0.1 — legacy wrapper над STORES.TASKS, STORES.SCHEDULE, STORES.MEETINGS */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    function getStore(name) {
        if (typeof STORES !== 'undefined' && STORES[name]) return STORES[name];
        var fallback = { TASKS: 'rbi_tasks', SCHEDULE: 'rbi_schedule_stages', MEETINGS: 'rbi_meetings' };
        return fallback[name] || name;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function markSyncDirty() {
        if (window.RBI.services.sync && typeof window.RBI.services.sync.markDirty === 'function') {
            window.RBI.services.sync.markDirty('tasks');
        }
    }

    function requireStorage() {
        if (!window.RBI.services.storage) throw new Error('[RBI.tasks] storage service недоступен');
    }

    window.RBI.services.tasks = {

        getAllTasks: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('TASKS'));
        },

        getTask: async function (id) {
            requireStorage();
            return window.RBI.services.storage.get(getStore('TASKS'), id);
        },

        saveTask: async function (task) {
            requireStorage();
            var now = nowIso();
            var record = Object.assign({}, task, {
                updatedAt: now,
                updated_at: now
            });
            await window.RBI.services.storage.put(getStore('TASKS'), record);
            markSyncDirty();
            return record;
        },

        deleteTask: async function (id) {
            requireStorage();
            var item = await this.getTask(id);
            if (!item) return false;
            var now = nowIso();
            var deleted = Object.assign({}, item, {
                _deleted: true,
                is_deleted: true,
                deleted_at: now,
                updatedAt: now,
                updated_at: now,
                syncStatus: 'deleted_pending_sync',
                sync_status: 'deleted_pending_sync'
            });
            await window.RBI.services.storage.put(getStore('TASKS'), deleted);
            markSyncDirty();
            return deleted;
        },

        getAllSchedule: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('SCHEDULE'));
        },

        getAllMeetings: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('MEETINGS'));
        },

        /* ── Синхронные геттеры/сеттеры живых in-memory структур ──────── */

        getTasksSync: function () {
            return Array.isArray(window.rbi_tasksData) ? window.rbi_tasksData : [];
        },
        ensureTasksSync: function () {
            if (!Array.isArray(window.rbi_tasksData)) window.rbi_tasksData = [];
            return window.rbi_tasksData;
        },
        setTasksSync: function (arr) {
            window.rbi_tasksData = Array.isArray(arr) ? arr : [];
            return window.rbi_tasksData;
        },
        getScheduleSync: function () {
            return Array.isArray(window.rbi_scheduleData) ? window.rbi_scheduleData : [];
        },
        ensureScheduleSync: function () {
            if (!Array.isArray(window.rbi_scheduleData)) window.rbi_scheduleData = [];
            return window.rbi_scheduleData;
        },
        setScheduleSync: function (arr) {
            window.rbi_scheduleData = Array.isArray(arr) ? arr : [];
            return window.rbi_scheduleData;
        },
        getFmeaSync: function () {
            return Array.isArray(window.rbi_fmeaRecords) ? window.rbi_fmeaRecords : [];
        },
        ensureFmeaSync: function () {
            if (!Array.isArray(window.rbi_fmeaRecords)) window.rbi_fmeaRecords = [];
            return window.rbi_fmeaRecords;
        },
        setFmeaSync: function (arr) {
            window.rbi_fmeaRecords = Array.isArray(arr) ? arr : [];
            return window.rbi_fmeaRecords;
        },
        getPracticesSync: function () {
            return Array.isArray(window.rbi_practicesData) ? window.rbi_practicesData : [];
        },
        ensurePracticesSync: function () {
            if (!Array.isArray(window.rbi_practicesData)) window.rbi_practicesData = [];
            return window.rbi_practicesData;
        },
        setPracticesSync: function (arr) {
            window.rbi_practicesData = Array.isArray(arr) ? arr : [];
            return window.rbi_practicesData;
        },
        getInterventionsSync: function () {
            return Array.isArray(window.rbi_interventionsData) ? window.rbi_interventionsData : [];
        },
        ensureInterventionsSync: function () {
            if (!Array.isArray(window.rbi_interventionsData)) window.rbi_interventionsData = [];
            return window.rbi_interventionsData;
        },
        setInterventionsSync: function (arr) {
            window.rbi_interventionsData = Array.isArray(arr) ? arr : [];
            return window.rbi_interventionsData;
        },
        getMeetingsSync: function () {
            return Array.isArray(window.rbi_meetingsData) ? window.rbi_meetingsData : [];
        },
        ensureMeetingsSync: function () {
            if (!Array.isArray(window.rbi_meetingsData)) window.rbi_meetingsData = [];
            return window.rbi_meetingsData;
        },
        setMeetingsSync: function (arr) {
            window.rbi_meetingsData = Array.isArray(arr) ? arr : [];
            return window.rbi_meetingsData;
        },

        generateWeeklyPlan: function (force) {
            if (typeof window.gameGenerateWeeklyPlan !== 'function') {
                console.warn('[RBI.tasks] window.gameGenerateWeeklyPlan недоступен');
                return;
            }
            return window.gameGenerateWeeklyPlan(force);
        },
        forceUpdatePlan: function (silent) {
            if (typeof window.gameForceUpdatePlan !== 'function') {
                console.warn('[RBI.tasks] window.gameForceUpdatePlan недоступен');
                return;
            }
            return window.gameForceUpdatePlan(silent);
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.tasks', window.RBI.services.tasks);
    }

    console.log('[RBI Service] tasks loaded');
}());
