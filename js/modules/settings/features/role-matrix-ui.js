/**
 * role-matrix-ui.js
 * Admin UI: «Роли и права» (§23 Блок 1) — Настройки → Платформа.
 * Чистый ES-модуль: без window.* — действия через data-role-matrix-action.
 * Ключи ролей не редактируются; меняются только флаги/label поверх DEFAULT.
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
let _selectedRole = null;
let _draft = null;
let _saving = false;

const BOOL_FIELDS = [
    { key: 'canCreate', labelKey: 'settings.admin.roles.bool.canCreate', hintKey: 'settings.admin.roles.bool.canCreate_hint', labelFb: 'Создание записей', hintFb: 'Разрешает создавать новые осмотры / проектные записи. Без флага интерфейс часто в режиме «только чтение».' },
    { key: 'canPush', labelKey: 'settings.admin.roles.bool.canPush', hintKey: 'settings.admin.roles.bool.canPush_hint', labelFb: 'Push в облако', hintFb: 'Разрешает отправлять локальные изменения в Supabase (sync push). Без флага данные остаются только на устройстве.' },
    { key: 'canDeleteOwn', labelKey: 'settings.admin.roles.bool.canDeleteOwn', hintKey: 'settings.admin.roles.bool.canDeleteOwn_hint', labelFb: 'Удаление своих', hintFb: 'Можно удалять только свои записи (автор = текущий инженер). Чужие — нельзя.' },
    { key: 'canDeleteAll', labelKey: 'settings.admin.roles.bool.canDeleteAll', hintKey: 'settings.admin.roles.bool.canDeleteAll_hint', labelFb: 'Удаление любых', hintFb: 'Можно удалять чужие записи тоже. Обычно только у админов / зам. руководителя.' },
    { key: 'canManageRoles', labelKey: 'settings.admin.roles.bool.canManageRoles', hintKey: 'settings.admin.roles.bool.canManageRoles_hint', labelFb: 'Управление ролями', hintFb: 'Доступ к этому экрану «Роли и права» и к операциям смены прав. Осторожно: снятие у своей роли может закрыть экран.' },
    { key: 'canManageObjects', labelKey: 'settings.admin.roles.bool.canManageObjects', hintKey: 'settings.admin.roles.bool.canManageObjects_hint', labelFb: 'Управление объектами', hintFb: 'Права на админ-операции со справочником объектов / привязками объектов к пользователям.' },
    { key: 'canEditKnowledgeBase', labelKey: 'settings.admin.roles.bool.canEditKnowledgeBase', hintKey: 'settings.admin.roles.bool.canEditKnowledgeBase_hint', labelFb: 'Редактирование БЗ', hintFb: 'Можно создавать и править материалы базы знаний (TWI, документы, узлы и т.п.).' },
    { key: 'canViewKnowledgeBase', labelKey: 'settings.admin.roles.bool.canViewKnowledgeBase', hintKey: 'settings.admin.roles.bool.canViewKnowledgeBase_hint', labelFb: 'Просмотр БЗ', hintFb: 'Можно открывать и читать базу знаний. Без флага раздел БЗ недоступен.' },
    { key: 'isAdmin', labelKey: 'settings.admin.roles.bool.isAdmin', hintKey: 'settings.admin.roles.bool.isAdmin_hint', labelFb: 'Админ', hintFb: 'Полный админ-доступ в клиенте: служебные блоки настроек, обход части ограничений редактирования, админ-UI.' },
    { key: 'isLeadership', labelKey: 'settings.admin.roles.bool.isLeadership', hintKey: 'settings.admin.roles.bool.isLeadership_hint', labelFb: 'Руководство', hintFb: 'Маркер руководящей роли (РП / директор / админ). Используется в UI и фильтрах «для руководства».' },
    { key: 'canManageSK', labelKey: 'settings.admin.roles.bool.canManageSK', hintKey: 'settings.admin.roles.bool.canManageSK_hint', labelFb: 'Управление СК', hintFb: 'Доступ к управлению модулем ПК СК (импорт/анализ Excel Стройконтроль), не путать со стройконтролем construction.' },
    { key: 'canManageHierarchy', labelKey: 'settings.admin.roles.bool.canManageHierarchy', hintKey: 'settings.admin.roles.bool.canManageHierarchy_hint', labelFb: 'Управление иерархией', hintFb: 'Права на иерархию объекта (корпус / этаж / локации / планы) и связанные админ-блоки справочников.' },
    { key: 'isEngineerOrAdmin', labelKey: 'settings.admin.roles.bool.isEngineerOrAdmin', hintKey: 'settings.admin.roles.bool.isEngineerOrAdmin_hint', labelFb: 'Инженер или админ', hintFb: 'Совмещённый флаг «инженер СК или админ» для экранов/кнопок, где нужен полевой или полный доступ.' },
    { key: 'canViewWeeklyPlan', labelKey: 'settings.admin.roles.bool.canViewWeeklyPlan', hintKey: 'settings.admin.roles.bool.canViewWeeklyPlan_hint', labelFb: 'Недельный план', hintFb: 'Показывает недельный план задач / план инженера. Без флага раздел скрыт.' },
    { key: 'canApproveContours', labelKey: 'settings.admin.roles.bool.canApproveContours', hintKey: 'settings.admin.roles.bool.canApproveContours_hint', labelFb: 'Утверждение объёмов (РП)', hintFb: 'Право утверждать предложенные ПТО объёмы: после утверждения фиксируется неизменяемый baseline. По умолчанию у РП, заместителя руководителя, директора и админа.' },
    { key: 'canManageWorks', labelKey: 'settings.admin.roles.bool.canManageWorks', hintKey: 'settings.admin.roles.bool.canManageWorks_hint', labelFb: 'Справочник работ (ПТО)', hintFb: 'Право вести справочник видов работ и связки названий из форм заказчика. По умолчанию у ПТО и админа.' },
    { key: 'canManageContours', labelKey: 'settings.admin.roles.bool.canManageContours', hintKey: 'settings.admin.roles.bool.canManageContours_hint', labelFb: 'Контуры объёмов (ПТО)', hintFb: 'Право вести объёмы по контурам: РД, договор, предложение, утверждено, принято заказчиком. По умолчанию у ПТО и админа.' },
    { key: 'canRecordFact', labelKey: 'settings.admin.roles.bool.canRecordFact', hintKey: 'settings.admin.roles.bool.canRecordFact_hint', labelFb: 'Факт выполнения (прораб)', hintFb: 'Право вносить факт выполнения работ по объекту и корректировать его сторно. По умолчанию у прораба, инженера и админа.' },
    { key: 'canManageNorms', labelKey: 'settings.admin.roles.bool.canManageNorms', hintKey: 'settings.admin.roles.bool.canManageNorms_hint', labelFb: 'Нормы выработки (ПТО)', hintFb: 'Право задавать и править нормы выработки для графика производства работ. По умолчанию у роли ПТО и админа.' }
];

const DATA_SCOPES = [
    { value: 'all', labelKey: 'settings.admin.roles.scope.all', hintKey: 'settings.admin.roles.scope.all_hint', labelFb: 'Все данные', hintFb: 'Видит все записи проекта без фильтра по автору / подрядчику / своим объектам.' },
    { value: 'ownProject', labelKey: 'settings.admin.roles.scope.ownProject', hintKey: 'settings.admin.roles.scope.ownProject_hint', labelFb: 'Свои проекты', hintFb: 'Только записи по объектам из assignedProjects. Если объектов нет — пусто.' },
    { value: 'ownContractor', labelKey: 'settings.admin.roles.scope.ownContractor', hintKey: 'settings.admin.roles.scope.ownContractor_hint', labelFb: 'Свой подрядчик', hintFb: 'Только записи своего подрядчика (кабинет подрядчика). Плюс фильтр по проекту, если объекты назначены.' },
    { value: 'ownProjectOrOwnRecords', labelKey: 'settings.admin.roles.scope.ownProjectOrOwnRecords', hintKey: 'settings.admin.roles.scope.ownProjectOrOwnRecords_hint', labelFb: 'Проекты или свои записи', hintFb: 'Записи своих объектов; если объектов нет — только свои записи без проекта. Типично для инженера.' },
    { value: 'none', labelKey: 'settings.admin.roles.scope.none', hintKey: 'settings.admin.roles.scope.none_hint', labelFb: 'Нет доступа', hintFb: 'Чужие данные не показываются (гость).' }
];

const MODULE_OPTIONS = [
    { id: 'quality', labelKey: 'settings.admin.roles.module.quality', hintKey: 'settings.admin.roles.module.quality_hint', labelFb: 'Качество', hintFb: 'Модуль качества: осмотр, история, аналитика, задачи и связанные вкладки.' },
    { id: 'construction', labelKey: 'settings.admin.roles.module.construction', hintKey: 'settings.admin.roles.module.construction_hint', labelFb: 'Стройконтроль', hintFb: 'Модуль стройконтроля: дефекты, приёмка, планы, кабинет подрядчика.' },
    { id: 'knowledge', labelKey: 'settings.admin.roles.module.knowledge', hintKey: 'settings.admin.roles.module.knowledge_hint', labelFb: 'База знаний', hintFb: 'Сквозной модуль базы знаний (TWI, документы, узлы). По умолчанию включён у всех ролей.' }
];

const DEFAULT_MODULES = ['quality', 'construction', 'knowledge'];

function _perm() {
    return (window.RBI && window.RBI.services && window.RBI.services.permissions) || null;
}

function _toast(msg) {
    const toastFn = window.showToast;
    if (typeof toastFn === 'function') toastFn(msg);
}

function _canManage() {
    const p = _perm();
    return !!(p && (p.isAdmin?.() || p.canManageRoles?.()));
}

function _escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _roles() {
    const p = _perm();
    if (!p || typeof p.getAllRoles !== 'function') return [];
    return p.getAllRoles() || [];
}

function _entry(roleKey) {
    const p = _perm();
    if (!p) return null;
    if (typeof p.getRoleEntry === 'function') return p.getRoleEntry(roleKey);
    return p.getPermissions(roleKey);
}

function _hasOverride(roleKey) {
    const p = _perm();
    if (!p || typeof p.getRoleOverrides !== 'function') return false;
    const o = p.getRoleOverrides() || {};
    return !!(o[roleKey] && Object.keys(o[roleKey]).length);
}

function _ensureDraft() {
    if (!_selectedRole) {
        const list = _roles();
        _selectedRole = list.length ? list[0].key : null;
    }
    if (!_selectedRole) {
        _draft = null;
        return;
    }
    const entry = _entry(_selectedRole);
    if (!entry) {
        _draft = null;
        return;
    }
    _draft = Object.assign({}, entry, {
        allowedModules: Array.isArray(entry.allowedModules) ? entry.allowedModules.slice() : DEFAULT_MODULES.slice()
    });
}

function _readFormIntoDraft() {
    if (!_draft || !_selectedRole) return;
    const labelEl = document.getElementById('role-matrix-label');
    if (labelEl) _draft.label = labelEl.value;

    const scopeEl = document.getElementById('role-matrix-datascope');
    if (scopeEl) _draft.dataScope = scopeEl.value;

    BOOL_FIELDS.forEach((f) => {
        const el = document.getElementById('role-matrix-bool-' + f.key);
        if (el) _draft[f.key] = !!el.checked;
    });

    const mods = [];
    MODULE_OPTIONS.forEach((m) => {
        const el = document.getElementById('role-matrix-mod-' + m.id);
        if (el && el.checked) mods.push(m.id);
    });
    _draft.allowedModules = mods.length ? mods : DEFAULT_MODULES.slice();
}

function _roleListHtml() {
    return _roles().map((r) => {
        const active = r.key === _selectedRole;
        const badge = _hasOverride(r.key)
            ? '<span class="text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 ml-1">' + _escapeHtml(_t('settings.admin.roles.changed', 'изм.')) + '</span>'
            : '';
        return `<button type="button"
            data-role-matrix-action="select"
            data-role-key="${_escapeHtml(r.key)}"
            class="w-full text-left px-3 py-2 rounded-lg border text-[11px] font-bold transition-colors ${
                active
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-[var(--card-bg)] text-slate-700 dark:text-slate-200 border-[var(--card-border)] hover:border-indigo-300'
            }">
            <span>${_escapeHtml(r.label || r.key)}</span>${badge}
            <div class="text-[9px] font-mono opacity-70 mt-0.5">${_escapeHtml(r.key)}</div>
        </button>`;
    }).join('');
}

function _scopeHintText(scopeValue) {
    const found = DATA_SCOPES.find((s) => s.value === scopeValue) || DATA_SCOPES[0];
    if (!found) return '';
    return _t(found.hintKey, found.hintFb || '');
}

function _formHtml() {
    if (!_draft || !_selectedRole) {
        return '<div class="text-[11px] text-[var(--text-muted)] p-3">' + _escapeHtml(_t('settings.admin.roles.empty', 'Нет ролей в матрице.')) + '</div>';
    }
    const d = _draft;
    const boolRows = BOOL_FIELDS.map((f) => {
        const label = _t(f.labelKey, f.labelFb);
        const hint = _t(f.hintKey, f.hintFb || '');
        return `
        <label class="flex items-start justify-between gap-3 py-2.5 border-b border-[var(--card-border)]/50 last:border-0">
            <span class="min-w-0">
                <span class="block text-[11px] font-bold text-slate-700 dark:text-slate-200">${_escapeHtml(label)}</span>
                <span class="block text-[10px] leading-snug text-[var(--text-muted)] mt-0.5">${_escapeHtml(hint)}</span>
            </span>
            <input type="checkbox" id="role-matrix-bool-${_escapeHtml(f.key)}"
                class="w-4 h-4 mt-0.5 shrink-0 accent-indigo-600" ${d[f.key] ? 'checked' : ''}
                title="${_escapeHtml(hint || label)}">
        </label>
    `;
    }).join('');

    const scopeOpts = DATA_SCOPES.map((s) => {
        const label = _t(s.labelKey, s.labelFb);
        return `<option value="${_escapeHtml(s.value)}" ${d.dataScope === s.value ? 'selected' : ''}>${_escapeHtml(label)}</option>`;
    }).join('');
    const scopeHint = _scopeHintText(d.dataScope);

    const modRows = MODULE_OPTIONS.map((m) => {
        const on = Array.isArray(d.allowedModules) && d.allowedModules.indexOf(m.id) >= 0;
        const label = _t(m.labelKey, m.labelFb);
        const hint = _t(m.hintKey, m.hintFb || '');
        return `<label class="flex items-start gap-2 text-[11px]">
            <input type="checkbox" id="role-matrix-mod-${_escapeHtml(m.id)}"
                class="w-4 h-4 mt-0.5 shrink-0 accent-indigo-600" ${on ? 'checked' : ''}
                title="${_escapeHtml(hint || label)}">
            <span class="min-w-0">
                <span class="font-bold text-slate-700 dark:text-slate-200">${_escapeHtml(label)}</span>
                <span class="font-mono text-[9px] text-[var(--text-muted)] ml-1">(${_escapeHtml(m.id)})</span>
                <span class="block text-[10px] leading-snug text-[var(--text-muted)] mt-0.5">${_escapeHtml(hint)}</span>
            </span>
        </label>`;
    }).join('');

    return `
        <div class="space-y-3">
            <div class="text-[10px] text-[var(--text-muted)]">
                ${_escapeHtml(_t('settings.admin.roles.key_line', 'Ключ роли: {key} (не редактируется — это техническое имя в профиле пользователя)', { key: _selectedRole }))}
            </div>
            <div>
                <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">${_escapeHtml(_t('settings.admin.roles.label', 'Подпись'))}</label>
                <input id="role-matrix-label" type="text" value="${_escapeHtml(d.label || '')}"
                    class="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[12px] text-slate-800 dark:text-white">
                <div class="text-[10px] text-[var(--text-muted)] mt-1">${_escapeHtml(_t('settings.admin.roles.label_hint', 'Человекочитаемое имя в списках (ключ роли при этом не меняется).'))}</div>
            </div>
            <div>
                <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">${_escapeHtml(_t('settings.admin.roles.data_scope', 'Область данных'))}</label>
                <select id="role-matrix-datascope"
                    class="w-full px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-[12px] text-slate-800 dark:text-white">
                    ${scopeOpts}
                </select>
                <div id="role-matrix-datascope-hint" class="text-[10px] leading-snug text-[var(--text-muted)] mt-1">${_escapeHtml(scopeHint)}</div>
            </div>
            <div>
                <div class="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">${_escapeHtml(_t('settings.admin.roles.modules', 'Модули'))}</div>
                <div class="space-y-2">${modRows}</div>
            </div>
            <div>
                <div class="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1">${_escapeHtml(_t('settings.admin.roles.flags', 'Флаги прав'))}</div>
                <div class="rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3">${boolRows}</div>
            </div>
            <div class="flex flex-col gap-2 pt-1">
                <button type="button" data-role-matrix-action="save"
                    class="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-colors ${_saving ? 'opacity-60 cursor-not-allowed' : ''}"
                    ${_saving ? 'disabled' : ''}>
                    ${_saving ? _escapeHtml(_t('settings.admin.roles.saving', 'Сохранение…')) : _escapeHtml(_t('settings.admin.roles.save', 'Сохранить роль'))}
                </button>
                <button type="button" data-role-matrix-action="reset"
                    class="w-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 px-3 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest active:scale-95 ${_saving ? 'opacity-60 cursor-not-allowed' : ''}"
                    ${_saving ? 'disabled' : ''}>
                    ${_escapeHtml(_t('settings.admin.roles.reset', 'Сбросить роль к умолчанию'))}
                </button>
            </div>
        </div>
    `;
}

function _rootHtml() {
    return `
        <div class="p-4 space-y-3">
            <div class="text-[11px] text-[var(--text-muted)] leading-relaxed">
                ${_escapeHtml(_t('settings.admin.roles.intro', 'Командная матрица ролей (синхронизируется на устройства через облако). Пустые оверрайды = права по умолчанию из кода. Ключи ролей (guest…manager) не меняются. Жёсткий RLS в базе — отдельный блок.'))}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-[11rem_1fr] gap-3">
                <div id="role-matrix-list" class="flex flex-col gap-1.5">${_roleListHtml()}</div>
                <div id="role-matrix-form">${_formHtml()}</div>
            </div>
        </div>
    `;
}

function _rerender() {
    const root = document.getElementById('settings-role-matrix-root');
    if (!root) return;
    _ensureDraft();
    root.innerHTML = _rootHtml();
}

async function _onSelect(roleKey) {
    if (!roleKey || roleKey === _selectedRole) return;
    _selectedRole = roleKey;
    _draft = null;
    _ensureDraft();
    _rerender();
}

async function _onSave() {
    if (_saving) return;
    if (!_canManage()) {
        _toast(_t('settings.admin.roles.admin_only', '⚠️ Только для администратора'));
        return;
    }
    const p = _perm();
    if (!p || typeof p.setRoleOverrides !== 'function') {
        _toast(_t('settings.admin.roles.svc_missing', '❌ Сервис прав недоступен'));
        return;
    }
    _readFormIntoDraft();
    if (!_draft || !_selectedRole) return;

    _saving = true;
    _rerender();
    try {
        const result = await p.setRoleOverrides(_selectedRole, _draft);
        if (result && result.error) {
            _toast(result.error === 'forbidden'
                ? _t('settings.admin.roles.forbidden', '⛔ Нет прав')
                : _t('settings.admin.roles.save_error', '❌ Ошибка сохранения'));
        } else {
            _toast(_t('settings.admin.roles.saved', '✅ Права роли сохранены (командная матрица)'));
            _draft = null;
            _ensureDraft();
        }
    } catch (e) {
        console.error('[role-matrix-ui] save', e);
        _toast(_t('settings.admin.roles.save_error', '❌ Ошибка сохранения'));
    } finally {
        _saving = false;
        _rerender();
    }
}

async function _onReset() {
    if (_saving) return;
    if (!_canManage()) {
        _toast(_t('settings.admin.roles.admin_only', '⚠️ Только для администратора'));
        return;
    }
    if (!_selectedRole) return;
    if (!confirm(_t('settings.admin.roles.confirm_reset', 'Сбросить права роли «{role}» к значениям по умолчанию из кода?', { role: _selectedRole }))) return;

    const p = _perm();
    if (!p || typeof p.clearRoleOverrides !== 'function') {
        _toast(_t('settings.admin.roles.svc_missing', '❌ Сервис прав недоступен'));
        return;
    }

    _saving = true;
    _rerender();
    try {
        const result = await p.clearRoleOverrides(_selectedRole);
        if (result && result.error) {
            _toast(result.error === 'forbidden'
                ? _t('settings.admin.roles.forbidden', '⛔ Нет прав')
                : _t('settings.admin.roles.reset_error', '❌ Ошибка сброса'));
        } else {
            _toast(_t('settings.admin.roles.reset_ok', '✅ Роль сброшена к умолчанию'));
            _draft = null;
            _ensureDraft();
        }
    } catch (e) {
        console.error('[role-matrix-ui] reset', e);
        _toast(_t('settings.admin.roles.reset_error', '❌ Ошибка сброса'));
    } finally {
        _saving = false;
        _rerender();
    }
}

function bindRoleMatrixDelegation() {
    if (_delegationBound) return;
    _delegationBound = true;
    document.addEventListener('click', (e) => {
        const el = e.target && e.target.closest
            ? e.target.closest('[data-role-matrix-action]')
            : null;
        if (!el) return;
        const action = el.dataset.roleMatrixAction;
        if (action === 'select') _onSelect(el.dataset.roleKey);
        else if (action === 'save') _onSave();
        else if (action === 'reset') _onReset();
    }, true);
    document.addEventListener('change', (e) => {
        const t = e.target;
        if (!t || t.id !== 'role-matrix-datascope') return;
        const hintEl = document.getElementById('role-matrix-datascope-hint');
        if (!hintEl) return;
        const found = DATA_SCOPES.find((s) => s.value === t.value);
        hintEl.textContent = found ? _t(found.hintKey, found.hintFb || '') : '';
    }, true);
}

/**
 * Монтирует/обновляет UI в #settings-role-matrix-root.
 * Секция видна только admin / canManageRoles.
 */
export async function mountRoleMatrixUI() {
    bindRoleMatrixDelegation();
    const root = document.getElementById('settings-role-matrix-root');
    if (!root) return;

    const section = document.getElementById('settings-role-matrix-section');
    if (!_canManage()) {
        if (section) section.classList.add('hidden');
        root.innerHTML = '';
        _selectedRole = null;
        _draft = null;
        return;
    }
    if (section) section.classList.remove('hidden');
    _ensureDraft();
    root.innerHTML = _rootHtml();
}

export const RoleMatrixUI = {
    mount: mountRoleMatrixUI
};
