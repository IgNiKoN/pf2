/* Файл: js/shared/sync-ui-defer.utils.js
 * Единый хелпер §5: sync не делает full-render активного экрана.
 * Модули: shouldDeferFullRender('analytics'|'history'|...) → skip paint, markDirty.
 */
(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    window.RBI = window.RBI || {};
    window.RBI.utils = window.RBI.utils || {};

    var DEFER_END_MS = 400;

    function _elActive(id) {
        var el = document.getElementById(id);
        return !!(el && el.classList.contains('active'));
    }

    function _subVisible(id) {
        var el = document.getElementById(id);
        return !!(el && !el.classList.contains('hidden'));
    }

    function _analyticsActive() {
        return _elActive('tab-analytics');
    }

    function _engineerActive() {
        return _elActive('tab-engineer');
    }

    /** Активен ли указанный экран / подвкладка. */
    function isViewActive(viewKey) {
        var key = String(viewKey || '').trim();
        if (!key) return false;

        switch (key) {
            case 'analytics':
                return _analyticsActive();
            case 'contractors':
                return _analyticsActive() && _subVisible('sub-contractors');
            case 'onepager':
                return _analyticsActive() && _subVisible('sub-onepager');
            case 'history':
                return _analyticsActive() && _subVisible('sub-history');
            case 'sk':
                return _analyticsActive() && _subVisible('sub-sk');
            case 'schedule':
                return _analyticsActive() && _subVisible('sub-schedule');
            case 'data':
                return _analyticsActive() && _subVisible('sub-data');
            case 'rating':
                return _analyticsActive() && _subVisible('sub-rating');

            case 'engineer':
                return _engineerActive();
            case 'tasks':
                return _engineerActive() && _subVisible('eng-sub-tasks');
            case 'meetings':
                return _engineerActive() && _subVisible('eng-sub-meetings');
            case 'impact':
                return _engineerActive() && _subVisible('eng-sub-impact');
            case 'fmea':
                return _engineerActive() && _subVisible('eng-sub-fmea');
            case 'badges':
            case 'game':
                return _engineerActive() && _subVisible('eng-sub-badges');

            case 'reference':
                return _elActive('tab-reference');
            case 'settings':
                return _elActive('tab-settings');
            case 'audit':
                return _elActive('tab-audit');

            case 'construction':
                return _elActive('tab-construction-defects')
                    || _elActive('tab-construction-acceptance')
                    || _elActive('tab-transfer')
                    || _elActive('tab-construction-reports')
                    || _elActive('tab-construction-reference');
            case 'construction-defects':
                return _elActive('tab-construction-defects');
            case 'construction-acceptance':
                return _elActive('tab-construction-acceptance');
            case 'transfer':
                return _elActive('tab-transfer');

            default:
                // Произвольный id секции: tab-* / sub-*
                if (key.indexOf('tab-') === 0) return _elActive(key);
                if (key.indexOf('sub-') === 0 || key.indexOf('eng-sub-') === 0 || key.indexOf('ref-sub-') === 0) {
                    var parentOk = true;
                    if (key.indexOf('sub-') === 0) parentOk = _analyticsActive();
                    if (key.indexOf('eng-sub-') === 0) parentOk = _engineerActive();
                    return parentOk && _subVisible(key);
                }
                return false;
        }
    }

    function isDeferred() {
        return !!(window.isSyncing || window._rbiDeferActiveViewFullRender);
    }

    /**
     * true → не делать full-render этого экрана (sync идёт / только что закончился,
     * и экран сейчас на виду у пользователя).
     * @param {string|string[]} viewKeys
     */
    function shouldDeferFullRender(viewKeys) {
        if (!isDeferred()) return false;
        var keys = Array.isArray(viewKeys) ? viewKeys : [viewKeys];
        for (var i = 0; i < keys.length; i++) {
            if (isViewActive(keys[i])) return true;
        }
        return false;
    }

    function beginDefer() {
        window._rbiDeferActiveViewFullRender = true;
    }

    /**
     * Нужен ли full-paint после sync: только скелетон / пустой первый кадр.
     * Уже отрисованный экран НЕ пересобираем — иначе схлопываются аккордеоны,
     * прыгает скролл (тихая sync должна быть как iCloud: данные в память,
     * UI без скачка; обновление — при смене вкладки / точечно).
     */
    function _viewNeedsFirstPaint(hostIds, emptyTextRe) {
        var ids = Array.isArray(hostIds) ? hostIds : [hostIds];
        var host = null;
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) { host = el; break; }
        }
        if (!host) return true;
        if (host.querySelector && host.querySelector('.rbi-skeleton-wrap, .animate-spin')) return true;
        var html = (host.innerHTML || '').trim();
        if (html.length < 80) return true;
        var text = host.innerText || '';
        if (emptyTextRe && emptyTextRe.test(text) && html.length < 800) return true;
        if (/Чтение базы/i.test(text)) return true;
        return false;
    }

    function _analyticsNeedsFlushPaint() {
        var tab = (window.AnalyticsState && window.AnalyticsState.activeSubTab)
            || window.currentActiveAnalyticsTab
            || 'sub-contractors';
        if (tab === 'sub-contractors') {
            return _viewNeedsFirstPaint(
                ['contractors-list-container', 'sub-contractors'],
                /Нет данных/i
            );
        }
        if (tab === 'sub-onepager') {
            return _viewNeedsFirstPaint(['sub-onepager'], /Нет данных/i);
        }
        if (tab === 'sub-sk') {
            if (!document.getElementById('sk-view-dashboard')) return true;
            return _viewNeedsFirstPaint(['sk-main-container', 'sub-sk'], /Чтение базы|Нет данных/i);
        }
        if (tab === 'sub-schedule') {
            return _viewNeedsFirstPaint(['schedule-container', 'sub-schedule'], /Нет данных/i);
        }
        if (tab === 'sub-history') {
            return _viewNeedsFirstPaint(['history-list', 'sub-history'], /Нет записей|Нет данных/i);
        }
        if (tab === 'sub-reports' || tab === 'sub-data' || tab === 'sub-rating') {
            return _viewNeedsFirstPaint([tab], /Нет данных/i);
        }
        return _viewNeedsFirstPaint(['tab-analytics'], /Нет данных/i);
    }

    /**
     * После снятия defer: full-paint только если активный экран ещё не собран
     * (скелетон / пусто). Иначе dirty остаётся — обновится при навигации.
     */
    function flushDirtyActiveViews() {
        if (isDeferred()) return;
        var flags = window.syncDirtyFlags;
        if (!flags) return;

        if (flags.analytics && isViewActive('analytics')) {
            // Живой DOM после sync не трогаем (аккордеоны/скролл). Но если
            // пользователь сменил глобальный фильтр во время defer — filter paint
            // stale, иначе кнопка «закреплена», а данные остаются старыми.
            // dataStale сам по себе НЕ повод для paint (см. sync-live-paint.policy /
            // shouldSkipAnalyticsLivePaint в analytics.render).
            var filterStale = typeof window.analyticsFilterPaintIsStale === 'function'
                && window.analyticsFilterPaintIsStale();
            var dataStale = !!(window.AnalyticsRender
                && typeof window.AnalyticsRender.sourceDataIsStale === 'function'
                && window.AnalyticsRender.sourceDataIsStale());
            if (!_analyticsNeedsFlushPaint() && !filterStale) {
                // A9: если source-signature не изменился — снимаем dirty,
                // иначе dirty остаётся до навигации (без live rebuild).
                if (!dataStale) flags.analytics = false;
                return;
            }
            if (typeof window.renderCurrentAnalyticsTab === 'function') {
                try { window.renderCurrentAnalyticsTab(); } catch (e) {
                    console.warn('[syncUi] flush analytics failed', e);
                }
            }
            return;
        }

        if (flags.history && isViewActive('history')) {
            // A9: живой журнал не пересобираем; dirty остаётся → refresh при уходе/заходе.
            // Host id — history-list (history-list-container в разметке нет).
            if (!_viewNeedsFirstPaint(['history-list', 'sub-history'], /Нет записей|Нет данных/i)) {
                return;
            }
            if (window.HistoryActions && typeof window.HistoryActions.loadRecords === 'function') {
                try {
                    Promise.resolve(window.HistoryActions.loadRecords()).then(function () {
                        if (typeof window.renderHistoryTab === 'function') window.renderHistoryTab();
                    });
                } catch (e) {
                    console.warn('[syncUi] flush history failed', e);
                }
            } else if (typeof window.renderHistoryTab === 'function') {
                try { window.renderHistoryTab(); } catch (e2) { /* ignore */ }
            }
            return;
        }

        if (flags.sk && isViewActive('sk')) {
            // A9: живой ПК СК не пересобираем; dirty остаётся → refresh при повторном заходе.
            if (!_viewNeedsFirstPaint(['sk-main-container', 'sk-view-dashboard', 'sub-sk'], /Чтение базы|Нет данных/i)) {
                return;
            }
            if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
                try { window.RBI.events.emit('sk:renderRequested', { view: 'mainTab' }); } catch (e) { /* ignore */ }
            }
        }

        if (flags.construction && isViewActive('construction')) {
            // ConstManager.init — тяжёлый full-render; только если экран пуст/скелетон.
            if (!_viewNeedsFirstPaint(
                ['tab-construction-defects', 'tab-construction-acceptance', 'tab-transfer'],
                /Нет данных|Загрузка/i
            )) {
                return;
            }
            if (window.ConstructionActions && typeof window.ConstructionActions.init === 'function') {
                try { window.ConstructionActions.init(); } catch (e) {
                    console.warn('[syncUi] flush construction failed', e);
                }
            }
        }
    }

    var _endTimer = null;
    function endDefer(delayMs) {
        if (_endTimer) {
            clearTimeout(_endTimer);
            _endTimer = null;
        }
        var ms = (delayMs === 0 || delayMs) ? delayMs : DEFER_END_MS;
        if (ms <= 0) {
            window._rbiDeferActiveViewFullRender = false;
            flushDirtyActiveViews();
            return;
        }
        _endTimer = setTimeout(function () {
            _endTimer = null;
            window._rbiDeferActiveViewFullRender = false;
            flushDirtyActiveViews();
        }, ms);
    }

    function markDirty(flagKeys) {
        if (!window.syncDirtyFlags) return;
        var keys = Array.isArray(flagKeys) ? flagKeys : [flagKeys];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (!k) continue;
            window.syncDirtyFlags[k] = true;
        }
    }

    var api = {
        beginDefer: beginDefer,
        endDefer: endDefer,
        isDeferred: isDeferred,
        isViewActive: isViewActive,
        shouldDeferFullRender: shouldDeferFullRender,
        markDirty: markDirty,
        flushDirtyActiveViews: flushDirtyActiveViews
    };

    window.RBI.utils.syncUi = api;
    // Удобные глобалы для legacy-вызовов
    window.shouldDeferFullRender = shouldDeferFullRender;
    window.rbiBeginSyncUiDefer = beginDefer;
    window.rbiEndSyncUiDefer = endDefer;

    // Кросс-вкладочный sync lock (BroadcastChannel) — тот же defer.
    try {
        if (window.syncChannel && typeof window.syncChannel.addEventListener === 'function') {
            window.syncChannel.addEventListener('message', function (e) {
                if (!e || !e.data) return;
                if (e.data === 'sync_started') beginDefer();
                if (e.data === 'sync_done') endDefer(DEFER_END_MS);
            });
        }
    } catch (_) { /* syncChannel может появиться позже */ }

    console.log('[RBI Utils] sync-ui-defer loaded');
}());
