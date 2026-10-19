// etalon.state.js — Фаза 18: изолированное состояние модуля Etalon

(function () {
  let _acts = [];
  let _isConstructorOpen = false;

  const EtalonState = {

    // currentEtalonContext — локальная let-переменная в etalon.js,
    // недоступна снаружи, EtalonState не пытается её читать.

    isConstructorOpen: false,

    /**
     * Живая ссылка на window.etalonActsArray — не копия.
     * Аналог паттерна ReportsState.getReports() (Фаза 16).
     */
    getActs() {
      return (typeof window !== 'undefined' && window.etalonActsArray) || _acts;
    },

    /**
     * Найти акт-эталон по id.
     */
    getActById(id) {
      const acts = EtalonState.getActs();
      if (!Array.isArray(acts)) return null;
      return acts.find(function (a) { return a && a.id === id; }) || null;
    },

    /**
     * Копирует snapshot window.etalonActsArray → _acts.
     */
    syncFromLegacy() {
      if (typeof window !== 'undefined' && Array.isArray(window.etalonActsArray)) {
        _acts = window.etalonActsArray.slice();
      }
    }
  };

  window.EtalonState = EtalonState;
})();

console.log('[EtalonState] etalon.state.js loaded');
