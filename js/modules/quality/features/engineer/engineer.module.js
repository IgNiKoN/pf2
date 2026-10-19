// engineer.module.js — Фаза 20: контракт платформы (ES-модуль)
//
// Стратегия фасада: функции rbi_switchEngineerSubTab / rbi_renderEngineerTab
// остаются в app.js как legacy-монолит.
// ES-модуль только:
//   1. Регистрирует себя в window.RBI.registry как 'module.engineer'
//   2. Синхронизирует EngineerState из window.rbi_tasksData
//   3. Делегирует действия в window.*-функции из app.js
//
// Порядок загрузки гарантирован: app.js загружается как обычный <script>
// до этого ES-модуля — все window.*-функции из app.js уже доступны.

import './engineer.state.js';
import './engineer.actions.js';
import './engineer.render.js';

export const EngineerModule = {
  id: 'engineer',
  routes: ['/engineer', '/engineer/:subTab'],
  dependencies: ['storage', 'tasks', 'game', 'analytics'],

  _syncUnsubscribe: null,
  _tasksLoadedUnsubscribe: null,

  /**
   * Инициализация: синхронизирует EngineerState из window.rbi_tasksData,
   * подписывается на sync:completed и tasks:loaded.
   * Вызывается один раз при старте платформы.
   */
  async init(ctx) {
    ctx.math      = window.RBI && window.RBI.utils && window.RBI.utils.math;
    ctx.toast     = window.RBI && window.RBI.utils && window.RBI.utils.toast;
    ctx.templates = window.RBI && window.RBI.utils && window.RBI.utils.templates;
    if (window.EngineerActions) window.EngineerActions.bindCtx(ctx);
    if (window.EngineerState) window.EngineerState.bindCtx(ctx);
    if (window.EngineerRender) window.EngineerRender.bindCtx(ctx);

    if (window.EngineerState) window.EngineerState.syncFromLegacy();

    const events = (ctx && ctx.events) || (window.RBI && window.RBI.events);

    if (events && typeof events.on === 'function') {
      const syncHandler = function () {
        if (window.EngineerActions) window.EngineerActions.syncFromLegacy();
      };
      events.on('sync:completed', syncHandler);
      EngineerModule._syncUnsubscribe = function () {
        if (events.off) events.off('sync:completed', syncHandler);
      };

      const tasksLoadedHandler = function () {
        if (window.EngineerState) window.EngineerState.setDataLoaded(true);
      };
      events.on('tasks:loaded', tasksLoadedHandler);
      EngineerModule._tasksLoadedUnsubscribe = function () {
        if (events.off) events.off('tasks:loaded', tasksLoadedHandler);
      };
    }

    if (events && typeof events.emit === 'function') {
      events.emit('engineer:initialized', {});
    }

    console.log('[EngineerModule] init complete');
  },

  /**
   * Монтирование UI — рендерит текущую подвкладку.
   */
  mount(container, ctx) {
    if (window.EngineerRender && window.EngineerState) {
      window.EngineerRender.render(window.EngineerState.getCurrentSubTab());
    }
  },

  /**
   * Очистка при уходе с вкладки.
   */
  unmount() {
    if (typeof EngineerModule._syncUnsubscribe === 'function') {
      EngineerModule._syncUnsubscribe();
      EngineerModule._syncUnsubscribe = null;
    }
    if (typeof EngineerModule._tasksLoadedUnsubscribe === 'function') {
      EngineerModule._tasksLoadedUnsubscribe();
      EngineerModule._tasksLoadedUnsubscribe = null;
    }
  }
};

if (typeof window !== 'undefined' && window.RBI && window.RBI.registry) {
  window.RBI.registry.register('module.engineer', EngineerModule);
}

console.log('[EngineerModule] engineer.module.js loaded (ES module)');
