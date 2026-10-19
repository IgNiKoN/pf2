// engineer.render.js — Фаза 20: рендер-диспетчер модуля Engineer
//
// Диспетчер по подвкладкам Engineer-таба.
// Делегирует рендер в соответствующие legacy window.*-функции.

(function () {
  var _ctx = null;

  var _engineerI18nBound = false;

  function _t(key, fallback, vars) {
    try {
      var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
      if (i18n && typeof i18n.t === 'function') {
        var s = vars ? i18n.t(key, vars) : i18n.t(key);
        if (s && s !== key) return s;
      }
    } catch (e) {}
    if (vars && fallback) {
      return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) {
        return vars[k] != null ? String(vars[k]) : '';
      });
    }
    return fallback;
  }


  var EngineerRender = {

    bindCtx: function (ctx) {
      _ctx = ctx;
    },

    // =====================================================================
    // РАЗМЕТКА ВКЛАДКИ «ИНЖЕНЕР» (перенос из index.html:437-617, JS-рендер).
    // Возвращает HTML-строку 1:1 идентичную прежней статичной разметке
    // #tab-engineer (подвкладки Задачи/Совещания/Impact/FMEA/Профиль).
    // =====================================================================
    renderMarkup: function () {
      return `
        <div id="tab-engineer" class="view-section">
            <!-- Блок подвкладок Инженера (Липкий) -->
            <div id="engineer-subtabs-block" class="z-[45] transition-all duration-300 w-full max-w-4xl mx-auto py-2">
                <div
                    class="flex gap-1 p-1 bg-[var(--card-border)]/80 backdrop-blur-md rounded-xl overflow-x-auto no-scrollbar whitespace-nowrap text-center shadow-sm border border-[var(--card-border)]">
                    <button data-tasks-action="rbi_switchEngineerSubTab" data-action-arg="eng-sub-badges" data-tasks-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-rbi-caption sm:text-rbi-caption font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z">
                            </path>
                        </svg><span data-i18n="quality.sub.engineer.profile">Профиль</span>
                    </button>
                    <button data-tasks-action="rbi_switchEngineerSubTab" data-action-arg="eng-sub-tasks" data-tasks-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-rbi-caption sm:text-rbi-caption font-bold uppercase rounded-md bg-white shadow-sm text-brand flex flex-col items-center gap-1 active">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4">
                            </path>
                        </svg><span data-i18n="quality.sub.engineer.tasks">Задачи</span>
                    </button>
                    <button data-tasks-action="rbi_switchEngineerSubTab" data-action-arg="eng-sub-meetings" data-tasks-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-rbi-caption sm:text-rbi-caption font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                            </path>
                        </svg><span class="sm:hidden" data-i18n="quality.sub.engineer.meetings_short">Совещ.</span><span class="hidden sm:inline" data-i18n="quality.sub.engineer.meetings">Совещания</span>
                    </button>
                    <button data-tasks-action="rbi_switchEngineerSubTab" data-action-arg="eng-sub-impact" data-tasks-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-rbi-caption sm:text-rbi-caption font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                        </svg><span data-i18n="quality.sub.engineer.impact">Impact</span>
                    </button>
                    <button data-tasks-action="rbi_switchEngineerSubTab" data-action-arg="eng-sub-fmea" data-tasks-action-arg2-type="element"
                        class="sub-tab-btn flex-1 min-w-[60px] py-2 text-rbi-caption sm:text-rbi-caption font-bold uppercase rounded-md text-[var(--text-muted)] flex flex-col items-center gap-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z">
                            </path>
                        </svg><span data-i18n="quality.sub.engineer.fmea">FMEA</span>
                    </button>

                </div>
            </div>

            <!-- Подвкладка: ЗАДАЧИ -->
             
            <div id="eng-sub-tasks" class="eng-sub-section mt-2">
                <div
                    class="sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-4 z-40 flex justify-between items-center w-full">
                    <div>
                        <div class="text-rbi-body font-black text-ink uppercase tracking-tight flex items-center gap-1.5"
                            id="rbi-week-title">
                            <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z">
                                </path>
                            </svg> ${_t('quality.engineer.tasks.week', 'НЕДЕЛЯ')} <span id="rbi-week-number">--</span>
                        </div>
                        <div class="text-rbi-caption font-bold text-[var(--text-muted)]" id="rbi-week-dates">-- апр — -- мая
                            2026</div>
                    </div>
                    <div class="flex flex-col items-end gap-0.5">
                        <div class="text-rbi-caption font-black uppercase text-[var(--text-muted)]">${_t('quality.engineer.tasks.progress', 'Прогресс')}: <span
                                id="rbi-tasks-progress-text" class="text-brand">0/0</span>
                        </div>
                        <div class="text-rbi-caption font-bold text-muted tabular-nums">
                            ${_t('quality.engineer.tasks.open_short', 'Откр.')} <span id="rbi-tasks-open" class="text-ink">0</span>
                            · <span class="text-danger">${_t('quality.engineer.tasks.overdue_short', 'Проср.')} <span id="rbi-tasks-overdue">0</span></span>
                            · ${_t('quality.engineer.tasks.closed_short', 'Закр.')} <span id="rbi-tasks-closed-week" class="text-emerald-600 dark:text-emerald-400">0</span>
                        </div>
                        <div class="w-28 h-1.5 bg-surface rounded-full overflow-hidden">
                            <div id="rbi-tasks-progress-bar" class="h-full bg-brand transition-all"
                                style="width: 0%"></div>
                        </div>
                    </div>
                </div>

                <div id="rbi-tasks-container" class="space-y-4 pb-8"></div>
            </div>

            <!-- Подвкладка: СОВЕЩАНИЯ -->
            <div id="eng-sub-meetings" class="eng-sub-section hidden mt-2">
                <div
                    class="sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-4 z-40 flex justify-between items-center w-full">
                    <div>
                        <h2
                            class="text-rbi-title font-black uppercase tracking-tight text-ink flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                                </path>
                            </svg>
                            ${_t('quality.engineer.meetings.title', 'Совещания')}
                        </h2>
                        <p class="text-rbi-caption font-bold text-[var(--text-muted)] mt-0.5 uppercase tracking-widest">${_t('quality.engineer.meetings.subtitle', 'Умные протоколы')}</p>
                    </div>
                    <button data-meetings-action="rbi_createMeeting"
                        class="bg-orange-500 text-white px-3 py-1.5 rounded-lg shadow-md active:scale-95 text-rbi-caption font-black uppercase whitespace-nowrap flex items-center gap-1 transition-transform">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path>
                        </svg> ${_t('quality.engineer.meetings.new', 'Новое')}
                    </button>
                </div>
                <div id="rbi-meeting-container" class="space-y-3 pb-8">
                    <div
                        class="text-center py-10 text-muted text-rbi-label font-bold uppercase tracking-widest bg-surface rounded-xl border border-dashed border-surface shadow-sm">
                        ${_t('quality.engineer.meetings.empty', 'Активных протоколов нет')}</div>
                </div>
            </div>

            <!-- Подвкладка: ЭФФЕКТИВНОСТЬ -->
            <div id="eng-sub-impact" class="eng-sub-section hidden mt-2">
                <div
                    class="sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-4 z-40 flex justify-between items-center w-full">
                    <div>
                        <h2
                            class="text-rbi-title font-black uppercase tracking-tight text-ink flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6">
                                </path>
                            </svg>
                            ${_t('quality.engineer.impact.title', 'Эффективность')}
                        </h2>
                        <p class="text-rbi-caption font-bold text-[var(--text-muted)] mt-0.5 uppercase tracking-widest">Impact
                            Score</p>
                    </div>
                    <button data-interventions-action="rbi_openInterventionModal"
                        class="bg-green-600 text-white px-3 py-1.5 rounded-lg shadow-md active:scale-95 text-rbi-caption font-black uppercase whitespace-nowrap flex items-center gap-1 transition-transform">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"></path>
                        </svg> ${_t('quality.engineer.impact.action', 'Воздействие')}
                    </button>
                </div>
                <div id="rbi-impact-dashboard" class="space-y-3 pb-8">
                    <!-- Дашборд загрузится через JS -->
                </div>
            </div>

            <!-- Подвкладка: FMEA АНАЛИЗ -->
            <div id="eng-sub-fmea" class="eng-sub-section hidden mt-2">
                <div id="rbi-fmea-container" class="pb-8"></div>
            </div>

            <!-- Подвкладка: ДОСТИЖЕНИЯ (ПРОФИЛЬ) -->
            <div id="eng-sub-badges" class="eng-sub-section hidden mt-2">
                <div
                    class="sticky-top-panel bg-[var(--card-border)]/80 backdrop-blur-md p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-4 z-40 flex flex-col">
                    <div class="flex justify-between items-center w-full">
                        <div id="profile-title-text"
                            class="text-rbi-title font-black uppercase tracking-tight text-ink flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z">
                                </path>
                            </svg>
                            ${_t('quality.engineer.profile.title', 'Профиль Инженера')}
                        </div>
                        <button data-game-action="gameOpenManagerPanelAuth"
                            class="w-8 h-8 flex items-center justify-center bg-surface rounded-full text-muted active:scale-95 shadow-sm border border-surface">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round"
                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z">
                                </path>
                            </svg>
                        </button>
                    </div>
                    <!-- Умное поле ввода имени -->
                    <div id="profile-name-edit-container" class="hidden mt-2 w-full">
                        <input type="text" id="profile-name-input"
                            class="input-base text-rbi-body border-brand-soft bg-brand-soft"
                            placeholder="${_t('quality.engineer.profile.name_ph', 'Введите вашу Фамилию и И.О...')}" data-game-action="saveEngineerNameForce" data-game-action-val-type="value" data-action-event="change">
                        <div class="text-rbi-caption text-[var(--text-muted)] mt-1 pl-1 font-bold">${_t('quality.engineer.profile.name_hint', 'Имя привяжется ко всем актам навсегда.')}</div>
                    </div>
                </div>
                <div id="game-dashboard-container"></div>
            </div>
        </div> <!-- ВАЖНО: ЭТОТ ТЕГ ЗАКРЫВАЕТ ВКЛАДКУ ИНЖЕНЕРА -->
      `;
    },

    /**
     * Диспетчер рендера по подвкладке.
     * eng-sub-tasks    → rbi_renderTasksList
     * eng-sub-meetings → rbi_renderMeetingTab
     * eng-sub-impact   → rbi_renderImpactTab
     * eng-sub-badges   → gameRenderDashboard
     * eng-sub-fmea     → rbi_renderFmeaHistory
     */
    render: function (subTab) {
      var tab = subTab || (window.EngineerState ? window.EngineerState.getCurrentSubTab() : 'eng-sub-tasks');

      if (tab === 'eng-sub-tasks') {
        if (typeof window.rbi_renderTasksList === 'function') {
          window.rbi_renderTasksList();
        } else {
          console.warn('[EngineerRender] rbi_renderTasksList недоступен');
        }
      } else if (tab === 'eng-sub-meetings') {
        if (typeof window.rbi_renderMeetingTab === 'function') {
          window.rbi_renderMeetingTab();
        } else {
          console.warn('[EngineerRender] rbi_renderMeetingTab недоступен');
        }
      } else if (tab === 'eng-sub-impact') {
        if (typeof window.rbi_renderImpactTab === 'function') {
          window.rbi_renderImpactTab();
        } else {
          console.warn('[EngineerRender] rbi_renderImpactTab недоступен');
        }
      } else if (tab === 'eng-sub-badges') {
        var gameSvc = (_ctx && _ctx.game) || (window.RBI && window.RBI.services && window.RBI.services.game);
        if (gameSvc) {
          gameSvc.renderDashboard();
        } else {
          console.warn('[EngineerRender] gameRenderDashboard недоступен');
        }
      } else if (tab === 'eng-sub-fmea') {
        if (typeof window.rbi_renderFmeaHistory === 'function') {
          window.rbi_renderFmeaHistory();
        } else {
          console.warn('[EngineerRender] rbi_renderFmeaHistory недоступен');
        }
      }
    },

    /**
     * Переключить и отрендерить подвкладку.
     * Делегирует в EngineerActions.switchSubTab(tabId, btnElement).
     */
    renderSubTab: function (tabId, btnElement) {
      if (window.EngineerActions) {
        window.EngineerActions.switchSubTab(tabId, btnElement);
      } else {
        console.warn('[EngineerRender] EngineerActions недоступен');
      }
    }
  };

  window.EngineerRender = EngineerRender;

  function _bindEngineerI18n() {
    if (_engineerI18nBound) return;
    _engineerI18nBound = true;
    var events = window.RBI && window.RBI.events;
    if (!(events && typeof events.on === 'function')) return;
    events.on('i18n:localeChanged', function () {
      try {
        var tab = document.getElementById('tab-engineer');
        if (!tab) return;
        // Remount static chrome from markup (keeps data-i18n subtabs via applyDom)
        var host = tab.parentNode;
        if (!host) return;
        var markup = EngineerRender.renderMarkup();
        var tmp = document.createElement('div');
        tmp.innerHTML = markup;
        var fresh = tmp.firstElementChild;
        // preserve visible sub-section id
        var visible = tab.querySelector('.eng-sub-section:not(.hidden)');
        var visId = visible && visible.id;
        tab.replaceWith(fresh);
        if (visId) {
          fresh.querySelectorAll('.eng-sub-section').forEach(function (s) {
            s.classList.toggle('hidden', s.id !== visId);
          });
        }
        if (window.RBI && window.RBI.services && window.RBI.services.i18n && typeof window.RBI.services.i18n.applyDom === 'function') {
          window.RBI.services.i18n.applyDom(fresh);
        }
        if (typeof EngineerRender.render === 'function') EngineerRender.render(visId);
      } catch (_e) { /* ignore */ }
    });
  }
  _bindEngineerI18n();

  // =========================================================================
  // МОНТАЖ РАЗМЕТКИ ВКЛАДКИ «ИНЖЕНЕР» (перенос из index.html:437-617, Блок
  // 2 инициативы «Перенос статичной разметки quality в JS-рендер»). По
  // прецеденту Блока 1/N (`audit`) — на верхнем уровне модуля, до
  // DOMContentLoaded. Grep подтвердил отсутствие top-level bootstrap:*-
  // подписок в файлах фичи — тайминг здесь не критичен, но паттерн
  // сохранён для консистентности.
  // =========================================================================
  (function mountEngineerMarkup() {
    if (typeof window.rbiEnsureTabMarkup === 'function') {
      window.rbiEnsureTabMarkup('tab-engineer', function () {
        return EngineerRender.renderMarkup();
      }, '#engineer-subtabs-block');
      return;
    }
    if (document.getElementById('tab-engineer')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
      ? window.RBI.services.shell.getContentRoot()
      : document.getElementById('app-content');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', EngineerRender.renderMarkup());
  }());

  window.ensureEngineerMarkup = function () {
    if (typeof window.rbiEnsureTabMarkup === 'function') {
      return window.rbiEnsureTabMarkup('tab-engineer', function () {
        return EngineerRender.renderMarkup();
      }, '#engineer-subtabs-block');
    }
    return !!document.getElementById('tab-engineer');
  };
})();

console.log('[EngineerRender] engineer.render.js loaded');
