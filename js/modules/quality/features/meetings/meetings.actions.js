// meetings.actions.js — Step 32: тонкий фасад-делегат модуля Meetings (Wrapper, Шаг 1/10)
//
// Стратегия фасада: функции rbi_createMeeting / rbi_openMeetingSetupModal /
// rbi_updateMeetingSetupList / rbi_executeMeetingSetup / rbi_saveMeetingMemo /
// rbi_handleMeetingPhotoUpload / rbi_openSavedMeeting / rbi_saveEditedMeeting /
// rbi_deleteMeeting остаются в app.js как legacy-монолит.
// Этот файл только делегирует вызовы в window.rbi_*-функции (аналог schedule.actions.js
// до переноса бизнес-логики) — логика не переносится и не меняется.

(function () {

  /**
   * Безопасный вызов legacy-функции.
   * Если функция недоступна — выводит предупреждение.
   */
  function _call(name, fn, args) {
    if (typeof fn === 'function') {
      return fn.apply(null, args || []);
    } else {
      console.warn('[MeetingsActions] ' + name + ' недоступен');
    }
  }

  var MeetingsActions = {

    _ctx: null,
    bindCtx: function (ctx) { this._ctx = ctx; },

    /**
     * Создать новое совещание (или открыть модалку настройки, если данных нет).
     * Делегирует в window.rbi_createMeeting(customData).
     */
    createMeeting: function (customData) {
      return _call('rbi_createMeeting', window.rbi_createMeeting, [customData]);
    },

    /**
     * Открыть модалку настройки нового протокола совещания.
     * Делегирует в window.rbi_openMeetingSetupModal(taskId).
     */
    openSetupModal: function (taskId) {
      return _call('rbi_openMeetingSetupModal', window.rbi_openMeetingSetupModal, [taskId]);
    },

    /**
     * Обновить список участников/объектов в модалке настройки.
     * Делегирует в window.rbi_updateMeetingSetupList().
     */
    updateSetupList: function () {
      return _call('rbi_updateMeetingSetupList', window.rbi_updateMeetingSetupList, []);
    },

    /**
     * Выполнить настройку и создать протокол на её основе.
     * Делегирует в window.rbi_executeMeetingSetup(taskId).
     */
    executeSetup: function (taskId) {
      return _call('rbi_executeMeetingSetup', window.rbi_executeMeetingSetup, [taskId]);
    },

    /**
     * Сохранить памятку/протокол совещания.
     * Делегирует в window.rbi_saveMeetingMemo().
     */
    saveMemo: function () {
      return _call('rbi_saveMeetingMemo', window.rbi_saveMeetingMemo, []);
    },

    /**
     * Обработать загрузку фото к протоколу совещания.
     * Делегирует в window.rbi_handleMeetingPhotoUpload(event).
     */
    handlePhotoUpload: function (event) {
      return _call('rbi_handleMeetingPhotoUpload', window.rbi_handleMeetingPhotoUpload, [event]);
    },

    /**
     * Открыть сохранённое совещание для просмотра/редактирования.
     * Делегирует в window.rbi_openSavedMeeting(id).
     */
    openSaved: function (id) {
      return _call('rbi_openSavedMeeting', window.rbi_openSavedMeeting, [id]);
    },

    /**
     * Сохранить правки открытого совещания.
     * Делегирует в window.rbi_saveEditedMeeting().
     */
    saveEdited: function () {
      return _call('rbi_saveEditedMeeting', window.rbi_saveEditedMeeting, []);
    },

    /**
     * Удалить совещание (мягкое удаление).
     * Делегирует в window.rbi_deleteMeeting(id).
     */
    delete: function (id) {
      return _call('rbi_deleteMeeting', window.rbi_deleteMeeting, [id]);
    },

    /**
     * Синхронизирует состояние из legacy-переменных.
     */
    syncFromLegacy: function () {
      if (window.MeetingsState) {
        window.MeetingsState.syncFromLegacy();
      }
    }
  };

  window.MeetingsActions = MeetingsActions;
})();

console.log('[MeetingsActions] meetings.actions.js loaded');
