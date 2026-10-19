/* Файл: js/services/contractor-metrics.service.js */
/* ContractorMetricsService v0.1 — инкрементальный in-memory кэш метрик подрядчика.
 *
 * Проблема: renderContractorsSubTab/renderContractorsListOnly/renderOnePagerSubTab/
 * renderGlobalOnePager (analytics.render.js) на каждое открытие вкладки «Подрядчики»/
 * «Сводка» вызывали getContractorMetrics()/getObjectIntegralMetrics() (math.utils.js)
 * в цикле по всем группам подрядчик×объект — O(подрядчики × записи) при каждом рендере.
 *
 * Решение: держим в памяти готовый результат getContractorMetrics() на группу
 * "подрядчик [объект]" (тот же groupKey, что используется в analytics.render.js),
 * пересчитываем ТОЧЕЧНО (только затронутую группу), а не всю базу:
 *   - разовый полный пересчёт при старте приложения (после restoreSession());
 *   - точечно при save()/softDelete() одной проверки (inspection.service.js);
 *   - точечно после pull из облака — только для групп, чьи записи реально
 *     изменились в этом pull (sync-engine.core.js/sync-post-actions.js).
 *
 * Сознательное упрощение (подтверждено пользователем): кэш НЕ персистентный,
 * не переживает reload — getContractorMetrics() — чистая функция от записей
 * стора app_history, поэтому пересчёт из первоисточника гарантирует одинаковый
 * результат на разных устройствах после синхронизации, без риска рассинхрона
 * отдельного канала хранения агрегата.
 */

(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    // { [groupKey]: { metrics, idsSignature } } — groupKey = `${contractorName} [${projectLabel}]`
    // (тот же формат cKey, что в analytics.render.js renderContractorsSubTab/renderContractorsListOnly).
    // idsSignature — отпечаток набора id записей, из которых посчитан metrics
    // (см. idsSignatureOf ниже) — нужен, чтобы отличить "полная база подрядчика"
    // (что кэширует этот сервис) от отфильтрованного набора, который реально
    // пришёл в рендер вкладки (период/объект/подрядчик/шаблон/режим cloud —
    // см. getMetricsForGroupMatching).
    var _cache = {};
    var _initialized = false;

    // Кэш метрик по отфильтрованным срезам (D30 и др.): ключ = idsSignature.
    // Без него getMetricsForGroupMatching при любом периоде ≠ ALL на каждый
    // рендер/смену вкладки заново гоняет getContractorMetrics по всем группам
    // (current_plan B5). Инвалидируется вместе с полным кэшем.
    var _sliceCache = {};
    var _sliceCacheKeys = [];
    var SLICE_CACHE_MAX = 250;

    function idsSignatureOf(records) {
        return records.map(function (i) { return i && i.id; }).sort().join('_');
    }

    function clearSliceCache() {
        _sliceCache = {};
        _sliceCacheKeys = [];
    }

    function getSliceCached(sig) {
        if (!sig || !_sliceCache[sig]) return null;
        return _sliceCache[sig];
    }

    function setSliceCached(sig, metrics) {
        if (!sig || !metrics) return;
        if (_sliceCache[sig]) {
            var idx = _sliceCacheKeys.indexOf(sig);
            if (idx >= 0) _sliceCacheKeys.splice(idx, 1);
        }
        _sliceCache[sig] = metrics;
        _sliceCacheKeys.push(sig);
        while (_sliceCacheKeys.length > SLICE_CACHE_MAX) {
            var oldest = _sliceCacheKeys.shift();
            if (oldest) delete _sliceCache[oldest];
        }
    }

    function projectLabelOf(item) {
        return item.project_display_name || item.projectName || item.project_canonical_key || 'Без объекта';
    }

    function groupKeyOf(item) {
        return (item.contractorName || 'Не указан') + ' [' + projectLabelOf(item) + ']';
    }

    function userTemplates() {
        if (window.RBI.services.templates) return window.RBI.services.templates.getUserTemplates();
        return typeof window.userTemplates !== 'undefined' ? window.userTemplates : {};
    }

    function sourceRecords() {
        if (window.RBI.services.inspections) return window.RBI.services.inspections.getAllForAnalyticsSync();
        return Array.isArray(window.contractorArray) ? window.contractorArray : [];
    }

    function groupByKey(records) {
        var grouped = {};
        records.forEach(function (item) {
            if (!item || item._deleted === true || item.is_deleted === true) return;
            var key = groupKeyOf(item);
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
        });
        return grouped;
    }

    // Пересчитывает ОДНУ группу (подрядчик+объект) из текущего живого массива записей.
    function recalcGroup(groupKey) {
        var records = sourceRecords();
        var groupRecords = records.filter(function (item) {
            return item && item._deleted !== true && item.is_deleted !== true && groupKeyOf(item) === groupKey;
        });

        if (groupRecords.length === 0) {
            delete _cache[groupKey];
            return null;
        }

        var metrics = typeof window.getContractorMetrics === 'function'
            ? window.getContractorMetrics(groupRecords, userTemplates())
            : null;

        if (metrics) {
            _cache[groupKey] = { metrics: metrics, idsSignature: idsSignatureOf(groupRecords) };
        } else {
            delete _cache[groupKey];
        }
        return metrics;
    }

    // Точечный пересчёт по одной записи (после save/softDelete/pull) — вычисляет
    // groupKey этой записи и пересчитывает только её группу.
    function recalcForRecord(record) {
        if (!record) return;
        recalcGroup(groupKeyOf(record));
    }

    var ContractorMetricsService = {

        // Разовый полный пересчёт всех групп — вызывается один раз при старте
        // приложения (после restoreSession()), НЕ при каждом открытии вкладки.
        recalcAll: function () {
            clearSliceCache();
            var grouped = groupByKey(sourceRecords());
            var nextCache = {};
            for (var key in grouped) {
                var metrics = typeof window.getContractorMetrics === 'function'
                    ? window.getContractorMetrics(grouped[key], userTemplates())
                    : null;
                if (metrics) nextCache[key] = { metrics: metrics, idsSignature: idsSignatureOf(grouped[key]) };
            }
            _cache = nextCache;
            _initialized = true;
            return this.getAllGroupMetrics();
        },

        // Точечный пересчёт: принимает одну запись (после save/softDelete)
        // или массив записей (после pull — по затронутым записям).
        recalcTouched: function (recordOrRecords) {
            if (!_initialized) return this.recalcAll();
            // База группы изменилась — срезовые ответы (D30 и т.п.) невалидны.
            clearSliceCache();
            if (Array.isArray(recordOrRecords)) {
                var seenKeys = {};
                recordOrRecords.forEach(function (r) {
                    if (!r) return;
                    var key = groupKeyOf(r);
                    if (!seenKeys[key]) {
                        seenKeys[key] = true;
                        recalcGroup(key);
                    }
                });
            } else {
                recalcForRecord(recordOrRecords);
            }
        },

        // Готовое значение метрик для группы (contractorName + projectLabel) —
        // ВСЕГДА посчитано по ПОЛНОЙ (неотфильтрованной) базе подрядчика.
        // Если кэш ещё не инициализирован — считает разово (fallback, не должен
        // происходить в обычном потоке после старта приложения).
        getMetricsForGroup: function (groupKey) {
            if (!_initialized) this.recalcAll();
            if (_cache[groupKey] !== undefined) return _cache[groupKey].metrics;
            return recalcGroup(groupKey);
        },

        // ИСПРАВЛЕНИЕ (см. отчёт "Аналитика не учитывает фильтры"): рендер
        // вкладок «Подрядчики»/«Сводка» вызывает эту функцию с УЖЕ отфильтрованным
        // (период/объект/подрядчик/шаблон/режим cloud, см. getFilteredAnalyticsData)
        // набором записей группы. Раньше _contractorMetricsCached всегда отдавал
        // кэш (посчитанный по ПОЛНОЙ базе) без проверки — при активном фильтре
        // показывались метрики, как если бы фильтр не применялся. Теперь кэш
        // используется только если его отпечаток id совпадает с переданными
        // records (т.е. фильтр реально не сузил группу); иначе считаем напрямую
        // по filteredRecords, не трогая общий кэш (он остаётся верным для
        // непрефильтрованных мест использования).
        getMetricsForGroupMatching: function (groupKey, filteredRecords) {
            if (!_initialized) this.recalcAll();
            var entry = _cache[groupKey];
            if (entry === undefined) {
                var recalced = recalcGroup(groupKey);
                entry = _cache[groupKey];
                if (entry === undefined) return recalced;
            }
            var records = Array.isArray(filteredRecords) ? filteredRecords : [];
            var sig = idsSignatureOf(records);
            if (entry.idsSignature === sig) return entry.metrics;
            // Срез (D30/фильтры): не пересчитывать одну и ту же выборку
            // при каждом переключении подвкладки аналитики.
            var sliced = getSliceCached(sig);
            if (sliced) return sliced;
            var computed = typeof window.getContractorMetrics === 'function'
                ? window.getContractorMetrics(records, userTemplates())
                : null;
            if (computed) setSliceCached(sig, computed);
            return computed;
        },

        // Метрики для конкретной записи (удобный шорткат — вычисляет groupKey сам).
        getMetricsForRecord: function (record) {
            return this.getMetricsForGroup(groupKeyOf(record));
        },

        // Все текущие метрики по группам — { groupKey: metrics }. Копия, не живая ссылка.
        getAllGroupMetrics: function () {
            if (!_initialized) this.recalcAll();
            var out = {};
            for (var key in _cache) out[key] = _cache[key].metrics;
            return out;
        },

        groupKeyOf: groupKeyOf,

        isInitialized: function () { return _initialized; }
    };

    window.RBI.services.contractorMetrics = ContractorMetricsService;
    if (window.RBI.registry) {
        window.RBI.registry.register('service.contractorMetrics', ContractorMetricsService);
    }

    console.log('[RBI Service] contractorMetrics loaded');
}());
