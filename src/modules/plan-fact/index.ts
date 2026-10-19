/**
 * Platform entry: plan-fact (Vite bundle).
 * Ядро вызывает init(ctx) через module-loader.loadModule('plan-fact'), роуты модуль
 * регистрирует сам (как construction-v2): mount/unmount ядро не вызывает.
 * Всё чтение платформы — через публичные сервисы, своего состояния прав и данных нет.
 */

import { PlanFactManifest } from './manifest';
import type { PlanFactTab } from './types';
import { initPlanFactCloud } from './domain/cloud';
import { getPlanFactTab, mountPlanFactShell, renderPlanFact, setPlanFactTab, setSectionNavigator } from './ui';

let _inited = false;

const TAB_IDS: PlanFactTab[] = ['summary', 'vor', 'contours', 'works', 'schedule', 'foreman', 'fact'];

function _hashPath(): string {
  return String(window.location.hash || '').replace(/^#/, '');
}

function _applyHashTab(): void {
  const path = _hashPath();
  if (!path.startsWith('/plan-fact/')) return;
  const sub = path.slice('/plan-fact/'.length).split('/')[0] as PlanFactTab;
  if (TAB_IDS.indexOf(sub) !== -1) setPlanFactTab(sub);
}

interface PlanFactModeManager {
  currentMode?: string;
  changeMode?: (mode: string) => void;
  updateHeaderVisibility?: (show?: boolean) => void;
  renderBottomNav?: () => void;
}

function _modeManager(): PlanFactModeManager | undefined {
  return (window as unknown as { AppModeManager?: PlanFactModeManager }).AppModeManager;
}

/**
 * Гарантирует режим приложения 'plan-fact' перед показом экрана.
 * Роут модуля перекрывает роут оболочки в AppRouter, поэтому переключение режима
 * (и всё, что за него отвечает: хедер, bottom-nav, рейл) делает сам модуль.
 * Возвращает true, когда режим уже нужный и можно просто показать экран.
 */
function _ensureMode(): boolean {
  const modeMgr = _modeManager();
  if (!modeMgr || !modeMgr.currentMode) return true;
  if (modeMgr.currentMode === 'plan-fact') return true;
  if (typeof modeMgr.changeMode === 'function') {
    modeMgr.changeMode('plan-fact');
    return false;
  }
  return true;
}

/** Показать экран модуля: App Shell переключает вкладки классом .active, не .hidden. */
export function showTab(): void {
  document.querySelectorAll('.view-section').forEach((el) => {
    el.classList.remove('active');
  });
  const tab = document.getElementById('tab-plan-fact');
  if (tab) {
    tab.classList.remove('hidden');
    tab.classList.add('active');
  }

  const modeMgr = _modeManager();
  if (modeMgr && typeof modeMgr.updateHeaderVisibility === 'function') {
    modeMgr.updateHeaderVisibility(true);
  }
  if (modeMgr && modeMgr.currentMode === 'plan-fact' && typeof modeMgr.renderBottomNav === 'function') {
    modeMgr.renderBottomNav();
  }

  renderPlanFact();

  if (typeof window.updateBodyPadding === 'function') {
    setTimeout(() => window.updateBodyPadding?.(), 50);
  }
}

/**
 * Открыть модуль по текущему маршруту.
 *
 * Роут модуля обслуживает и голый `#/plan-fact`, и подвкладки `#/plan-fact/<tab>`,
 * поэтому подвкладку читаем здесь: рейл ходит через `router.navigate` (pushState),
 * события `hashchange` при этом не бывает, и без этого шага клик по рейлу не переключал
 * раздел — переключались только верхние вкладки.
 */
function _openModule(): void {
  _applyHashTab();
  if (_ensureMode()) {
    _syncHashWithTab();
    showTab();
  }
}

/** Голый `#/plan-fact` дописываем до подвкладки: иначе рейл не подсветит открытый раздел. */
function _syncHashWithTab(): void {
  if (_hashPath() !== '/plan-fact') return;
  const target = `#/plan-fact/${getPlanFactTab()}`;
  const router = window.AppRouter;
  if (window.location.hash === target) return;
  if (router && typeof router.navigate === 'function') router.navigate(target, true);
  else window.location.hash = target;
}

/** Верхние вкладки меняют маршрут — рейл и история остаются согласованными. */
function _wireSectionNavigator(): void {
  setSectionNavigator((tab) => {
    const target = `#/plan-fact/${tab}`;
    if (window.location.hash === target) return;
    const router = window.AppRouter;
    if (router && typeof router.navigate === 'function') router.navigate(target);
    else window.location.hash = target;
  });
}

function _registerAppRouter(): void {
  const router = window.AppRouter;
  if (router && typeof router.addRoute === 'function') {
    router.addRoute('#/plan-fact', _openModule);
    TAB_IDS.forEach((id) => {
      if (router.addRoute) router.addRoute(`#/plan-fact/${id}`, _openModule);
    });
  }

  // `hashchange` — ручная правка URL; `popstate` — кнопки «назад/вперёд» и переходы
  // ядра через pushState (событие hashchange там не приходит вовсе).
  const _followRoute = (): void => {
    if (_hashPath().startsWith('/plan-fact')) _openModule();
  };
  window.addEventListener('hashchange', _followRoute);
  window.addEventListener('popstate', _followRoute);

  if (_hashPath().startsWith('/plan-fact')) {
    setTimeout(_openModule, 0);
  }
}

export async function init(_ctx?: Record<string, unknown>): Promise<{ ok: boolean; reentered?: boolean }> {
  if (_inited) {
    _applyHashTab();
    _openModule();
    return { ok: true, reentered: true };
  }

  mountPlanFactShell();
  _applyHashTab();
  renderPlanFact();
  _wireSectionNavigator();

  // Справочник объектов приходит из locations: по его обновлении перечитываем список.
  window.RBI?.events?.on?.('locations:changed', () => {
    const tab = document.getElementById('tab-plan-fact');
    if (tab && !tab.classList.contains('hidden')) renderPlanFact();
  });

  _registerAppRouter();
  // Облако: очередь уезжает после цикла синхронизации ядра, при появлении сети и на старте.
  // Без проекта/сессии ничего не происходит — очередь просто остаётся на устройстве.
  initPlanFactCloud();
  if (_hashPath().startsWith('/plan-fact')) _openModule();

  _inited = true;
  console.info('[plan-fact] init ok');
  return { ok: true };
}

function registerModule(): void {
  window.RBI = window.RBI || ({ services: {} } as Window['RBI']);
  const mod = { init, showTab, manifest: PlanFactManifest, render: renderPlanFact };
  if (window.RBI.registry?.register) {
    window.RBI.registry.register('module.plan-fact', mod);
  }
  (window as unknown as { PlanFactModule?: typeof mod }).PlanFactModule = mod;
}

registerModule();

export { PlanFactManifest };
export default { init, showTab, manifest: PlanFactManifest };
