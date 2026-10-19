// ─── audit.render.js — Фаза 15: рендер вкладки «Аудит» (owner-module) ───────
// Реализация перенесена из audit.legacy.js. Источник данных — AuditState.*
// (window.state/.details/.photos/.currentTemplateKey/.currentChecklist по
// ссылке). Остальные глобалы (app.js) используются как есть (bare identifiers).

import { AuditActions } from './audit.actions.js';

(function () {
  'use strict';

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


  // Фаза 50-B (перенесено из audit.legacy.js): единая точка доступа к
  // настройкам через SettingsService с fallback. Нужна локально в render.js,
  // т.к. render.js и actions.js — независимые ES-модули; используют общий
  // `_ctx`, полученный через импорт `AuditActions`.
  function _getSetting(key) {
    if (AuditActions._ctx && AuditActions._ctx.settings) return AuditActions._ctx.settings.get(key);
    return window.RBI.services.settings.get(key);
  }

  function _getTwiCards() {
    if (AuditActions._ctx && AuditActions._ctx.knowledge) {
      return AuditActions._ctx.knowledge.getTwiCardsSync();
    }
    if (window.RBI && window.RBI.services && window.RBI.services.knowledge) {
      return window.RBI.services.knowledge.getTwiCardsSync();
    }
    return Array.isArray(window.customTwiCards) ? window.customTwiCards : [];
  }

  // Единая точка доступа к полному массиву проверок. ВАЖНО (постраничная
  // загрузка Журнала, см. отчёт по оптимизации журнала/аналитики):
  // window.HistoryState.allRecords с этого момента содержит только текущую
  // страницу Журнала, не весь стор — источник правды здесь всегда
  // window.contractorArray (полный массив, заполняется в session.service.js/
  // sync-engine.core.js).
  function _getAllInspections() {
    return Array.isArray(window.contractorArray) ? window.contractorArray : [];
  }

  function _templates() {
    if (AuditActions._ctx && AuditActions._ctx.templates) {
      return AuditActions._ctx.templates;
    }
    if (window.RBI && window.RBI.services && window.RBI.services.templates) {
      return window.RBI.services.templates;
    }
    return {
      getUserTemplates: function () {
        return typeof window.userTemplates !== 'undefined' ? window.userTemplates : {};
      },
      getSystemTemplates: function () {
        return typeof window.SYSTEM_TEMPLATES !== 'undefined' ? window.SYSTEM_TEMPLATES : {};
      }
    };
  }

  // Единая точка доступа к window.contractorArray (без HistoryState-фоллбэка
  // — сохраняет ровно текущую семантику showContractorDetails()).
  function _getContractorArray() {
    return Array.isArray(window.contractorArray) ? window.contractorArray : [];
  }

  // Константа причин дефектов (перенесено из audit.legacy.js, копия из app.js).
  // window._AUDIT_DEFECT_CAUSES сохранён для обратной совместимости
  // (читается в audit.actions.js: toggleCommentField/saveCommentModal).
  var _AUDIT_DEFECT_CAUSES = [
    { code: 'C01', name: 'Нарушение технологии (ППР)', group: 'Технология' },
    { code: 'C02', name: 'Отклонение от проекта/РД', group: 'Проект' },
    { code: 'C03', name: 'Некачественный материал', group: 'Материалы' },
    { code: 'C04', name: 'Низкая квалификация рабочих', group: 'Персонал' },
    { code: 'C05', name: 'Отсутствие контроля (ИТР)', group: 'Организация' },
    { code: 'C06', name: 'Спешка / Нарушение сроков', group: 'Организация' },
    { code: 'C07', name: 'Погодные условия', group: 'Внешние факторы' },
    { code: 'C00', name: 'Иное (указать в комментарии)', group: 'Другое' }
  ];
  window._AUDIT_DEFECT_CAUSES = _AUDIT_DEFECT_CAUSES;
  // Алиас для внешних потребителей (app.js legacy-имя): ai.actions.js,
  // reports.actions.js, game.actions.js, analytics.*.js — бареные/typeof-guarded
  // обращения к DEFECT_CAUSES продолжают резолвиться через этот же массив.
  window.DEFECT_CAUSES = _AUDIT_DEFECT_CAUSES;

  // =====================================================================
  // РЯД МИНИАТЮР ФОТО ПУНКТА ЧЕК-ЛИСТА (Множественные фото, B1)
  // AuditState.photos[id] — массив src (обратная совместимость: строка для
  // старых сессий нормализуется через window.normalizeItemPhotos). addBtnClass
  // отличает стиль кнопки «добавить ещё» для fail/ok карточек.
  // =====================================================================
  function renderPhotoRow(id, addBtnClass) {
    var photosArr = window.normalizeItemPhotos(AuditState.photos[id]);
    var thumbsHtml = photosArr.map(function (src, idx) {
      return `<div class="relative shrink-0"><img ${(typeof window.rbiBuildPhotoImgAttrs === 'function') ? window.rbiBuildPhotoImgAttrs(src, { preferThumb: true }) : ('src="' + (window.getPhotoThumbSrc || window.getPhotoSrc)(src) + '"')} class="photo-thumb !w-11 !h-11 !rounded-[12px] border ${addBtnClass.thumbBorder} shadow-sm object-cover" loading="lazy" onclick="openPhotoViewer('${src}')"><div onclick="removePhoto(${id}, event, ${idx})" class="absolute -top-1.5 -right-1.5 bg-danger text-white rounded-full w-5 h-5 flex items-center justify-center text-rbi-body font-bold cursor-pointer shadow-md border border-white z-10">✕</div></div>`;
    }).join('');

    var addBtnHtml = `<button onclick="triggerPhotoInput(${id})" class="btn-status !w-11 !h-11 !rounded-[12px] shrink-0 shadow-sm ${addBtnClass.addBtn}" title="${photosArr.length ? _t('quality.audit.photo.add_more', 'Добавить ещё фото') : addBtnClass.title}"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><circle cx="12" cy="13" r="3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></circle></svg></button>`;

    return `<div class="flex items-center gap-1.5 shrink-0">${thumbsHtml}${addBtnHtml}</div>`;
  }

  // Звуковые эффекты (base64 для офлайна) — перенесено из js/app.js, module-приватные
  // (единственный потребитель — audioOk.play()/audioFail.play() ниже в этом файле).
  const audioOk = new Audio("data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq");
  const audioFail = new Audio("data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq");
  // (В реале сюда можно вставить короткие base64 писки, сейчас они просто заглушки, чтобы не было ошибки)

  // =====================================================================
  // СВАЙПЫ (УМНАЯ ЛОГИКА И ПЛАВНОСТЬ iOS)
  // Перенесено из app.js (было app.js:708-779). Единственный вызывающий —
  // AuditRender.render() (см. ниже) — теперь в этом же файле, поэтому
  // функция остаётся module-приватной (без window.*).
  // =====================================================================
  function initSwipes() {
    const container = document.getElementById('audit-items');
    let startX = 0, currentX = 0, isDragging = false, currentCard = null, content = null;
    let bgOk = null, bgFail = null;

    container.addEventListener('touchstart', (e) => {
      if (!_getSetting('swipeEnabled')) return;
      const target = e.target.closest('.swipe-container');
      if (!target || e.target.closest('.btn-status') || e.target.closest('.photo-thumb')) return;

      currentCard = target;
      content = currentCard.querySelector('.swipe-content');
      bgOk = currentCard.querySelector('.swipe-bg-ok');
      bgFail = currentCard.querySelector('.swipe-bg-fail');

      startX = e.touches[0].clientX;
      isDragging = true;
      currentCard.classList.add('swiping');

      // Сбрасываем стили
      if (bgOk) bgOk.style.opacity = '0';
      if (bgFail) bgFail.style.opacity = '0';
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (!isDragging || !currentCard || !content) return;
      currentX = e.touches[0].clientX;
      const diff = currentX - startX;

      // Ограничитель с эффектом "резинки"
      const maxSwipe = 100;
      let moveX = diff;
      if (diff > maxSwipe) moveX = maxSwipe + (diff - maxSwipe) * 0.2;
      if (diff < -maxSwipe) moveX = -maxSwipe + (diff + maxSwipe) * 0.2;

      content.style.transform = `translateX(${moveX}px)`;

      // Плавное проявление цвета подложки (Opacity)
      if (diff > 0 && bgOk && bgFail) {
        bgOk.style.zIndex = 1; bgFail.style.zIndex = 0;
        bgOk.style.opacity = Math.min(diff / 80, 1).toString();
        bgFail.style.opacity = '0';
      } else if (diff < 0 && bgOk && bgFail) {
        bgOk.style.zIndex = 0; bgFail.style.zIndex = 1;
        bgFail.style.opacity = Math.min(Math.abs(diff) / 80, 1).toString();
        bgOk.style.opacity = '0';
      }
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      if (!isDragging || !currentCard || !content) return;
      isDragging = false;
      currentCard.classList.remove('swiping');

      const diff = currentX - startX;
      const id = parseInt(currentCard.dataset.id);

      // Возвращаем карточку на место
      content.style.transform = `translateX(0)`;
      if (bgOk) bgOk.style.opacity = '0';
      if (bgFail) bgFail.style.opacity = '0';

      // Отложенное срабатывание (ждем пока карточка визуально отскочит)
      if (diff > 80) {
        setTimeout(() => window.toggleOk(id), 150);
      } else if (diff < -80) {
        setTimeout(() => window.toggleFail(id), 150);
      }

      currentCard = null; content = null; bgOk = null; bgFail = null;
    });
  }

  var AuditRender = {

    // =====================================================================
    // РАЗМЕТКА ВКЛАДКИ «ОСМОТР» (перенос из index.html:433-605, JS-рендер)
    // Возвращает HTML-строку 1:1 идентичную прежней статичной разметке
    // #tab-audit (welcome-блок + пустые контейнеры #audit-items/#audit-actions
    // + скрытый #fake-checklist-selector). Заполнение контейнеров — задача
    // render()/renderSelector() ниже, не этой функции.
    // =====================================================================
    renderMarkup: function () {
      return `
        <div id="tab-audit" class="view-section">
            <!-- Пустое состояние (Оригинальный дизайн, компактная версия) -->
            <div id="empty-checklist-state"
                class="py-3 ios-panel border border-surface/50 rounded-[22px] shadow-sm mb-3 mt-1 overflow-hidden">

                <div class="px-4 text-center">
                    <div
                        class="w-11 h-11 mx-auto bg-brand-soft rounded-[16px] flex items-center justify-center mb-2 border border-brand-soft shadow-sm">
                        <svg class="w-6 h-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z"></path>
                            <path d="M9 12l2 2 4-4"></path>
                        </svg>
                    </div>

                    <div
                        class="text-rbi-title font-black uppercase tracking-tight text-ink dark:text-white leading-tight">
                        ${_t('quality.audit.welcome.title', 'Добро пожаловать')}
                    </div>

                    <div class="text-rbi-caption text-[var(--text-muted)] mt-0.5 leading-snug">
                        ${_t('quality.audit.welcome.subtitle', 'Выберите режим старта работы')}
                    </div>
                </div>

                <div class="px-3 mt-3 space-y-2">

                    <!-- ДЕМО -->
                    <button data-settings-action="startDemoMode"
                        class="w-full text-left bg-surface border border-surface rounded-[18px] p-3 shadow-sm active:scale-[0.98] transition-all flex gap-3 items-center">
                        <div
                            class="w-9 h-9 rounded-[14px] bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 flex items-center justify-center shrink-0">
                            <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14"></path>
                                <rect x="3" y="6" width="12" height="12" rx="3"></rect>
                                <path d="M7 10h4"></path>
                                <path d="M7 14h2"></path>
                            </svg>
                        </div>

                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <div
                                    class="text-rbi-label font-black uppercase tracking-tight text-ink dark:text-white">
                                    ${_t('quality.audit.welcome.demo_title', 'Демо-режим')}
                                </div>
                                <span
                                    class="text-rbi-caption font-black uppercase bg-blue-50 text-blue-600 border border-blue-100 px-1.5 py-0.5 rounded-md dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300">
                                    ${_t('quality.audit.welcome.demo_badge', 'безопасно')}
                                </span>
                            </div>
                            <div class="text-[9.5px] text-muted leading-snug mt-0.5">
                                ${_t('quality.audit.welcome.demo_hint', 'Тестовые данные. Можно нажимать всё — рабочая база не меняется.')}
                            </div>
                        </div>

                        <svg class="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>

                    <!-- ОБУЧЕНИЕ -->
                    <button data-settings-action="startInteractiveTutorial"
                        class="w-full text-left bg-surface border border-surface rounded-[18px] p-3 shadow-sm active:scale-[0.98] transition-all flex gap-3 items-center">
                        <div
                            class="w-9 h-9 rounded-[14px] bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 flex items-center justify-center shrink-0">
                            <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 20h9"></path>
                                <path d="M12 4h9"></path>
                                <path d="M4 9l2 2 4-4"></path>
                                <path d="M4 17l2 2 4-4"></path>
                            </svg>
                        </div>

                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <div
                                    class="text-rbi-label font-black uppercase tracking-tight text-ink dark:text-white">
                                    ${_t('quality.audit.welcome.onboarding_title', 'Онбординг')}
                                </div>
                                <span
                                    class="text-rbi-caption font-black uppercase bg-emerald-50 text-emerald-600 border border-emerald-100 px-1.5 py-0.5 rounded-md dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300">
                                    ${_t('quality.audit.welcome.onboarding_badge', '44 шага')}
                                </span>
                            </div>
                            <div class="text-[9.5px] text-muted leading-snug mt-0.5">
                                ${_t('quality.audit.welcome.onboarding_hint', 'Полный тур по платформе: Осмотр, Инженер, Аналитика, БЗ, СК и настройки (ПК и телефон).')}
                            </div>
                        </div>

                        <svg class="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>

                    <!-- FAQ / AI -->
                    <button data-knowledge-action="openFaqModal"
                        class="w-full text-left bg-surface border border-surface rounded-[18px] p-3 shadow-sm active:scale-[0.98] transition-all flex gap-3 items-center">
                        <div
                            class="w-9 h-9 rounded-[14px] bg-brand-soft border border-brand-soft flex items-center justify-center shrink-0">
                            <svg class="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 6v12"></path>
                                <path d="M5 8a4 4 0 014-4h11v14H9a4 4 0 00-4 4V8z"></path>
                                <path d="M5 8a4 4 0 00-4 4v10"></path>
                            </svg>
                        </div>

                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                                <div
                                    class="text-rbi-label font-black uppercase tracking-tight text-ink dark:text-white">
                                    ${_t('quality.audit.welcome.faq_title', 'FAQ / ИИ-помощник')}
                                </div>
                                <span
                                    class="text-rbi-caption font-black uppercase bg-brand-soft text-brand border border-brand-soft px-1.5 py-0.5 rounded-md">
                                    offline + AI
                                </span>
                            </div>
                            <div class="text-[9.5px] text-muted leading-snug mt-0.5">
                                ${_t('quality.audit.welcome.faq_hint', 'После первой синхронизации база доступна офлайн, при интернете отвечает ИИ.')}
                            </div>
                        </div>

                        <svg class="w-4 h-4 text-muted shrink-0" fill="none" stroke="currentColor"
                            viewBox="0 0 24 24" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"></path>
                        </svg>
                    </button>

                    <!-- НАЧАТЬ ПРОВЕРКУ -->
                    <div class="relative pt-1" id="start-checklist-wrap">
                        <div
                            class="pointer-events-none w-full bg-brand text-white py-3 rounded-[18px] font-black text-rbi-label uppercase tracking-widest shadow-md flex justify-center items-center gap-2"
                            aria-hidden="true">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 5v14"></path>
                                <path d="M5 12h14"></path>
                            </svg>
                            ${_t('quality.audit.welcome.start_check', 'Начать проверку')}
                        </div>
                        <select id="fake-checklist-selector"
                            data-audit-action="changeTemplate" data-audit-action-val-type="value" data-action-event="change"
                            class="absolute inset-0 z-10 w-full h-full cursor-pointer opacity-[0.01]"
                            aria-label="${_t('quality.audit.checklist.pick', 'Выбрать чек-лист')}">
                            <option value="" disabled selected>${_t('quality.audit.checklist.pick', 'Выбрать чек-лист')}</option>
                            <optgroup label="${_t('quality.audit.checklist.group_system', 'Системные')}" id="fake-system-group"></optgroup>
                            <optgroup label="${_t('quality.audit.checklist.group_user', 'Загруженные')}" id="fake-user-group"></optgroup>
                        </select>
                    </div>

                    <div class="px-2 pt-0.5 text-rbi-caption text-muted leading-snug text-center">
                        ${_t('quality.audit.welcome.footer_hint', 'Обучение — для первого входа · Демо — для тестов · FAQ — для вопросов по работе')}
                    </div>
                </div>
            </div>

            <!-- НОВОЕ: Горизонтальная навигация по группам -->
            <div id="audit-items"></div>

            <!-- Возвращаем кнопки действий -->
            <div class="grid grid-cols-2 gap-3 mt-8 mb-4" id="audit-actions" style="display:none;">
                <button data-audit-action="saveProductToArray" data-requires-create="true"
                    class="bg-brand text-white rounded-xl py-4 font-black text-xs uppercase shadow-[0_10px_20px_rgba(79,70,229,0.3)] active:scale-95 transition-transform">
                    ${_t('quality.audit.actions.save_history', 'Сохранить в Историю')}</button>
                <button data-audit-action="resetChecklist"
                    class="bg-danger-soft text-danger border border-danger rounded-xl py-4 font-black text-xs uppercase active:scale-95 transition-transform">
                    ${_t('quality.audit.actions.clear_form', 'Очистить форму')}</button>
            </div>
        </div>`;
    },

    // =====================================================================
    // РЕНДЕР ЧЕКЛИСТА
    // Перенесено из audit.legacy.js (было в app.js, строка 2866).
    // =====================================================================
    /**
     * Welcome vs чек-лист: после route-teardown remount даёт стартовый экран
     * с display по умолчанию, а render() раньше только заполнял #audit-items —
     * на ПК получался «старт поверх чек-листа». Единая точка видимости.
     */
    syncPaneVisibility: function () {
      var has = !!(AuditState.currentTemplateKey && AuditState.currentTemplateKey !== 'HOME');
      var empty = document.getElementById('empty-checklist-state');
      var items = document.getElementById('audit-items');
      var actions = document.getElementById('audit-actions');
      if (empty) empty.style.display = has ? 'none' : 'block';
      if (items) items.style.display = has ? 'block' : 'none';
      if (actions) actions.style.display = has ? 'grid' : 'none';
    },

    render: function () {
      if (!AuditState.currentTemplateKey) return;
      var root = document.getElementById('audit-items');
      var navRoot = document.getElementById('audit-group-nav');
      if (!root) return;

      AuditRender.syncPaneVisibility();

      var html = ""; var navHtml = "";

      AuditState.currentChecklist.forEach(function (g, gIndex) {
        navHtml += `<button id="nav-btn-${gIndex}" onclick="scrollToGroup(${gIndex})" class="inline-block px-3 py-1.5 min-w-fit text-rbi-caption font-bold uppercase rounded-xl bg-[var(--hover-bg)] text-[var(--text-muted)] border border-[var(--card-border)] transition-colors active:scale-95 shrink-0">${g.group || g.title}</button>`;

        var isCollapsed = _getSetting('defaultGroupsCollapsed');
        var arrow = isCollapsed ? '▶' : '▼';
        var displayStyle = isCollapsed ? 'display: none;' : 'display: block;';

        html += `<div class="block-title flex justify-between items-center cursor-pointer select-none rounded-lg px-2 mt-4" onclick="toggleGroup(${gIndex})">
            <span id="group-title-${gIndex}">${arrow} ${g.group || g.title}</span>
            <span id="group-counter-${gIndex}" class="text-rbi-caption bg-[var(--card-border)] px-2 py-0.5 rounded text-[var(--text-muted)]">0/${g.items.length}</span>
        </div><div id="group_content_${gIndex}" class="transition-all origin-top" style="${displayStyle}">`;

        var itemsToRender = [...g.items];
        itemsToRender.forEach(function (i) { html += `<div id="card_wrapper_${i.id}"></div>`; });
        html += `</div>`;
      });

      root.innerHTML = html;
      if (navRoot) { navRoot.innerHTML = navHtml; navRoot.classList.remove('hidden'); }

      AuditState.currentChecklist.forEach(function (g) {
        g.items.forEach(function (i) { AuditRender.updateCardDOM(i.id, i); });
      });

      if (_getSetting('swipeEnabled')) initSwipes();
      AuditRender.updateGroupCounters();
    },

    // =====================================================================
    // РЕНДЕР СЕЛЕКТОРА ШАБЛОНОВ (ВИДА РАБОТ)
    // Перенесено из audit.legacy.js (было в app.js, строка 2699).
    // =====================================================================
    renderSelector: function () {
      var sysGroup = document.getElementById('system-group');
      var userGroup = document.getElementById('user-group');

      var refSysGroup = document.getElementById('ref-system-group');
      var refUserGroup = document.getElementById('ref-user-group');

      var fakeSysGroup = document.getElementById('fake-system-group');
      var fakeUserGroup = document.getElementById('fake-user-group');

      var _st = _templates().getSystemTemplates();
      var _companyForBadge = window.RBI && window.RBI.services && window.RBI.services.company;
      var _officialMap = (_companyForBadge && typeof _companyForBadge.getOfficialTemplates === 'function')
        ? _companyForBadge.getOfficialTemplates()
        : {};
      var sysKeys = Object.keys(_st).sort(function (a, b) {
        return _st[a].title.localeCompare(_st[b].title, 'ru');
      });
      var sysHtml = sysKeys.map(function (key) {
        var _ptr = _officialMap[key];
        if (_ptr && _ptr.type === 'user') {
          var _dateStr = '';
          try { _dateStr = _ptr.updatedAt ? new Date(_ptr.updatedAt).toLocaleDateString('ru') : ''; } catch (_e) { /* ignore */ }
          var _badgeTitle = _t('quality.audit.checklist.official_badge', 'изменён компанией, v{version} от {date}', { version: _ptr.version, date: _dateStr });
          return '<option value="sys_' + key + '" title="' + _badgeTitle.replace(/"/g, '&quot;') + '">' + _st[key].title + ' ✎</option>';
        }
        return '<option value="sys_' + key + '">' + _st[key].title + '</option>';
      }).join('');

      var _ut = _templates().getUserTemplates();
      var userKeys = Object.keys(_ut).sort(function (a, b) {
        return _ut[a].title.localeCompare(_ut[b].title, 'ru');
      });
      var userHtml = userKeys.length > 0
        ? userKeys.map(function (key) {
          return '<option value="user_' + key + '">' + _ut[key].title + '</option>';
        }).join('')
        : '<option disabled>' + _t('quality.audit.checklist.no_user_templates', 'Своих шаблонов нет') + '</option>';

      if (sysGroup) sysGroup.innerHTML = sysHtml;
      if (userGroup) userGroup.innerHTML = userHtml;

      if (refSysGroup) refSysGroup.innerHTML = sysHtml;
      if (refUserGroup) refUserGroup.innerHTML = userHtml;

      if (fakeSysGroup) fakeSysGroup.innerHTML = sysHtml;
      if (fakeUserGroup) fakeUserGroup.innerHTML = userHtml;

      if (AuditState.currentTemplateKey) {
        var sel = document.getElementById('checklist-selector');
        if (sel) sel.value = AuditState.currentTemplateKey;
      }
    },

    // =====================================================================
    // ОБНОВЛЕНИЕ МИНИ-ДАШБОРДА (метрики текущего осмотра)
    // Перенесено из audit.legacy.js (было в app.js, строка 3270).
    // =====================================================================
    updateUI: function () {
      var p = AuditState.currentTemplateKey ? getProductMetrics(AuditState.state, AuditState.currentChecklist) : null;
      var getTextColor = function (val, isDanger) {
        if (isDanger || val < 70) return 'text-white drop-shadow-md';
        if (val < 85) return 'text-ink';
        return 'text-white drop-shadow-md';
      };

      if (!p) {
        if (document.getElementById('dash-p-text')) document.getElementById('dash-p-text').innerText = "0/0";
        if (document.getElementById('dash-p-doc')) document.getElementById('dash-p-doc').innerText = "";
        if (document.getElementById('dash-p-bar')) document.getElementById('dash-p-bar').style.width = "0%";
        if (document.getElementById('dash-p-percent')) document.getElementById('dash-p-percent').innerText = "--%";
        ['dash-p-kc', 'dash-p-kcrit', 'dash-p-b2', 'dash-p-b3'].forEach(function (id) { if (document.getElementById(id)) document.getElementById(id).innerText = "-"; });
      } else {
        if (document.getElementById('dash-p-text')) document.getElementById('dash-p-text').innerText = `${p.checkedCount}/${p.totalCount}`;
        if (document.getElementById('dash-p-doc')) {
          document.getElementById('dash-p-doc').innerText = (p.documentary !== null && p.documentary !== undefined) ? _t('quality.audit.dash.doc_prefix', 'Док: {pct}%', { pct: p.documentary }) : "";
        }
        if (document.getElementById('dash-p-bar')) {
          document.getElementById('dash-p-bar').style.width = `${p.final}%`;
          document.getElementById('dash-p-bar').className = `absolute top-0 left-0 h-full transition-all duration-500 ${p.isDanger ? 'bg-danger' : (p.final < 85 ? 'bg-yellow-400' : 'bg-green-500')}`;
        }
        if (document.getElementById('dash-p-percent')) {
          document.getElementById('dash-p-percent').innerText = `${p.final}%`;
          document.getElementById('dash-p-percent').className = `absolute inset-0 flex items-center justify-center text-rbi-label font-black z-10 ${getTextColor(p.final, p.isDanger)}`;
        }
        if (document.getElementById('dash-p-kc')) document.getElementById('dash-p-kc').innerText = p.kc.toFixed(2);
        if (document.getElementById('dash-p-kcrit')) document.getElementById('dash-p-kcrit').innerText = p.kcrit.toFixed(2);
        if (document.getElementById('dash-p-b2')) document.getElementById('dash-p-b2').innerText = p.n_B2_fail;
        if (document.getElementById('dash-p-b3')) document.getElementById('dash-p-b3').innerText = p.n_B3_fail;
      }

      var currentContr = document.getElementById('inp-contractor') && document.getElementById('inp-contractor').value.trim();
      var _inspections = _getAllInspections();
      var filteredArr = currentContr ? _inspections.filter(function (i) { return i.contractorName === currentContr && i.templateKey === AuditState.currentTemplateKey; }) : [];

      if (filteredArr.length < 7) {
        if (document.getElementById('dash-c-text')) document.getElementById('dash-c-text').innerText = _t('quality.audit.dash.checks_suffix', '{n} пров.', { n: filteredArr.length + '/7' });
        if (document.getElementById('dash-c-doc')) document.getElementById('dash-c-doc').innerText = "";
        if (document.getElementById('dash-c-bar')) document.getElementById('dash-c-bar').style.width = "0%";
        if (document.getElementById('dash-c-percent')) document.getElementById('dash-c-percent').innerText = _t('quality.audit.dash.collecting', 'СБОР');
        ['dash-c-ks', 'dash-c-kcrit', 'dash-c-b3'].forEach(function (id) { if (document.getElementById(id)) document.getElementById(id).innerText = "-"; });
      } else {
        var _ut = _templates().getUserTemplates();
        var c = getContractorMetrics(filteredArr, _ut);
        if (c) {
          if (document.getElementById('dash-c-text')) document.getElementById('dash-c-text').innerText = _t('quality.audit.dash.checks_suffix', '{n} пров.', { n: c.count });
          if (document.getElementById('dash-c-doc')) {
            document.getElementById('dash-c-doc').innerText = (c.documentaryC !== null && c.documentaryC !== undefined) ? _t('quality.audit.dash.doc_prefix', 'Док: {pct}%', { pct: c.documentaryC }) : "";
          }
          if (document.getElementById('dash-c-bar')) {
            document.getElementById('dash-c-bar').style.width = `${c.finalC}%`;
            document.getElementById('dash-c-bar').className = `absolute top-0 left-0 h-full transition-all duration-500 ${c.isRedZone ? 'bg-danger' : (c.finalC < 85 ? 'bg-yellow-400' : 'bg-green-500')}`;
          }
          if (document.getElementById('dash-c-percent')) {
            document.getElementById('dash-c-percent').innerText = `${c.finalC}%`;
            document.getElementById('dash-c-percent').className = `absolute inset-0 flex items-center justify-center text-rbi-label font-black z-10 ${getTextColor(c.finalC, c.isRedZone)}`;
          }
          if (document.getElementById('dash-c-ks')) {
            var ksEl = document.getElementById('dash-c-ks');
            ksEl.innerText = c.ks.toFixed(2);
            ksEl.className = `font-black ${c.ks < 1 ? 'text-danger' : 'text-green-600'}`;
          }
          if (document.getElementById('dash-c-kcrit')) {
            var kcritEl = document.getElementById('dash-c-kcrit');
            kcritEl.innerText = c.kcritC.toFixed(2);
            kcritEl.className = `font-black ${c.kcritC < 1 ? 'text-danger' : 'text-green-600'}`;
          }
          if (document.getElementById('dash-c-b3')) document.getElementById('dash-c-b3').innerText = c.n_изделий_с_B3;
        }
      }

      var selectEl = document.getElementById('checklist-selector');
      var clName = selectEl && selectEl.options[selectEl.selectedIndex] ? selectEl.options[selectEl.selectedIndex].text.replace('▼', '').trim() : _t('quality.audit.checklist.none', 'Вид работ не выбран');
      var labelEl = document.getElementById('current-checklist-label');
      if (labelEl) labelEl.innerText = clName;

      AuditRender.updateGroupCounters();
    },

    // =====================================================================
    // ОБНОВЛЕНИЕ СТРОКИ-СВОДКИ ДАННЫХ
    // Перенесено из audit.legacy.js (было в app.js, строка 2812).
    // =====================================================================
    updateDataSummary: function () {
      var proj = document.getElementById('inp-project')?.value.trim() || _t('quality.audit.field.project', 'Объект');
      var contr = document.getElementById('inp-contractor')?.value.trim() || _t('quality.audit.field.contractor', 'Подрядчик');
      var loc = document.getElementById('inp-location')?.value.trim() || _t('quality.audit.field.location', 'Локация');

      var selectEl = document.getElementById('checklist-selector');
      var clName = selectEl?.options[selectEl.selectedIndex]?.text.replace('▼', '').trim() || _t('quality.audit.checklist.not_selected', 'Чек-лист не выбран');

      var summary = document.getElementById('data-block-summary');
      if (summary) summary.innerText = `✏️ ${clName} | ${proj} | ${contr} | ${loc}`;

      var labelEl = document.getElementById('current-checklist-label');
      if (labelEl) labelEl.innerText = clName;
    },

    // =====================================================================
    // СВОРАЧИВАНИЕ/РАЗВОРАЧИВАНИЕ БЛОКА ДАННЫХ
    // Перенесено из audit.legacy.js (было в app.js, строка 2827).
    // =====================================================================
    toggleDataBlock: function (forceOpen) {
      var content = document.getElementById('data-block-content');
      var summary = document.getElementById('data-block-summary');
      var icon = document.getElementById('data-toggle-icon');
      if (!content || !summary) return;

      if (forceOpen || content.style.display === 'none') {
        content.style.display = 'grid'; summary.classList.add('hidden'); icon.innerText = _t('quality.audit.data.collapse', 'СВЕРНУТЬ ▲');
      } else {
        AuditRender.updateDataSummary(); content.style.display = 'none'; summary.classList.remove('hidden'); icon.innerText = _t('quality.audit.data.expand', 'РАЗВЕРНУТЬ ▼');
      }
    },

    // =====================================================================
    // РЕНДЕР КАРТОЧКИ ПУНКТА ЧЕКЛИСТА В DOM
    // Перенесено из audit.legacy.js (было в app.js, строка 2986).
    // =====================================================================
    updateCardDOM: function (id, itemData) {
      if (itemData === undefined) itemData = null;
      var wrapper = document.getElementById(`card_wrapper_${id}`);
      if (!wrapper) return;

      if (!itemData) {
        var flat = getFlatList(AuditState.currentChecklist);
        itemData = flat.find(function (x) { return x.id === id; });
      }
      if (!itemData) return;

      var s = AuditState.state[id];
      var i = itemData;

      var isEscalated = s === 'fail_escalated';
      var failActive = s === 'fail' || s === 'fail_escalated';
      var okActive = s === 'ok';

      var cardBgClass = failActive ? 'bg-danger-soft border-danger-soft' : (okActive ? 'bg-green-50 border-green-100 dark:bg-green-900/20 dark:border-green-800' : '');
      var indicatorClass = `indicator-${s ? (okActive ? 'ok' : (isEscalated ? 3 : i.w)) : i.w}`;

      var collapseClass = '';
      if (okActive && _getSetting('autoCollapseOk') && !itemData._forceExpand) {
        collapseClass = 'card-collapsed';
        cardBgClass = '';
      }

      if (_getSetting('soundEnabled') && AuditState.state[id] && !itemData._justRendered) {
        if (AuditState.state[id] === 'ok') audioOk.play().catch(function () { });
        else audioFail.play().catch(function () { });
      }
      itemData._justRendered = true;

      var _twiCards = _getTwiCards();
      // Совпадает с openItemHelpMenu: вид работ целиком = itemId 'ALL' или пустой.
      var _isItemOrAll = function (c) {
        return String(c.itemId) === String(id) || c.itemId === 'ALL' || !c.itemId;
      };
      var inspectorCard = _twiCards.find(function (c) { return c.type === 'INSPECTOR' && String(c.itemId) === String(id); });
      var workerCard = _twiCards.find(function (c) {
        return c.type === 'WORKER' && c.checklistKey === AuditState.currentTemplateKey && _isItemOrAll(c);
      });
      var pdfCard = _twiCards.find(function (c) {
        return c.type === 'PDF' && c.checklistKey === AuditState.currentTemplateKey && _isItemOrAll(c);
      });

      var hasAnyHelp = inspectorCard || workerCard || pdfCard;

      var helpBtnHtml = '';
      if (hasAnyHelp) {
        var btnClass = 'text-muted bg-surface border-surface';

        if (inspectorCard && workerCard) {
          btnClass = 'text-purple-600 bg-purple-100 border-purple-300 dark:bg-purple-900/50 dark:text-purple-400 dark:border-purple-800';
        } else if (inspectorCard) {
          btnClass = 'text-blue-600 bg-blue-100 border-blue-300 dark:bg-blue-900/50 dark:text-blue-400 dark:border-blue-800';
        } else if (workerCard) {
          btnClass = 'text-green-600 bg-green-100 border-green-300 dark:bg-green-900/50 dark:text-green-400 dark:border-green-800';
        }

        helpBtnHtml = `
            <button onclick="window.RBI.services.knowledge.openItemHelp(${id}, event)" class="btn-status ${btnClass} !w-11 !h-11 !rounded-[12px] relative shadow-sm shrink-0" title="${_t('quality.audit.help.title', 'Инструкции и Справка')}">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"></path></svg>
            </button>
        `;
      } else {
        helpBtnHtml = `
            <button onclick='showToast(${JSON.stringify(_t('quality.audit.help.none_toast', 'К этому пункту пока не привязаны инструкции'))})' class="btn-status text-muted bg-transparent border-dashed border-surface !w-11 !h-11 !rounded-[12px] shadow-sm shrink-0" title="${_t('quality.audit.help.none_title', 'Нет инструкций')}">
                <svg class="w-6 h-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"></path></svg>
            </button>
        `;
      }

      var mainBtnsHtml = `
        <button onclick="toggleOk(${id})" class="btn-status ${okActive ? 'bg-green-500 text-white border-green-500' : 'border-surface'} !w-11 !h-11 shrink-0 shadow-sm transition-transform active:scale-90">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M20 6L9 17l-5-5"/></svg>
        </button>
        <button onclick="toggleFail(${id})" class="btn-status ${failActive ? 'bg-danger text-white border-danger' : 'border-surface'} !w-11 !h-11 shrink-0 shadow-sm transition-transform active:scale-90">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
    `;

      var auditHtml = '';

      if (window.auditOriginalData) {
        var origState = window.auditOriginalData.state[id];
        var origPhoto = window.auditOriginalData.photos ? window.normalizeItemPhotos(window.auditOriginalData.photos[id])[0] || null : null;

        if (origState) {
          if (window.auditOriginalData.isCrossAudit) {
            var badgeColor = origState === 'ok' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-danger-soft text-danger border-danger';
            var badgeText = origState === 'ok' ? 'OK' : 'FAIL';
            var photoBlock = origPhoto ? `<img ${(typeof window.rbiBuildPhotoImgAttrs === 'function') ? window.rbiBuildPhotoImgAttrs(origPhoto, { preferThumb: true }) : ('src="' + (window.getPhotoThumbSrc || window.getPhotoSrc)(origPhoto) + '"')} class="w-8 h-8 object-cover rounded cursor-pointer border border-slate-300" loading="lazy" onclick="openPhotoViewer('${origPhoto}')">` : '';

            auditHtml = `
                    <div class="mt-2 bg-surface border border-dashed border-surface p-2 rounded-lg flex justify-between items-center w-full">
                        <div>
                            <div class="text-rbi-caption font-black uppercase text-muted mb-0.5">${_t('quality.audit.card.engineer_score', 'Оценка инженера ({score})', { score: window.auditOriginalData.inspector })}</div>
                            <span class="text-rbi-caption font-black px-1.5 py-0.5 rounded border ${badgeColor}">${badgeText}</span>
                        </div>
                        ${photoBlock}
                    </div>
                `;
          } else if (window.auditOriginalData.isEtalonCompare && (origState === 'fail' || origState === 'fail_escalated')) {
            if (origPhoto) {
              auditHtml = `
                        <div class="mt-2 bg-orange-50 dark:bg-orange-900/10 border border-dashed border-orange-200 dark:border-orange-800 p-2 rounded-lg flex items-center gap-3 w-full">
                            <img ${(typeof window.rbiBuildPhotoImgAttrs === 'function') ? window.rbiBuildPhotoImgAttrs(origPhoto, { preferThumb: true }) : ('src="' + (window.getPhotoThumbSrc || window.getPhotoSrc)(origPhoto) + '"')} class="w-12 h-12 object-cover rounded cursor-pointer border border-orange-300" loading="lazy" onclick="openPhotoViewer('${origPhoto}')">
                            <div>
                                <div class="text-rbi-caption font-black uppercase text-orange-600 mb-0.5">${_t('quality.audit.card.was_fail', '📸 Было (Брак)')}</div>
                                <div class="text-rbi-caption font-bold text-orange-800 dark:text-orange-400 leading-tight">${_t('quality.audit.card.attach_became', 'Прикрепите новое фото "СТАЛО", чтобы зафиксировать исправление эталона.')}</div>
                            </div>
                        </div>
                    `;
            }
          }
        }
      }

      var contentHtml = '';

      if (failActive) {
        var hasComment = AuditState.details[id] && AuditState.details[id].comment && AuditState.details[id].comment.trim() !== "";

        var commBtn = hasComment ?
          `<div class="relative shrink-0"><button onclick="toggleCommentField(${id})" class="btn-status text-brand bg-brand-soft border-brand !w-11 !h-11 !rounded-[12px] shadow-sm"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg></button><div onclick="deleteComment(${id}, event)" class="absolute -top-1.5 -right-1.5 bg-danger text-white rounded-full w-5 h-5 flex items-center justify-center text-rbi-body font-bold cursor-pointer shadow-md border border-white z-10">✕</div></div>` :
          `<button onclick="toggleCommentField(${id})" class="btn-status !w-11 !h-11 !rounded-[12px] shrink-0 shadow-sm"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg></button>`;

        var photoBtn = renderPhotoRow(id, { thumbBorder: 'border-brand', addBtn: '', title: _t('quality.audit.photo.add', 'Добавить фото') });
        var escBtn = (i.w === 2) ? `<button onclick="toggleEscalation(${id})" class="btn-status ${isEscalated ? 'bg-danger-soft text-danger border-danger' : 'text-orange-500 bg-orange-50 border-orange-200 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400'} !w-11 !h-11 !rounded-[12px] transition-all shrink-0 shadow-sm"><span class="text-rbi-body font-bold">>1.5</span></button>` : '';

        var visualIndicatorHtml = isEscalated ? `<div class="text-rbi-caption font-black text-white bg-danger px-2 py-0.5 rounded w-fit mt-1 shadow-sm">${_t('quality.audit.card.b3_noted', 'Дефект учтен как B3')}</div>` : '';
        var commentBlockHtml = hasComment ? `<div class="mt-2 text-rbi-body font-semibold text-ink italic bg-surface p-2.5 rounded-lg border border-danger-soft shadow-sm leading-snug break-words w-full">💬 ${AuditState.details[id].comment}</div>` : '';

        contentHtml = `
            <div class="flex flex-col w-full">
                <div class="w-full pointer-events-none mb-2">
                    <div class="text-rbi-body font-bold leading-snug card-title-text text-ink dark:text-white">
                        <span class="weight-tag wt-${i.w}">B${i.w}</span> ${i.n}
                    </div>
                    ${visualIndicatorHtml}
                    ${commentBlockHtml}
                </div>
                
                <div class="flex justify-end items-center flex-wrap gap-1.5 w-full mt-1 border-t border-danger-soft pt-3">
                    ${escBtn}
                    ${commBtn}
                    ${photoBtn}
                    ${helpBtnHtml}
                    ${mainBtnsHtml}
                </div>
            </div>
        `;
      } else if (okActive) {
        var photoBtnOk = renderPhotoRow(id, { thumbBorder: 'border-green-300', addBtn: 'text-green-600 bg-green-50 border-green-200', title: _t('quality.audit.photo.add_etalon', 'Добавить фото эталона') });
        contentHtml = `
            <div class="flex justify-between items-center w-full min-h-[44px]">
                <div class="flex-1 mr-3 min-w-0 pointer-events-none">
                    <div class="text-rbi-body font-bold leading-snug card-title-text text-ink dark:text-white">
                        <span class="weight-tag wt-${i.w}">B${i.w}</span> ${i.n}
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    ${photoBtnOk}
                    ${helpBtnHtml}
                    ${mainBtnsHtml}
                </div>
            </div>
        `;
      } else {
        contentHtml = `
            <div class="flex justify-between items-center w-full min-h-[44px]">
                <div class="flex-1 mr-3 min-w-0 pointer-events-none">
                    <div class="text-rbi-body font-bold leading-snug mb-1 card-title-text text-ink dark:text-white">
                        <span class="weight-tag wt-${i.w}">B${i.w}</span> ${i.n}
                    </div>
                    <div class="text-rbi-label text-[var(--text-muted)] leading-snug norm-desc-text">${i.t}</div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    ${helpBtnHtml}
                    ${mainBtnsHtml}
                </div>
            </div>
        `;
      }

      var cardHtml = `
    <div class="card-audit swipe-container ${indicatorClass} ${cardBgClass} ${collapseClass}" data-id="${id}" onclick="if(this.classList.contains('card-collapsed')) expandCard(${id}, event)">
        <div class="swipe-actions-bg swipe-bg-ok"><span class="ml-4">OK</span></div>
        <div class="swipe-actions-bg swipe-bg-fail"><span class="mr-4">FAIL</span></div>
        <div class="swipe-content p-2.5 bg-inherit border-inherit rounded-inherit h-full w-full bg-[var(--card-bg)] transition-colors">
            ${contentHtml}
        </div>
    </div>`;

      wrapper.innerHTML = cardHtml;
    },

    // =====================================================================
    // ОБНОВЛЕНИЕ СЧЁТЧИКОВ ГРУПП + ЦВЕТОВАЯ ИНДИКАЦИЯ НАВИГАЦИИ
    // Перенесено из audit.legacy.js (было в app.js, строка 2934).
    // =====================================================================
    updateGroupCounters: function () {
      if (!AuditState.currentTemplateKey) return;

      AuditState.currentChecklist.forEach(function (g, gIndex) {
        var answered = 0;
        var stageState = {};

        g.items.forEach(function (i) {
          if (AuditState.state[i.id]) {
            answered++;
            stageState[i.id] = AuditState.state[i.id];
          }
        });

        var counterEl = document.getElementById(`group-counter-${gIndex}`);
        var navBtnEl = document.getElementById(`nav-btn-${gIndex}`);

        if (counterEl) counterEl.innerText = `${answered}/${g.items.length}`;

        if (navBtnEl) {
          if (answered === 0) {
            navBtnEl.className = `inline-block px-3 py-2 mr-2 text-rbi-caption font-bold uppercase rounded-xl bg-[var(--hover-bg)] text-[var(--text-muted)] border border-[var(--card-border)] transition-colors active:scale-95`;
          } else {
            var stageMetrics = getProductMetrics(stageState, [g]);
            var f = stageMetrics.final;

            if (f < 70 || stageMetrics.isDanger) {
              navBtnEl.className = `inline-block px-3 py-2 mr-2 text-rbi-caption font-bold uppercase rounded-xl border transition-all shadow-sm bg-danger-soft text-danger border-danger active:scale-95`;
            } else if (f < 85) {
              navBtnEl.className = `inline-block px-3 py-2 mr-2 text-rbi-caption font-bold uppercase rounded-xl border transition-all shadow-sm bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400 active:scale-95`;
            } else {
              navBtnEl.className = `inline-block px-3 py-2 mr-2 text-rbi-caption font-bold uppercase rounded-xl border transition-all shadow-sm bg-green-50 text-green-600 border-green-200 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400 active:scale-95`;
            }
          }
        }
      });
    },

    // =====================================================================
    // СВОРАЧИВАНИЕ/РАЗВОРАЧИВАНИЕ ГРУППЫ ПУНКТОВ
    // Перенесено из audit.legacy.js (было в app.js, строка 2906).
    // =====================================================================
    toggleGroup: function (index) {
      var content = document.getElementById(`group_content_${index}`);
      var title = document.getElementById(`group-title-${index}`);
      if (!content || !title) return;

      if (content.style.display === 'none') {
        content.style.display = 'block';
        title.innerText = title.innerText.replace('▶', '▼');
      } else {
        content.style.display = 'none';
        title.innerText = title.innerText.replace('▼', '▶');
      }
    },

    // =====================================================================
    // ПРОКРУТКА К ГРУППЕ ПО НАВИГАЦИИ
    // Перенесено из audit.legacy.js (было в app.js, строка 2920).
    // =====================================================================
    scrollToGroup: function (index) {
      var content = document.getElementById(`group_content_${index}`);
      if (content && content.previousElementSibling) {
        var headerEl = document.getElementById('main-header');
        var headerOffset = headerEl ? headerEl.offsetHeight + 10 : 120;

        var elementPosition = content.previousElementSibling.getBoundingClientRect().top;
        var offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({ top: offsetPosition, behavior: "smooth" });
      }
    },

    // =====================================================================
    // ПРИНУДИТЕЛЬНОЕ РАЗВОРАЧИВАНИЕ КАРТОЧКИ
    // Перенесено из audit.legacy.js (было в app.js, строка 2976).
    // =====================================================================
    expandCard: function (id, event) {
      if (event) event.stopPropagation();
      var flatList = getFlatList(AuditState.currentChecklist);
      var itemData = flatList.find(function (x) { return x.id === id; });
      if (itemData) {
        itemData._forceExpand = true;
        AuditRender.updateCardDOM(id, itemData);
      }
    }
  };

  window.AuditRender = AuditRender;

  // =========================================================================
  // МОНТАЖ РАЗМЕТКИ ВКЛАДКИ «ОСМОТР» (перенос из index.html:433-605, Блок 1
  // инициативы «Перенос статичной разметки quality в JS-рендер»). Выполняется
  // синхронно на верхнем уровне модуля (deferred-скрипт, до DOMContentLoaded),
  // ДО регистрации слушателей bootstrap:selectorReady/checklistReady ниже —
  // иначе renderSelector()/render() не найдут узлы #tab-audit/#audit-items и
  // список чек-листов останется пустым при первой загрузке (см. план блока).
  // =========================================================================
  (function mountAuditMarkup() {
    if (typeof window.rbiEnsureTabMarkup === 'function') {
      window.rbiEnsureTabMarkup('tab-audit', function () {
        return AuditRender.renderMarkup();
      }, '#empty-checklist-state');
      return;
    }
    if (document.getElementById('tab-audit')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
      ? window.RBI.services.shell.getContentRoot()
      : document.getElementById('app-content');
    if (!root) return;
    root.insertAdjacentHTML('afterbegin', AuditRender.renderMarkup());
  }());

  window.ensureAuditMarkup = function () {
    var tabBefore = document.getElementById('tab-audit');
    var hadMarker = !!(tabBefore && tabBefore.querySelector('#empty-checklist-state'));
    var ok;
    if (typeof window.rbiEnsureTabMarkup === 'function') {
      ok = window.rbiEnsureTabMarkup('tab-audit', function () {
        return AuditRender.renderMarkup();
      }, '#empty-checklist-state');
    } else {
      ok = !!document.getElementById('tab-audit');
    }
    // Route teardown очищает #tab-audit; remount даёт пустой <select>.
    // Первый mount заполняет init/bootstrap:selectorReady — здесь только remount.
    if (ok && !hadMarker) {
      try {
        if (typeof AuditRender.renderSelector === 'function') AuditRender.renderSelector();
        if (AuditState.currentTemplateKey && typeof AuditRender.render === 'function') {
          AuditRender.render();
        } else if (typeof AuditRender.syncPaneVisibility === 'function') {
          AuditRender.syncPaneVisibility();
        }
      } catch (_) { /* ignore */ }
    } else if (ok && typeof AuditRender.syncPaneVisibility === 'function') {
      // Каркас уже был, но visibility могла разъехаться с session (desktop remount).
      try { AuditRender.syncPaneVisibility(); } catch (_) { /* ignore */ }
    }
    return ok;
  };

  // =========================================================================
  // МОДАЛКИ РАСЧЕТОВ (По клику на мини-дашборд)
  // Перенесено из app.js (было: showProductMath/showContractorDetails +
  // DOMContentLoaded-листенер, строки ~1109-1219). Публикуются явно через
  // window.* — потребитель inline onclick в index.html:759,780 исполняется
  // в глобальном скоупе, а этот файл — ES-модуль.
  // =========================================================================
  window.showProductMath = function () {
    if (!AuditState.currentTemplateKey) return;
    var p = window.getProductMetrics(AuditState.state, AuditState.currentChecklist);
    var modal = document.getElementById('modal-overlay');
    var body = document.getElementById('modal-body');

    document.getElementById('modal-icon').innerHTML = `<div class="w-14 h-14 bg-brand-soft text-brand rounded-[14px] flex items-center justify-center border border-brand-soft mx-auto"><svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="8" y="8" width="8" height="2"></rect><line x1="8" y1="14" x2="8.01" y2="14"></line><line x1="12" y1="14" x2="12.01" y2="14"></line><line x1="16" y1="14" x2="16.01" y2="14"></line></svg></div>`;
    document.getElementById('modal-title').innerText = _t('quality.audit.math.title', 'Расчет УрК Осмотра');

    if (!p) {
      body.innerHTML = '<p>' + _t('quality.audit.math.empty', 'Проверьте хотя бы один пункт для отображения оценки.') + '</p>';
    } else {
      body.innerHTML = `
        <div class="bg-[var(--hover-bg)] p-4 rounded-xl border border-[var(--card-border)] mb-4">
            <div class="text-rbi-caption uppercase font-bold text-[var(--text-muted)] mb-2">${_t('quality.audit.math.formula_label', 'Формула (Текущий осмотр)')}</div>
            <div class="text-sm font-black font-mono bg-[var(--card-bg)] p-2 rounded border border-[var(--card-border)] text-center">${_t('quality.audit.math.formula', 'УрК = База × Kc × Kcrit')}</div>
            <div class="text-center mt-2 text-2xl font-black ${p.final < 70 ? 'text-danger' : (p.final < 85 ? 'text-orange-500' : 'text-green-600')}">${p.final}%</div>
        </div>
        <ul class="text-sm space-y-3 mb-4">
            <li class="flex justify-between items-center border-b border-[var(--card-border)] pb-2">
                <span><b>${_t('quality.audit.math.base', 'Базовый балл')}</b><br><span class="text-rbi-caption text-[var(--text-muted)]">${_t('quality.audit.math.base_hint', 'Доля пройденных пунктов (по весам)')}</span></span>
                <span class="font-black text-lg">${p.baseUrkPerc}%</span>
            </li>
            <li class="flex justify-between items-center border-b border-[var(--card-border)] pb-2">
                <span><b>${_t('quality.audit.math.kc', 'Концентрация (Kc)')}</b><br><span class="text-rbi-caption text-[var(--text-muted)]">${_t('quality.audit.math.kc_hint', 'Штраф за долю брака B2')}</span></span>
                <span class="font-black text-lg ${p.kc < 1 ? 'text-danger' : 'text-green-600'}">${p.kc.toFixed(2)}</span>
            </li>
            <li class="flex justify-between items-center border-b border-[var(--card-border)] pb-2">
                <span><b>${_t('quality.audit.math.kcrit', 'Критичность (Kcrit)')}</b><br><span class="text-rbi-caption text-[var(--text-muted)]">${_t('quality.audit.math.kcrit_hint', 'Штраф за наличие B3')}</span></span>
                <span class="font-black text-lg ${p.kcrit < 1 ? 'text-danger' : 'text-green-600'}">${p.kcrit.toFixed(2)}</span>
            </li>
        </ul>
        <div class="text-rbi-label font-bold ${p.final > 84 && (p.kc < 1 || p.kcrit < 1 || p.n_B2_fail > 0) ? 'bg-orange-50 text-orange-800 border-orange-200' : 'bg-surface text-ink'} p-3 rounded-lg border border-surface shadow-sm leading-relaxed">
            ${_t('quality.audit.math.cap84', 'Правило потолка (Cap84): итоговый УрК не может превышать 84%.')}
        </div>`;
    }
    document.body.classList.add('modal-open'); modal.style.display = 'flex';
  };

  window.showContractorDetails = function () {
    if (!AuditState.currentTemplateKey) return;
    var currentContr = document.getElementById('inp-contractor').value.trim();
    var filteredArr = currentContr ? _getContractorArray().filter(function (i) { return i.contractorName === currentContr && i.templateKey === AuditState.currentTemplateKey; }) : [];

    var modal = document.getElementById('modal-overlay');
    document.getElementById('modal-icon').innerHTML = `<div class="w-14 h-14 bg-brand-soft text-brand rounded-2xl flex items-center justify-center font-black text-2xl">M</div>`;
    document.getElementById('modal-title').innerText = currentContr ? _t('quality.audit.contr.title_named', 'Аналитика: {name}', { name: currentContr }) : _t('quality.audit.contr.title', 'Аналитика подрядчика');
    var body = document.getElementById('modal-body');

    if (filteredArr.length < 7) {
      body.innerHTML = `<p class="bg-surface text-ink p-4 rounded-xl border border-surface font-bold leading-snug text-center">${_t('quality.audit.contr.collecting', 'Сбор данных: требуется минимум 7 независимых проверок.')}<br><br><b class="text-lg text-brand">${filteredArr.length} / 7</b></p>`;
    } else {
      var c = window.getContractorMetrics(filteredArr, _templates().getUserTemplates());
      var warningHtml = ''; // Убрали предупреждение, так как до 7 проверок модалка теперь блокируется

      body.innerHTML = `
            ${warningHtml}
            <div class="bg-brand-soft p-4 rounded-xl border border-brand mb-5 shadow-sm relative overflow-hidden">
                <div class="text-rbi-caption uppercase font-bold text-brand mb-2 flex justify-between items-center">
                    <span>${_t('quality.audit.contr.reliability', 'Надёжность (оперативно, окно ≤15)')}</span>
                </div>
                <div class="flex items-center justify-between mt-1">
                    <div class="text-5xl font-black text-brand">${c.finalC}%</div>
                    <div class="text-right">
                        <span class="text-rbi-caption font-bold text-brand bg-brand-soft px-2 py-1 rounded uppercase block w-fit ml-auto border border-brand">${c.statusTxt}</span>
                        <div class="text-rbi-caption text-brand mt-1 font-bold">${_t('quality.audit.contr.n_window', 'N в окне: {n}', { n: c.count })}</div>
                    </div>
                </div>
            </div>
            
            <div class="text-rbi-caption font-black text-[var(--text-muted)] uppercase mb-2">${_t('quality.audit.contr.penalties', 'Штрафные коэффициенты')}</div>
            <ul class="text-rbi-body space-y-3 mb-5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 shadow-sm">
                <li class="flex justify-between items-center border-b border-[var(--card-border)] pb-2">
                    <span class="leading-snug"><b>${_t('quality.audit.contr.ks', 'Системный брак (Ks)')}</b><br><span class="text-rbi-caption text-[var(--text-muted)] mt-0.5">${_t('quality.audit.contr.ks_hint', 'Повтор дефекта в {pct}% проверок', { pct: c.maxFailRate.toFixed(1) })}</span></span>
                    <span class="font-black text-lg ${c.ks < 1 ? 'text-danger' : 'text-green-600'}">${c.ks.toFixed(2)}</span>
                </li>
                <li class="flex justify-between items-center pb-1">
                    <span class="leading-snug"><b>${_t('quality.audit.contr.kb3', 'Критичность (KB3)')}</b><br><span class="text-rbi-caption text-[var(--text-muted)] mt-0.5">${_t('quality.audit.contr.kb3_hint', 'Доля проверок с B3: {pct}%', { pct: c.rateB3.toFixed(1) })}</span></span>
                    <span class="font-black text-lg ${c.kcritC < 1 ? 'text-danger' : 'text-green-600'}">${c.kcritC.toFixed(2)}</span>
                </li>
            </ul>

            <div class="text-rbi-caption font-black text-[var(--text-muted)] uppercase mb-2">${_t('quality.audit.contr.stability', 'Стабильность')}</div>
            <div class="bg-[var(--card-bg)] border border-[var(--card-border)] p-3 rounded-xl shadow-sm text-center mb-5 cursor-help" title="${c.stabDesc}">
                <div class="text-rbi-caption text-[var(--text-muted)] font-bold uppercase mb-1 border-b border-dashed border-slate-300 pb-1 inline-block">${_t('quality.audit.contr.stab_index', 'Индекс стаб.')}</div>
                <div class="text-xl font-black ${c.stabColor} leading-none">${c.stabilityIndex}</div>
                <div class="text-rbi-caption font-bold uppercase mt-1 ${c.stabColor}">${c.stabText}</div>
            </div>

            <div class="text-rbi-label font-bold ${c.finalC < 70 ? 'text-danger bg-danger-soft border-danger' : (c.finalC < 85 ? 'text-orange-700 bg-orange-50 border-orange-200' : 'text-green-700 bg-green-50 border-green-200')} mt-2 p-3 rounded-xl border shadow-sm leading-snug">
                <span class="uppercase text-rbi-caption block mb-1 opacity-70">${_t('quality.audit.contr.basis', 'Основание / Вывод')}</span>${c.reason}
            </div>`;
    }
    document.body.classList.add('modal-open'); modal.style.display = 'flex';
  };

  // === СВОРАЧИВАЕМ МИНИДАШБОРД ===
  // Перенесено из app.js (было app.js:662-668). Публикуется на window.*, так
  // как вызывается из inline onclick="toggleDashboardExpand()" в index.html.
  window.toggleDashboardExpand = function () {
    const expView = document.getElementById('dash-expanded-view');
    if (!expView) return;
    expView.classList.toggle('hidden');
    // Обновляем отступ страницы через нашу умную функцию
    setTimeout(updateBodyPadding, 50);
  };

  // Назначаем клики на мини-дашборд (перенесено из app.js вместе с функциями,
  // т.к. слушатель бареным именем вызывал их — при переносе только функций,
  // без листенера, клики на мини-дашборд перестали бы работать).
  document.addEventListener("DOMContentLoaded", function () {
    var pCard = document.getElementById('mini-p-bar') ? document.getElementById('mini-p-bar').parentElement : null;
    var cCard = document.getElementById('mini-c-urk') ? document.getElementById('mini-c-urk').parentElement : null;

    if (pCard) pCard.addEventListener('click', window.showProductMath);
    if (cCard) cCard.addEventListener('click', window.showContractorDetails);
  });

  // =========================================================================
  // WINDOW-ПРОКСИ (обратная совместимость: index.html inline-обработчики,
  // динамически генерируемый HTML — onclick в строках выше — и app.js).
  // =========================================================================
  window.render = AuditRender.render.bind(AuditRender);
  window.renderSelector = AuditRender.renderSelector.bind(AuditRender);
  window.updateUI = AuditRender.updateUI.bind(AuditRender);
  window.updateDataSummary = AuditRender.updateDataSummary.bind(AuditRender);
  window.toggleDataBlock = AuditRender.toggleDataBlock.bind(AuditRender);
  window.updateCardDOM = AuditRender.updateCardDOM.bind(AuditRender);
  window.updateGroupCounters = AuditRender.updateGroupCounters.bind(AuditRender);
  window.toggleGroup = AuditRender.toggleGroup.bind(AuditRender);
  window.scrollToGroup = AuditRender.scrollToGroup.bind(AuditRender);
  window.expandCard = AuditRender.expandCard.bind(AuditRender);


  // =========================================================================
  // i18n: перерисовка UI chrome при смене локали (без сброса draft/выбора)
  // =========================================================================
  function refreshAuditStaticChrome() {
    var tab = document.getElementById('tab-audit');
    if (!tab) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = AuditRender.renderMarkup();
    var empty = document.getElementById('empty-checklist-state');
    var newEmpty = tmp.querySelector('#empty-checklist-state');
    if (empty && newEmpty) {
      var emptyDisp = empty.style.display;
      empty.replaceWith(newEmpty);
      if (emptyDisp) newEmpty.style.display = emptyDisp;
    }
    var actions = document.getElementById('audit-actions');
    var newActions = tmp.querySelector('#audit-actions');
    if (actions && newActions) {
      var actDisp = actions.style.display;
      actions.innerHTML = newActions.innerHTML;
      actions.style.display = actDisp;
    }
    ['system-group', 'ref-system-group', 'fake-system-group'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.label = _t('quality.audit.checklist.group_system', 'Системные');
    });
    ['user-group', 'ref-user-group', 'fake-user-group'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.label = _t('quality.audit.checklist.group_user', 'Загруженные');
    });
    var fakeSel = document.getElementById('fake-checklist-selector');
    if (fakeSel && fakeSel.options[0] && !fakeSel.options[0].value) {
      fakeSel.options[0].textContent = _t('quality.audit.checklist.pick', 'Выбрать чек-лист');
      fakeSel.setAttribute('aria-label', _t('quality.audit.checklist.pick', 'Выбрать чек-лист'));
    }
    var icon = document.getElementById('data-toggle-icon');
    var content = document.getElementById('data-block-content');
    if (icon && content) {
      icon.innerText = (content.style.display === 'none')
        ? _t('quality.audit.data.expand', 'РАЗВЕРНУТЬ ▼')
        : _t('quality.audit.data.collapse', 'СВЕРНУТЬ ▲');
    }
  }

  var _auditI18nBound = false;
  function bindAuditI18n() {
    if (_auditI18nBound) return;
    _auditI18nBound = true;
    if (!(window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function')) return;
    window.RBI.events.on('i18n:localeChanged', function () {
      try {
        var tab = document.getElementById('tab-audit');
        if (!tab) return;
        refreshAuditStaticChrome();
        if (typeof AuditRender.renderSelector === 'function') AuditRender.renderSelector();
        if (typeof AuditRender.updateUI === 'function') AuditRender.updateUI();
        if (typeof AuditRender.updateDataSummary === 'function') AuditRender.updateDataSummary();
        if (AuditState.currentTemplateKey && typeof AuditRender.render === 'function') {
          AuditRender.render();
        }
      } catch (_e) { /* ignore */ }
    });
  }
  bindAuditI18n();

  console.log('[RBI Module] audit.render loaded (owner-module: full render logic)');
}());
