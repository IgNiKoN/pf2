// ─── construction.render.js — Фаза 15: рендер-диспетчер модуля Construction
// Делегирует в window.constManager_* / window.constAcceptance_* / window.transferManager_*.
// При отсутствии legacy-функции — предупреждение, без исключений.

const ConstructionRender = {

  // =====================================================================
  // РАЗМЕТКА 3 ВКЛАДОК CONSTRUCTION (перенос из index.html:447-624,
  // JS-рендер). Возвращает HTML-строку 1:1 идентичную прежней статичной
  // разметке tab-construction-defects/tab-transfer/tab-construction-acceptance.
  // =====================================================================
  renderMarkup: function () {
    return `
        <div id="tab-construction-defects" class="view-section">

            <!-- Панель выбора объекта и этажа -->
            <div class="bg-[var(--card-bg)] rounded-xl p-4 shadow-sm border border-[var(--card-border)] mb-4 mt-2">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="text-[13px] font-black uppercase text-slate-800 dark:text-white tracking-tight"
                        data-i18n="construction.legacy.plan_title">Выбор плана</h2>
                    <!-- Кнопка администрирования появится здесь через JS, если роль manager -->
                    <div id="const-admin-btn-container"></div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                        <label
                            class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block"
                            data-i18n="construction.legacy.label_object">Объект</label>
                        <select id="const-object-select" class="input-base"
                            data-construction-core-action="onObjectChange" data-action-event="change">
                            <option value="" data-i18n="construction.legacy.loading_objects">Загрузка объектов...</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block"
                            data-i18n="construction.legacy.label_building">Корпус / Секция</label>
                        <select id="const-building-select" class="input-base" disabled
                            data-construction-core-action="onBuildingChange" data-action-event="change">
                            <option value="" data-i18n="construction.legacy.select_building">Выберите корпус...</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block"
                            data-i18n="construction.legacy.label_floor">Этаж</label>
                        <select id="const-floor-select" class="input-base" disabled
                            data-construction-core-action="onFloorChange" data-action-event="change">
                            <option value="" data-i18n="construction.legacy.select_floor">Выберите этаж...</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block"
                            data-i18n="construction.legacy.label_layer">Слой (Визуализация)</label>
                        <select id="const-layer-select" class="input-base"
                            data-construction-core-action="onLayerChange" data-action-event="change">
                        </select>
                    </div>
                </div>
            </div>
            <!-- НОВОЕ: Переключатель видов и фильтры -->
            <!-- НОВОЕ: Переключатель видов и фильтры -->
            <div class="flex flex-col gap-3 mb-3">
                <!-- Верхний ряд: Тумблер, Категория, Экспорт -->
                <div class="flex justify-between items-center w-full">
                    <div
                        class="flex items-center bg-slate-200 dark:bg-slate-700 p-0.5 rounded-lg shadow-inner w-auto shrink-0">
                        <button data-construction-core-action="switchView" data-action-arg="plan" id="const-btn-view-plan"
                            class="px-4 py-1.5 rounded-md text-[11px] font-black uppercase transition-all bg-white dark:bg-slate-800 text-indigo-600 shadow-sm">🗺️
                            <span data-i18n="construction.legacy.view_plan">План</span></button>
                        <button data-construction-core-action="switchView" data-action-arg="list" id="const-btn-view-list"
                            class="px-4 py-1.5 rounded-md text-[11px] font-black uppercase transition-all text-slate-500 dark:text-slate-400">📋
                            <span data-i18n="construction.legacy.view_list">Реестр</span></button>
                    </div>

                    <div class="flex gap-2">
                        <select id="const-filter-category" data-construction-core-action="applyFilters" data-action-event="change"
                            class="input-base !py-1.5 !text-[10px] font-bold min-w-[100px] hidden sm:block">
                            <option value="ALL" data-i18n="construction.legacy.cat_all">Все категории</option>
                            <option value="B3" data-i18n="construction.legacy.cat_b3">Критичные (B3)</option>
                            <option value="B2" data-i18n="construction.legacy.cat_b2">Значимые (B2)</option>
                            <option value="B1" data-i18n="construction.legacy.cat_b1">Мелкие (B1)</option>
                        </select>
                        <button data-construction-core-action="exportDefectsToExcel"
                            class="bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase active:scale-95 shadow-sm whitespace-nowrap shrink-0 flex items-center gap-1">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z">
                                </path>
                            </svg> <span data-i18n="construction.legacy.excel">Excel</span>
                        </button>
                    </div>
                </div>

                <!-- Нижний ряд: Интерактивные чипсы статусов -->
                <div id="const-status-chips-container" class="flex gap-2 overflow-x-auto no-scrollbar w-full pb-1">
                    <!-- Чипсы будут генерироваться через JavaScript -->
                </div>
            </div>
            <!-- Контейнер для отображения PDF плана -->
            <div id="const-plan-container"
                class="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl h-[65vh] flex flex-col items-center justify-center relative overflow-hidden">
                <div class="text-center text-slate-400" id="const-plan-placeholder">
                    <svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7">
                        </path>
                    </svg>
                    <div class="text-xs font-bold uppercase tracking-widest" data-i18n="construction.legacy.plan_placeholder">Выберите план для просмотра</div>
                </div>

                <!-- Сюда JS будет вставлять холст с PDF -->
                <div id="const-pdf-render-area" class="absolute inset-0 w-full h-full hidden overflow-auto touch-none">
                </div>
            </div>
            <!-- НОВОЕ: Контейнер для Реестра дефектов (Скрыт по умолчанию) -->
            <div id="const-list-container" class="hidden pb-8 space-y-3">
                <!-- Сюда JS будет рендерить карточки дефектов -->
            </div>
        </div>
        <!-- === ВКЛАДКА: СТРОЙКОНТРОЛЬ - ШАХМАТКА (ПОМЕЩЕНИЯ) === -->
        <!-- === ВКЛАДКА: ПЕРЕДАЧА КВАРТИР === -->
        <div id="tab-transfer" class="view-section">
            <div class="bg-[var(--card-bg)] rounded-xl p-4 shadow-sm border border-[var(--card-border)] mb-4 mt-2">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="text-[13px] font-black uppercase text-slate-800 dark:text-white tracking-tight"
                        data-i18n="construction.legacy.transfer_title">Шахматка объекта</h2>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label
                            class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block"
                            data-i18n="construction.legacy.label_object">Объект</label>
                        <select id="transfer-object-select" class="input-base"
                            data-transfer-action="onObjectChange" data-action-event="change">
                            <option value="" data-i18n="construction.legacy.loading_objects">Загрузка объектов...</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-[var(--text-muted)] uppercase mb-1 block"
                            data-i18n="construction.legacy.label_building">Корпус / Секция</label>
                        <select id="transfer-building-select" class="input-base" disabled
                            data-transfer-action="onBuildingChange" data-action-event="change">
                            <option value="" data-i18n="construction.legacy.select_building">Выберите корпус...</option>
                        </select>
                    </div>
                </div>
            </div>

            <div id="transfer-grid-container" class="pb-8">
                <div
                    class="text-center py-10 text-slate-400 text-[11px] font-bold uppercase tracking-widest bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700"
                    data-i18n="construction.legacy.transfer_empty">
                    Выберите корпус для просмотра шахматки</div>
            </div>
        </div>

        <!-- === ВКЛАДКА: СТРОЙКОНТРОЛЬ - ПРИЁМКА РАБОТ === -->
        <div id="tab-construction-acceptance" class="view-section">
            <div class="bg-[var(--card-bg)] rounded-xl p-4 shadow-sm border border-[var(--card-border)] mb-4 mt-2">
                <div class="flex justify-between items-center mb-3">
                    <h2
                        class="text-[13px] font-black uppercase text-slate-800 dark:text-white tracking-tight flex items-center gap-1.5">
                        <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round"
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4">
                            </path>
                        </svg>
                        <span data-i18n="construction.legacy.acceptance_title">Журнал заявок</span>
                    </h2>
                    <button data-acceptance-action="openNewRequestModal"
                        class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg shadow-md active:scale-95 text-[10px] font-black uppercase whitespace-nowrap flex items-center gap-1 transition-transform">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path>
                        </svg> <span data-i18n="construction.legacy.acceptance_present">Предъявить</span>
                    </button>
                </div>
                <!-- НОВЫЙ ФИЛЬТР ПО ОБЪЕКТУ -->
                <div class="mb-2">
                    <select id="acc-global-obj-filter"
                        class="input-base !py-1.5 text-[11px] font-bold bg-[var(--hover-bg)]"
                        data-acceptance-action="renderList" data-action-event="change">
                        <option value="ALL" data-i18n="construction.legacy.acceptance_all_objects">Все объекты</option>
                    </select>
                </div>
            </div>

            <div id="acceptance-list-container" class="pb-8">
                <div
                    class="text-center py-10 text-slate-400 text-[11px] font-bold uppercase tracking-widest bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700"
                    data-i18n="construction.legacy.acceptance_loading">
                    Загрузка данных...</div>
            </div>
        </div>
`;
  },

  render: function (subTab) {
    var tab = subTab || (window.ConstructionState ? window.ConstructionState.activeSubTab : 'defects');

    if (tab === 'defects') {
      if (typeof constManager_renderDefectsList === 'function') {
        constManager_renderDefectsList();
      } else {
        console.warn('[ConstructionRender] constManager_renderDefectsList не найдена');
      }
    } else if (tab === 'acceptance') {
      if (typeof constAcceptance_renderList === 'function') {
        constAcceptance_renderList();
      } else {
        console.warn('[ConstructionRender] constAcceptance_renderList не найдена');
      }
    } else if (tab === 'transfer') {
      if (typeof transferManager_renderGrid === 'function') {
        transferManager_renderGrid();
      } else {
        console.warn('[ConstructionRender] transferManager_renderGrid не найдена');
      }
    }
  },

  renderSelectors: function () {
    if (typeof constManager_renderSelectors === 'function') {
      constManager_renderSelectors();
    } else {
      console.warn('[ConstructionRender] constManager_renderSelectors не найдена');
    }
  },

  renderAdminPanel: function () {
    if (typeof constManager_renderAdminPanel === 'function') {
      constManager_renderAdminPanel();
    } else {
      console.warn('[ConstructionRender] constManager_renderAdminPanel не найдена');
    }
  }
};

console.log('[RBI Module] construction.render loaded');

// =========================================================================
// МОНТАЖ РАЗМЕТКИ 3 ВКЛАДОК CONSTRUCTION (перенос из index.html:447-624).
// По прецеденту предыдущих 5 блоков (audit/engineer/analytics/reference/
// settings) — на верхнем уровне модуля, до DOMContentLoaded. Grep
// подтвердил отсутствие top-level bootstrap:*-подписок в js/modules/construction/**
// (см. current_plan.md) — тайминг здесь не критичен, паттерн сохранён для
// консистентности.
// =========================================================================
(function mountConstructionMarkup() {
  if (typeof window.rbiEnsureTabMarkup === 'function' && typeof ConstructionRender !== 'undefined') {
    var html = function () { return ConstructionRender.renderMarkup(); };
    window.rbiEnsureTabMarkup('tab-construction-defects', html, '#const-object-select');
    window.rbiEnsureTabMarkup('tab-transfer', html, '#transfer-object-select');
    window.rbiEnsureTabMarkup('tab-construction-acceptance', html, '#acceptance-list-container');
    return;
  }
  if (document.getElementById('tab-construction-defects')) return;
  var root = window.RBI && window.RBI.services && window.RBI.services.shell
    ? window.RBI.services.shell.getContentRoot()
    : document.getElementById('app-content');
  if (!root) return;
  root.insertAdjacentHTML('beforeend', ConstructionRender.renderMarkup());
}());

window.ensureConstructionMarkup = function (tabId) {
  var id = tabId || 'tab-construction-defects';
  var markers = {
    'tab-construction-defects': '#const-object-select',
    'tab-transfer': '#transfer-object-select',
    'tab-construction-acceptance': '#acceptance-list-container'
  };
  if (typeof window.rbiEnsureTabMarkup === 'function') {
    return window.rbiEnsureTabMarkup(id, function () {
      return ConstructionRender.renderMarkup();
    }, markers[id] || null);
  }
  return !!document.getElementById(id);
};

console.log('[ConstructionRender] construction.render.js markup mounted');

// ─── Перенесено из construction.legacy.js (удалён) ─────────────────────────
// module-scope прокси рендер-методов (формируют/вставляют HTML).
// Не копирует логику из constructionManager.js/transferManager.js — оригиналы
// не изменены. Остальные (CRUD/навигация/фильтры/lifecycle) — в construction.actions.js.
var _origCM = window.ConstManager    ? Object.assign({}, window.ConstManager)    : null;
var _origCA = window.ConstAcceptance ? Object.assign({}, window.ConstAcceptance) : null;
var _origTM = window.TransferManager ? Object.assign({}, window.TransferManager) : null;

if (_origCM) {
  var constManager_renderAdminPanel       = function () { return _origCM.renderAdminPanel.apply(window.ConstManager, arguments); };
  var constManager_renderSelectors        = function () { return _origCM.renderSelectors.apply(window.ConstManager, arguments); };
  var constManager_updateBuildingSelector = function () { return _origCM.updateBuildingSelector.apply(window.ConstManager, arguments); };
  var constManager_updateFloorSelector    = function () { return _origCM.updateFloorSelector.apply(window.ConstManager, arguments); };
  var constManager_renderDefectsList      = function () { return _origCM.renderDefectsList.apply(window.ConstManager, arguments); };
  var constManager_updateStatusChips      = function () { return _origCM.updateStatusChips && _origCM.updateStatusChips.apply(window.ConstManager, arguments); };
} else {
  console.warn('[construction.render] window.ConstManager не найден — прокси не установлены');
}

if (_origCA) {
  var constAcceptance_renderList = function () { return _origCA.renderList.apply(window.ConstAcceptance, arguments); };
} else {
  console.warn('[construction.render] window.ConstAcceptance не найден — прокси не установлены');
}

if (_origTM) {
  var transferManager_renderSelectors        = function () { return _origTM.renderSelectors.apply(window.TransferManager, arguments); };
  var transferManager_updateBuildingSelector = function () { return _origTM.updateBuildingSelector.apply(window.TransferManager, arguments); };
  var transferManager_renderGrid             = function () { return _origTM.renderGrid.apply(window.TransferManager, arguments); };
} else {
  console.warn('[construction.render] window.TransferManager не найден — прокси не установлены');
}

console.log('[construction.render] module-scope прокси (рендер) установлены');

export { ConstructionRender };
