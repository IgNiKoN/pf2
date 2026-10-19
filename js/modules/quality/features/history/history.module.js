/**
 * history.module.js
 * Модуль истории проверок — контракт платформы (id / routes / dependencies / init / mount / unmount).
 *
 * Оркестратор: загружает данные через HistoryActions,
 * подписывается на sync:completed и inspection:created → перезагружает список,
 * эмитит history:initialized.
 *
 * Зависимости: window.RBI.services.inspections, window.RBI.services.storage
 */

import { HistoryActions } from './history.actions.js';
import { HistoryRender }  from './history.render.js';

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-history-action).
function bindHistoryActionDelegation() {
    if (window.__historyActionDelegationBound) return;
    window.__historyActionDelegationBound = true;

    const readArg = (el, valType, evt) => {
        switch (valType) {
            case 'element': return el;
            case 'event': return evt;
            case 'checked': return el.checked;
            case 'int': return parseInt(el.value, 10);
            case 'value': return el.value;
            default: return undefined;
        }
    };

    const dispatch = (el, evt) => {
        const action = el.dataset.historyAction;
        const fn = window[action];
        if (typeof fn !== 'function') return;
        const valType = el.dataset.historyActionValType;
        const arg = valType ? readArg(el, valType, evt) : el.dataset.actionArg;
        if (arg === undefined) {
            fn();
        } else {
            fn(arg);
        }
    };

    const resolveActionElement = (target, wantsChange) => {
        let el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.historyAction) {
                if (!!(el.dataset.actionEvent === 'change') === wantsChange) return el;
            }
            const inlineOnclick = el.getAttribute && el.getAttribute('onclick');
            if (!wantsChange && inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
            el = el.parentElement;
        }
        return null;
    };

    document.addEventListener('click', (e) => {
        const el = resolveActionElement(e.target, false);
        if (el) dispatch(el, e);
    }, true);

    document.addEventListener('change', (e) => {
        const el = resolveActionElement(e.target, true);
        if (el) dispatch(el, e);
    }, true);
}

export const HistoryModule = {
    id: 'history',
    routes: ['/history', '/history/:id'],
    dependencies: ['storage', 'inspections'],

    _unsubscribeSync: null,
    _unsubscribeCreated: null,
    _unsubscribeRenderRequested: null,

    async init(ctx) {
        HistoryActions.bindCtx(ctx);
        HistoryRender.bindCtx(ctx);

        bindHistoryActionDelegation();

        const events = ctx && ctx.events;

        // 1. Загрузить данные
        await HistoryActions.loadRecords();

        // 2. sync:completed — no full-render on active History (единый хелпер §5).
        if (events && typeof events.on === 'function') {
            const onSync = async () => {
                if (window.RBI?.utils?.syncUi?.markDirty) window.RBI.utils.syncUi.markDirty('history');
                else if (window.syncDirtyFlags) window.syncDirtyFlags.history = true;
                // Аналитика активна (в т.ч. не-История) — только dirty, без лишнего load во время defer.
                if (typeof window.shouldDeferFullRender === 'function'
                    && window.shouldDeferFullRender(['history', 'analytics'])) {
                    return;
                }
                await HistoryActions.loadRecords();
            };
            events.on('sync:completed', onSync);
            HistoryModule._unsubscribeSync = () => events.off && events.off('sync:completed', onSync);
        }

        // 3. Подписаться на inspection:created → перезагрузить
        if (events && typeof events.on === 'function') {
            const onCreated = async () => {
                await HistoryActions.loadRecords();
                HistoryRender.render();
            };
            events.on('inspection:created', onCreated);
            HistoryModule._unsubscribeCreated = () => events.off && events.off('inspection:created', onCreated);
        }

        // 3.1 Подписаться на history:renderRequested → перерисовать (без перезагрузки данных)
        if (events && typeof events.on === 'function') {
            const onRenderRequested = () => HistoryRender.render();
            events.on('history:renderRequested', onRenderRequested);
            HistoryModule._unsubscribeRenderRequested = () => events.off && events.off('history:renderRequested', onRenderRequested);
        }

        // 4. Эмитить history:initialized
        if (events && typeof events.emit === 'function') {
            events.emit('history:initialized', {});
        }

        console.log('[HistoryModule] init complete');
    },

    mount(container, ctx) {
        const tab = (ctx && ctx.tab) || null;
        HistoryRender.render(tab);
    },

    unmount() {
        if (typeof HistoryModule._unsubscribeSync === 'function') {
            HistoryModule._unsubscribeSync();
            HistoryModule._unsubscribeSync = null;
        }
        if (typeof HistoryModule._unsubscribeCreated === 'function') {
            HistoryModule._unsubscribeCreated();
            HistoryModule._unsubscribeCreated = null;
        }
        if (typeof HistoryModule._unsubscribeRenderRequested === 'function') {
            HistoryModule._unsubscribeRenderRequested();
            HistoryModule._unsubscribeRenderRequested = null;
        }
    }
};

if (typeof window !== 'undefined' && window.RBI && window.RBI.registry) {
    window.RBI.registry.register('module.history', HistoryModule);
}

console.log('[HistoryModule] history.module.js loaded (ES module)');
