// ─── construction.state.js — Фаза 15: изолированное состояние модуля Construction
// Геттеры читают из window.ConstManager / window.ConstAcceptance / window.TransferManager
// по живой ссылке — без копирования и рассинхронизации.

const ConstructionState = {

  // ── ConstManager ─────────────────────────────────────────────────────────
  get objects()   { return window.ConstManager   ? window.ConstManager.objects   : []; },
  get buildings() { return window.ConstManager   ? window.ConstManager.buildings : []; },
  get floors()    { return window.ConstManager   ? window.ConstManager.floors    : []; },
  get defects()   { return window.ConstManager   ? window.ConstManager.defects   : []; },

  get currentObjId() { return window.ConstManager ? window.ConstManager.currentObjId : null; },
  get currentBldId() { return window.ConstManager ? window.ConstManager.currentBldId : null; },
  get currentFlrId() { return window.ConstManager ? window.ConstManager.currentFlrId : null; },

  get currentView()        { return window.ConstManager ? window.ConstManager.currentView        : 'list'; },
  get activeStatusFilters() { return window.ConstManager ? window.ConstManager.activeStatusFilters : []; },

  // ── ConstAcceptance ───────────────────────────────────────────────────────
  get requests() { return window.ConstAcceptance ? window.ConstAcceptance.requests : []; },

  // ── TransferManager ───────────────────────────────────────────────────────
  get units() { return window.TransferManager ? window.TransferManager.units : []; },

  // ── UI-состояние модуля ───────────────────────────────────────────────────
  activeSubTab: 'defects',

  // ── syncFromLegacy — копирует актуальное состояние в локальные поля ───────
  syncFromLegacy: function () {
      if (window.ConstManager) {
        this._objects            = window.ConstManager.objects            || [];
        this._buildings          = window.ConstManager.buildings          || [];
        this._floors             = window.ConstManager.floors             || [];
        this._defects            = window.ConstManager.defects            || [];
        this._currentObjId       = window.ConstManager.currentObjId       || null;
        this._currentBldId       = window.ConstManager.currentBldId       || null;
        this._currentFlrId       = window.ConstManager.currentFlrId       || null;
        this._currentView        = window.ConstManager.currentView        || 'list';
        this._activeStatusFilters = window.ConstManager.activeStatusFilters || [];
      }
      if (window.ConstAcceptance) {
        this._requests = window.ConstAcceptance.requests || [];
      }
      if (window.TransferManager) {
        this._units = window.TransferManager.units || [];
      }
    }
};

console.log('[RBI Module] construction.state loaded');

export { ConstructionState };
