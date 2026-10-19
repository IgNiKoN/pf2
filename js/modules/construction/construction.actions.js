// ─── construction.actions.js — Фаза 15: бизнес-действия модуля Construction
// Делегирует в window.ConstManager / window.ConstAcceptance / window.TransferManager.
// Эмитит кастомные события через window.RBI.events.

function emit(name, detail) {
    try {
      var events = ConstructionActions._ctx && ConstructionActions._ctx.events;
      if (events && typeof events.emit === 'function') {
        events.emit(name, detail || {});
      }
      document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (e) {
      console.warn('[ConstructionActions] emit error:', e);
    }
  }

function _storage() {
  if (ConstructionActions._ctx && ConstructionActions._ctx.storage) {
    return ConstructionActions._ctx.storage;
  }
  if (window.RBI && window.RBI.services && window.RBI.services.storage) {
    return window.RBI.services.storage;
  }
  return {
    stores: function () { return typeof STORES !== 'undefined' ? STORES : {}; },
    get: function (store, key) { return dbGet(store, key); },
    getAll: function (store) { return dbGetAll(store); },
    put: function (store, data) { return dbPut(store, data); },
    delete: function (store, key) { return dbDelete(store, key); }
  };
}

const ConstructionActions = {

    _ctx: null,
    bindCtx: function (ctx) { this._ctx = ctx; },

    init: function () {
      if (window.ConstManager && typeof window.ConstManager.init === 'function') {
        window.ConstManager.init();
      }
      if (window.ConstructionState && typeof window.ConstructionState.syncFromLegacy === 'function') {
        window.ConstructionState.syncFromLegacy();
      }
      emit('construction:initialized');
    },

    initAcceptance: function () {
      if (window.ConstAcceptance && typeof window.ConstAcceptance.init === 'function') {
        window.ConstAcceptance.init();
      }
    },

    initTransfer: function () {
      if (window.TransferManager && typeof window.TransferManager.init === 'function') {
        window.TransferManager.init();
      }
    },

    handleDefectsCreated: function (defects) {
      if (!window.ConstManager || !Array.isArray(defects) || defects.length === 0) return;
      var cm = window.ConstManager;
      defects.forEach(function (def) {
        if (!def) return;

        // Координаты с planPin осмотра (если переданы)
        var x = Number(def.x);
        var y = Number(def.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          x = 50;
          y = 50;
        }
        def.x = x;
        def.y = y;

        // floorId: явный → resolve из locationFloorId/planPin → текущий этаж СК
        var floorId = def.floorId || null;
        if (floorId && cm.floors && !cm.floors.some(function (f) { return String(f.id) === String(floorId); })) {
          // Возможно это id этажа из locations
          if (typeof cm.resolveFloorIdFromLocation === 'function') {
            floorId = cm.resolveFloorIdFromLocation(floorId) || floorId;
          }
        }
        if (!floorId && def.locationFloorId && typeof cm.resolveFloorIdFromLocation === 'function') {
          floorId = cm.resolveFloorIdFromLocation(def.locationFloorId);
        }
        if (!floorId && cm.currentFlrId) {
          floorId = cm.currentFlrId;
        }
        def.floorId = floorId || null;

        // Не плодим дубликаты по id
        var exists = (cm.defects || []).some(function (d) { return d && d.id === def.id; });
        if (!exists) {
          cm.defects.push(def);
        } else {
          var idx = cm.defects.findIndex(function (d) { return d && d.id === def.id; });
          if (idx !== -1) cm.defects[idx] = Object.assign({}, cm.defects[idx], def);
        }
        if (_storage().stores().CONST_DEFECTS) {
          _storage().put(_storage().stores().CONST_DEFECTS, def);
        }
      });
      if (typeof showToast === 'function') {
        showToast(`🏗️ В реестр Стройконтроля автоматически добавлено ${defects.length} дефектов!`);
      }
      if (cm.currentView === 'list' && typeof cm.renderDefectsList === 'function') {
        cm.renderDefectsList();
      } else if (cm.currentFlrId && window.ConstDefectForm && typeof window.ConstDefectForm.renderAllPins === 'function') {
        window.ConstDefectForm.renderAllPins(cm.currentFlrId, cm.getPinFilters ? cm.getPinFilters() : {});
      }
      if (typeof cm.updateStatusChips === 'function') cm.updateStatusChips();
    },

    handleAcceptanceStatusChanged: function (requestId, status) {
      if (!window.ConstAcceptance || !requestId) return;
      var req = window.ConstAcceptance.requests.find(function (r) { return r.id === requestId; });
      if (!req) return;
      req.status = status;
      if (_storage().stores().CONST_ACCEPTANCE) {
        _storage().put(_storage().stores().CONST_ACCEPTANCE, req);
      }
      if (typeof window.ConstAcceptance.renderList === 'function') {
        window.ConstAcceptance.renderList();
      }
    },

    handleDefectFixSaved: function (detail) {
      detail = detail || {};
      var defect = window.ConstManager && window.ConstManager.defects
        ? window.ConstManager.defects.find(function (d) { return d.id === detail.defectId; })
        : null;
      if (defect && window.ConstDefectForm) {
        window.ConstDefectForm.applyStatusChange(defect, 'fixed', detail.userName, detail.comment, detail.photoRef);
      }
    },

    applyFilters: function () {
      if (typeof constManager_applyFilters === 'function') {
        constManager_applyFilters();
        emit('construction:state:changed', { action: 'filters' });
      }
    },

    switchView: function (view) {
      if (typeof constManager_switchView === 'function') {
        constManager_switchView(view);
        emit('construction:state:changed', { action: 'switchView', view: view });
      }
    },

    exportToExcel: function () {
      if (typeof constManager_exportDefectsToExcel === 'function') {
        constManager_exportDefectsToExcel();
      }
    }
};

console.log('[RBI Module] construction.actions loaded');

// ─── Перенесено из construction.legacy.js (удалён) ─────────────────────────
// Регистрация constManager/constAcceptance/transferManager в RBI.registry +
// module-scope прокси действий (CRUD/навигация/фильтры/экспорт/lifecycle).
// Не копирует логику из constructionManager.js/transferManager.js — оригиналы
// не изменены. Рендер-прокси (HTML-формирующие методы) — в construction.render.js.
if (window.RBI && window.RBI.registry) {
  if (window.ConstManager) {
    window.RBI.registry.register('constManager', window.ConstManager);
  }
  if (window.ConstAcceptance) {
    window.RBI.registry.register('constAcceptance', window.ConstAcceptance);
  }
  if (window.TransferManager) {
    window.RBI.registry.register('transferManager', window.TransferManager);
  }
}

var _origCM = window.ConstManager    ? Object.assign({}, window.ConstManager)    : null;
var _origCA = window.ConstAcceptance ? Object.assign({}, window.ConstAcceptance) : null;
var _origTM = window.TransferManager ? Object.assign({}, window.TransferManager) : null;

if (_origCM) {
  var constManager_init                 = function ()      { return _origCM.init.apply(window.ConstManager, arguments); };
  var constManager_onObjectChange       = function ()      { return _origCM.onObjectChange.apply(window.ConstManager, arguments); };
  var constManager_onBuildingChange     = function ()      { return _origCM.onBuildingChange.apply(window.ConstManager, arguments); };
  var constManager_onFloorChange        = function ()      { return _origCM.onFloorChange.apply(window.ConstManager, arguments); };
  var constManager_onLayerChange        = function ()      { return _origCM.onLayerChange.apply(window.ConstManager, arguments); };
  var constManager_clearPdfView         = function ()      { return _origCM.clearPdfView.apply(window.ConstManager, arguments); };
  var constManager_loadPdfForFloor      = function (flrId) { return _origCM.loadPdfForFloor.apply(window.ConstManager, arguments); };
  var constManager_switchView           = function (view)  { return _origCM.switchView.apply(window.ConstManager, arguments); };
  var constManager_applyFilters         = function ()      { return _origCM.applyFilters.apply(window.ConstManager, arguments); };
  var constManager_exportDefectsToExcel = function ()      { return _origCM.exportDefectsToExcel.apply(window.ConstManager, arguments); };
} else {
  console.warn('[construction.actions] window.ConstManager не найден — прокси не установлены');
}

if (_origCA) {
  var constAcceptance_init               = function ()             { return _origCA.init.apply(window.ConstAcceptance, arguments); };
  var constAcceptance_filter              = function (st, el)       { return _origCA.filter.apply(window.ConstAcceptance, arguments); };
  var constAcceptance_openNewRequestModal = function (flId, zi, rc) { return _origCA.openNewRequestModal.apply(window.ConstAcceptance, arguments); };
  var constAcceptance_onObjChange         = function (id, pre)      { return _origCA.onObjChange.apply(window.ConstAcceptance, arguments); };
  var constAcceptance_onBldChange         = function (id, pre)      { return _origCA.onBldChange.apply(window.ConstAcceptance, arguments); };
  var constAcceptance_goDrawZone          = function ()             { return _origCA.goDrawZone.apply(window.ConstAcceptance, arguments); };
  var constAcceptance_saveNewRequest      = function ()             { return _origCA.saveNewRequest.apply(window.ConstAcceptance, arguments); };
  var constAcceptance_openRequestDetails  = function (id)           { return _origCA.openRequestDetails.apply(window.ConstAcceptance, arguments); };
  var constAcceptance_changeStatus        = function (id, st)       { return _origCA.changeStatus.apply(window.ConstAcceptance, arguments); };
  var constAcceptance_deleteRequest       = function (id)           { return _origCA.deleteRequest.apply(window.ConstAcceptance, arguments); };
  var constAcceptance_focusOnZone         = function (id)           { return _origCA.focusOnZone.apply(window.ConstAcceptance, arguments); };
  var constAcceptance_startInspection     = function (id)           { return _origCA.startInspection.apply(window.ConstAcceptance, arguments); };
} else {
  console.warn('[construction.actions] window.ConstAcceptance не найден — прокси не установлены');
}

if (_origTM) {
  var transferManager_init             = function () { return _origTM.init.apply(window.TransferManager, arguments); };
  var transferManager_onObjectChange   = function () { return _origTM.onObjectChange.apply(window.TransferManager, arguments); };
  var transferManager_onBuildingChange = function () { return _origTM.onBuildingChange.apply(window.TransferManager, arguments); };
  var transferManager_generateDemoGrid = function () { return _origTM.generateDemoGrid.apply(window.TransferManager, arguments); };
} else {
  console.warn('[construction.actions] window.TransferManager не найден — прокси не установлены');
}

console.log('[construction.actions] module-scope прокси (действия) установлены; constManager/constAcceptance/transferManager зарегистрированы в RBI.registry');

// ─── Перенесено из construction.legacy.js (Блок 15) — fallback-заглушка module.construction ───
// Перезатирается реальным ConstructionModule из construction.module.js при его загрузке.
if (window.RBI && window.RBI.registry && !window.RBI.registry.has('module.construction')) {
  window.RBI.registry.register('module.construction', {
    id: 'construction',
    _isLegacyStub: true,
    routes: ['/construction', '/construction/:subTab'],
    dependencies: ['storage'],
    init() {},
    mount() {},
    unmount() {}
  });
}

export { ConstructionActions };
