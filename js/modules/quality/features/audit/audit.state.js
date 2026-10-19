// ─── audit.state.js — Фаза 14: изолированное состояние сеанса аудита ───────────
// Читает window.state / window.details / window.photos по ссылке (не копирует).
// Сеттеры мутируют существующие объекты и синхронизируют window.* для обратной
// совместимости с app.js и export.js.

(function () {
  'use strict';

  // Единая точка доступа к SessionService: приоритет AuditState._ctx.session →
  // window.RBI.services.session → bare window.* (тот же паттерн, что во всех
  // файлах «части 1» изоляции модулей).
  function _session() {
    if (AuditState._ctx && AuditState._ctx.session) return AuditState._ctx.session;
    if (window.RBI && window.RBI.services && window.RBI.services.session) return window.RBI.services.session;
    return null;
  }

  // Владение auditOriginalData (Реальная изоляция модулей, часть 3, Группа A):
  // перенесено 1:1 из js/core/bootstrap.js — AuditState теперь единственный
  // владелец объявления, window.auditOriginalData остаётся синхронизированной
  // живой ссылкой для обратной совместимости с audit.render.js/game.actions.js.
  var _auditOriginalData = null;
  window.auditOriginalData = _auditOriginalData;

  // Pin на PDF-плане этажа (Q-pin-1): { locationId, x, y } | null
  var _planPin = null;

  var AuditState = {
    _ctx: null,
    bindCtx: function (ctx) { this._ctx = ctx; },

    get auditOriginalData() { return window.auditOriginalData; },
    setAuditOriginalData: function (val) {
      _auditOriginalData = val;
      window.auditOriginalData = _auditOriginalData;
    },

    // Прямые ссылки на объекты, объявленные в app.js (строки 4–6).
    // Не создаём новые объекты — читаем из window.* после инициализации.
    get state() { var s = _session(); return s ? s.getState() : window.state; },
    get details() { var s = _session(); return s ? s.getDetails() : window.details; },
    get photos() { var s = _session(); return s ? s.getPhotos() : window.photos; },
    get currentTemplateKey() { var s = _session(); return s ? s.getTemplateKey() : window.currentTemplateKey; },
    get currentChecklist() { var s = _session(); return s ? s.getChecklist() : window.currentChecklist; },
    get inspectorName() { return window.inspectorName; },
    get contractorName() { return window.contractorName; },
    get location() { return window.location_ !== undefined ? window.location_ : window.location; },
    get isDirty() { return window.isDirty; },

    get planPin() { return _planPin; },
    getPlanPin: function () { return _planPin; },
    setPlanPin: function (pin) {
      if (!pin || pin.locationId == null) {
        _planPin = null;
        return;
      }
      var x = Number(pin.x);
      var y = Number(pin.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        _planPin = null;
        return;
      }
      _planPin = {
        locationId: String(pin.locationId),
        x: x,
        y: y
      };
    },
    clearPlanPin: function () { _planPin = null; },
    restorePlanPin: function (pin) {
      this.setPlanPin(pin || null);
    },

    setState: function (key, val) {
      var s = _session();
      if (s) { s.setState(key, val); return; }
      if (window.state && typeof window.state === 'object') {
        window.state[key] = val;
      }
    },

    setDetail: function (key, val) {
      var s = _session();
      if (s) { s.setDetail(key, val); return; }
      if (window.details && typeof window.details === 'object') {
        window.details[key] = val;
      }
    },

    setPhoto: function (key, src) {
      var s = _session();
      if (s) { s.addPhoto(key, src); return; }
      if (window.photos && typeof window.photos === 'object') {
        if (!window.photos[key]) window.photos[key] = [];
        window.photos[key].push(src);
      }
    },

    removePhoto: function (key, index) {
      var s = _session();
      if (s) { s.removePhoto(key, index); return; }
      if (window.photos && window.photos[key]) {
        window.photos[key].splice(index, 1);
      }
    },

    setTemplate: function (key) {
      var s = _session();
      if (s) { s.setTemplateKey(key); return; }
      window.currentTemplateKey = key;
    },

    setChecklist: function (data) {
      var s = _session();
      if (s) { s.setChecklist(data); return; }
      window.currentChecklist = data;
    },

    resetSession: function () {
      // Очистка через мутацию существующих объектов (не замену ссылок)
      if (window.state && typeof window.state === 'object') {
        Object.keys(window.state).forEach(function (k) { delete window.state[k]; });
      }
      if (window.details && typeof window.details === 'object') {
        Object.keys(window.details).forEach(function (k) { delete window.details[k]; });
      }
      if (window.photos && typeof window.photos === 'object') {
        Object.keys(window.photos).forEach(function (k) { delete window.photos[k]; });
      }
      _planPin = null;
      window.isDirty = false;
    },

    // Копия логики getSessionPhotosForSync из legacy
    getSessionPhotosForSync: function () {
      var result = [];
      var photos = window.photos;
      if (!photos || typeof photos !== 'object') return result;
      Object.keys(photos).forEach(function (posId) {
        var arr = photos[posId];
        if (Array.isArray(arr)) {
          arr.forEach(function (src) {
            result.push({ posId: posId, src: src });
          });
        }
      });
      return result;
    }
  };

  window.AuditState = AuditState;
  console.log('[RBI Module] audit.state loaded');
}());
