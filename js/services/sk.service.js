/* Файл: js/services/sk.service.js */
/* SK Service v0.1 — legacy wrapper над SK-сторами IndexedDB */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    var SK_STORE_NAMES = {
        SK_RECORDS:       'sk_records',
        SK_VOLUMES:       'sk_volumes',
        SK_IMPORT_BATCHES:'sk_import_batches',
        SK_CONTRACTOR_MAP:'sk_contractor_map',
        SK_CATEGORY_MAP:  'sk_category_map',
        SK_MAPPING:       'sk_mapping',
        SK_ISD_HISTORY:   'sk_isd_history'
    };

    function getStore(name) {
        if (typeof STORES !== 'undefined' && STORES[name]) return STORES[name];
        return SK_STORE_NAMES[name] || name;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function markSyncDirty() {
        if (window.RBI.services.sync && typeof window.RBI.services.sync.markDirty === 'function') {
            window.RBI.services.sync.markDirty('sk');
        }
    }

    function requireStorage() {
        if (!window.RBI.services.storage) throw new Error('[RBI.sk] storage service недоступен');
    }

    window.RBI.services.sk = {

        /* ── SK_RECORDS ──────────────────────────────────────────────── */

        getSkRecords: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('SK_RECORDS'));
        },

        getSkRecord: async function (id) {
            requireStorage();
            return window.RBI.services.storage.get(getStore('SK_RECORDS'), id);
        },

        saveSkRecord: async function (record) {
            requireStorage();
            var now = nowIso();
            var toSave = Object.assign({}, record, {
                updatedAt: now,
                updated_at: now
            });
            await window.RBI.services.storage.put(getStore('SK_RECORDS'), toSave);
            markSyncDirty();
            return toSave;
        },

        deleteSkRecord: async function (id) {
            requireStorage();
            var item = await this.getSkRecord(id);
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
            await window.RBI.services.storage.put(getStore('SK_RECORDS'), deleted);
            markSyncDirty();
            return deleted;
        },

        /* ── SK_VOLUMES ──────────────────────────────────────────────── */

        getSkVolumes: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('SK_VOLUMES'));
        },

        /* ── SK_IMPORT_BATCHES ───────────────────────────────────────── */

        getImportBatches: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('SK_IMPORT_BATCHES'));
        },

        /* ── SK_CONTRACTOR_MAP ───────────────────────────────────────── */

        getContractorMap: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('SK_CONTRACTOR_MAP'));
        },

        /* ── SK_CATEGORY_MAP ─────────────────────────────────────────── */

        getCategoryMap: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('SK_CATEGORY_MAP'));
        },

        /* ── SK_MAPPING ──────────────────────────────────────────────── */

        getSkMapping: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('SK_MAPPING'));
        },

        /* ── SK_ISD_HISTORY ──────────────────────────────────────────── */

        getIsdHistory: async function () {
            requireStorage();
            return window.RBI.services.storage.getAll(getStore('SK_ISD_HISTORY'));
        },

        /* ── Синхронные геттеры живых in-memory структур ────────────── */

        getRecordsSync: function () {
            return Array.isArray(window.skRecords) ? window.skRecords : [];
        },
        getVolumesSync: function () {
            return window.skVolumes || {};
        },
        getContractorMapSync: function () {
            return window.skContractorMap || {};
        },
        ensureRecordsSync: function () {
            if (!Array.isArray(window.skRecords)) window.skRecords = [];
            return window.skRecords;
        },
        setRecordsSync: function (arr) {
            window.skRecords = Array.isArray(arr) ? arr : [];
            return window.skRecords;
        },
        setVolumesSync: function (obj) {
            window.skVolumes = obj || {};
            return window.skVolumes;
        },
        setContractorMapSync: function (obj) {
            window.skContractorMap = obj || {};
            return window.skContractorMap;
        },
        getTempRawHeadersSync: function () {
            return Array.isArray(window.skTempRawHeaders) ? window.skTempRawHeaders : [];
        },
        setTempRawHeadersSync: function (arr) {
            window.skTempRawHeaders = Array.isArray(arr) ? arr : [];
            return window.skTempRawHeaders;
        },
        getBadRemarksSync: function () {
            return Array.isArray(window.skBadRemarks) ? window.skBadRemarks : [];
        },
        setBadRemarksSync: function (arr) {
            window.skBadRemarks = Array.isArray(arr) ? arr : [];
            return window.skBadRemarks;
        },

        /* ── Права ───────────────────────────────────────────────────── */

        canManageSK: function () {
            if (window.RBI.services.permissions &&
                typeof window.RBI.services.permissions.canManageSK === 'function') {
                return window.RBI.services.permissions.canManageSK();
            }
            return false;
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.sk', window.RBI.services.sk);
    }

    console.log('[RBI Service] sk loaded');
}());
