/**
 * rbi-core.js
 * Базовый namespace RBI Quality Pro.
 * Создаёт window.RBI один раз — все сервисы регистрируются в нём.
 * Не содержит бизнес-логики. Не зависит от других файлов приложения.
 */

(function () {
    'use strict';

    window.RBI = window.RBI || {};

    if (!window.RBI.events) {
        /**
         * EventBus — простой pub/sub для межмодульного общения.
         * Использование:
         *   RBI.events.on('inspectionSaved', handler)
         *   RBI.events.emit('inspectionSaved', data)
         *   RBI.events.off('inspectionSaved', handler)
         */
        window.RBI.events = (function () {
            var _listeners = {};

            return {
                on: function (event, handler) {
                    if (!_listeners[event]) {
                        _listeners[event] = [];
                    }
                    _listeners[event].push(handler);
                },
                off: function (event, handler) {
                    if (!_listeners[event]) return;
                    _listeners[event] = _listeners[event].filter(function (h) {
                        return h !== handler;
                    });
                },
                emit: function (event, data) {
                    if (!_listeners[event]) return;
                    _listeners[event].forEach(function (h) {
                        try {
                            h(data);
                        } catch (e) {
                            console.error('[RBI.events] Ошибка в обработчике события "' + event + '":', e);
                        }
                    });
                }
            };
        }());
    }

    if (!window.RBI.registry) {
        /**
         * registry — хранилище зарегистрированных сервисов и модулей.
         * Использование:
         *   RBI.registry.register('storage', myStorageService)
         *   RBI.registry.get('storage')
         */
        window.RBI.registry = (function () {
            var _store = {};

            return {
                register: function (name, service) {
                    if (_store[name] && !_store[name]._isLegacyStub) {
                        console.warn('[RBI.registry] Сервис "' + name + '" уже зарегистрирован. Перезаписывается.');
                    }
                    _store[name] = service;
                },
                get: function (name) {
                    if (!_store[name]) {
                        console.warn('[RBI.registry] Сервис "' + name + '" не найден.');
                        return null;
                    }
                    return _store[name];
                },
                has: function (name) {
                    return !!_store[name];
                }
            };
        }());
    }

    if (!window.RBI.context) {
        /**
         * context — глобальный контекст сессии (текущий пользователь, роль, объект).
         * Значения устанавливаются при инициализации приложения.
         */
        window.RBI.context = {
            user: null,
            role: null,
            objectId: null,
            contractorId: null
        };
    }

    /**
     * services — пространство для будущих сервисов.
     * Заполняется в пакетах 03–08.
     */
    window.RBI.services = window.RBI.services || {};

    /**
     * utils — пространство для shared-утилит.
     * Заполняется при загрузке js/shared/*.utils.js.
     */
    window.RBI.utils = window.RBI.utils || {};

    if (!window.RBI.createContext) {
        /**
         * createContext() — фабрика контекстов для модулей.
         * Вызывается в момент инициализации модуля, когда все сервисы уже загружены.
         */
        window.RBI.createContext = function (overrides) {
            var base = {
                storage:     (window.RBI.services && window.RBI.services.storage)     || null,
                sync:        (window.RBI.services && window.RBI.services.sync)        || null,
                permissions: (window.RBI.services && window.RBI.services.permissions) || null,
                settings:    (window.RBI.services && window.RBI.services.settings)    || null,
                inspections: (window.RBI.services && window.RBI.services.inspections) || null,
                reports:     (window.RBI.services && window.RBI.services.reports)     || null,
                files:       (window.RBI.services && window.RBI.services.files)       || null,
                tasks:       (window.RBI.services && window.RBI.services.tasks)       || null,
                sk:          (window.RBI.services && window.RBI.services.sk)          || null,
                knowledge:   (window.RBI.services && window.RBI.services.knowledge)   || null,
                analytics:   (window.RBI.services && window.RBI.services.analytics)   || null,
                ai:          (window.RBI.services && window.RBI.services.ai)          || null,
                masterData:  (window.RBI.services && window.RBI.services.masterData)  || null,
                objects:     (window.RBI.services && window.RBI.services.objects)     || null,
                contractors: (window.RBI.services && window.RBI.services.contractors) || null,
                session:     (window.RBI.services && window.RBI.services.session)     || null,
                appMode:     (window.RBI.services && window.RBI.services.appMode)     || null,
                shell:       (window.RBI.services && window.RBI.services.shell)       || null,
                userContext: (window.RBI.services && window.RBI.services.userContext) || null,
                company:     (window.RBI.services && window.RBI.services.company)     || null,
                utils: {
                    math:      (window.RBI.utils && window.RBI.utils.math)      || null,
                    toast:     (window.RBI.utils && window.RBI.utils.toast)     || null,
                    templates: (window.RBI.utils && window.RBI.utils.templates) || null
                },
                events: window.RBI.events
            };
            if (overrides && typeof overrides === 'object') {
                Object.assign(base, overrides);
            }
            return base;
        };
    }

    console.log('[RBI] Core namespace инициализирован. Версия: 1.0.0');
}());
