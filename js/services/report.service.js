/* Файл: js/services/report.service.js */
/* Report Service v0.1 — legacy wrapper над STORES.REPORTS */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    /* Владение reportsArray (Реальная изоляция модулей, часть 3, Группа C,
       критичный шаг): перенесено 1:1 из js/core/bootstrap.js — сервис теперь
       единственный владелец объявления, window.reportsArray остаётся
       синхронизированной живой ссылкой для всех существующих потребителей. */
    window.reportsArray = window.reportsArray || [];

    function getReportsStore() {
        if (typeof STORES !== 'undefined' && STORES.REPORTS) return STORES.REPORTS;
        return 'app_reports';
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function markSyncDirty() {
        if (window.RBI.services.sync && typeof window.RBI.services.sync.markDirty === 'function') {
            window.RBI.services.sync.markDirty('general');
        }
    }

    window.RBI.services.reports = {

        getAll: async function () {
            if (!window.RBI.services.storage) throw new Error('[RBI.reports] storage service недоступен');
            var arr = await window.RBI.services.storage.getAll(getReportsStore());
            return Array.isArray(arr) ? arr : [];
        },

        getActive: async function () {
            var arr = await this.getAll();
            return arr.filter(function (i) {
                return i && i._deleted !== true && i.is_deleted !== true;
            });
        },

        save: async function (report) {
            if (!window.RBI.services.storage) throw new Error('[RBI.reports] storage service недоступен');
            var now = nowIso();
            var item = Object.assign({}, report, {
                updatedAt: now,
                updated_at: now,
                source: 'local'
            });
            await window.RBI.services.storage.put(getReportsStore(), item);
            markSyncDirty();
            return item;
        },

        softDelete: async function (id) {
            if (!window.RBI.services.storage) throw new Error('[RBI.reports] storage service недоступен');
            var arr = await this.getAll();
            var item = arr.find(function (i) { return i.id === id; }) || null;
            if (!item) return false;
            var now = nowIso();
            var deleted = Object.assign({}, item, {
                _deleted: true,
                is_deleted: true,
                deleted_at: now,
                updatedAt: now,
                updated_at: now
            });
            await window.RBI.services.storage.put(getReportsStore(), deleted);
            markSyncDirty();
            return deleted;
        },

        printTwi: function (mode) {
            if (typeof window.printCurrentTwi !== 'function') {
                console.warn('[RBI Reports Service] window.printCurrentTwi недоступен');
                return;
            }
            return window.printCurrentTwi(mode);
        },

        getAllSync: function () {
            return Array.isArray(window.reportsArray) ? window.reportsArray : [];
        },

        /**
         * Облачные отчёты: file_blob остаётся только в IDB, из RAM снимаем.
         * Локальные ещё не залитые в облако (нет http file_url) — blob в памяти
         * оставляем, иначе push не найдёт файл.
         */
        detachCloudBlobsInMemory: function (list) {
            var arr = Array.isArray(list) ? list : this.getAllSync();
            for (var i = 0; i < arr.length; i++) {
                var r = arr[i];
                if (!r) continue;
                var url = r.file_url || r.fileUrl || '';
                if (r.file_blob && typeof url === 'string' && url.indexOf('http') === 0) {
                    r.file_blob = null;
                }
            }
            return arr;
        },

        /** Достать PDF/PPTX blob из IDB по id (без записи в reportsArray). */
        getLocalBlob: async function (id) {
            if (!id || !window.RBI.services.storage) return null;
            try {
                var row = await window.RBI.services.storage.get(getReportsStore(), id);
                if (!row) return null;
                var toBlob = window.rbiReportPayloadToBlob;
                if (typeof toBlob === 'function') {
                    return toBlob(row.file_blob, row.mime_type || row.mimeType || 'application/pdf');
                }
                return (row.file_blob instanceof Blob && row.file_blob.size > 0) ? row.file_blob : null;
            } catch (e) {
                console.warn('[RBI.reports] getLocalBlob:', e);
                return null;
            }
        },

        /** Есть ли локальный payload в RAM или IDB (Blob или ArrayBuffer). */
        hasLocalBlob: async function (reportOrId) {
            var r = reportOrId;
            if (typeof reportOrId === 'string') {
                r = this.getAllSync().find(function (x) { return x && x.id === reportOrId; }) || { id: reportOrId };
            }
            if (!r) return false;
            var hasPayload = window.rbiHasReportPayload;
            if (typeof hasPayload === 'function') {
                if (hasPayload(r.file_blob)) return true;
            } else if (r.file_blob) {
                return true;
            }
            var blob = await this.getLocalBlob(r.id);
            return !!blob;
        },

        upsertSync: function (record) {
            var arr = this.getAllSync();
            var idx = arr.findIndex(function (r) { return r.id === record.id; });
            if (idx > -1) arr[idx] = record;
            else arr.unshift(record);
            return record;
        },

        getExpertConclusions: function () {
            return window.customExpertConclusions || {};
        },

        getExpertConclusion: function (key) {
            return (window.customExpertConclusions || {})[key];
        },

        setExpertConclusion: function (key, val) {
            if (window.customExpertConclusions) window.customExpertConclusions[key] = val;
        },

        deleteExpertConclusion: function (key) {
            if (window.customExpertConclusions) delete window.customExpertConclusions[key];
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.reports', window.RBI.services.reports);
    }

    console.log('[RBI Service] reports loaded');
}());
