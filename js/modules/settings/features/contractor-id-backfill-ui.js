/**
 * contractor-id-backfill-ui.js
 * Admin UI: backfill contractorId в истории legacy-таблиц (Настройки → Миграция данных).
 * Чистый ES-модуль: без window.* — действия через data-contractor-backfill-action.
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

function _svc() {
    return (window.RBI && window.RBI.services && window.RBI.services.contractors) || null;
}

function _perm() {
    return (window.RBI && window.RBI.services && window.RBI.services.permissions) || null;
}

function _toast(msg) {
    const toastFn = window.showToast;
    if (typeof toastFn === 'function') toastFn(msg);
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
    return _t('settings.admin.backfill.contractor.counters',
        'обновлено {updated} · уже было {already} · пропущено {skipped} · ошибок {errors}',
        {
            updated: x.updated || 0,
            already: x.already || 0,
            skipped: x.skipped || 0,
            errors: x.errors || 0
        });
}

function _phaseLabel(progress) {
    const phase = progress && progress.phase || '';
    if (phase === 'done') return _t('settings.admin.backfill.contractor.done', 'Готово');
    if (!phase) return '';
    return _t('settings.admin.backfill.contractor.in_progress', 'В процессе: {phase}{table}', {
        phase: phase,
        table: progress.table ? ' / ' + progress.table : ''
    });
}

function _renderProgressHtml(progress) {
    if (!progress) {
        return '<div class="text-[10px] text-[var(--text-muted)]" data-backfill-idle>' + _escapeHtml(_t('settings.admin.backfill.contractor.not_started', 'Ещё не запускалось.')) + '</div>';
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
    const totalsLine = _t('settings.admin.backfill.contractor.totals', 'Итого: {counters}', { counters: _formatCounters(totals) });

    return `
        <div class="space-y-2">
            <div class="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">${_escapeHtml(phaseLabel)}</div>
            <div class="text-[11px] font-bold text-slate-800 dark:text-white">${_escapeHtml(totalsLine)}</div>
            <div class="rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] p-2">${rows || '<div class="text-[10px] text-[var(--text-muted)]">' + _escapeHtml(_t('settings.admin.backfill.contractor.no_data', 'Нет данных')) + '</div>'}</div>
            ${progress.cloudAvailable === false ? '<div class="text-[10px] text-amber-600">' + _escapeHtml(_t('settings.admin.backfill.contractor.cloud_local_only', 'Облако недоступно — обработаны только локальные записи.')) + '</div>' : ''}
        </div>
    `;
}

function _setStatus(html) {
    const el = document.getElementById('contractor-id-backfill-status');
    if (el) el.innerHTML = html;
}

function _setBusy(busy) {
    _running = !!busy;
    const btn = document.getElementById('contractor-id-backfill-run');
    if (btn) {
        btn.disabled = !!busy;
        btn.textContent = busy
            ? _t('settings.admin.backfill.contractor.busy', 'Выполняется…')
            : _t('settings.admin.backfill.contractor.run_btn', 'Заполнить contractorId в истории');
        btn.classList.toggle('opacity-60', !!busy);
        btn.classList.toggle('cursor-not-allowed', !!busy);
    }
}

async function _onRun() {
    if (_running) return;
    if (!_isAdmin()) {
        _toast(_t('settings.admin.backfill.contractor.admin_only', '⚠️ Только для администратора'));
        return;
    }
    if (!_cloudReady()) {
        _toast(_t('settings.admin.backfill.contractor.need_cloud', '⚠️ Нужен онлайн и подключение к облаку'));
        return;
    }

    const svc = _svc();
    if (!svc || typeof svc.backfillContractorIdsOnLegacyRecords !== 'function') {
        _toast(_t('settings.admin.backfill.contractor.svc_missing', '❌ Сервис contractors недоступен'));
        return;
    }

    _setBusy(true);
    _setStatus(_renderProgressHtml({ phase: 'start', totals: {}, tables: {}, cloudAvailable: true }));

    try {
        const report = await svc.backfillContractorIdsOnLegacyRecords({
            batchSize: 50,
            onProgress: (p) => _setStatus(_renderProgressHtml(p))
        });
        _setStatus(_renderProgressHtml(Object.assign({}, report, { phase: 'done' })));
        const t = report && report.totals ? report.totals : {};
        _toast(_t('settings.admin.backfill.contractor.done_toast', '✅ Backfill: обновлено {updated}, пропущено {skipped}', {
            updated: t.updated || 0,
            skipped: t.skipped || 0
        }));
    } catch (e) {
        console.error('[contractor-id-backfill]', e);
        _setStatus('<div class="text-[11px] text-red-600">' + _escapeHtml(_t('settings.admin.backfill.contractor.error_prefix', 'Ошибка: {msg}', { msg: e && e.message ? e.message : String(e) })) + '</div>');
        _toast(_t('settings.admin.backfill.contractor.error_toast', '❌ Ошибка backfill contractorId'));
    } finally {
        _setBusy(false);
    }
}

function bindContractorIdBackfillDelegation() {
    if (_delegationBound) return;
    _delegationBound = true;
    document.addEventListener('click', (e) => {
        const el = e.target && e.target.closest
            ? e.target.closest('[data-contractor-backfill-action]')
            : null;
        if (!el) return;
        const action = el.dataset.contractorBackfillAction;
        if (action === 'run') _onRun();
    }, true);
}

function _rootHtml() {
    return `
        <div class="p-4 space-y-3">
            <div class="text-[11px] text-[var(--text-muted)] leading-relaxed">
                ${_escapeHtml(_t('settings.admin.backfill.contractor.intro', 'Дописывает UUID contractorId в историю осмотров, ПК СК, дефектов и приёмки (локально и в облаке). Имя подрядчика, даты и автор не меняются. Повторный запуск безопасен: уже заполненные строки пропускаются, без карточки / pending — в «пропущено».'))}
            </div>
            <button id="contractor-id-backfill-run"
                type="button"
                data-contractor-backfill-action="run"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-colors">
                ${_escapeHtml(_t('settings.admin.backfill.contractor.run_btn', 'Заполнить contractorId в истории'))}
            </button>
            <div id="contractor-id-backfill-status" class="min-h-[2rem]">
                <div class="text-[10px] text-[var(--text-muted)]" data-backfill-idle>${_escapeHtml(_t('settings.admin.backfill.contractor.not_started', 'Ещё не запускалось.'))}</div>
            </div>
        </div>
    `;
}

/**
 * Монтирует/обновляет UI в #contractor-id-backfill-root.
 */
export async function mountContractorIdBackfillUI() {
    bindContractorIdBackfillDelegation();
    const root = document.getElementById('contractor-id-backfill-root');
    if (!root) return;

    const section = document.getElementById('contractor-id-backfill-section');
    if (!_isAdmin()) {
        if (section) section.classList.add('hidden');
        root.innerHTML = '';
        return;
    }
    if (section) section.classList.remove('hidden');

    const prevStatus = document.getElementById('contractor-id-backfill-status');
    const keepStatus = prevStatus ? prevStatus.innerHTML : '';
    root.innerHTML = _rootHtml();
    if (keepStatus && !keepStatus.includes('data-backfill-idle')) {
        const statusEl = document.getElementById('contractor-id-backfill-status');
        if (statusEl) statusEl.innerHTML = keepStatus;
    }
    if (_running) _setBusy(true);
}

export const ContractorIdBackfillUI = {
    mount: mountContractorIdBackfillUI
};
