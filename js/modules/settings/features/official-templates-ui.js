/**
 * official-templates-ui.js
 * Admin UI: «Официальные версии чек-листов» (редактор системных чек-листов,
 * Блок 1) — Настройки → Качество.
 *
 * Модель: указатель (pointer) company.service.getOfficialTemplates()
 * {systemKey: {type:'user', ref, version, updatedAt, updatedBy}} над уже
 * существующим механизмом user_templates/shared_checklists — не мутирует
 * поставку (data/system_templates*.js).
 *
 * Действия:
 *  - «Изменить» — если оверрайда нет: клонирует поставку (тот же поток, что
 *    window.cloneSystemTemplateToCustom) и открывает конструктор; при
 *    сохранении автоматически назначается официальной (v1). Если оверрайд
 *    уже есть — открывает именно его для правок (при сохранении v+1).
 *  - «Выбрать существующую копию» — назначить официальной уже существующий
 *    user_template без клонирования.
 *  - «Вернуть к стандартной версии» — снять указатель (копия не удаляется).
 *
 * Чистый ES-модуль: без собственных window.*-глобалов (кроме делегирования
 * кликов на data-атрибуты — как остальные settings-features).
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
let _busyKey = null;
/** systemKey, ожидающий назначения официальной версии после сохранения в конструкторе. */
let _pendingAssignKey = null;
let _pendingUnsubscribe = null;

function _templatesSvc() {
    return (window.RBI && window.RBI.services && window.RBI.services.templates) || null;
}

function _companySvc() {
    return (window.RBI && window.RBI.services && window.RBI.services.company) || null;
}

function _perm() {
    return (window.RBI && window.RBI.services && window.RBI.services.permissions) || null;
}

function _canManage() {
    const p = _perm();
    return !!(p && (p.isAdmin?.() || p.canManageRoles?.()));
}

function _toast(msg) {
    const toastFn = window.showToast;
    if (typeof toastFn === 'function') toastFn(msg);
}

function _escape(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _formatDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('ru');
    } catch (_e) {
        return '';
    }
}

function _systemKeys() {
    const svc = _templatesSvc();
    const sys = svc ? svc.getSystemTemplates() : {};
    return Object.keys(sys).sort(function (a, b) {
        return String(sys[a].title || a).localeCompare(String(sys[b].title || b), 'ru');
    });
}

function _rowHtml(key) {
    const svc = _templatesSvc();
    const sys = svc ? svc.getSystemTemplates() : {};
    const base = sys[key];
    if (!base) return '';
    const companySvc = _companySvc();
    const pointer = (companySvc && typeof companySvc.getOfficialTemplates === 'function')
        ? companySvc.getOfficialTemplates()[key]
        : null;
    const busy = _busyKey === key;

    let statusHtml;
    if (pointer && pointer.type === 'user') {
        statusHtml = `<span class="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
            ${_escape(_t('settings.official_templates.status_official', 'Официальная копия v{version} от {date}, {who}', {
                version: pointer.version, date: _formatDate(pointer.updatedAt), who: pointer.updatedBy || ''
            }))}
        </span>`;
    } else {
        statusHtml = `<span class="text-[10px] font-black uppercase tracking-widest text-slate-400">
            ${_escape(_t('settings.official_templates.status_shipped', 'Стандартная версия'))}
        </span>`;
    }

    return `<div class="border-b border-[var(--card-border)]/60 last:border-0 py-3 px-1 flex flex-col gap-1.5" data-official-tpl-row="${_escape(key)}">
        <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
                <div class="text-[12px] font-bold text-slate-700 dark:text-slate-200 truncate">${_escape(base.title || key)}</div>
                ${statusHtml}
            </div>
        </div>
        <div class="flex flex-wrap gap-1.5 mt-1">
            <button type="button" data-official-tpl-action="edit" data-key="${_escape(key)}"
                class="text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white active:scale-95 ${busy ? 'opacity-60 cursor-not-allowed' : ''}"
                ${busy ? 'disabled' : ''}>
                ${_escape(_t('settings.official_templates.action_edit', 'Изменить'))}
            </button>
            <button type="button" data-official-tpl-action="pick" data-key="${_escape(key)}"
                class="text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 active:scale-95 ${busy ? 'opacity-60 cursor-not-allowed' : ''}"
                ${busy ? 'disabled' : ''}>
                ${_escape(_t('settings.official_templates.action_pick_existing', 'Выбрать существующую копию'))}
            </button>
            ${pointer ? `<button type="button" data-official-tpl-action="revert" data-key="${_escape(key)}"
                class="text-[9px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 active:scale-95 ${busy ? 'opacity-60 cursor-not-allowed' : ''}"
                ${busy ? 'disabled' : ''}>
                ${_escape(_t('settings.official_templates.action_revert', 'Вернуть к стандартной версии'))}
            </button>` : ''}
        </div>
    </div>`;
}

function _listHtml() {
    const keys = _systemKeys();
    if (!keys.length) {
        return `<div class="p-4 text-[11px] text-[var(--text-muted)]">${_escape(_t('settings.official_templates.empty', 'Системных видов работ нет.'))}</div>`;
    }
    return `<div class="divide-y divide-transparent">${keys.map(_rowHtml).join('')}</div>`;
}

function _rerender() {
    const root = document.getElementById('settings-official-templates-root');
    if (!root) return;
    root.innerHTML = _listHtml();
}

/** Отписаться от ожидания сохранения конструктора (если было). */
function _clearPendingAssign() {
    _pendingAssignKey = null;
    if (_pendingUnsubscribe) {
        try { _pendingUnsubscribe(); } catch (_e) { /* ignore */ }
        _pendingUnsubscribe = null;
    }
}

/**
 * Подписаться один раз на templates:changed — когда конструктор сохранит
 * новый/изменённый user_template, назначить его официальным для systemKey.
 */
function _awaitNextTemplateSaveAndAssign(systemKey) {
    _clearPendingAssign();
    _pendingAssignKey = systemKey;
    const events = window.RBI && window.RBI.events;
    if (!events || typeof events.on !== 'function') return;
    const handler = function (payload) {
        const slug = payload && payload.slug;
        const key = _pendingAssignKey;
        _clearPendingAssign();
        if (!slug || !key || (payload && payload.deleted)) return;
        const companySvc = _companySvc();
        if (!companySvc || typeof companySvc.setOfficialTemplate !== 'function') return;
        companySvc.setOfficialTemplate(key, { type: 'user', ref: slug }).then(function (result) {
            if (result && result.error) {
                _toast(_t('settings.official_templates.assign_error', '❌ Не удалось назначить официальную версию'));
            } else {
                _toast(_t('settings.official_templates.toast_assigned', '✅ Официальная версия назначена'));
            }
            _rerender();
        });
    };
    events.on('templates:changed', handler);
    _pendingUnsubscribe = function () {
        if (typeof events.off === 'function') events.off('templates:changed', handler);
    };
}

function _onEdit(key) {
    if (!_canManage()) {
        _toast(_t('settings.official_templates.admin_only', '⚠️ Только для администратора'));
        return;
    }
    const svc = _templatesSvc();
    const companySvc = _companySvc();
    if (!svc || !companySvc) {
        _toast(_t('settings.official_templates.svc_missing', '❌ Сервис шаблонов недоступен'));
        return;
    }
    const pointer = companySvc.getOfficialTemplates()[key];
    _awaitNextTemplateSaveAndAssign(key);

    const userTpls = window.userTemplates;
    if (pointer && pointer.type === 'user' && pointer.ref && userTpls && userTpls[pointer.ref]) {
        // Продолжить правки существующей официальной копии → v+1 при сохранении.
        const editFn = window.editUserTemplate;
        if (typeof editFn === 'function') {
            editFn(pointer.ref);
        } else {
            _clearPendingAssign();
            _toast(_t('settings.official_templates.svc_missing', '❌ Сервис шаблонов недоступен'));
        }
        return;
    }

    // Нет оверрайда — клонировать поставку (тот же поток, что кнопка «Сделать
    // копию и править» в Базе знаний) и открыть конструктор → v1 при сохранении.
    let sel = document.getElementById('clone-sys-select');
    if (!sel) {
        sel = document.createElement('select');
        sel.id = 'clone-sys-select';
        sel.style.display = 'none';
        document.body.appendChild(sel);
    }
    const opt = document.createElement('option');
    opt.value = key;
    sel.innerHTML = '';
    sel.appendChild(opt);
    sel.value = key;

    const cloneFn = window.cloneSystemTemplateToCustom;
    if (typeof cloneFn === 'function') {
        cloneFn();
    } else {
        _clearPendingAssign();
        _toast(_t('settings.official_templates.svc_missing', '❌ Сервис шаблонов недоступен'));
    }
}

function _onPickExisting(key) {
    if (!_canManage()) {
        _toast(_t('settings.official_templates.admin_only', '⚠️ Только для администратора'));
        return;
    }
    const companySvc = _companySvc();
    if (!companySvc) {
        _toast(_t('settings.official_templates.svc_missing', '❌ Сервис недоступен'));
        return;
    }
    const userTplsRaw = window.userTemplates;
    const user = (userTplsRaw && typeof userTplsRaw === 'object') ? userTplsRaw : {};
    const slugs = Object.keys(user).filter(function (slug) {
        return user[slug] && !user[slug]._deleted && !user[slug].is_deleted;
    }).sort(function (a, b) {
        return String(user[a].title || a).localeCompare(String(user[b].title || b), 'ru');
    });
    if (!slugs.length) {
        _toast(_t('settings.official_templates.no_user_templates_for_pick', 'Нет пользовательских копий для выбора'));
        return;
    }
    const labels = slugs.map(function (slug, i) {
        return (i + 1) + '. ' + (user[slug].title || slug);
    }).join('\n');
    const pick = prompt(_t('settings.official_templates.prompt_pick_existing', 'Номер копии для назначения официальной:\n{labels}', { labels: labels }), '1');
    if (!pick) return;
    const idx = Number(pick) - 1;
    const chosenSlug = slugs[idx];
    if (!chosenSlug) {
        _toast(_t('settings.official_templates.invalid_number', 'Неверный номер'));
        return;
    }
    companySvc.setOfficialTemplate(key, { type: 'user', ref: chosenSlug }).then(function (result) {
        if (result && result.error) {
            _toast(_t('settings.official_templates.assign_error', '❌ Не удалось назначить официальную версию'));
        } else {
            _toast(_t('settings.official_templates.toast_assigned', '✅ Официальная версия назначена'));
        }
        _rerender();
    });
}

function _onRevert(key) {
    if (!_canManage()) {
        _toast(_t('settings.official_templates.admin_only', '⚠️ Только для администратора'));
        return;
    }
    if (!confirm(_t('settings.official_templates.confirm_revert', 'Снять официальный указатель и вернуть вид работ к стандартной версии? Сама копия не удаляется.'))) return;
    const companySvc = _companySvc();
    if (!companySvc) return;
    companySvc.clearOfficialTemplate(key).then(function (result) {
        if (result && result.error) {
            _toast(_t('settings.official_templates.revert_error', '❌ Не удалось вернуть к стандартной версии'));
        } else {
            _toast(_t('settings.official_templates.toast_reverted', '✅ Возвращено к стандартной версии'));
        }
        _rerender();
    });
}

function _bindDelegation() {
    if (_delegationBound) return;
    _delegationBound = true;
    document.addEventListener('click', function (e) {
        const el = e.target && e.target.closest ? e.target.closest('[data-official-tpl-action]') : null;
        if (!el) return;
        const action = el.getAttribute('data-official-tpl-action');
        const key = el.getAttribute('data-key');
        if (!key) return;
        if (action === 'edit') _onEdit(key);
        else if (action === 'pick') _onPickExisting(key);
        else if (action === 'revert') _onRevert(key);
    }, true);
    const events = window.RBI && window.RBI.events;
    if (events && typeof events.on === 'function') {
        events.on('company:officialTemplatesChanged', function () {
            _rerender();
        });
    }
}

/**
 * Монтирует/обновляет UI в #settings-official-templates-root.
 * Секция видна только admin / canManageRoles.
 */
export async function mountOfficialTemplatesUI() {
    _bindDelegation();
    const root = document.getElementById('settings-official-templates-root');
    const section = document.getElementById('settings-official-templates-section');
    if (!root) return;
    if (!_canManage()) {
        if (section) section.classList.add('hidden');
        root.innerHTML = '';
        return;
    }
    if (section) section.classList.remove('hidden');
    _rerender();
}

export const OfficialTemplatesUI = {
    mount: mountOfficialTemplatesUI
};
