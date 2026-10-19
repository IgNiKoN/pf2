/**
 * analytics.pptx-export.js
 * Пилот PPTX-экспорта локальной сводки объекта (вкладка «Сводка»).
 * Библиотека: PptxGenJS (libs/pptxgenjs.bundle.js) — напрямую, без service-обёртки.
 */

const root = typeof globalThis !== 'undefined' ? globalThis : window;

function _toast(msg) {
    if (typeof root.showToast === 'function') root.showToast(msg);
    else console.warn('[pptx-export]', msg);
}

function _resolvePptxCtor() {
    if (typeof root.PptxGenJS === 'function') return root.PptxGenJS;
    if (typeof root.pptxgenjs === 'function') return root.pptxgenjs;
    if (root.pptxgenjs && typeof root.pptxgenjs === 'object') {
        if (typeof root.pptxgenjs.default === 'function') return root.pptxgenjs.default;
    }
    return null;
}

function _templates() {
    return root.RBI && root.RBI.services && root.RBI.services.templates
        ? root.RBI.services.templates
        : {
            getUserTemplates: () => (root.userTemplates || {})
        };
}

function _systemTemplates() {
    return root.SYSTEM_TEMPLATES || {};
}

function _contractorMetrics(groupKey, cData) {
    var svc = root.RBI && root.RBI.services && root.RBI.services.contractorMetrics;
    if (svc && typeof svc.getMetricsForGroupMatching === 'function') {
        var matched = svc.getMetricsForGroupMatching(groupKey, cData);
        if (matched) return matched;
    }
    if (typeof root.getContractorMetrics === 'function') {
        return root.getContractorMetrics(cData, _templates().getUserTemplates());
    }
    return null;
}

function _objectIntegralMetrics(data) {
    if (typeof root.getObjectIntegralMetrics !== 'function' || !data || !data.length) return null;
    return root.getObjectIntegralMetrics(data, _templates().getUserTemplates() || {});
}

function _filterLabel() {
    var filters = (root.activeMultiFilters && root.activeMultiFilters.analytics) || {};
    var projects = Array.isArray(filters.project) ? filters.project.filter(Boolean) : [];
    if (projects.length === 1) return String(projects[0]);
    if (projects.length > 1) return projects.length + '_объектов';
    var btn = document.getElementById('btn-ana-project');
    var txt = btn ? String(btn.textContent || '').trim() : '';
    if (txt && txt !== 'Объекты' && txt !== 'Все объекты') return txt;
    return 'фильтр';
}

function _periodText() {
    var periodText = document.getElementById('btn-ana-period-label')?.innerText?.trim() || 'За 30 дней';
    if (document.getElementById('global-filter-period')?.value === 'CUSTOM') {
        var dFrom = document.getElementById('filter-date-from')?.value;
        var dTo = document.getElementById('filter-date-to')?.value;
        if (dFrom || dTo) {
            var fmt = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '...';
            periodText = 'с ' + fmt(dFrom) + ' по ' + fmt(dTo);
        }
    }
    return periodText;
}

function _safeFilePart(s) {
    return String(s || '')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 80) || 'фильтр';
}

function _groupKey(item) {
    if (typeof root.trendContractorKey === 'function') return root.trendContractorKey(item);
    return (item.contractorName || 'Неизвестно') + ' [' + (item.project_display_name || item.projectName || 'Без объекта') + ']';
}

function _collectTopB3(data) {
    var b3Map = {};
    var flatListFn = typeof root.getFlatList === 'function' ? root.getFlatList : null;
    data.forEach(function (i) {
        if (!i.state || !i.details || !i.templateKey) return;
        Object.keys(i.state).forEach(function (id) {
            var s = i.state[id];
            if (s !== 'fail' && s !== 'fail_escalated') return;
            var defName = 'Дефект';
            var tType = i.templateKey.split('_')[0];
            var tKey = i.templateKey.replace(tType + '_', '');
            var cl = tType === 'sys' && _systemTemplates()[tKey]
                ? _systemTemplates()[tKey].groups
                : (_templates().getUserTemplates()[tKey] ? _templates().getUserTemplates()[tKey].groups : []);
            var foundItem = flatListFn ? flatListFn(cl).find(function (x) { return x.id == id; }) : null;
            if (foundItem) defName = foundItem.n;
            var isB3 = (s === 'fail_escalated') || (foundItem && foundItem.w === 3);
            if (!isB3) return;
            var photo = (i.photos && i.photos[id])
                ? (root.normalizeItemPhotos ? root.normalizeItemPhotos(i.photos[id])[0] : [].concat(i.photos[id])[0])
                : null;
            if (!b3Map[defName]) {
                b3Map[defName] = {
                    count: 0,
                    photo: null,
                    contr: (i.contractorName || 'Неизвестно') + ' [' + (i.projectName || 'Без объекта') + ']',
                    name: defName
                };
            }
            b3Map[defName].count++;
            if (photo) b3Map[defName].photo = photo;
        });
    });
    return Object.values(b3Map).sort(function (a, b) { return b.count - a.count; }).slice(0, 5);
}

async function _thumbDataUrl(photoRef) {
    if (!photoRef) return null;
    var pm = root.PhotoManager;
    if (!pm || typeof pm.getAsyncUrl !== 'function') return null;
    try {
        var url = await pm.getAsyncUrl(photoRef, { preferThumb: true });
        if (!url) return null;
        if (String(url).startsWith('data:image')) return url;
        var resp = await fetch(url);
        if (!resp || !resp.ok) return null;
        var blob = await resp.blob();
        if (!blob || !String(blob.type || '').startsWith('image/')) return null;
        return await new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result || null); };
            reader.onerror = function () { resolve(null); };
            reader.readAsDataURL(blob);
        });
    } catch (_) {
        return null;
    }
}

function _buildSummaryPayload(data) {
    var sumB3 = 0;
    data.forEach(function (i) {
        if (!i.metrics) return;
        sumB3 += Number(i.metrics.n_B3_fail) || 0;
    });
    var kpi = (typeof root.avgContractorRatingsFromChecks === 'function')
        ? root.avgContractorRatingsFromChecks(data)
        : { avgUrk: 0 };
    var currAvgUrk = kpi.avgUrk;

    var groupedC = {};
    data.forEach(function (item) {
        var cKey = _groupKey(item);
        (groupedC[cKey] = groupedC[cKey] || []).push(item);
    });
    var currContractorsCount = Object.keys(groupedC).length;

    var currIntMetrics = _objectIntegralMetrics(data);
    var mData = currIntMetrics || { redZonePerc: 0, IKO: '0.00', ikoStatus: 'Мало данных' };

    var ratingData = [];
    Object.keys(groupedC).forEach(function (cName) {
        if (groupedC[cName].length < 3) return;
        var m = _contractorMetrics(cName, groupedC[cName]);
        if (m) ratingData.push({ name: cName, val: m.finalC, count: m.count, b3: m.n_изделий_с_B3, isPrelim: m.count < 7 });
    });
    ratingData.sort(function (a, b) { return b.val - a.val; });

    var withRel = ratingData.filter(function (r) { return r.count >= 7; });
    var relN = withRel.length;
    var redContrCount = withRel.filter(function (r) { return r.val < 70; }).length;
    var redContrPerc = relN > 0 ? Math.round((redContrCount / relN) * 100) : null;

    return {
        checks: data.length,
        periodText: _periodText(),
        filterLabel: _filterLabel(),
        IKO: mData.IKO,
        avgUrk: currAvgUrk,
        contractorsCount: currContractorsCount,
        sumB3: sumB3,
        redContrCount: redContrCount,
        redContrPerc: redContrPerc,
        relN: relN,
        ratingData: ratingData,
        topB3: _collectTopB3(data)
    };
}

/**
 * Экспорт локальной сводки в .pptx (кнопка / FAB → data-analytics-action).
 */
export async function exportOnePagerPptx() {
    try {
        if (root.onepagerMode === 'global') {
            return _toast('PPTX-пилот доступен только для локальной сводки объекта');
        }

        var PptxCtor = _resolvePptxCtor();
        if (!PptxCtor) return _toast('Библиотека экспорта не загружена');

        var getData = (root.AnalyticsActions && typeof root.AnalyticsActions.getFilteredAnalyticsData === 'function')
            ? root.AnalyticsActions.getFilteredAnalyticsData.bind(root.AnalyticsActions)
            : root.getFilteredAnalyticsData;
        var data = typeof getData === 'function' ? (getData() || []) : [];
        if (!data.length) return _toast('Нет данных для выгрузки');

        var payload = _buildSummaryPayload(data);
        var pptx = new PptxCtor();
        pptx.author = 'RBI Platform';
        pptx.title = 'Сводный статус объекта';
        pptx.subject = payload.periodText;

        // 1. Титул
        var s1 = pptx.addSlide();
        s1.addText('Сводный статус объекта', { x: 0.5, y: 1.2, w: 9, h: 0.7, fontSize: 28, bold: true, color: '1e293b' });
        s1.addText('Период: ' + payload.periodText, { x: 0.5, y: 2.1, w: 9, h: 0.4, fontSize: 16, color: '475569' });
        s1.addText('Проверок в выборке: ' + payload.checks, { x: 0.5, y: 2.6, w: 9, h: 0.35, fontSize: 14, color: '64748b' });
        s1.addText('Дата выгрузки: ' + new Date().toLocaleDateString('ru-RU'), { x: 0.5, y: 3.05, w: 9, h: 0.35, fontSize: 14, color: '64748b' });
        s1.addText('Объект / фильтр: ' + payload.filterLabel, { x: 0.5, y: 3.5, w: 9, h: 0.35, fontSize: 13, color: '64748b' });

        // 2. KPI (те же формулы, что карточки Сводки)
        var s2 = pptx.addSlide();
        s2.addText('KPI', { x: 0.5, y: 0.3, w: 9, h: 0.45, fontSize: 22, bold: true, color: '1e293b' });
        var redLabel = payload.relN > 0
            ? (payload.redContrCount + ' из ' + payload.relN + ' (' + payload.redContrPerc + '%)')
            : 'СБОР (нужен N≥7)';
        var kpiRows = [
            [
                { text: 'Показатель', options: { bold: true, fill: { color: 'e2e8f0' } } },
                { text: 'Значение', options: { bold: true, fill: { color: 'e2e8f0' } } }
            ],
            ['ИКО', String(payload.IKO)],
            ['ср. УрК / ИУрК (физика), %', String(payload.avgUrk) + '%'],
            ['Число подрядчиков', String(payload.contractorsCount)],
            ['B3 (сумма)', String(payload.sumB3)],
            ['Подрядчики с ИУрК ниже 70% (N≥7)', redLabel]
        ];
        s2.addTable(kpiRows, {
            x: 0.5, y: 1.0, w: 9, colW: [5.5, 3.5],
            border: { pt: 0.5, color: 'cbd5e1' },
            fontSize: 13,
            color: '1e293b',
            valign: 'middle'
        });

        // 3. Рейтинг подрядчиков
        var s3 = pptx.addSlide();
        s3.addText('Рейтинг подрядчиков', { x: 0.5, y: 0.3, w: 9, h: 0.45, fontSize: 22, bold: true, color: '1e293b' });
        var topN = payload.ratingData.slice(0, 15);
        if (topN.length === 0) {
            s3.addText('Недостаточно данных (нужен N≥3 у подрядчика)', { x: 0.5, y: 1.2, w: 9, h: 0.4, fontSize: 14, color: '64748b' });
        } else {
            var ratingRows = [[
                { text: 'Подрядчик', options: { bold: true, fill: { color: 'e2e8f0' } } },
                { text: 'ИУрК %', options: { bold: true, fill: { color: 'e2e8f0' } } },
                { text: 'N', options: { bold: true, fill: { color: 'e2e8f0' } } }
            ]];
            topN.forEach(function (r) {
                ratingRows.push([
                    r.name + (r.isPrelim ? ' (СБОР)' : ''),
                    String(r.val) + '%',
                    String(r.count)
                ]);
            });
            s3.addTable(ratingRows, {
                x: 0.4, y: 0.9, w: 9.2, colW: [6.2, 1.5, 1.5],
                border: { pt: 0.5, color: 'cbd5e1' },
                fontSize: 11,
                color: '1e293b',
                valign: 'middle'
            });
        }

        // 4. Сравнение (bar chart)
        var s4 = pptx.addSlide();
        s4.addText('Сравнение ИУрК', { x: 0.5, y: 0.3, w: 9, h: 0.45, fontSize: 22, bold: true, color: '1e293b' });
        var chartSrc = payload.ratingData.slice(0, 12);
        if (chartSrc.length === 0) {
            s4.addText('Недостаточно данных для диаграммы', { x: 0.5, y: 1.2, w: 9, h: 0.4, fontSize: 14, color: '64748b' });
        } else {
            s4.addChart(pptx.charts.BAR, [{
                name: 'ИУрК %',
                labels: chartSrc.map(function (r) {
                    var n = String(r.name || '');
                    return n.length > 28 ? n.slice(0, 27) + '…' : n;
                }),
                values: chartSrc.map(function (r) { return Number(r.val) || 0; })
            }], {
                x: 0.4, y: 0.9, w: 9.2, h: 4.2,
                showTitle: false,
                showLegend: false,
                showValue: true,
                chartColors: ['4f46e5'],
                valAxisMaxValue: 100,
                valAxisMinValue: 0
            });
        }

        // 5. Топ дефектов B3 + thumb
        var s5 = pptx.addSlide();
        s5.addText('Топ дефектов B3', { x: 0.5, y: 0.25, w: 9, h: 0.4, fontSize: 22, bold: true, color: '1e293b' });
        var topB3 = payload.topB3;
        if (topB3.length === 0) {
            s5.addText('Критических дефектов B3 не зафиксировано', { x: 0.5, y: 1.2, w: 9, h: 0.4, fontSize: 14, color: '64748b' });
        } else {
            var colW = 1.7;
            var gap = 0.15;
            var startX = 0.4;
            for (var i = 0; i < topB3.length; i++) {
                var d = topB3[i];
                var x = startX + i * (colW + gap);
                var thumb = await _thumbDataUrl(d.photo);
                if (thumb) {
                    try {
                        s5.addImage({ data: thumb, x: x, y: 0.85, w: colW, h: 1.5 });
                    } catch (_) {
                        s5.addShape(pptx.shapes.RECTANGLE, {
                            x: x, y: 0.85, w: colW, h: 1.5,
                            fill: { color: 'f1f5f9' }, line: { color: 'cbd5e1', pt: 0.5 }
                        });
                        s5.addText('нет превью', { x: x, y: 1.4, w: colW, h: 0.3, fontSize: 9, color: '94a3b8', align: 'center' });
                    }
                } else {
                    s5.addShape(pptx.shapes.RECTANGLE, {
                        x: x, y: 0.85, w: colW, h: 1.5,
                        fill: { color: 'f1f5f9' }, line: { color: 'cbd5e1', pt: 0.5 }
                    });
                    s5.addText('нет превью', { x: x, y: 1.4, w: colW, h: 0.3, fontSize: 9, color: '94a3b8', align: 'center' });
                }
                s5.addText(String(d.name || 'Дефект'), {
                    x: x, y: 2.45, w: colW, h: 0.7, fontSize: 10, bold: true, color: '1e293b', valign: 'top'
                });
                s5.addText(String(d.count) + ' шт · ' + String(d.contr || ''), {
                    x: x, y: 3.2, w: colW, h: 0.8, fontSize: 9, color: '64748b', valign: 'top'
                });
            }
        }

        var fileName = 'Сводка_' + _safeFilePart(payload.filterLabel) + '_' +
            new Date().toISOString().slice(0, 10) + '.pptx';
        await pptx.writeFile({ fileName: fileName });
        _toast('PPTX сохранён: ' + fileName);
    } catch (err) {
        console.error('[pptx-export]', err);
        _toast('Ошибка экспорта PPTX');
    }
}

// Публикация для data-analytics-action / FAB (через root[...], без прямой записи window.*).
root['exportOnePagerPptx'] = exportOnePagerPptx;
