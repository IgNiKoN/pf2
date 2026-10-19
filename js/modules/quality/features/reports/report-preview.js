/**
 * report-preview.js — print-first превью One-Pager 2.0.
 * Содержимое берётся из buildOnePagerV2Html({ forPreview: true }),
 * тумблеры включают/выключают секции OP2, печать — window.print.
 */

function _t(key, fallback, vars) {
    try {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var s = vars ? i18n.t(key, vars) : i18n.t(key);
            if (s && s !== key) return s;
        }
    } catch (e) {}
    if (vars && fallback) {
        return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) {
            return vars[k] != null ? String(vars[k]) : '';
        });
    }
    return fallback;
}

const SECTION_DEFS = [
    { id: 'kpi', labelKey: 'quality.reports.preview.section_kpi', label: 'KPI' },
    { id: 'chartUrk', labelKey: 'quality.reports.preview.section_chart_urk', label: 'График УрК' },
    { id: 'chartRel', labelKey: 'quality.reports.preview.section_chart_rel', label: 'График надёжн.' },
    { id: 'audit', labelKey: 'quality.reports.preview.section_audit', label: 'Аудиты' },
    { id: 'sk', labelKey: 'quality.reports.preview.section_sk', label: 'ПК СК' },
    { id: 'skLists', labelKey: 'quality.reports.preview.section_sk_lists', label: 'Списки СК' },
    { id: 'help', labelKey: 'quality.reports.preview.section_help', label: 'Пояснения' }
];

const _sectionsOn = {
    kpi: true,
    chartUrk: true,
    chartRel: true,
    audit: true,
    sk: true,
    skLists: true,
    help: true
};

let _previewData = [];
let _builtTitle = 'One-Pager 2.0';
let _rendering = false;

function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _ensureOverlay() {
    let el = document.getElementById('rbi-report-preview');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'rbi-report-preview';
    el.className = 'rbi-report-preview hidden';
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('role', 'dialog');
    el.innerHTML = [
        '<div class="rbi-report-preview-chrome">',
        '  <div class="rbi-report-preview-head">',
        '    <div>',
        '      <div class="rbi-report-preview-title">' + _esc(_t('quality.reports.preview.title', 'Сводка к печати · One-Pager 2.0')) + '</div>',
        '      <div class="rbi-report-preview-sub">' + _esc(_t('quality.reports.preview.subtitle', 'Те же блоки, что в PDF OP2 — включайте разделы и печатайте системной печатью')) + '</div>',
        '    </div>',
        '    <div class="rbi-report-preview-actions">',
        '      <button type="button" class="rbi-rp-btn rbi-rp-btn-secondary" data-rp-action="legacy">' + _esc(_t('quality.reports.preview.legacy_pdf', 'Старый PDF')) + '</button>',
        '      <button type="button" class="rbi-rp-btn rbi-rp-btn-primary" data-rp-action="print">' + _esc(_t('quality.reports.preview.print', 'Печать')) + '</button>',
        '      <button type="button" class="rbi-rp-btn rbi-rp-btn-ghost" data-rp-action="close">' + _esc(_t('quality.reports.preview.close', 'Закрыть')) + '</button>',
        '    </div>',
        '  </div>',
        '  <div class="rbi-report-preview-toggles" id="rbi-rp-toggles"></div>',
        '</div>',
        '<div class="rbi-report-preview-scroll">',
        '  <div class="rbi-report-preview-sheet rbi-report-preview-sheet-op2" id="rbi-rp-sheet">',
        '    <div class="rbi-rp-loading">' + _esc(_t('quality.reports.preview.loading', 'Собираем One-Pager 2.0…')) + '</div>',
        '  </div>',
        '</div>'
    ].join('');
    document.body.appendChild(el);

    el.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-rp-action]');
        if (!btn) return;
        const act = btn.getAttribute('data-rp-action');
        if (act === 'close') closeReportPreview();
        else if (act === 'print') printReportPreview();
        else if (act === 'legacy') {
            closeReportPreview();
            if (typeof window.handleFabExportAction === 'function') {
                window.handleFabExportAction('onepager_v2', 'script');
            }
        }
    });

    el.querySelector('#rbi-rp-toggles').addEventListener('click', function (e) {
        const chip = e.target.closest('[data-rp-section]');
        if (!chip) return;
        const id = chip.getAttribute('data-rp-section');
        _sectionsOn[id] = !_sectionsOn[id];
        _renderToggles();
        _applySectionVisibility();
    });

    return el;
}

function _renderToggles() {
    const box = document.getElementById('rbi-rp-toggles');
    if (!box) return;
    box.innerHTML = SECTION_DEFS.map(function (s) {
        const on = !!_sectionsOn[s.id];
        const label = _t(s.labelKey, s.label);
        return '<button type="button" class="rbi-rp-chip' + (on ? ' is-on' : '') + '" data-rp-section="' + s.id + '">' +
            _esc(label) + '</button>';
    }).join('');
}

function _applySectionVisibility() {
    const sheet = document.getElementById('rbi-rp-sheet');
    if (!sheet) return;
    sheet.querySelectorAll('[data-op2-sec]').forEach(function (sec) {
        const id = sec.getAttribute('data-op2-sec');
        sec.style.display = _sectionsOn[id] === false ? 'none' : '';
    });
}

async function _renderSheet() {
    const sheet = document.getElementById('rbi-rp-sheet');
    if (!sheet) return;
    if (typeof window.buildOnePagerV2Html !== 'function') {
        sheet.innerHTML = '<div class="rbi-rp-loading">' + _esc(_t('quality.reports.preview.unavailable', 'buildOnePagerV2Html недоступен — обновите страницу (SW).')) + '</div>';
        return;
    }
    sheet.innerHTML = '<div class="rbi-rp-loading">' + _esc(_t('quality.reports.preview.loading', 'Собираем One-Pager 2.0…')) + '</div>';
    _rendering = true;
    try {
        const built = await window.buildOnePagerV2Html(_previewData, { forPreview: true });
        if (!built || !built.content) {
            sheet.innerHTML = '<div class="rbi-rp-loading">' + _esc(_t('quality.reports.preview.no_data', 'Нет данных для сводки')) + '</div>';
            return;
        }
        _builtTitle = built.shellTitle || 'One-Pager 2.0';
        sheet.innerHTML = [
            '<header class="rbi-rp-doc-head">',
            '  <div class="rbi-rp-doc-title">' + _esc(_builtTitle) + '</div>',
            '  <div class="rbi-rp-doc-meta">' + _esc(_t('quality.reports.preview.meta', 'Превью One-Pager 2.0 · печать системная (без html2pdf)')) + '</div>',
            '</header>',
            built.content
        ].join('');
        _applySectionVisibility();
    } catch (err) {
        console.warn('[report-preview] OP2 build failed', err);
        sheet.innerHTML = '<div class="rbi-rp-loading">' + _esc(_t('quality.reports.preview.build_error', 'Ошибка сборки: {msg}', { msg: (err && err.message ? err.message : String(err)) })) + '</div>';
    } finally {
        _rendering = false;
    }
}

export async function openReportPreview(data) {
    _previewData = Array.isArray(data) ? data : [];
    if (!_previewData.length) {
        if (typeof showToast === 'function') showToast(_t('quality.reports.toast.no_data_export', 'Нет данных для выгрузки'));
        return;
    }
    // Remount chrome labels if overlay already exists (locale may have changed).
    let el = document.getElementById('rbi-report-preview');
    if (el) {
        el.remove();
        el = null;
    }
    el = _ensureOverlay();
    _renderToggles();
    el.classList.remove('hidden');
    document.body.classList.add('rbi-report-preview-open', 'modal-open');
    await _renderSheet();
}

export function closeReportPreview() {
    const el = document.getElementById('rbi-report-preview');
    if (el) el.classList.add('hidden');
    document.body.classList.remove('rbi-report-preview-open', 'modal-open');
}

export function printReportPreview() {
    const el = document.getElementById('rbi-report-preview');
    if (!el || el.classList.contains('hidden') || _rendering) return;
    setTimeout(function () { window.print(); }, 50);
}

window.openReportPreview = openReportPreview;
window.closeReportPreview = closeReportPreview;
window.printReportPreview = printReportPreview;
