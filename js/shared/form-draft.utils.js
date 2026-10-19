/* js/shared/form-draft.utils.js — локальные черновики форм (localStorage) */
/* IIFE-паттерн. Не синхронизируется между устройствами. */

(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    var PREFIX = 'rbi_form_draft:';
    var DEFAULT_DELAY = 1000;
    var _timers = Object.create(null);
    var _bindings = Object.create(null);
    /** key → collectFn для отложенных scheduleSave (нужен flush при route-teardown). */
    var _pending = Object.create(null);

    function _storageKey(key) {
        return PREFIX + String(key || '');
    }

    function _nowIso() {
        return new Date().toISOString();
    }

    function _formatWhen(iso) {
        try {
            return new Date(iso).toLocaleString('ru-RU', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return iso || '';
        }
    }

    /** Есть ли в payload хоть что-то осмысленное (не пустая болванка). */
    function _hasContent(payload) {
        if (payload == null) return false;
        if (typeof payload === 'string') return payload.trim().length > 0;
        if (Array.isArray(payload)) return payload.length > 0;
        if (typeof payload !== 'object') return !!payload;
        var keys = Object.keys(payload);
        for (var i = 0; i < keys.length; i++) {
            if (_hasContent(payload[keys[i]])) return true;
        }
        return false;
    }

    var FormDraft = {
        KEYS: {
            PRACTICE_MANUAL: 'practice_manual',
            PRACTICE_INT: 'practice_int',
            TWI_NEW: 'twi_new',
            ETALON_NEW: 'etalon_new',
            ETALON_V18: 'etalon_v18',
            ETALON_V18B: 'etalon_v18b',
            FMEA_NEW: 'fmea_new',
            MEETING_WS: 'meeting_workspace',
            DOC_NEW: 'doc_new',
            NODE_NEW: 'node_new'
        },

        practiceIntKey: function (intId) {
            return FormDraft.KEYS.PRACTICE_INT + ':' + String(intId || '');
        },

        get: function (key) {
            try {
                var raw = localStorage.getItem(_storageKey(key));
                if (!raw) return null;
                var parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object' || !parsed.payload) return null;
                return parsed;
            } catch (e) {
                return null;
            }
        },

        has: function (key) {
            var d = FormDraft.get(key);
            return !!(d && _hasContent(d.payload));
        },

        set: function (key, payload) {
            if (!key) return false;
            if (!_hasContent(payload)) {
                FormDraft.clear(key);
                return false;
            }
            try {
                localStorage.setItem(_storageKey(key), JSON.stringify({
                    savedAt: _nowIso(),
                    payload: payload
                }));
                return true;
            } catch (e) {
                console.warn('[RBIFormDraft] Не удалось сохранить черновик (квота?):', key, e);
                return false;
            }
        },

        clear: function (key) {
            try {
                localStorage.removeItem(_storageKey(key));
            } catch (e) { /* ignore */ }
            if (_timers[key]) {
                clearTimeout(_timers[key]);
                delete _timers[key];
            }
        },

        /**
         * Диалог при открытии формы.
         * @returns {'continue'|'fresh'|'none'}
         */
        askRestore: function (key, formTitle) {
            var d = FormDraft.get(key);
            if (!d || !_hasContent(d.payload)) return 'none';
            var title = formTitle || 'формы';
            var when = _formatWhen(d.savedAt);
            var ok = window.confirm(
                'Найден локальный черновик «' + title + '»\nот ' + when + '.\n\n' +
                'OK — продолжить заполнение\n' +
                'Отмена — начать сначала'
            );
            if (ok) return 'continue';
            FormDraft.clear(key);
            return 'fresh';
        },

        scheduleSave: function (key, collectFn, delayMs) {
            if (!key || typeof collectFn !== 'function') return;
            if (_timers[key]) clearTimeout(_timers[key]);
            _pending[key] = collectFn;
            var delay = typeof delayMs === 'number' ? delayMs : DEFAULT_DELAY;
            _timers[key] = setTimeout(function () {
                delete _timers[key];
                var fn = _pending[key];
                delete _pending[key];
                try {
                    if (fn) FormDraft.set(key, fn());
                } catch (e) {
                    console.warn('[RBIFormDraft] collect/save failed:', key, e);
                }
            }, delay);
        },

        /** Сразу сохранить (фото и т.п.). */
        saveNow: function (key, collectFn) {
            if (!key || typeof collectFn !== 'function') return;
            if (_timers[key]) {
                clearTimeout(_timers[key]);
                delete _timers[key];
            }
            delete _pending[key];
            try {
                FormDraft.set(key, collectFn());
            } catch (e) {
                console.warn('[RBIFormDraft] saveNow failed:', key, e);
            }
        },

        /**
         * Автосохранение по input/change внутри rootEl.
         * Повторный bind с тем же key снимает предыдущий слушатель.
         */
        bindAutoSave: function (rootEl, key, collectFn, delayMs) {
            FormDraft.unbindAutoSave(key);
            if (!rootEl || !key || typeof collectFn !== 'function') return;
            var handler = function () {
                FormDraft.scheduleSave(key, collectFn, delayMs);
            };
            rootEl.addEventListener('input', handler, true);
            rootEl.addEventListener('change', handler, true);
            _bindings[key] = { root: rootEl, handler: handler, collectFn: collectFn };
        },

        unbindAutoSave: function (key) {
            var b = _bindings[key];
            if (!b) return;
            try {
                b.root.removeEventListener('input', b.handler, true);
                b.root.removeEventListener('change', b.handler, true);
            } catch (e) { /* ignore */ }
            delete _bindings[key];
            if (_timers[key]) {
                clearTimeout(_timers[key]);
                delete _timers[key];
            }
            delete _pending[key];
        },

        /** Сбросить все отложенные scheduleSave в localStorage (до очистки DOM). */
        flushPending: function () {
            Object.keys(_timers).forEach(function (key) {
                clearTimeout(_timers[key]);
                delete _timers[key];
                var fn = _pending[key];
                delete _pending[key];
                if (typeof fn !== 'function') return;
                try { FormDraft.set(key, fn()); } catch (e) {
                    console.warn('[RBIFormDraft] flushPending failed:', key, e);
                }
            });
        },

        /**
         * Сохранить и отвязать autosave только для черновиков внутри rootEl
         * (уход с вкладки не должен unbind'ить формы на других вкладках).
         */
        flushBindingsIn: function (rootEl) {
            if (!rootEl) return;
            Object.keys(_bindings).forEach(function (key) {
                var b = _bindings[key];
                if (!b || !b.root) return;
                try {
                    if (!rootEl.contains(b.root)) return;
                } catch (e) { return; }
                if (typeof b.collectFn === 'function') {
                    try { FormDraft.set(key, b.collectFn()); } catch (err) {
                        console.warn('[RBIFormDraft] flushBindingsIn failed:', key, err);
                    }
                }
                FormDraft.unbindAutoSave(key);
            });
        }
    };

    window.RBIFormDraft = FormDraft;
    window.RBI = window.RBI || {};
    window.RBI.utils = window.RBI.utils || {};
    window.RBI.utils.formDraft = FormDraft;

    if (window.RBI.registry) {
        window.RBI.registry.register('utils.formDraft', FormDraft);
    }

    console.log('[RBI Utils] form-draft loaded');
}());
