/**
 * project-id-backfill-ui.js
 * Admin UI: backfill projectId + merge написаний объектов (Настройки → Миграция данных).
 * Зеркало contractor-id-backfill-ui.js.
 */

function _t(key, fallback, vars) {
    try {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var s = i18n.t(key, vars);
            if (s && s !== key) return s;
        }
    } catch (_e) { /* ignore */ }
    if (vars && typeof fallback === 'string') {
        return fallback.replace(/\{(\w+)\}/g, function (_, name) {
            return vars[name] != null ? String(vars[name]) : '{' + name + '}';
        });
    }
    return fallback;
}

let _delegationBound = false;
let _running = false;

function _objects() {
    return (window.RBI && window.RBI.services && window.RBI.services.objects) || null;
}
function _objectList() {
    var o = _objects();
    if (!o) return [];
    if (typeof o.list === 'function') {
        var l = o.list();
        return Array.isArray(l) ? l : [];
    }
    return Array.isArray(o.objects) ? o.objects : [];
}
function _leftoverList() {
    var o = _objects();
    if (!o) return [];
    if (typeof o.leftoverList === 'function') {
        var l = o.leftoverList();
        return Array.isArray(l) ? l : [];
    }
    return Array.isArray(o.leftoverObjects) ? o.leftoverObjects : [];
}

function _svc() {
    return _objects();
}

function _perm() {
    return (window.RBI && window.RBI.services && window.RBI.services.permissions) || null;
}

function _toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg);
}

function _isAdmin() {
    const p = _perm();
    return !!(p && p.isAdmin?.());
}

function _cloudReady() {
    return !!(window.supabaseClient && window.syncConfig && window.syncConfig.enabled);
}

function _escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _formatCounters(c) {
    const x = c || {};
    return _t('settings.admin.backfill.project.counters',
        'обновлено {updated} · уже было {already} · без матча {unmatched} · пропущено {skipped} · ошибок {errors}',
        {
            updated: x.updated || 0,
            already: x.already || 0,
            unmatched: x.unmatched || 0,
            skipped: x.skipped || 0,
            errors: x.errors || 0
        });
}

function _phaseLabel(progress) {
    const phase = progress && progress.phase || '';
    if (phase === 'done') return _t('settings.admin.backfill.project.done', 'Готово');
    if (!phase) return '';
    return _t('settings.admin.backfill.project.in_progress', 'В процессе: {phase}{table}', {
        phase: phase,
        table: progress.table ? ' / ' + progress.table : ''
    });
}

function _renderProgressHtml(progress) {
    if (!progress) {
        return '<div class="text-[10px] text-[var(--text-muted)]">' + _escapeHtml(_t('settings.admin.backfill.project.not_started', 'Ещё не запускалось.')) + '</div>';
    }
    const totals = progress.totals || {};
    const tables = progress.tables || {};
    const tableKeys = Object.keys(tables);
    const rows = tableKeys.map((key) => {
        return `<div class="flex justify-between gap-2 text-[10px] py-0.5 border-b border-[var(--card-border)]/60 last:border-0">
            <span class="font-mono text-slate-600 dark:text-slate-300">${_escapeHtml(key)}</span>
            <span class="text-right text-[var(--text-muted)]">${_escapeHtml(_formatCounters(tables[key]))}</span>
        </div>`;
    }).join('');

    const phaseLabel = _phaseLabel(progress);
    const totalsLine = _t('settings.admin.backfill.project.totals', 'Итого: {counters}', { counters: _formatCounters(totals) });

    return `
        <div class="space-y-2">
            <div class="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">${_escapeHtml(phaseLabel)}</div>
            <div class="text-[11px] font-bold text-slate-800 dark:text-white">${_escapeHtml(totalsLine)}</div>
            <div class="rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] p-2">${rows || '<div class="text-[10px] text-[var(--text-muted)]">' + _escapeHtml(_t('settings.admin.backfill.project.no_data', 'Нет данных')) + '</div>'}</div>
            ${progress.cloudAvailable === false ? '<div class="text-[10px] text-amber-600">' + _escapeHtml(_t('settings.admin.backfill.project.cloud_local_only', 'Облако недоступно — обработаны только локальные записи.')) + '</div>' : ''}
        </div>
    `;
}

function _setStatus(html) {
    const el = document.getElementById('project-id-backfill-status');
    if (el) el.innerHTML = html;
}

function _setBusy(busy) {
    _running = !!busy;
    const btn = document.getElementById('project-id-backfill-run');
    if (btn) {
        btn.disabled = !!busy;
        btn.textContent = busy
            ? _t('settings.admin.backfill.project.busy', 'Выполняется…')
            : _t('settings.admin.backfill.project.run_btn', 'Заполнить projectId в истории');
        btn.classList.toggle('opacity-60', !!busy);
        btn.classList.toggle('cursor-not-allowed', !!busy);
    }
}

async function _onRun() {
    if (_running) return;
    if (!_isAdmin()) {
        _toast(_t('settings.admin.backfill.project.admin_only', '⚠️ Только для администратора'));
        return;
    }
    if (!_cloudReady()) {
        _toast(_t('settings.admin.backfill.project.need_cloud', '⚠️ Нужен онлайн и подключение к облаку'));
        return;
    }

    const svc = _svc();
    if (!svc || typeof svc.backfillProjectIdsOnLegacyRecords !== 'function') {
        _toast(_t('settings.admin.backfill.project.svc_missing', '❌ Сервис объектов не загружен'));
        return;
    }

    _setBusy(true);
    _setStatus('<div class="text-[10px] text-indigo-600 animate-pulse">' + _escapeHtml(_t('settings.admin.backfill.project.starting', 'Запуск backfill projectId…')) + '</div>');
    try {
        const report = await svc.backfillProjectIdsOnLegacyRecords({
            onProgress: (p) => _setStatus(_renderProgressHtml(p))
        });
        _setStatus(_renderProgressHtml(Object.assign({ phase: 'done' }, report || {})));
        _toast(_t('settings.admin.backfill.project.done_toast', '✅ Backfill projectId завершён'));
    } catch (e) {
        console.error('[project-id-backfill]', e);
        _toast(_t('settings.admin.backfill.project.error_toast', '❌ Ошибка backfill projectId'));
        _setStatus(`<div class="text-[10px] text-red-600">${_escapeHtml(e && e.message ? e.message : String(e))}</div>`);
    } finally {
        _setBusy(false);
    }
}

async function _onMerge() {
    if (!_isAdmin()) {
        _toast(_t('settings.admin.backfill.project.admin_only', '⚠️ Только для администратора'));
        return;
    }
    const rawEl = document.getElementById('project-merge-raw');
    const targetEl = document.getElementById('project-merge-target');
    const raw = rawEl ? String(rawEl.value || '').trim() : '';
    const target = targetEl ? String(targetEl.value || '').trim() : '';
    if (!raw || !target) {
        _toast(_t('settings.admin.backfill.project.merge_need_fields', 'Укажите написание и целевой объект'));
        return;
    }
    const svc = _svc();
    if (!svc || typeof svc.mergeRawNameIntoObject !== 'function') {
        _toast(_t('settings.admin.backfill.project.svc_missing', '❌ Сервис объектов не загружен'));
        return;
    }
    try {
        const res = await svc.mergeRawNameIntoObject(raw, target);
        if (!res || !res.ok) {
            _toast(_t('settings.admin.backfill.project.merge_fail', '❌ Не удалось слить: {error}', {
                error: res && res.error ? res.error : 'ошибка'
            }));
            return;
        }
        _toast(_t('settings.admin.backfill.project.merge_ok', '✅ Слито в объект. Профилей обновлено: {count}', {
            count: res.remappedProfiles || 0
        }));
        if (rawEl) rawEl.value = '';
    } catch (e) {
        console.error('[project-merge]', e);
        _toast(_t('settings.admin.backfill.project.merge_error', '❌ Ошибка слияния'));
    }
}

function _objectOptionsHtml() {
    const list = _objectList().filter(o => o && !o._deleted && !o.is_deleted);
    return list.map(o =>
        `<option value="${_escapeHtml(o.id || o.canonical_key)}">${_escapeHtml(o.display_name || o.canonical_key)}</option>`
    ).join('');
}

function _bindDelegation() {
    if (_delegationBound) return;
    _delegationBound = true;
    document.addEventListener('click', (e) => {
        const t = e.target && e.target.closest
            ? e.target.closest('[data-project-backfill-action]')
            : null;
        if (!t) return;
        const act = t.getAttribute('data-project-backfill-action');
        if (act === 'run') _onRun();
        if (act === 'merge') _onMerge();
    });
}

export function mountProjectIdBackfillUI() {
    const root = document.getElementById('project-id-backfill-root');
    if (!root) return;
    if (!_isAdmin()) {
        root.innerHTML = '';
        return;
    }
    _bindDelegation();
    root.innerHTML = `
        <div class="space-y-3 p-4">
            <div class="text-[11px] font-black text-amber-800 dark:text-amber-300 uppercase tracking-tight">${_escapeHtml(_t('settings.admin.backfill.project.title', 'Объекты · projectId'))}</div>
            <p class="text-[10px] text-[var(--text-muted)] leading-snug">
                ${_escapeHtml(_t('settings.admin.backfill.project.intro', 'Проставляет projectId (UUID узла объекта) в истории проверок / ПК СК / стройконтроле — по аналогии с contractorId. Сначала выполните SQL sql/011_add_project_id_to_legacy_tables.sql в Supabase.'))}
            </p>
            <button id="project-id-backfill-run"
                type="button"
                class="w-full sm:w-auto px-3 py-2 rounded-lg text-[10px] font-black uppercase bg-indigo-600 text-white shadow-sm active:scale-95"
                data-project-backfill-action="run">
                ${_escapeHtml(_t('settings.admin.backfill.project.run_btn', 'Заполнить projectId в истории'))}
            </button>
            <div id="project-id-backfill-status" class="min-h-[2rem]">
                <div class="text-[10px] text-[var(--text-muted)]">${_escapeHtml(_t('settings.admin.backfill.project.not_started', 'Ещё не запускалось.'))}</div>
            </div>
            <div class="border-t border-[var(--card-border)] pt-3 space-y-2">
                <div class="text-[10px] font-black text-slate-600 uppercase">${_escapeHtml(_t('settings.admin.backfill.project.merge_title', 'Слить написание в канон'))}</div>
                <p class="text-[10px] text-[var(--text-muted)] leading-snug">
                    ${_escapeHtml(_t('settings.admin.backfill.project.merge_hint', 'Например «лиговский 240» → объект «Лиговский 240»: synonym + remap привязок инженеров на UUID.'))}
                </p>
                <input id="project-merge-raw" type="text" class="input-base !text-[11px] w-full" placeholder="${_escapeHtml(_t('settings.admin.backfill.project.ph_raw', 'Написание-дубль (как у инженера)'))}">
                <select id="project-merge-target" class="input-base !text-[11px] w-full">
                    <option value="">${_escapeHtml(_t('settings.admin.backfill.project.ph_target', '— Целевой объект справочника —'))}</option>
                    ${_objectOptionsHtml()}
                </select>
                <button type="button"
                    class="px-3 py-2 rounded-lg text-[10px] font-black uppercase bg-emerald-600 text-white shadow-sm active:scale-95"
                    data-project-backfill-action="merge">
                    ${_escapeHtml(_t('settings.admin.backfill.project.merge_btn', 'Слить написание'))}
                </button>
            </div>
        </div>
    `;
}

export const ProjectIdBackfillUI = { mount: mountProjectIdBackfillUI };
