// meetings.render.js — Step 32: тонкий делегат рендера модуля Meetings (Wrapper, Шаг 1/10)
//
// Стратегия фасада: функция rbi_renderMeetingTab остаётся в app.js как
// legacy-монолит. Этот файл только делегирует вызов в неё —
// логика рендера не переносится и не меняется.

(function () {

  var MeetingsRender = {

    /**
     * Отрендерить блок «Протоколы Совещаний».
     * Делегирует в window.rbi_renderMeetingTab() (реализация в app.js).
     */
    render: function () {
      if (typeof window.rbi_renderMeetingTab === 'function') {
        window.rbi_renderMeetingTab();
      } else {
        console.warn('[MeetingsRender] rbi_renderMeetingTab недоступен');
      }
    }
  };

  window.MeetingsRender = MeetingsRender;
})();

console.log('[MeetingsRender] meetings.render.js loaded');
