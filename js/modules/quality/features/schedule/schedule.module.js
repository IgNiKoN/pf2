// schedule.module.js — Блок 29: контракт платформы (ES-модуль)
//
// Стратегия фасада: функции rbi_renderScheduleTab / rbi_addScheduleRow /
// rbi_deleteScheduleRow / rbi_clearSchedule / rbi_saveSchedule /
// rbi_handleScheduleImport остаются в app.js как legacy-монолит.
// ES-модуль только:
//   1. Регистрирует себя в window.RBI.registry как 'module.schedule'
//   2. Синхронизирует ScheduleState из window.rbi_scheduleData
//   3. Делегирует действия в window.*-функции из app.js
//
// Это Шаг 1 из 10-шагового цикла очистки (раздел 15 PLATFORM_TARGET_ARCHITECTURE.md)
// для блока «Расписание СМР». Перенос самой бизнес-логики — предмет
// последующих отдельных шагов, НЕ этого.
//
// Порядок загрузки гарантирован: app.js загружается как обычный <script>
// до этого ES-модуля — все window.*-функции из app.js уже доступны.

import './schedule.state.js';
import './schedule.actions.js';
import './schedule.render.js';

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-schedule-action).
function bindScheduleActionDelegation() {
  if (window.__scheduleActionDelegationBound) return;
  window.__scheduleActionDelegationBound = true;

  const dispatch = (el, evt) => {
    const action = el.dataset.scheduleAction;
    const fn = window[action];
    if (typeof fn !== 'function') return;
    const valType = el.dataset.scheduleActionValType;
    const arg = valType === 'event' ? evt : el.dataset.actionArg;
    if (arg === undefined) {
      fn();
    } else {
      fn(arg);
    }
  };

  const resolveActionElement = (target, wantsChange) => {
    let el = target;
    while (el && el.nodeType === 1) {
      if (el.dataset && el.dataset.scheduleAction) {
        if (!!(el.dataset.actionEvent === 'change') === wantsChange) return el;
      }
      const inlineOnclick = el.getAttribute && el.getAttribute('onclick');
      if (!wantsChange && inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
      el = el.parentElement;
    }
    return null;
  };

  document.addEventListener('change', (e) => {
    const el = resolveActionElement(e.target, true);
    if (el) dispatch(el, e);
  }, true);
}

export const ScheduleModule = {
  id: 'schedule',
  routes: ['/schedule'],
  dependencies: ['storage', 'tasks'],

  _syncUnsubscribe: null,

  /**
   * Инициализация: синхронизирует ScheduleState из window.rbi_scheduleData,
   * подписывается на sync:completed.
   * Вызывается один раз при старте платформы.
   */
  async init(ctx) {
    if (window.ScheduleActions) window.ScheduleActions.bindCtx(ctx);
    if (window.ScheduleRender) window.ScheduleRender.bindCtx(ctx);

    if (window.ScheduleState) window.ScheduleState.syncFromLegacy();

    bindScheduleActionDelegation();

    const events = (ctx && ctx.events) || (window.RBI && window.RBI.events);

    if (events && typeof events.on === 'function') {
      const syncHandler = function () {
        if (window.ScheduleActions) window.ScheduleActions.syncFromLegacy();
      };
      events.on('sync:completed', syncHandler);
      ScheduleModule._syncUnsubscribe = function () {
        if (events.off) events.off('sync:completed', syncHandler);
      };
    }

    if (events && typeof events.emit === 'function') {
      events.emit('schedule:initialized', {});
    }

    console.log('[ScheduleModule] init complete');
  },

  /**
   * Монтирование UI — рендерит блок «Расписание СМР».
   */
  mount(container, ctx) {
    if (window.ScheduleRender) {
      window.ScheduleRender.render(true);
    }
  },

  /**
   * Очистка при уходе с вкладки.
   */
  unmount() {
    if (typeof ScheduleModule._syncUnsubscribe === 'function') {
      ScheduleModule._syncUnsubscribe();
      ScheduleModule._syncUnsubscribe = null;
    }
  }
};

if (typeof window !== 'undefined' && window.RBI && window.RBI.registry) {
  window.RBI.registry.register('module.schedule', ScheduleModule);
}

console.log('[ScheduleModule] schedule.module.js loaded (ES module)');
