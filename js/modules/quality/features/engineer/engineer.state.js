// engineer.state.js — Фаза 20: изолированное состояние модуля Engineer
//
// Изолирует let-переменные из app.js:
//   _engineerDataLoaded  →  _dataLoaded
//   currentActiveEngineerTab  →  _currentSubTab

(function () {
  var _ctx = null;

  function _getSetting(key) {
    if (_ctx && _ctx.settings) {
      return _ctx.settings.get(key);
    }
    return window.RBI.services.settings.get(key);
  }

  function _getTasks() {
    if (_ctx && _ctx.tasks) {
      return _ctx.tasks.getTasksSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.tasks) {
      return window.RBI.services.tasks.getTasksSync();
    }
    return typeof window.rbi_tasksData !== 'undefined' ? window.rbi_tasksData : [];
  }

  var _currentSubTab = 'eng-sub-tasks';
  var _dataLoaded = false;
  var _engineerName = _getSetting('engineerName') || '';

  var EngineerState = {

    bindCtx: function (ctx) {
      _ctx = ctx;
    },

    getCurrentSubTab: function () {
      return _currentSubTab;
    },

    setCurrentSubTab: function (tabId) {
      _currentSubTab = tabId;
    },

    isDataLoaded: function () {
      return _dataLoaded;
    },

    setDataLoaded: function (v) {
      _dataLoaded = !!v;
    },

    getEngineerName: function () {
      return _engineerName;
    },

    /**
     * Синхронизирует _dataLoaded из window.rbi_tasksData:
     * если массив непустой — данные считаются загруженными.
     */
    syncFromLegacy: function () {
      if (typeof window !== 'undefined' && (
        (window.RBI && window.RBI.services && window.RBI.services.tasks) ||
        Array.isArray(window.rbi_tasksData)
      )) {
        _dataLoaded = _getTasks().length > 0;
      }
    }
  };

  // Реактивная подписка: обновлять _engineerName при settings:changed
  if (window.RBI && window.RBI.events && window.RBI.events.on) {
    window.RBI.events.on('settings:changed', function (payload) {
      if (payload && payload.key === 'engineerName') {
        _engineerName = payload.value || '';
      }
    });
  } else {
    document.addEventListener('rbi:ready', function () {
      if (window.RBI && window.RBI.events && window.RBI.events.on) {
        window.RBI.events.on('settings:changed', function (payload) {
          if (payload && payload.key === 'engineerName') {
            _engineerName = payload.value || '';
          }
        });
      }
    }, { once: true });
  }

  window.EngineerState = EngineerState;
})();

console.log('[EngineerState] engineer.state.js loaded');
