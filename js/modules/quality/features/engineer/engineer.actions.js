// engineer.actions.js — Фаза 20: бизнес-действия модуля Engineer
//
// Делегирует все действия в window.*-функции из app.js (legacy-монолит).
// app.js не переписывается — ES-обёртка предоставляет типизированный фасад.

(function () {

  /**
   * Безопасный вызов legacy-функции.
   * Если функция недоступна — выводит предупреждение.
   */
  function _call(name, fn, args) {
    if (typeof fn === 'function') {
      return fn.apply(null, args || []);
    } else {
      console.warn('[EngineerActions] ' + name + ' недоступен');
    }
  }

  var EngineerActions = {

    _ctx: null,
    bindCtx: function (ctx) { this._ctx = ctx; },

    /**
     * Переключить подвкладку Engineer-таба.
     * Делегирует в window.rbi_switchEngineerSubTab(tabId, btnElement).
     */
    switchSubTab: function (tabId, btnElement) {
      return _call('rbi_switchEngineerSubTab', window.rbi_switchEngineerSubTab, [tabId, btnElement]);
    },

    /**
     * Отрендерить Engineer-таб.
     * Делегирует в window.rbi_renderEngineerTab().
     */
    renderEngineerTab: function () {
      return _call('rbi_renderEngineerTab', window.rbi_renderEngineerTab, []);
    },

    /**
     * Загрузить данные (задачи).
     * Делегирует в window.rbi_loadData() если доступна.
     */
    loadData: function () {
      return _call('rbi_loadData', window.rbi_loadData, []);
    },

    /**
     * Синхронизирует состояние из legacy-переменных.
     */
    syncFromLegacy: function () {
      if (window.EngineerState) {
        window.EngineerState.syncFromLegacy();
      }
    }
  };

  window.EngineerActions = EngineerActions;
})();

console.log('[EngineerActions] engineer.actions.js loaded');
