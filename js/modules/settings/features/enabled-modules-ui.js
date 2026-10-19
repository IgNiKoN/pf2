/**
 * enabled-modules-ui.js
 * Admin UI: «Модули платформы» (§37.2 Block 3) — Настройки → Платформа.
 * Чистый ES-модуль: без window.* — действия через data-enabled-modules-action.
 * Persist через company.setEnabledModules → settings prefs (не multi-tenant).
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
let _saving = false;

const MODULE_OPTIONS = [
    {
        id: 'quality',
        labelKey: 'settings.platform.modules.quality',
        hintKey: 'settings.platform.modules.quality_hint',
        labelFb: 'Качество',
        hintFb: 'Модуль качества: осмотр, история, аналитика, задачи и связанные вкладки. Feature-of (СК, игра, AI) едут бандлами родителя. Тянет сквозную Базу знаний.'
    },
    {
        id: 'construction',
        labelKey: 'settings.platform.modules.construction',
        hintKey: 'settings.platform.modules.construction_hint',
        labelFb: 'Стройконтроль',
        hintFb: 'Модуль стройконтроля: дефекты, приёмка, планы. Дочерний construction-v2 и сквозная База знаний — бандлами родителя.'
    },
    {
        id: 'knowledge',
        labelKey: 'settings.platform.modules.knowledge',
        hintKey: 'settings.platform.modules.knowledge_hint',
        labelFb: 'База знаний',
        hintFb: 'Сквозной peer-модуль (Ч/л, НД, TWI, узлы). Обязателен с Качеством и Стройконтролем; можно оставить один (knowledge-only).'
    }
];

function _company() {
    return (window.RBI && window.RBI.services && window.RBI.services.company) || null;
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
    return !!(p && typeof p.isAdmin === 'function' && p.isAdmin());
}

function _escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _currentEnabled() {
    const c = _company();
    if (c && typeof c.getCompany === 'function') {
        const snap = c.getCompany();
        if (snap && Array.isArray(snap.enabledModules)) return snap.enabledModules.slice();
    }
    return ['quality', 'construction', 'knowledge'];
}

function _readCheckedIds() {
    const ids = [];
    MODULE_OPTIONS.forEach((m) => {
        const el = document.getElementById('enabled-mod-' + m.id);
        if (el && el.checked) ids.push(m.id);
    });
    // Mirror company sanitize: Q/C → force knowledge in payload
    if ((ids.indexOf('quality') >= 0 || ids.indexOf('construction') >= 0) &&
        ids.indexOf('knowledge') < 0) {
        ids.push('knowledge');
    }
    return ids;
}

function _syncKnowledgeLock() {
    const q = document.getElementById('enabled-mod-quality');
    const c = document.getElementById('enabled-mod-construction');
    const k = document.getElementById('enabled-mod-knowledge');
    if (!k) return;
    const force = !!(q && q.checked) || !!(c && c.checked);
    if (force) {
        k.checked = true;
        k.disabled = true;
        k.title = _t(
            'settings.platform.modules.knowledge_locked',
            'Обязательна вместе с Качеством или Стройконтролем'
        );
    } else {
        k.disabled = !!_saving;
        k.title = _t(
            'settings.platform.modules.knowledge_hint',
            'Сквозной peer-модуль (Ч/л, НД, TWI, узлы). Обязателен с Качеством и Стройконтролем; можно оставить один (knowledge-only).'
        );
    }
}

function _rootHtml() {
    const enabled = _currentEnabled();
    const qOn = enabled.indexOf('quality') >= 0;
    const cOn = enabled.indexOf('construction') >= 0;
    const kbForced = qOn || cOn;
    const rows = MODULE_OPTIONS.map((m) => {
        const on = m.id === 'knowledge'
            ? (kbForced || enabled.indexOf('knowledge') >= 0)
            : enabled.indexOf(m.id) >= 0;
        const label = _t(m.labelKey, m.labelFb);
        const hint = m.id === 'knowledge' && kbForced
            ? _t('settings.platform.modules.knowledge_locked', 'Обязательна вместе с Качеством или Стройконтролем')
            : _t(m.hintKey, m.hintFb || '');
        const lockKb = m.id === 'knowledge' && kbForced;
        return `<label class="flex items-start gap-3 py-2.5 border-b border-[var(--card-border)]/50 last:border-0">
            <input type="checkbox" id="enabled-mod-${_escapeHtml(m.id)}"
                class="w-4 h-4 mt-0.5 shrink-0 accent-indigo-600" ${on ? 'checked' : ''}
                title="${_escapeHtml(hint || label)}"
                ${(_saving || lockKb) ? 'disabled' : ''}>
            <span class="min-w-0">
                <span class="font-bold text-[12px] text-slate-700 dark:text-slate-200">${_escapeHtml(label)}</span>
                <span class="font-mono text-[9px] text-[var(--text-muted)] ml-1">(${_escapeHtml(m.id)})</span>
                <span class="block text-[10px] leading-snug text-[var(--text-muted)] mt-0.5">${_escapeHtml(hint)}</span>
            </span>
        </label>`;
    }).join('');

    return `
        <div class="p-4 space-y-3">
            <div class="text-[11px] text-[var(--text-muted)] leading-relaxed">
                ${_escapeHtml(_t(
                    'settings.platform.modules.intro',
                    'Включение/отключение бизнес-модулей. Настройки всегда в shell. База знаний сквозная: обязательна с Качеством и Стройконтролем; можно оставить только БЗ. Feature-of и construction-v2 — бандлами. После сохранения — hard reload.'
                ))}
            </div>
            <div class="rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] px-3" data-enabled-modules-form="1">
                ${rows}
            </div>
            <div class="flex flex-col gap-2 pt-1">
                <button type="button" data-enabled-modules-action="save"
                    class="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md active:scale-95 transition-colors ${_saving ? 'opacity-60 cursor-not-allowed' : ''}"
                    ${_saving ? 'disabled' : ''}>
                    ${_saving
                        ? _escapeHtml(_t('settings.platform.modules.saving', 'Сохранение…'))
                        : _escapeHtml(_t('settings.platform.modules.save', 'Сохранить модули'))}
                </button>
                <button type="button" data-enabled-modules-action="reset"
                    class="w-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 px-3 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest active:scale-95 ${_saving ? 'opacity-60 cursor-not-allowed' : ''}"
                    ${_saving ? 'disabled' : ''}>
                    ${_escapeHtml(_t('settings.platform.modules.reset', 'Сбросить к умолчанию (все вкл.)'))}
                </button>
                <button type="button" data-enabled-modules-action="reload"
                    class="w-full bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 px-3 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest active:scale-95">
                    ${_escapeHtml(_t('settings.platform.modules.reload', 'Обновить страницу'))}
                </button>
            </div>
        </div>
    `;
}

function _rerender() {
    const root = document.getElementById('settings-enabled-modules-root');
    if (!root) return;
    root.innerHTML = _rootHtml();
}

function _toastAfterPersist() {
    _toast(_t(
        'settings.platform.modules.saved_reload',
        '✅ Сохранено. Обновите страницу (hard reload), чтобы модули перезагрузились'
    ));
}

async function _onSave() {
    if (_saving) return;
    if (!_isAdmin()) {
        _toast(_t('settings.platform.modules.admin_only', '⚠️ Только для администратора'));
        return;
    }
    const c = _company();
    if (!c || typeof c.setEnabledModules !== 'function') {
        _toast(_t('settings.platform.modules.svc_missing', '❌ Сервис компании недоступен'));
        return;
    }
    const ids = _readCheckedIds();
    if (ids.length === 0) {
        const ok = confirm(_t(
            'settings.platform.modules.confirm_empty',
            'Платформа без бизнес-модулей (пустой shell). Продолжить?'
        ));
        if (!ok) return;
    }

    _saving = true;
    _rerender();
    try {
        const result = await c.setEnabledModules(ids);
        if (result && result.error) {
            _toast(_t('settings.platform.modules.save_error', '❌ Ошибка сохранения'));
        } else {
            _toastAfterPersist();
        }
    } catch (e) {
        console.error('[enabled-modules-ui] save', e);
        _toast(_t('settings.platform.modules.save_error', '❌ Ошибка сохранения'));
    } finally {
        _saving = false;
        _rerender();
    }
}

async function _onReset() {
    if (_saving) return;
    if (!_isAdmin()) {
        _toast(_t('settings.platform.modules.admin_only', '⚠️ Только для администратора'));
        return;
    }
    const c = _company();
    if (!c || typeof c.resetEnabledModules !== 'function') {
        _toast(_t('settings.platform.modules.svc_missing', '❌ Сервис компании недоступен'));
        return;
    }
    if (!confirm(_t(
        'settings.platform.modules.confirm_reset',
        'Сбросить каталог модулей к умолчанию (Качество, Стройконтроль и База знаний включены)?'
    ))) return;

    _saving = true;
    _rerender();
    try {
        const result = await c.resetEnabledModules();
        if (result && result.error) {
            _toast(_t('settings.platform.modules.reset_error', '❌ Ошибка сброса'));
        } else {
            _toastAfterPersist();
        }
    } catch (e) {
        console.error('[enabled-modules-ui] reset', e);
        _toast(_t('settings.platform.modules.reset_error', '❌ Ошибка сброса'));
    } finally {
        _saving = false;
        _rerender();
    }
}

function _onReload() {
    try {
        location.reload();
    } catch (_e) { /* ignore */ }
}

function bindEnabledModulesDelegation() {
    if (_delegationBound) return;
    _delegationBound = true;
    document.addEventListener('click', (e) => {
        const el = e.target && e.target.closest
            ? e.target.closest('[data-enabled-modules-action]')
            : null;
        if (!el) return;
        const action = el.dataset.enabledModulesAction;
        if (action === 'save') _onSave();
        else if (action === 'reset') _onReset();
        else if (action === 'reload') _onReload();
    }, true);
    document.addEventListener('change', (e) => {
        const t = e.target;
        if (!t || !t.id || t.id.indexOf('enabled-mod-') !== 0) return;
        if (!t.closest || !t.closest('[data-enabled-modules-form]')) return;
        _syncKnowledgeLock();
    }, true);
}

/**
 * Монтирует/обновляет UI в #settings-enabled-modules-root.
 * Секция видна только admin (isAdmin).
 */
export async function mountEnabledModulesUI() {
    bindEnabledModulesDelegation();
    const root = document.getElementById('settings-enabled-modules-root');
    if (!root) return;

    const section = document.getElementById('settings-enabled-modules-section');
    if (!_isAdmin()) {
        if (section) section.classList.add('hidden');
        root.innerHTML = '';
        return;
    }
    if (section) section.classList.remove('hidden');
    root.innerHTML = _rootHtml();
}

export const EnabledModulesUI = {
    mount: mountEnabledModulesUI
};
