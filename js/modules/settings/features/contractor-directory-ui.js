/**
 * contractor-directory-ui.js
 * UI списка/карточки единого справочника подрядчиков (Настройки).
 * Чистый ES-модуль: без window.* — действия через data-contractor-dir-action.
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

function _escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _canView() {
    const p = _perm();
    if (!p) return false;
    return !!(p.isAdmin?.() || p.canManageHierarchy?.());
}

function _canEdit() {
    const p = _perm();
    return !!(p && p.isAdmin?.());
}

function _makeKeyFromName(name) {
    const svc = _svc();
    if (svc && typeof svc.makeCanonicalKey === 'function') {
        return svc.makeCanonicalKey(name);
    }
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-zа-я0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '') || 'unknown_contractor';
}

function _listContractors() {
    const svc = _svc();
    const list = svc && typeof svc.list === 'function' ? (svc.list() || []) : [];
    return list
        .filter(c => c && !c.is_deleted && !c._deleted)
        .slice()
        .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || ''), 'ru'));
}

function _aliasNamesFor(canonicalKey) {
    const svc = _svc();
    const aliases = svc && typeof svc.aliases === 'function' ? (svc.aliases() || {}) : {};
    return Object.keys(aliases).filter(k => aliases[k] === canonicalKey);
}

function _listContracts(contractorId) {
    const svc = _svc();
    if (!svc || typeof svc.listContracts !== 'function') return [];
    return svc.listContracts(contractorId) || [];
}

const _LEGAL_FIELDS = [
    ['legal_name', 'settings.admin.contractors.legal_name', 'Юр. название'],
    ['legal_form', 'settings.admin.contractors.legal_form', 'ОГРН / ОГРНИП'],
    ['legal_address', 'settings.admin.contractors.legal_address', 'Юр. адрес'],
    ['contact_person', 'settings.admin.contractors.contact_person', 'Контактное лицо'],
    ['contact_phone', 'settings.admin.contractors.contact_phone', 'Телефон'],
    ['contact_email', 'settings.admin.contractors.contact_email', 'Email']
];

function _legalLabel(key, fallback) {
    return _t(key, fallback);
}

function _legalFieldsHtml(c, canEdit) {
    if (!canEdit) {
        const rows = _LEGAL_FIELDS.map(([fieldKey, labelKey, labelFallback]) => {
            const val = c[fieldKey] || '—';
            const label = _legalLabel(labelKey, labelFallback);
            return `<div class="text-[9px]"><span class="font-bold text-slate-500 uppercase">${_escapeHtml(label)}:</span> <span class="text-slate-700 dark:text-slate-300">${_escapeHtml(val)}</span></div>`;
        }).join('');
        return `<div class="mt-2 space-y-1 border-t border-slate-100 dark:border-slate-700 pt-2">${rows}</div>`;
    }
    return `
        <div class="mt-2 space-y-1.5 border-t border-slate-100 dark:border-slate-700 pt-2">
            <div class="text-[8px] font-bold text-slate-500 uppercase">${_escapeHtml(_t('settings.admin.contractors.legal_section', 'Юридические данные'))}</div>
            ${_LEGAL_FIELDS.map(([fieldKey, labelKey, labelFallback]) => {
                const label = _legalLabel(labelKey, labelFallback);
                return `
                <input type="text" data-contractor-dir-field="${fieldKey}" data-contractor-id="${_escapeHtml(c.id)}"
                    class="input-base !py-1.5 text-[10px]" value="${_escapeHtml(c[fieldKey] || '')}" placeholder="${_escapeHtml(label)}">`;
            }).join('')}
        </div>`;
}

function _contractsHtml(c, canEdit) {
    const contracts = _listContracts(c.id);
    const list = contracts.length
        ? contracts.map(ct => {
            const meta = [
                ct.contract_number || _t('settings.admin.contractors.no_number', 'без номера'),
                ct.contract_date || '—',
                ct.work_type || '—',
                ct.status || '—'
            ].join(' · ');
            const edit = canEdit ? `
                <div class="flex flex-wrap gap-1 mt-1">
                    <input type="text" data-contract-field="contract_number" data-contract-id="${_escapeHtml(ct.id)}" class="input-base !py-1 text-[9px] w-28" value="${_escapeHtml(ct.contract_number || '')}" placeholder="${_escapeHtml(_t('settings.admin.contractors.ph_number', 'Номер'))}">
                    <input type="date" data-contract-field="contract_date" data-contract-id="${_escapeHtml(ct.id)}" class="input-base !py-1 text-[9px] w-32" value="${_escapeHtml(ct.contract_date || '')}">
                    <input type="text" data-contract-field="work_type" data-contract-id="${_escapeHtml(ct.id)}" class="input-base !py-1 text-[9px] flex-1 min-w-[6rem]" value="${_escapeHtml(ct.work_type || '')}" placeholder="${_escapeHtml(_t('settings.admin.contractors.ph_work', 'Вид работ'))}">
                    <input type="text" data-contract-field="status" data-contract-id="${_escapeHtml(ct.id)}" class="input-base !py-1 text-[9px] w-24" value="${_escapeHtml(ct.status || '')}" placeholder="${_escapeHtml(_t('settings.admin.contractors.ph_status', 'Статус'))}">
                    <button type="button" data-contractor-dir-action="save-contract" data-contract-id="${_escapeHtml(ct.id)}" data-contractor-id="${_escapeHtml(c.id)}" class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded text-[8px] font-black uppercase">${_escapeHtml(_t('settings.admin.contractors.save', 'Сохранить'))}</button>
                    <button type="button" data-contractor-dir-action="delete-contract" data-contract-id="${_escapeHtml(ct.id)}" data-contractor-id="${_escapeHtml(c.id)}" class="bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded text-[8px] font-black uppercase">${_escapeHtml(_t('settings.admin.contractors.delete', 'Удалить'))}</button>
                </div>` : `<div class="text-[9px] text-slate-600 dark:text-slate-300">${_escapeHtml(meta)}</div>`;
            return `<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 mb-1">${edit || `<div class="text-[9px]">${_escapeHtml(meta)}</div>`}</div>`;
        }).join('')
        : '<div class="text-[9px] italic text-slate-400">' + _escapeHtml(_t('settings.admin.contractors.no_contracts', 'Договоров нет')) + '</div>';

    const create = canEdit ? `
        <div class="flex flex-wrap gap-1 mt-2 pt-2 border-t border-dashed border-slate-200 dark:border-slate-600">
            <input type="text" data-contract-new="number" data-contractor-id="${_escapeHtml(c.id)}" class="input-base !py-1 text-[9px] w-28" placeholder="${_escapeHtml(_t('settings.admin.contractors.ph_contract_number', 'Номер договора'))}">
            <input type="date" data-contract-new="date" data-contractor-id="${_escapeHtml(c.id)}" class="input-base !py-1 text-[9px] w-32">
            <input type="text" data-contract-new="work" data-contractor-id="${_escapeHtml(c.id)}" class="input-base !py-1 text-[9px] flex-1 min-w-[6rem]" placeholder="${_escapeHtml(_t('settings.admin.contractors.ph_work', 'Вид работ'))}">
            <input type="text" data-contract-new="status" data-contractor-id="${_escapeHtml(c.id)}" class="input-base !py-1 text-[9px] w-24" value="active" placeholder="${_escapeHtml(_t('settings.admin.contractors.ph_status', 'Статус'))}">
            <button type="button" data-contractor-dir-action="add-contract" data-contractor-id="${_escapeHtml(c.id)}" class="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded text-[8px] font-black uppercase border border-blue-200">${_escapeHtml(_t('settings.admin.contractors.add_contract', '+ Договор'))}</button>
        </div>` : '';

    return `
        <div class="mt-2 border-t border-slate-100 dark:border-slate-700 pt-2">
            <div class="text-[8px] font-bold text-slate-500 uppercase mb-1">${_escapeHtml(_t('settings.admin.contractors.contracts_title', 'Договоры ({count})', { count: contracts.length }))}</div>
            ${list}
            ${create}
        </div>`;
}

function _renderListHtml(canEdit) {
    const items = _listContractors();
    if (!items.length) {
        return `<div class="text-center py-6 text-slate-400 text-[10px] font-bold uppercase tracking-widest border border-dashed border-slate-300 rounded-xl bg-white dark:bg-slate-800">${_escapeHtml(_t('settings.admin.contractors.empty', 'Справочник пуст'))}</div>`;
    }

    return items.map(c => {
        const aliases = _aliasNamesFor(c.canonical_key);
        const aliasTags = aliases.length
            ? aliases.map(a => `<span class="bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 text-[9px] mr-1 mb-1 inline-block">${_escapeHtml(a)}</span>`).join('')
            : '<span class="text-[9px] italic text-slate-400">' + _escapeHtml(_t('settings.admin.contractors.no_aliases', 'Нет синонимов')) + '</span>';
        const sync = c.syncStatus || c.sync_status || '';
        const editBlock = canEdit ? `
            <div class="space-y-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <input type="text" data-contractor-dir-field="display" data-contractor-id="${_escapeHtml(c.id)}" class="input-base !py-1.5 text-[10px]" value="${_escapeHtml(c.display_name)}" placeholder="${_escapeHtml(_t('settings.admin.contractors.ph_name', 'Название'))}">
                <input type="text" data-contractor-dir-field="inn" data-contractor-id="${_escapeHtml(c.id)}" class="input-base !py-1.5 text-[10px]" value="${_escapeHtml(c.inn || '')}" placeholder="${_escapeHtml(_t('settings.admin.contractors.ph_inn', 'ИНН (опционально)'))}">
                <div class="flex gap-1.5">
                    <input type="text" data-contractor-dir-field="alias" data-contractor-id="${_escapeHtml(c.id)}" class="input-base !py-1.5 text-[10px] flex-1" placeholder="${_escapeHtml(_t('settings.admin.contractors.ph_alias', 'Новый синоним'))}">
                    <button type="button" data-contractor-dir-action="add-alias" data-contractor-id="${_escapeHtml(c.id)}" class="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase border border-blue-200 dark:border-blue-800 active:scale-95 shrink-0">${_escapeHtml(_t('settings.admin.contractors.add_alias', '+ Синоним'))}</button>
                </div>
                ${_legalFieldsHtml(c, true)}
                ${_contractsHtml(c, true)}
                <div class="flex gap-2">
                    <button type="button" data-contractor-dir-action="save" data-contractor-id="${_escapeHtml(c.id)}" class="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-[10px] font-black uppercase active:scale-95">${_escapeHtml(_t('settings.admin.contractors.save', 'Сохранить'))}</button>
                    <button type="button" data-contractor-dir-action="delete" data-contractor-id="${_escapeHtml(c.id)}" class="flex-1 bg-red-50 text-red-600 border border-red-200 py-2 rounded-lg text-[10px] font-black uppercase active:scale-95">${_escapeHtml(_t('settings.admin.contractors.delete', 'Удалить'))}</button>
                </div>
            </div>` : `
            ${_legalFieldsHtml(c, false)}
            ${_contractsHtml(c, false)}`;

        return `
        <details class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl mb-2 shadow-sm group [&_summary::-webkit-details-marker]:hidden">
            <summary class="p-2 sm:p-3 cursor-pointer flex justify-between items-center transition-colors select-none group-open:border-b border-[var(--card-border)] hover:bg-[var(--hover-bg)] rounded-xl group-open:rounded-b-none">
                <div class="min-w-0 pr-2">
                    <div class="font-black text-[11px] sm:text-[12px] text-slate-800 dark:text-white uppercase truncate">${_escapeHtml(c.display_name)}</div>
                    <div class="text-[8px] font-mono text-slate-400 mt-1 truncate">${_escapeHtml(_t('settings.admin.contractors.card_meta', 'key: {key} · sync: {sync} · синонимов: {aliases} · договоров: {contracts}', {
                        key: c.canonical_key,
                        sync: sync || '—',
                        aliases: aliases.length,
                        contracts: _listContracts(c.id).length
                    }))}</div>
                </div>
                <span class="shrink-0 text-slate-400 transition-transform group-open:rotate-180">▼</span>
            </summary>
            <div class="p-3 bg-[var(--hover-bg)] rounded-b-xl">
                <div class="text-[8px] font-bold text-slate-500 uppercase mb-1">${_escapeHtml(_t('settings.admin.contractors.aliases_title', 'Синонимы / алиасы'))}</div>
                <div class="flex flex-wrap gap-1 mb-1">${aliasTags}</div>
                <div class="text-[8px] font-mono text-slate-400 break-all">id: ${_escapeHtml(c.id)}</div>
                ${editBlock}
            </div>
        </details>`;
    }).join('');
}

function _renderRootHtml() {
    if (!_canView()) {
        return `<div class="p-4 text-[10px] text-slate-500 font-bold">${_escapeHtml(_t('settings.admin.contractors.denied', 'Справочник подрядчиков доступен руководителям и администраторам.'))}</div>`;
    }
    const canEdit = _canEdit();
    const findDupsBtn = canEdit ? `
        <div class="flex justify-end mb-2">
            <button type="button" data-contractor-dir-action="find-dups" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase active:scale-95 shadow-md flex items-center gap-1">${_escapeHtml(_t('settings.admin.contractors.find_dups', '🤖 Поиск дублей'))}</button>
        </div>` : '';
    const createBlock = canEdit ? `
        <div class="flex flex-col sm:flex-row gap-2 mb-3">
            <input type="text" id="contractor-dir-new-name" class="input-base !py-2 text-[10px] bg-white dark:bg-slate-800 flex-1" placeholder="${_escapeHtml(_t('settings.admin.contractors.ph_new_name', 'Новый подрядчик (напр: ООО Каменный город)'))}">
            <input type="text" id="contractor-dir-new-key" class="input-base !py-2 text-[10px] bg-white dark:bg-slate-800 sm:w-48" placeholder="${_escapeHtml(_t('settings.admin.contractors.ph_new_key', 'Ключ (авто)'))}">
            <button type="button" data-contractor-dir-action="create" class="bg-indigo-600 text-white px-3 py-2 rounded-lg text-[9px] font-black uppercase shadow-sm active:scale-95 shrink-0">${_escapeHtml(_t('settings.admin.contractors.create', 'Создать'))}</button>
        </div>` : `<div class="mb-3 text-[9px] text-slate-500 font-bold">${_escapeHtml(_t('settings.admin.contractors.view_only', 'Режим просмотра (создание/правка — только admin).'))}</div>`;

    return `
        <div class="p-3 bg-[var(--hover-bg)] rounded-b-xl">
            <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 rounded-xl mb-3 text-[10px] text-blue-800 dark:text-blue-300 leading-relaxed">
                ${_escapeHtml(_t('settings.admin.contractors.intro', 'Канонические карточки подрядчиков проекта. Стабильный UUID id используется для будущего dual-write осмотров. Сейчас осмотры по-прежнему пишут строковое имя / canonical_key. Юр.поля и договоры уходят в облачные contractors / contracts.'))}
            </div>
            ${findDupsBtn}
            ${createBlock}
            <div id="contractor-directory-list" class="max-h-[50vh] overflow-y-auto custom-scrollbar">
                ${_renderListHtml(canEdit)}
            </div>
        </div>`;
}

async function _refresh(root) {
    if (!root) return;
    root.innerHTML = _renderRootHtml();
}

async function _ensureInit() {
    const svc = _svc();
    if (svc && typeof svc.init === 'function') {
        await svc.init();
    }
}

async function _onCreate() {
    if (!_canEdit()) return _toast(_t('settings.admin.contractors.need_admin', '⚠️ Нет прав (нужен admin)'));
    const nameEl = document.getElementById('contractor-dir-new-name');
    const keyEl = document.getElementById('contractor-dir-new-key');
    const displayName = String(nameEl && nameEl.value || '').trim();
    if (!displayName) return _toast(_t('settings.admin.contractors.need_name', '⚠️ Укажите название'));
    let canonicalKey = String(keyEl && keyEl.value || '').trim();
    if (!canonicalKey) canonicalKey = _makeKeyFromName(displayName);

    try {
        const svc = _svc();
        await svc.create({ display_name: displayName, canonical_key: canonicalKey });
        _toast(_t('settings.admin.contractors.toast_created', '✅ Подрядчик создан'));
        const root = document.getElementById('contractor-directory-root');
        await _ensureInit();
        await _refresh(root);
    } catch (e) {
        console.error('[ContractorDirectoryUI] create:', e);
        _toast('❌ ' + (e && e.message ? e.message : _t('settings.admin.contractors.create_fail', 'Не удалось создать')));
    }
}

function _readLegalPatch(root, id) {
    const patch = {};
    const keys = ['legal_name', 'legal_form', 'legal_address', 'contact_person', 'contact_phone', 'contact_email'];
    for (const key of keys) {
        const el = root.querySelector(`[data-contractor-dir-field="${key}"][data-contractor-id="${id}"]`);
        if (el) patch[key] = String(el.value || '').trim();
    }
    return patch;
}

async function _onSave(id) {
    if (!_canEdit()) return _toast(_t('settings.admin.contractors.need_admin', '⚠️ Нет прав (нужен admin)'));
    const root = document.getElementById('contractor-directory-root');
    if (!root) return;
    const displayEl = root.querySelector(`[data-contractor-dir-field="display"][data-contractor-id="${id}"]`);
    const innEl = root.querySelector(`[data-contractor-dir-field="inn"][data-contractor-id="${id}"]`);
    try {
        await _svc().update(id, {
            display_name: String(displayEl && displayEl.value || '').trim(),
            inn: String(innEl && innEl.value || '').trim(),
            ..._readLegalPatch(root, id)
        });
        _toast(_t('settings.admin.contractors.toast_saved', '✅ Сохранено'));
        await _ensureInit();
        await _refresh(root);
    } catch (e) {
        console.error('[ContractorDirectoryUI] update:', e);
        _toast('❌ ' + (e && e.message ? e.message : _t('settings.admin.contractors.save_fail', 'Не удалось сохранить')));
    }
}

async function _onAddAlias(id) {
    if (!_canEdit()) return _toast(_t('settings.admin.contractors.need_admin', '⚠️ Нет прав (нужен admin)'));
    const root = document.getElementById('contractor-directory-root');
    const input = root && root.querySelector(`[data-contractor-dir-field="alias"][data-contractor-id="${id}"]`);
    const raw = String(input && input.value || '').trim();
    if (!raw) return _toast(_t('settings.admin.contractors.need_alias', '⚠️ Укажите синоним'));
    const card = _svc().getById(id);
    if (!card) return _toast(_t('settings.admin.contractors.card_missing', '⚠️ Карточка не найдена'));
    try {
        const synonyms = Array.isArray(card.synonyms) ? card.synonyms.slice() : [];
        if (!synonyms.some(s => String(s).toLowerCase() === raw.toLowerCase())) {
            synonyms.push(raw);
        }
        await _svc().update(id, { synonyms });
        _toast(_t('settings.admin.contractors.alias_added', '✅ Синоним добавлен'));
        await _ensureInit();
        await _refresh(root);
    } catch (e) {
        console.error('[ContractorDirectoryUI] alias:', e);
        _toast(_t('settings.admin.contractors.alias_fail', '❌ Не удалось добавить синоним'));
    }
}

async function _onDelete(id) {
    if (!_canEdit()) return _toast(_t('settings.admin.contractors.need_admin', '⚠️ Нет прав (нужен admin)'));
    if (!confirm(_t('settings.admin.contractors.confirm_delete', 'Удалить подрядчика из справочника? История проверок не удалится. Договоры будут удалены мягко.'))) return;
    try {
        await _svc().softDelete(id);
        _toast(_t('settings.admin.contractors.toast_deleted', '🗑️ Подрядчик удалён'));
        const root = document.getElementById('contractor-directory-root');
        await _ensureInit();
        await _refresh(root);
    } catch (e) {
        console.error('[ContractorDirectoryUI] softDelete:', e);
        _toast(_t('settings.admin.contractors.delete_fail', '❌ Не удалось удалить'));
    }
}

async function _onAddContract(contractorId) {
    if (!_canEdit()) return _toast(_t('settings.admin.contractors.need_admin', '⚠️ Нет прав (нужен admin)'));
    const root = document.getElementById('contractor-directory-root');
    if (!root) return;
    const numEl = root.querySelector(`[data-contract-new="number"][data-contractor-id="${contractorId}"]`);
    const dateEl = root.querySelector(`[data-contract-new="date"][data-contractor-id="${contractorId}"]`);
    const workEl = root.querySelector(`[data-contract-new="work"][data-contractor-id="${contractorId}"]`);
    const statusEl = root.querySelector(`[data-contract-new="status"][data-contractor-id="${contractorId}"]`);
    try {
        await _svc().createContract({
            contractorId,
            contract_number: String(numEl && numEl.value || '').trim(),
            contract_date: String(dateEl && dateEl.value || '').trim(),
            work_type: String(workEl && workEl.value || '').trim(),
            status: String(statusEl && statusEl.value || 'active').trim() || 'active'
        });
        _toast(_t('settings.admin.contractors.contract_added', '✅ Договор добавлен'));
        await _ensureInit();
        await _refresh(root);
    } catch (e) {
        console.error('[ContractorDirectoryUI] createContract:', e);
        _toast('❌ ' + (e && e.message ? e.message : _t('settings.admin.contractors.contract_add_fail', 'Не удалось добавить договор')));
    }
}

async function _onSaveContract(contractId) {
    if (!_canEdit()) return _toast(_t('settings.admin.contractors.need_admin', '⚠️ Нет прав (нужен admin)'));
    const root = document.getElementById('contractor-directory-root');
    if (!root) return;
    const numEl = root.querySelector(`[data-contract-field="contract_number"][data-contract-id="${contractId}"]`);
    const dateEl = root.querySelector(`[data-contract-field="contract_date"][data-contract-id="${contractId}"]`);
    const workEl = root.querySelector(`[data-contract-field="work_type"][data-contract-id="${contractId}"]`);
    const statusEl = root.querySelector(`[data-contract-field="status"][data-contract-id="${contractId}"]`);
    try {
        await _svc().updateContract(contractId, {
            contract_number: String(numEl && numEl.value || '').trim(),
            contract_date: String(dateEl && dateEl.value || '').trim(),
            work_type: String(workEl && workEl.value || '').trim(),
            status: String(statusEl && statusEl.value || '').trim()
        });
        _toast(_t('settings.admin.contractors.contract_saved', '✅ Договор сохранён'));
        await _ensureInit();
        await _refresh(root);
    } catch (e) {
        console.error('[ContractorDirectoryUI] updateContract:', e);
        _toast(_t('settings.admin.contractors.contract_save_fail', '❌ Не удалось сохранить договор'));
    }
}

function _onFindDuplicates() {
    if (!_canEdit()) return _toast(_t('settings.admin.contractors.need_admin', '⚠️ Нет прав (нужен admin)'));
    const findFn = window.gameFindContractorDuplicates;
    if (typeof findFn !== 'function') {
        _toast(_t('settings.admin.contractors.dups_svc_missing', '❌ Функция поиска дублей недоступна'));
        return;
    }
    findFn();
}

async function _onDeleteContract(contractId) {
    if (!_canEdit()) return _toast(_t('settings.admin.contractors.need_admin', '⚠️ Нет прав (нужен admin)'));
    if (!confirm(_t('settings.admin.contractors.confirm_delete_contract', 'Удалить договор?'))) return;
    try {
        await _svc().softDeleteContract(contractId);
        _toast(_t('settings.admin.contractors.contract_deleted', '🗑️ Договор удалён'));
        const root = document.getElementById('contractor-directory-root');
        await _ensureInit();
        await _refresh(root);
    } catch (e) {
        console.error('[ContractorDirectoryUI] softDeleteContract:', e);
        _toast(_t('settings.admin.contractors.contract_delete_fail', '❌ Не удалось удалить договор'));
    }
}

function bindContractorDirectoryDelegation() {
    if (_delegationBound) return;
    _delegationBound = true;

    document.addEventListener('click', (e) => {
        let el = e.target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.contractorDirAction) break;
            el = el.parentElement;
        }
        if (!el || !el.dataset) return;
        const action = el.dataset.contractorDirAction;
        const id = el.dataset.contractorId;
        const contractId = el.dataset.contractId;
        if (action === 'create') { e.preventDefault(); _onCreate(); }
        else if (action === 'find-dups') { e.preventDefault(); _onFindDuplicates(); }
        else if (action === 'save' && id) { e.preventDefault(); _onSave(id); }
        else if (action === 'add-alias' && id) { e.preventDefault(); _onAddAlias(id); }
        else if (action === 'delete' && id) { e.preventDefault(); _onDelete(id); }
        else if (action === 'add-contract' && id) { e.preventDefault(); _onAddContract(id); }
        else if (action === 'save-contract' && contractId) { e.preventDefault(); _onSaveContract(contractId); }
        else if (action === 'delete-contract' && contractId) { e.preventDefault(); _onDeleteContract(contractId); }
    }, true);
}

/**
 * Монтирует/обновляет UI в #contractor-directory-root.
 */
export async function mountContractorDirectoryUI() {
    bindContractorDirectoryDelegation();
    const root = document.getElementById('contractor-directory-root');
    if (!root) return;
    if (!_canView()) {
        const section = document.getElementById('contractor-directory-section');
        if (section) section.classList.add('hidden');
        return;
    }
    const section = document.getElementById('contractor-directory-section');
    if (section) section.classList.remove('hidden');
    await _ensureInit();
    await _refresh(root);
}

export const ContractorDirectoryUI = {
    mount: mountContractorDirectoryUI
};
