/**
 * analytics.module.js
 * Модуль аналитики — контракт платформы (id / routes / dependencies / init / mount / unmount).
 *
 * Оркестратор: синхронизирует начальное состояние из window.*,
 * подписывается на sync:completed → перезагружает данные,
 * эмитит analytics:initialized.
 *
 * Зависимости: window.RBI.services.analytics, window.RBI.services.storage
 */

import { AnalyticsState }   from './analytics.state.js';
import { AnalyticsActions } from './analytics.actions.js';
import { AnalyticsRender }  from './analytics.render.js';
import './analytics.pptx-export.js'; // side-effect: публикует exportOnePagerPptx

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-analytics-action,
// не data-action, используемый ai.module.js). Поддерживает N вызовов на одном узле
// через запятую в самом data-analytics-action (`"toggleDateRange,renderCurrentAnalyticsTab"`),
// второй аргумент через data-analytics-action-arg2-type (element/event/...).
function bindAnalyticsActionDelegation() {
    if (window.__analyticsActionDelegationBound) return;
    window.__analyticsActionDelegationBound = true;

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
        const actions = el.dataset.analyticsAction.split(',');
        const valType = el.dataset.analyticsActionValType;
        const arg = valType ? readArg(el, valType, evt) : el.dataset.actionArg;
        const arg2Type = el.dataset.analyticsActionArg2Type;
        actions.forEach((action) => {
            const fn = window[action];
            if (typeof fn !== 'function') return;
            if (arg2Type) {
                fn(arg, readArg(el, arg2Type, evt));
            } else if (arg === undefined) {
                fn();
            } else {
                fn(arg);
            }
        });
    };

    const resolveActionElement = (target, wantsChange) => {
        let el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.analyticsAction) {
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

export const AnalyticsModule = {
    id: 'analytics',
    routes: ['/analytics', '/analytics/:subTab'],
    dependencies: ['storage', 'analytics'],

    _syncUnsubscribe: null,
    _renderRequestedUnsubscribe: null,

    async init(ctx) {
        AnalyticsActions.bindCtx(ctx);
        AnalyticsRender.bindCtx(ctx);
        if (window.MultiFilterShared) window.MultiFilterShared.bindCtx(ctx);

        bindAnalyticsActionDelegation();

        // 1. Синхронизировать начальное состояние через ctx.analytics
        const currentMode = (ctx.analytics && typeof ctx.analytics.getAnalyticsMode === 'function')
            ? ctx.analytics.getAnalyticsMode()
            : 'local';
        AnalyticsState.setMode(currentMode);

        const currentFilters = (ctx.analytics && typeof ctx.analytics.getAnalyticsFilters === 'function')
            ? ctx.analytics.getAnalyticsFilters()
            : null;
        if (currentFilters) AnalyticsState.setFilters(currentFilters);

        // 2. Восстановить активную подвкладку из localStorage
        try {
            const savedTab = localStorage.getItem('rbi_active_analytics_tab');
            if (savedTab) AnalyticsState.setActiveSubTab(savedTab);
        } catch (_) {}

        // 3. sync:completed — данные в память; full-render запрещён на активном
        // экране (единый хелпер §5: shouldDeferFullRender).
        const events = ctx && ctx.events;
        if (events && typeof events.on === 'function') {
            const handler = async () => {
                await AnalyticsActions.loadData();
                if (window.RBI?.utils?.syncUi?.markDirty) window.RBI.utils.syncUi.markDirty('analytics');
                else if (window.syncDirtyFlags) window.syncDirtyFlags.analytics = true;
                if (typeof window.shouldDeferFullRender === 'function' && window.shouldDeferFullRender('analytics')) {
                    return;
                }
            };
            events.on('sync:completed', handler);
            AnalyticsModule._syncUnsubscribe = () => events.off && events.off('sync:completed', handler);
        }

        // 3.1 Подписаться на analytics:renderRequested → перерисовать (без перезагрузки данных)
        if (events && typeof events.on === 'function') {
            const onRenderRequested = () => AnalyticsRender.render();
            events.on('analytics:renderRequested', onRenderRequested);
            AnalyticsModule._renderRequestedUnsubscribe = () => events.off && events.off('analytics:renderRequested', onRenderRequested);
        }

        // 4. Эмитировать analytics:initialized
        if (events && typeof events.emit === 'function') {
            events.emit('analytics:initialized', { mode: AnalyticsState.mode });
        }

        console.log('[AnalyticsModule] init complete');
    },

    mount(container, ctx) {
        if (typeof window.ensureAnalyticsMarkup === 'function') {
            window.ensureAnalyticsMarkup();
        }
        const subTab = (ctx && ctx.subTab) || AnalyticsState.activeSubTab;
        AnalyticsRender.render(subTab);
    },

    /**
     * Route-teardown при уходе с #/quality/analytics (AppRouter).
     * Уничтожает Chart.js / desktop-shell / DOM-каркас и runtime-кэши галерей.
     * НЕ снимает EventBus-подписки init() — иначе при возврате на вкладку
     * sync:completed / renderRequested молчат до полной перезагрузки модуля.
     */
    teardownView() {
        const desk = window.AnalyticsDesktopRender;
        if (desk && typeof desk.teardown === 'function') {
            try { desk.teardown(); } catch (_) { /* ignore */ }
        }

        Object.values(AnalyticsState.chartInstances || {}).forEach(function (ch) {
            try { if (ch && typeof ch.destroy === 'function') ch.destroy(); } catch (_) {}
        });
        AnalyticsState.setChartInstances({});

        if (typeof window.clearAnalyticsViewRuntimeCaches === 'function') {
            try { window.clearAnalyticsViewRuntimeCaches(); } catch (_) { /* ignore */ }
        }

        if (typeof window.rbiTeardownTabView === 'function') {
            window.rbiTeardownTabView('tab-analytics');
        } else {
            const tab = document.getElementById('tab-analytics');
            if (tab) tab.innerHTML = '';
        }
    },

    unmount() {
        AnalyticsModule.teardownView();

        if (typeof AnalyticsModule._syncUnsubscribe === 'function') {
            AnalyticsModule._syncUnsubscribe();
            AnalyticsModule._syncUnsubscribe = null;
        }
        if (typeof AnalyticsModule._renderRequestedUnsubscribe === 'function') {
            AnalyticsModule._renderRequestedUnsubscribe();
            AnalyticsModule._renderRequestedUnsubscribe = null;
        }
    }
};

if (typeof window !== 'undefined') {
    window.AnalyticsModule = AnalyticsModule;
    if (window.RBI && window.RBI.registry) {
        window.RBI.registry.register('module.analytics', AnalyticsModule);
    }
}

console.log('[AnalyticsModule] analytics.module.js loaded (ES module)');
