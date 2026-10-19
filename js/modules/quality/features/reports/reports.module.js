/**
 * reports.module.js — Фаза 16: контракт платформы для модуля Reports.
 *
 * Стратегия фасада: export.js (~4 056 строк) остаётся как legacy-монолит.
 * ES-модуль только:
 *   1. Регистрирует себя в window.RBI.registry как 'module.reports'
 *   2. Синхронизирует состояние отчётов в ReportsState
 *   3. Делегирует действия в window.*-функции из export.js
 *
 * Порядок загрузки гарантирован: export.js загружается как обычный <script>
 * до этого ES-модуля — все window.*-функции из export.js уже доступны.
 */

import { ReportsState }  from './reports.state.js';
import { ReportsActions } from './reports.actions.js';
import { ReportsRender }  from './reports.render.js';
import './report-preview.js';
import './reports.pptx-export.js'; // side-effect: публикует exportReportPptx
import './reports.pptx-viewer.js'; // side-effect: публикует openPptxViewer

// Fallback legacy-заглушка — перезаписывается после загрузки ES-модуля.
// Если window.RBI.registry недоступен на момент выполнения — пропускается.
(function () {
    if (!window.RBI || !window.RBI.registry) return;
    if (window.RBI.registry.has('module.reports')) return;
    var stub = {
        id:           'reports',
        _isLegacyStub: true,
        routes:       ['/reports'],
        dependencies: [],
        init:         function () {},
        mount:        function () {},
        unmount:      function () {}
    };
    window.RBI.registry.register('module.reports', stub);
}());

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-reports-action).
// handleDataExport(a, b) принимает 2 фиксированных строковых аргумента —
// второй передаётся через data-reports-action-arg2 (не -val-type, т.к. значение
// известно статически, не читается из DOM в момент события).
function bindReportsActionDelegation() {
    if (window.__reportsActionDelegationBound) return;
    window.__reportsActionDelegationBound = true;

    var readArg = function (el, valType, evt) {
        switch (valType) {
            case 'element': return el;
            case 'event': return evt;
            case 'checked': return el.checked;
            case 'int': return parseInt(el.value, 10);
            case 'value': return el.value;
            default: return undefined;
        }
    };

    var dispatch = function (el, evt) {
        var action = el.dataset.reportsAction;
        var fn = window[action];
        if (typeof fn !== 'function') return;
        var valType = el.dataset.reportsActionValType;
        var arg = valType ? readArg(el, valType, evt) : el.dataset.actionArg;
        var arg2 = el.dataset.reportsActionArg2;
        if (arg2 !== undefined) {
            fn(arg, arg2);
        } else if (arg === undefined) {
            fn();
        } else {
            fn(arg);
        }
    };

    var resolveActionElement = function (target, wantsChange) {
        var el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.reportsAction) {
                if (!!(el.dataset.actionEvent === 'change') === wantsChange) return el;
            }
            var inlineOnclick = el.getAttribute && el.getAttribute('onclick');
            if (!wantsChange && inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
            el = el.parentElement;
        }
        return null;
    };

    document.addEventListener('click', function (e) {
        var el = resolveActionElement(e.target, false);
        if (el) dispatch(el, e);
    }, true);

    document.addEventListener('change', function (e) {
        var el = resolveActionElement(e.target, true);
        if (el) dispatch(el, e);
    }, true);
}

export const ReportsModule = {
    id:           'reports',
    routes:       ['/reports', '/reports/:type'],
    dependencies: ['storage', 'inspections', 'reports', 'files'],

    _syncUnsubscribe:      null,
    _inspectionUnsubscribe: null,

    /**
     * Инициализация: синхронизирует ReportsState из window.reportsArray,
     * подписывается на sync:completed и inspection:created.
     * Вызывается один раз при старте платформы.
     */
    async init(ctx) {
        ctx.math      = window.RBI && window.RBI.utils && window.RBI.utils.math;
        ctx.toast     = window.RBI && window.RBI.utils && window.RBI.utils.toast;
        ctx.templates = window.RBI && window.RBI.utils && window.RBI.utils.templates;
        ReportsActions.bindCtx(ctx);

        bindReportsActionDelegation();

        // Первичная синхронизация состояния
        ReportsState.syncFromLegacy();

        const events = (ctx && ctx.events) || (window.RBI && window.RBI.events);

        if (events && typeof events.on === 'function') {
            // Перезагружать состояние после синхронизации с сервером
            const syncHandler = function () {
                ReportsActions.syncFromLegacy();
            };
            events.on('sync:completed', syncHandler);
            ReportsModule._syncUnsubscribe = function () {
                if (events.off) events.off('sync:completed', syncHandler);
            };

            // Обновлять данные после создания новой проверки
            const inspectionHandler = function () {
                ReportsActions.syncFromLegacy();
            };
            events.on('inspection:created', inspectionHandler);
            ReportsModule._inspectionUnsubscribe = function () {
                if (events.off) events.off('inspection:created', inspectionHandler);
            };
        }

        if (events && typeof events.emit === 'function') {
            events.emit('reports:initialized', {
                reports: ReportsState.getReports()
            });
        }

        console.log('[ReportsModule] init complete');
    },

    /**
     * Монтирование UI — открывает модальное окно или отображает список шаблонов.
     */
    mount(container, ctx) {
        var type = ctx && ctx.type;
        var mode = ctx && ctx.mode;
        if (type) {
            ReportsRender.openModal(type, mode);
        } else {
            ReportsRender.renderTemplatesList();
        }
    },

    /**
     * Очистка при уходе с вкладки.
     */
    unmount() {
        if (typeof ReportsModule._syncUnsubscribe === 'function') {
            ReportsModule._syncUnsubscribe();
            ReportsModule._syncUnsubscribe = null;
        }
        if (typeof ReportsModule._inspectionUnsubscribe === 'function') {
            ReportsModule._inspectionUnsubscribe();
            ReportsModule._inspectionUnsubscribe = null;
        }
    }
};

// Регистрация в реестре платформы — перезаписывает fallback-заглушку
if (typeof window !== 'undefined' && window.RBI && window.RBI.registry) {
    window.RBI.registry.register('module.reports', ReportsModule);
}

console.log('[ReportsModule] reports.module.js loaded (ES module)');
