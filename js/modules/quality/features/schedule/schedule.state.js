// schedule.state.js — Блок 29: изолированное состояние модуля Schedule
//
// Изолирует неявное состояние из app.js:
//   window.rbi_scheduleData (массив этапов графика) → _dataLoaded (флаг наличия данных)
//
// Бизнес-логика и сами данные графика остаются в window.rbi_scheduleData
// (app.js) — этот файл только отражает факт их наличия для платформенного слоя.

(function () {

  var _dataLoaded = false;

  var ScheduleState = {

    isDataLoaded: function () {
      return _dataLoaded;
    },

    setDataLoaded: function (v) {
      _dataLoaded = !!v;
    },

    /**
     * Синхронизирует _dataLoaded из window.rbi_scheduleData:
     * если массив непустой — данные считаются загруженными.
     */
    syncFromLegacy: function () {
      if (typeof window !== 'undefined' && Array.isArray(window.rbi_scheduleData)) {
        _dataLoaded = window.rbi_scheduleData.length > 0;
      }
    }
  };

  window.ScheduleState = ScheduleState;
})();

console.log('[ScheduleState] schedule.state.js loaded');
