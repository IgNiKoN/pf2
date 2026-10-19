/* Файл: js/modules/quality/features/shared/multi-filter.js */
/* Мульти-фильтры (dropdown Объект/Подрядчик/Инспектор/Вид работ) — общая логика для features quality/history и quality/analytics */

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

// === МУЛЬТИ-ФИЛЬТРЫ (ЛОГИКА МОДАЛКИ С ПРАВАМИ ДОСТУПА) ===
let _ctx = null;
function bindCtx(ctx) {
    _ctx = ctx;
    bindMultiFilterActionDelegation();
}
window.MultiFilterShared = { bindCtx: bindCtx };

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-multifilter-action).
// openMultiFilterModal(type, title, context) принимает 3 аргумента одновременно —
// передаются через один JSON-атрибут data-multifilter-action-args (не 2 отдельных
// ключа/arg2-type, как в других группах, т.к. аргументов 3, а не 2).
function bindMultiFilterActionDelegation() {
    if (window.__multiFilterActionDelegationBound) return;
    window.__multiFilterActionDelegationBound = true;

    const dispatch = (el) => {
        const action = el.dataset.multifilterAction;
        const fn = window[action];
        if (typeof fn !== 'function') return;
        const argsRaw = el.dataset.multifilterActionArgs;
        if (argsRaw) {
            let args = [];
            try { args = JSON.parse(argsRaw); } catch (e) { args = []; }
            fn.apply(null, args);
        } else {
            fn();
        }
    };

    const resolveActionElement = (target) => {
        let el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.multifilterAction) return el;
            const inlineOnclick = el.getAttribute && el.getAttribute('onclick');
            if (inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
            el = el.parentElement;
        }
        return null;
    };

    document.addEventListener('click', (e) => {
        const el = resolveActionElement(e.target);
        if (el) dispatch(el);
    }, true);
}

function _getSkRecords() {
    if (_ctx && _ctx.sk) {
        return _ctx.sk.getRecordsSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.sk) {
        return window.RBI.services.sk.getRecordsSync();
    }
    return Array.isArray(window.skRecords) ? window.skRecords : [];
}

function _getAllInspections() {
    if (_ctx && _ctx.inspections) {
        return _ctx.inspections.getAllSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.inspections) {
        return window.RBI.services.inspections.getAllSync();
    }
    return Array.isArray(window.contractorArray) ? window.contractorArray : [];
}

// Единственный источник — window.activeMultiFilters. Лексический let в ES-модуле
// расходился с window после analytics.resetAnalyticsFilters() (кнопка обновлялась,
// данные — нет). Все чтения/записи идут через getActiveMultiFilters().
function getActiveMultiFilters() {
    let af = window.activeMultiFilters;
    if (!af || typeof af !== 'object') {
        af = {
            history: { project: [], contractor: [], inspector: [], template: [] },
            analytics: { project: [], contractor: [], inspector: [], template: [] }
        };
        window.activeMultiFilters = af;
    }
    if (!af.history || typeof af.history !== 'object') {
        af.history = { project: [], contractor: [], inspector: [], template: [] };
    }
    if (!af.analytics || typeof af.analytics !== 'object') {
        af.analytics = { project: [], contractor: [], inspector: [], template: [] };
    }
    ['project', 'contractor', 'inspector'].forEach((k) => {
        if (!Array.isArray(af.history[k])) af.history[k] = [];
        if (!Array.isArray(af.analytics[k])) af.analytics[k] = [];
    });
    if (!Array.isArray(af.history.template)) af.history.template = [];
    if (!Array.isArray(af.analytics.template)) af.analytics.template = [];
    return af;
}
window.activeMultiFilters = getActiveMultiFilters();
let currentFilterContext = ''; // 'history' или 'analytics'
let currentFilterType = '';    // 'project', 'contractor' и т.д.

function _permSvc() {
    return (_ctx && _ctx.permissions)
        || (window.RBI && window.RBI.services && window.RBI.services.permissions)
        || null;
}

function _objectDirectory() {
    return (window.RBI && window.RBI.services && window.RBI.services.objects) || null;
}

function _isUuidLikeFilterVal(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

/** Display name единственного закреплённого объекта инженера (или ''). */
function _singleAssignedProjectDisplayName() {
    const permSvc = _permSvc();
    if (!permSvc) return '';
    const role = permSvc.getCurrentRole ? permSvc.getCurrentRole() : 'guest';
    const isManager = permSvc.canManageHierarchy
        ? permSvc.canManageHierarchy()
        : ['director', 'deputy_manager', 'manager'].includes(role);
    if (isManager || role === 'guest') return '';

    const assigned = typeof permSvc.getAssignedProjects === 'function'
        ? (permSvc.getAssignedProjects() || [])
        : [];
    if (!Array.isArray(assigned) || assigned.length !== 1) return '';

    const od = _objectDirectory();
    if (od && typeof od.getAssignedProjectObjects === 'function') {
        const objs = od.getAssignedProjectObjects() || [];
        if (objs.length === 1) {
            const name = String(objs[0].display_name || '').trim();
            if (name && !_isUuidLikeFilterVal(name)) return name;
        }
    }
    if (od && typeof od.getDisplayForAssignedRef === 'function') {
        const shown = String(od.getDisplayForAssignedRef(assigned[0]) || '').trim();
        if (shown && !_isUuidLikeFilterVal(shown)) return shown;
    }
    const fallback = String(assigned[0] || '').trim();
    return _isUuidLikeFilterVal(fallback) ? '' : fallback;
}

/**
 * Инженер с ровно одним закреплённым объектом: если фильтр project пуст —
 * закрепить этот объект (иначе UI/PDF пишут «Все объекты»).
 */
function ensureSingleAssignedProjectFilter() {
    const displayName = _singleAssignedProjectDisplayName();
    if (!displayName) return false;

    const af = getActiveMultiFilters();
    let changed = false;
    ['history', 'analytics'].forEach(function (ctx) {
        if (!af[ctx]) return;
        if (!Array.isArray(af[ctx].project) || af[ctx].project.length === 0) {
            af[ctx].project = [displayName];
            changed = true;
        }
    });
    return changed;
}
window.ensureSingleAssignedProjectFilter = ensureSingleAssignedProjectFilter;
window.getSingleAssignedProjectDisplayName = _singleAssignedProjectDisplayName;

const MULTI_FILTER_BTN_IDS = {
    history: {
        project: 'btn-hist-project',
        contractor: 'btn-hist-contractor',
        inspector: 'btn-hist-inspector',
        template: 'btn-hist-template'
    },
    analytics: {
        project: 'btn-ana-project',
        contractor: 'btn-ana-contractor',
        inspector: 'btn-ana-inspector',
        template: 'btn-ana-template'
    }
};

function _escapeFilterAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function _positionMultiFilterDropdown(anchorBtn) {
    const content = document.getElementById('multi-filter-modal-content');
    if (!content) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 6;
    const pad = 8;
    const maxW = Math.min(360, vw - pad * 2);
    const minW = Math.min(240, maxW);

    let width = maxW;
    let left = pad;
    let top = pad;

    if (anchorBtn) {
        const rect = anchorBtn.getBoundingClientRect();
        width = Math.max(minW, Math.min(maxW, Math.max(rect.width, 260)));
        left = Math.min(Math.max(pad, rect.left), vw - width - pad);
        const below = rect.bottom + gap;
        const above = rect.top - gap;
        const preferBelow = below + 280 < vh || below >= above;
        top = preferBelow ? below : Math.max(pad, above - Math.min(360, vh * 0.55));
        if (preferBelow && top + 200 > vh) {
            top = Math.max(pad, vh - Math.min(360, vh * 0.55) - pad);
        }
    }

    content.style.width = `${width}px`;
    content.style.left = `${left}px`;
    content.style.top = `${top}px`;
    content.style.maxHeight = `${Math.min(360, vh - top - pad)}px`;
}

function openMultiFilterModal(type, title, context) {
    const overlay = document.getElementById('multi-filter-modal-overlay');
    const content = document.getElementById('multi-filter-modal-content');
    if (!overlay || !content) return;

    // Повторный клик по той же кнопке (панель уже открыта) — закрыть, как у периода.
    if (overlay.style.display === 'block' && currentFilterType === type && currentFilterContext === context) {
        closeMultiFilterModal();
        return;
    }

    currentFilterType = type;
    currentFilterContext = context;

    document.getElementById('multi-filter-title').innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
        <span class="truncate">${_t('quality.filter.modal.title', title || 'Фильтр')}</span>
    `;
    _paintMultiFilterModalChrome();

    document.getElementById('multi-filter-search').value = '';

    // 1. ОПРЕДЕЛЯЕМ РОЛЬ И ДОСТУПЫ ПОЛЬЗОВАТЕЛЯ
    var permSvc = (_ctx && _ctx.permissions) || (window.RBI && window.RBI.services && window.RBI.services.permissions);
    const role = permSvc ? permSvc.getCurrentRole() : 'guest';
    const assignedProjects = permSvc ? permSvc.getAssignedProjects() : [];
    const isManager = permSvc ? permSvc.canManageHierarchy() : ['director', 'deputy_manager', 'manager'].includes(role);
    // dataScope роли, обязанной иметь индивидуально закреплённые объекты
    // (не 'all'/'none' — т.е. без hasNoOwnObjects): 'ownProject'/'ownProjectOrOwnRecords'/
    // 'ownContractor'. Раньше пустой assignedProjects у такой роли трактовался
    // как "фильтр не применяется" (показать все объекты компании) — согласовано
    // с filterByDataScope/push-guard, где пустой список НЕ значит "доступ ко
    // всему" (см. current_plan.md §2/§3).
    const requiresOwnObjects = permSvc ? !permSvc.hasNoOwnObjects(role) : !['guest', 'director', 'deputy_manager', 'manager'].includes(role);

    // 2. БАЗЫ ДАННЫХ (RBI и ПК СК)
    let accessibleRbi = _getAllInspections();
    let accessibleSk = _getSkRecords();

    // 3. ПРИМЕНЯЕМ ПРАВА ДОСТУПА (Если не админ — режем массивы по закрепленным объектам)
    let emptyBecauseNoAssignments = false;
    if (!isManager && role !== 'guest') {
        if (assignedProjects.length > 0) {
            accessibleRbi = accessibleRbi.filter(i => {
                if (permSvc && typeof permSvc.isRecordInAssignedProjects === 'function') {
                    return permSvc.isRecordInAssignedProjects(i, assignedProjects);
                }
                const p = i.project_canonical_key || i.project_display_name || i.projectName;
                return assignedProjects.includes(p);
            });
            accessibleSk = accessibleSk.filter(r => {
                if (permSvc && typeof permSvc.isRecordInAssignedProjects === 'function') {
                    return permSvc.isRecordInAssignedProjects(r, assignedProjects);
                }
                const p = r.project_canonical_key || r.project_display_name || r.display_name;
                return assignedProjects.includes(p);
            });
        } else if (requiresOwnObjects) {
            // Роль обязана иметь назначенные объекты, но их пока 0 — не
            // показывать полный список объектов компании (было доступно всё).
            accessibleRbi = [];
            accessibleSk = [];
            emptyBecauseNoAssignments = true;
        }
    }

    let uniqueValues = [];
    let field = '';

    // 4. КАСКАДНАЯ ФИЛЬТРАЦИЯ (Связываем Объект, Подрядчика и Инспектора)
    let filteredRbi = accessibleRbi;
    let filteredSk = accessibleSk;

    const activeMultiFilters = getActiveMultiFilters();
    if (!activeMultiFilters[context]) {
        console.warn('[multi-filter] unknown context:', context);
        return;
    }

    // Если открыт НЕ фильтр Объектов, но Объект уже выбран — сужаем базу
    if (type !== 'project' && activeMultiFilters[context].project && activeMultiFilters[context].project.length > 0) {
        const fProj = activeMultiFilters[context].project;
        filteredRbi = filteredRbi.filter(i => fProj.includes(i.project_display_name) || fProj.includes(i.project_canonical_key) || fProj.includes(i.projectName));
        filteredSk = filteredSk.filter(r => fProj.includes(r.project_display_name) || fProj.includes(r.project_canonical_key) || fProj.includes(r.display_name));
    }

    // Если открыт НЕ фильтр Подрядчиков, но Подрядчик уже выбран — сужаем базу
    if (type !== 'contractor' && activeMultiFilters[context].contractor && activeMultiFilters[context].contractor.length > 0) {
        const fContr = activeMultiFilters[context].contractor;
        filteredRbi = filteredRbi.filter(i => fContr.includes(i.contractorName));
        filteredSk = filteredSk.filter(r => fContr.includes(r.contractor_name) || fContr.includes(r.contractor));
    }

    // Если открыт НЕ фильтр Инспекторов, но Инспектор уже выбран — сужаем базу
    if (type !== 'inspector' && activeMultiFilters[context].inspector && activeMultiFilters[context].inspector.length > 0) {
        const fInsp = activeMultiFilters[context].inspector;
        filteredRbi = filteredRbi.filter(i => fInsp.includes(i.inspectorName));
        filteredSk = filteredSk.filter(r => fInsp.includes(r.issued_by) || fInsp.includes(r.inspector));
    }

    // Если открыт НЕ фильтр Видов работ, но Вид работ уже выбран — сужаем базу
    if (type !== 'template' && activeMultiFilters[context].template && activeMultiFilters[context].template.length > 0) {
        const fTmpl = activeMultiFilters[context].template;
        filteredRbi = filteredRbi.filter(i => fTmpl.includes(i.templateTitle || i.templateKey));
        filteredSk = filteredSk.filter(r => fTmpl.includes(r.category));
    }

    // 5. СОБИРАЕМ ДАННЫЕ ИЗ УЖЕ ОТФИЛЬТРОВАННОЙ БАЗЫ
    if (type === 'project') {
        const rbiProjs = filteredRbi.map(i => i.project_display_name || i.projectName || i.project_canonical_key);
        const skProjs = filteredSk.map(r => r.project_display_name || r.display_name || r.canonical_key);
        uniqueValues = [...new Set([...rbiProjs, ...skProjs].filter(Boolean))];
        // Не-менеджер: всегда показывать закреплённые объекты из справочника,
        // даже если локальных проверок/СК по ним ещё нет.
        if (!isManager && role !== 'guest') {
            const od = _objectDirectory();
            let assignedNames = [];
            if (od && typeof od.getAssignedProjectObjects === 'function') {
                assignedNames = (od.getAssignedProjectObjects() || [])
                    .map(function (o) { return String(o.display_name || '').trim(); })
                    .filter(function (name) { return name && !_isUuidLikeFilterVal(name); });
            }
            if (!assignedNames.length && od && typeof od.getDisplayForAssignedRef === 'function' && assignedProjects.length) {
                assignedNames = assignedProjects
                    .map(function (ref) { return String(od.getDisplayForAssignedRef(ref) || '').trim(); })
                    .filter(function (name) { return name && !_isUuidLikeFilterVal(name); });
            }
            if (assignedNames.length) {
                uniqueValues = [...new Set([...uniqueValues, ...assignedNames])];
            }
            // Убрать случайно попавшие UUID из списка опций
            uniqueValues = uniqueValues.filter(function (v) { return v && !_isUuidLikeFilterVal(v); });
            if (uniqueValues.length > 0) emptyBecauseNoAssignments = false;
        }
        uniqueValues.sort();
    }
    else if (type === 'contractor') {
        const rbiContrs = filteredRbi.map(i => i.contractorName);
        const skContrs = filteredSk.map(r => r.contractor_name || r.contractor);
        uniqueValues = [...new Set([...rbiContrs, ...skContrs].filter(Boolean))].sort();
    }
    else if (type === 'inspector') {
        // Берем ТОЛЬКО Инженеров по Качеству (из истории RBI аудитов), исключая инженеров СК
        const rbiEngs = filteredRbi.map(i => i.inspectorName);
        uniqueValues = [...new Set(rbiEngs.filter(name => name && name !== 'Система' && name !== 'Системная'))].sort();
    }
    else if (type === 'template') {
        // История: только RBI templateTitle (не список СК). Analytics — RBI + SK category.
        const rbiTmpls = filteredRbi.map(i => i.templateTitle);
        if (context === 'history') {
            uniqueValues = [...new Set(rbiTmpls.filter(Boolean))].sort();
        } else {
            const skTmpls = filteredSk.map(r => r.category && r.category !== 'Без категории' ? r.category : null);
            uniqueValues = [...new Set([...rbiTmpls, ...skTmpls].filter(Boolean))].sort();
        }
    }

    const currentSelected = activeMultiFilters[context][type] || [];
    const listEl = document.getElementById('multi-filter-list');

    if (uniqueValues.length === 0) {
        const emptyTitle = emptyBecauseNoAssignments
            ? _t('quality.filter.empty.no_assignments', 'Нет закреплённых объектов')
            : _t('quality.filter.empty.no_data', 'Нет данных');
        const emptyHint = emptyBecauseNoAssignments
            ? _t('quality.filter.empty.no_assignments_hint', 'Обратитесь к администратору — без назначенных объектов список фильтра пуст')
            : '';
        listEl.innerHTML = `<div class="p-8 text-center flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500"><svg class="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg><span class="text-xs font-bold uppercase tracking-wider">${emptyTitle}</span>${emptyHint ? `<span class="text-[10px] font-medium normal-case tracking-normal px-3 leading-snug">${emptyHint}</span>` : ''}</div>`;
    } else {
        // Клик по тексту — applyMultiFilterSingle (один выбор, сразу применить и закрыть).
        // Чекбокс — мультивыбор; применение по «Применить» / «Выбрать всё».
        listEl.innerHTML = uniqueValues.map(val => {
            const isChecked = currentSelected.length === 0 || currentSelected.includes(val);
            const displayVal = _escapeFilterAttr(val);
            const singleArgs = JSON.stringify([val]).replace(/'/g, '&#39;');

            return `
            <div class="filter-item-row flex items-center gap-2.5 px-2.5 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:border-indigo-300 dark:hover:border-indigo-600">
                <input type="checkbox" value="${displayVal}" class="filter-modal-cb w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0" ${isChecked ? 'checked' : ''}>
                <span class="text-[12px] font-bold text-slate-700 dark:text-slate-200 filter-item-text truncate flex-1 leading-snug cursor-pointer active:scale-[0.98] transition-transform"
                    data-multifilter-action="applyMultiFilterSingle" data-multifilter-action-args='${singleArgs}'>${displayVal}</span>
            </div>`;
        }).join('');
    }

    const btnId = (MULTI_FILTER_BTN_IDS[context] || {})[type];
    const anchorBtn = btnId ? document.getElementById(btnId) : null;
    _positionMultiFilterDropdown(anchorBtn);

    overlay.style.display = 'block';
    overlay.classList.remove('pointer-events-none');
    content.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
    requestAnimationFrame(() => {
        overlay.classList.remove('opacity-0');
        content.classList.remove('opacity-0', 'scale-95');
    });
}
window.openMultiFilterModal = openMultiFilterModal;

// === ЕДИНАЯ ФУНКЦИЯ ЗАКРЫТИЯ МУЛЬТИ-ФИЛЬТРА ===
function closeMultiFilterModal() {
    const overlay = document.getElementById('multi-filter-modal-overlay');
    const content = document.getElementById('multi-filter-modal-content');
    if (!overlay || !content) return;

    overlay.classList.add('opacity-0', 'pointer-events-none');
    content.classList.add('opacity-0', 'scale-95', 'pointer-events-none');

    setTimeout(() => {
        overlay.style.display = 'none';
        overlay.classList.remove('pointer-events-none');
    }, 150);
}
window.closeMultiFilterModal = closeMultiFilterModal;

// На мобиле быстрое переключение объектов запускает полный ререндер аналитики
// (Chart.js + canvas-превью фото) на каждый тап → UI зависает. Схлопываем
// подряд идущие apply в один отложенный вызов.
var _analyticsFilterRenderTimer = null;
function _scheduleAnalyticsRenderFromFilter() {
    // Сразу инвалидируем кэш paint: иначе при sync-defer первый apply обновляет
    // только кнопку фильтра, а flushDirtyActiveViews пропускает перерисовку
    // «живого» DOM — данные остаются нефильтрованными до второго клика.
    if (typeof window.invalidateAnalyticsFilterCache === 'function') {
        window.invalidateAnalyticsFilterCache();
    }
    if (_analyticsFilterRenderTimer) clearTimeout(_analyticsFilterRenderTimer);
    _analyticsFilterRenderTimer = setTimeout(function () {
        _analyticsFilterRenderTimer = null;
        if (typeof window.renderCurrentAnalyticsTab === 'function') {
            window.renderCurrentAnalyticsTab();
        }
    }, 400);
}
// Период/даты и мультифильтры — одна точка debounce (data-analytics-action).
window.scheduleRenderCurrentAnalyticsTab = _scheduleAnalyticsRenderFromFilter;

function filterMultiModalList() {
    const term = document.getElementById('multi-filter-search').value.toLowerCase();
    const rows = document.querySelectorAll('.filter-item-row');
    rows.forEach(row => {
        const text = row.querySelector('.filter-item-text').innerText.toLowerCase();
        row.style.display = text.includes(term) ? 'flex' : 'none';
    });
}
window.filterMultiModalList = filterMultiModalList;

function selectAllMultiFilter() {
    const checkboxes = document.querySelectorAll('.filter-modal-cb');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}
window.selectAllMultiFilter = selectAllMultiFilter;

function applyMultiFilter() {
    const checkboxes = document.querySelectorAll('.filter-modal-cb');
    const total = checkboxes.length;
    const checkedValues = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);
    const activeMultiFilters = getActiveMultiFilters();
    if (!activeMultiFilters[currentFilterContext]) return;

    // Один пункт в списке: «все выбранные» ≠ сброс — иначе инженер с 1 объектом
    // никогда не закрепит фильтр (length === total → []).
    if (total === 1 && checkedValues.length === 1) {
        activeMultiFilters[currentFilterContext][currentFilterType] = checkedValues;
    } else if (checkedValues.length === total || checkedValues.length === 0) {
        // Несколько опций: все/ничего → сброс (означает «Все»)
        activeMultiFilters[currentFilterContext][currentFilterType] = [];
    } else {
        activeMultiFilters[currentFilterContext][currentFilterType] = checkedValues;
    }

    updateFilterButtonLabels();
    closeMultiFilterModal();

    // Запускаем рендер нужной вкладки
    if (currentFilterContext === 'history') {
        window.applyHistoryFilters();
    } else {
        _scheduleAnalyticsRenderFromFilter();
    }
}
window.applyMultiFilter = applyMultiFilter;

// Клик по ТЕКСТУ строки фильтра (см. current_plan.md, блок "Мультифильтры
// неудобны"): выбирает ТОЛЬКО это значение (сбрасывает остальные), сразу
// применяет фильтр и закрывает модалку — быстрый однозначный выбор без
// отдельного нажатия «Применить». Отдельная функция от applyMultiFilter(),
// т.к. читает не DOM-чекбоксы (это же действие может быть вызвано при любом
// текущем состоянии чекбоксов), а сам переданный value.
function applyMultiFilterSingle(val) {
    const activeMultiFilters = getActiveMultiFilters();
    if (!activeMultiFilters[currentFilterContext]) return;
    activeMultiFilters[currentFilterContext][currentFilterType] = [val];

    updateFilterButtonLabels();
    closeMultiFilterModal();

    if (currentFilterContext === 'history') {
        window.applyHistoryFilters();
    } else {
        _scheduleAnalyticsRenderFromFilter();
    }
}
window.applyMultiFilterSingle = applyMultiFilterSingle;

function updateFilterButtonLabels() {
    ensureSingleAssignedProjectFilter();

    const updateBtn = (btnId, arr, defaultText) => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const textEl = btn.querySelector('.truncate');
        if (!textEl) return;
        if (arr.length === 0) {
            textEl.innerText = defaultText;
            textEl.classList.remove('text-indigo-600', 'font-black');
        } else if (arr.length === 1) {
            // Если выбран 1, показываем его имя (для шаблона придется искать имя)
            let display = arr[0];
            if (btnId.includes('template')) {
                // В фильтр кладётся templateTitle (см. openMultiFilterModal) — не key.
                const sample = _getAllInspections().find(i => i.templateTitle === arr[0] || i.templateKey === arr[0]);
                if (sample) display = sample.templateTitle || arr[0];
            }
            textEl.innerText = display;
            textEl.classList.add('text-indigo-600', 'font-black');
        } else {
            textEl.innerText = _t('quality.filter.selected_count', 'Выбрано: {n}', { n: arr.length });
            textEl.classList.add('text-indigo-600', 'font-black');
        }
    };

    const activeMultiFilters = getActiveMultiFilters();
    updateBtn('btn-hist-project', activeMultiFilters.history.project, _t('quality.filter.all_projects', 'Все объекты'));
    updateBtn('btn-hist-contractor', activeMultiFilters.history.contractor, _t('quality.filter.all_contractors', 'Все подрядчики'));
    updateBtn('btn-hist-template', activeMultiFilters.history.template, _t('quality.filter.all_templates', 'Все виды работ'));
    updateBtn('btn-hist-inspector', activeMultiFilters.history.inspector, _t('quality.filter.all_inspectors', 'Все инспекторы'));

    updateBtn('btn-ana-project', activeMultiFilters.analytics.project, _t('quality.filter.all_projects', 'Все объекты'));
    updateBtn('btn-ana-contractor', activeMultiFilters.analytics.contractor, _t('quality.filter.all_contractors', 'Все подрядчики'));
    updateBtn('btn-ana-inspector', activeMultiFilters.analytics.inspector, _t('quality.filter.all_inspectors', 'Все инспекторы'));
    updateBtn('btn-ana-template', activeMultiFilters.analytics.template, _t('quality.filter.all_templates', 'Все виды работ'));
}

// После загрузки модуля — закрепить единственный объект, если уже есть профиль.
try { ensureSingleAssignedProjectFilter(); } catch (_) { /* ignore */ }

// =========================================================================
// РАЗМЕТКА DROPDOWN «multi-filter-modal-overlay» — панель у кнопки фильтра
// (вместо полноэкранной модалки). Имена id/функций сохранены для совместимости.
// =========================================================================
(function mountMultiFilterModalOverlayMarkup() {
    if (document.getElementById('multi-filter-modal-overlay')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', `
    <div id="multi-filter-modal-overlay"
        class="fixed inset-0 z-[3000] transition-opacity duration-150 opacity-0"
        style="display:none"
        data-multifilter-action="closeMultiFilterModal">
        <div class="fixed bg-[var(--bg-main)] rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden opacity-0 scale-95 transition-all duration-150 origin-top"
            id="multi-filter-modal-content" onclick="event.stopPropagation()">

            <div
                class="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0 bg-white/90 dark:bg-slate-800/90">
                <div class="font-black text-[11px] uppercase tracking-tight text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 min-w-0"
                    id="multi-filter-title">
                    <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z">
                        </path>
                    </svg>
                    <span class="truncate">${_t('quality.filter.modal.title', 'Фильтр')}</span>
                </div>
                <div class="flex gap-2 items-center shrink-0">
                    <button type="button" data-multifilter-action="selectAllMultiFilter"
                        class="text-[9px] font-bold text-slate-500 hover:text-indigo-500 uppercase active:scale-95 transition-colors px-1">${_t('quality.filter.modal.select_all', 'Выбрать всё')}</button>
                    <button type="button" data-multifilter-action="closeMultiFilterModal"
                        class="w-7 h-7 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 active:scale-90 border border-slate-200 dark:border-slate-600">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="px-2.5 py-2 border-b border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 relative shrink-0">
                <span class="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><svg class="w-3.5 h-3.5" fill="none"
                        stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg></span>
                <input type="text" id="multi-filter-search"
                    class="input-base text-[11px] !py-2 pl-8 bg-white dark:bg-slate-900 shadow-inner"
                    placeholder="${_t('quality.filter.modal.search', 'Поиск...')}" oninput="filterMultiModalList()">
            </div>

            <div class="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1.5 bg-slate-50 dark:bg-slate-900/50 min-h-0"
                id="multi-filter-list">
            </div>

            <div
                class="p-2.5 border-t border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800/90 shrink-0">
                <button type="button" data-multifilter-action="applyMultiFilter"
                    class="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-black text-[11px] uppercase tracking-widest shadow-sm active:scale-95 transition-transform flex justify-center items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
                    </svg>
                    ${_t('quality.filter.modal.apply', 'Применить')}
                </button>
            </div>
        </div>
    </div>
`);
}());
window.updateFilterButtonLabels = updateFilterButtonLabels;

function _paintMultiFilterModalChrome() {
    var titleSpan = document.querySelector('#multi-filter-title .truncate');
    if (titleSpan) titleSpan.textContent = _t('quality.filter.modal.title', 'Фильтр');
    var selectAllBtn = document.querySelector('#multi-filter-modal-content [data-multifilter-action="selectAllMultiFilter"]');
    if (selectAllBtn) selectAllBtn.textContent = _t('quality.filter.modal.select_all', 'Выбрать всё');
    var search = document.getElementById('multi-filter-search');
    if (search) search.placeholder = _t('quality.filter.modal.search', 'Поиск...');
    var applyBtn = document.querySelector('#multi-filter-modal-content [data-multifilter-action="applyMultiFilter"]');
    if (applyBtn) {
        var applyLabel = _t('quality.filter.modal.apply', 'Применить');
        var nodes = applyBtn.childNodes;
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].nodeType === 3 && String(nodes[i].textContent || '').trim()) {
                nodes[i].textContent = ' ' + applyLabel;
                break;
            }
        }
    }
}

var _i18nBound = false;
function _bindMultiFilterI18n() {
    if (_i18nBound) return;
    _i18nBound = true;
    document.addEventListener('i18n:localeChanged', function () {
        if (typeof updateFilterButtonLabels === 'function') {
            updateFilterButtonLabels();
        }
        _paintMultiFilterModalChrome();
        var overlay = document.getElementById('multi-filter-modal-overlay');
        if (overlay && overlay.style.display === 'block' && currentFilterType && currentFilterContext) {
            var type = currentFilterType;
            var ctx = currentFilterContext;
            // Сброс type, чтобы openMultiFilterModal не сработал как toggle-close.
            currentFilterType = '';
            openMultiFilterModal(type, _t('quality.filter.modal.title', 'Фильтр'), ctx);
        }
    });
}
_bindMultiFilterI18n();
