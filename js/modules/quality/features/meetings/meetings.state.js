// meetings.state.js — Step 32: изолированное состояние модуля Meetings
//
// Изолирует неявное состояние из app.js:
//   window.rbi_meetingsData (массив протоколов совещаний) → _dataLoaded (флаг наличия данных)
//
// Бизнес-логика и сами данные совещаний остаются в window.rbi_meetingsData
// (app.js) — этот файл только отражает факт их наличия для платформенного слоя.

(function () {

  var _dataLoaded = false;

  var MeetingsState = {

    isDataLoaded: function () {
      return _dataLoaded;
    },

    setDataLoaded: function (v) {
      _dataLoaded = !!v;
    },

    /**
     * Синхронизирует _dataLoaded из window.rbi_meetingsData:
     * если массив непустой — данные считаются загруженными.
     */
    syncFromLegacy: function () {
      if (typeof window !== 'undefined' && Array.isArray(window.rbi_meetingsData)) {
        _dataLoaded = window.rbi_meetingsData.length > 0;
      }
    }
  };

  window.MeetingsState = MeetingsState;
})();

console.log('[MeetingsState] meetings.state.js loaded');
