// game.module.js — контракт платформы (ES-модуль)
//
// Единственная точка модуля gamification, присваивающая публикуемые имена
// на window (публичная граница модуля — см. ARCHITECTURE_BRIEF.md).
// currentEditingFmeaId/piRadarChartInstance/gameChartInstance — чистый
// module-scope внутри game.actions.js/game.render.js, не публикуются.
// gameActionLogs/weeklyPlanData/engineerAbsence/contractorStatuses остаются
// намеренным исключением (см. game.state.js) — назначаются на window внутри
// самого game.state.js, не здесь.

import {
  PI_GRADES, SKILL_ICONS, COMPETENCIES, gameSaveLogs, gameCalculateAllProfiles,
  getSmartQuest, getWeekId, getStartOfWeek, gameCalculateManagerMetrics, GameState,
  gameNormalizeActionLogs
} from './game.state.js';
import {
  gameLogAction, calculateImpactScore, saveWeeklyPlan, gameUpdatePlanProgress, gameToggleAbsence,
  saveAbsencePeriod, checkAutoExpireAbsence, saveEngineerNameForce, gameVerifyManagerPin,
  gameGenerateAuditPlan, startInspectionWithValues, gameChangeTaskStatus, gameStartTask,
  gameUpdateEngineerName, rbi_executeQualityDayReport, rbi_deleteFmea, rbi_loadFmeaToWorkspace,
  rbi_saveFmea, rbi_handleFmeaPhotoUpload, rbi_removeFmeaPhoto, rbi_createEmptyFmea,
  gameLoadContractorDirectory, gameEditContractor, gameDeleteContractor, gameLoadContractorRequests,
  gameResolveContractorRequest, gameDeleteContractorRequest, gameAddAssignedProjectFromSelect,
  gameRemoveAssignedProjectChip, gameLoadRoles, gameHandleUserAccessRemove, gameBlockUserAccess,
  gameDeleteUserAccess, gameSaveUserAccess, gameLoadAiKb, gameSaveAiKb, gameDeleteAiKb,
  gameFindContractorDuplicates, gameExecuteContractorMerge, rbi_exportFmeaExcel, GameActions
} from './game.actions.js';
import {
  getBadgeTier, getBadgeSvg, injectAbsenceModal, gameShowLevelsModal, gameRenderDashboard,
  profileNameLockStart, profileNameLockCancel, renderRadarChart, renderStatsCharts, gameShowBadgeInfo,
  gameInjectManagerModals, gameOpenManagerPanelAuth, closeManagerPanel, openManagerPanelView,
  switchManagerTab, gameRenderManagerAnalytics,
  gameOpenTaskDetails, gameOpenTopModal, gameOpenImpactModal, rbi_openQualityDaySettings,
  rbi_renderFmeaHistory, rbi_renderFmeaRegistry, rbi_viewFmea, rbi_closeFmeaViewModal,
  rbi_openFmeaBindModal, rbi_closeFmeaBindModal, rbi_saveFmeaBind,
  rbi_onFmeaBindProjectAllChange, rbi_onFmeaBindProjectChange,
  rbi_generateFmeaTable,
  rbi_addManualFmeaRow, gameRenderAssignedProjectChips, gameOpenAiKbModal, GameRender
} from './game.render.js';

window.PI_GRADES = PI_GRADES;
window.SKILL_ICONS = SKILL_ICONS;
window.COMPETENCIES = COMPETENCIES;
window.gameSaveLogs = gameSaveLogs;
window.gameNormalizeActionLogs = gameNormalizeActionLogs;
window.gameCalculateAllProfiles = gameCalculateAllProfiles;
window.getSmartQuest = getSmartQuest;
window.getWeekId = getWeekId;
window.getStartOfWeek = getStartOfWeek;
window.gameCalculateManagerMetrics = gameCalculateManagerMetrics;
window.GameState = GameState;

window.gameLogAction = gameLogAction;
window.calculateImpactScore = calculateImpactScore;
window.saveWeeklyPlan = saveWeeklyPlan;
window.gameUpdatePlanProgress = gameUpdatePlanProgress;
window.gameToggleAbsence = gameToggleAbsence;
window.saveAbsencePeriod = saveAbsencePeriod;
window.checkAutoExpireAbsence = checkAutoExpireAbsence;
window.saveEngineerNameForce = saveEngineerNameForce;
window.gameVerifyManagerPin = gameVerifyManagerPin;
window.gameGenerateAuditPlan = gameGenerateAuditPlan;
window.startInspectionWithValues = startInspectionWithValues;
window.gameChangeTaskStatus = gameChangeTaskStatus;
window.gameStartTask = gameStartTask;
window.gameUpdateEngineerName = gameUpdateEngineerName;
window.rbi_executeQualityDayReport = rbi_executeQualityDayReport;
window.rbi_deleteFmea = rbi_deleteFmea;
window.rbi_loadFmeaToWorkspace = rbi_loadFmeaToWorkspace;
window.rbi_saveFmea = rbi_saveFmea;
window.rbi_handleFmeaPhotoUpload = rbi_handleFmeaPhotoUpload;
window.rbi_removeFmeaPhoto = rbi_removeFmeaPhoto;
window.rbi_createEmptyFmea = rbi_createEmptyFmea;
window.gameLoadContractorDirectory = gameLoadContractorDirectory;
window.gameEditContractor = gameEditContractor;
window.gameDeleteContractor = gameDeleteContractor;
window.gameLoadContractorRequests = gameLoadContractorRequests;
window.gameResolveContractorRequest = gameResolveContractorRequest;
window.gameDeleteContractorRequest = gameDeleteContractorRequest;
window.gameAddAssignedProjectFromSelect = gameAddAssignedProjectFromSelect;
window.gameRemoveAssignedProjectChip = gameRemoveAssignedProjectChip;
window.gameLoadRoles = gameLoadRoles;
window.gameHandleUserAccessRemove = gameHandleUserAccessRemove;
window.gameBlockUserAccess = gameBlockUserAccess;
window.gameDeleteUserAccess = gameDeleteUserAccess;
window.gameSaveUserAccess = gameSaveUserAccess;
window.gameLoadAiKb = gameLoadAiKb;
window.gameSaveAiKb = gameSaveAiKb;
window.gameDeleteAiKb = gameDeleteAiKb;
window.gameFindContractorDuplicates = gameFindContractorDuplicates;
window.gameExecuteContractorMerge = gameExecuteContractorMerge;
window.rbi_exportFmeaExcel = rbi_exportFmeaExcel;
window.GameActions = GameActions;

window.getBadgeTier = getBadgeTier;
window.getBadgeSvg = getBadgeSvg;
window.injectAbsenceModal = injectAbsenceModal;
window.gameShowLevelsModal = gameShowLevelsModal;
window.gameRenderDashboard = gameRenderDashboard;
window.profileNameLockStart = profileNameLockStart;
window.profileNameLockCancel = profileNameLockCancel;
window.renderRadarChart = renderRadarChart;
window.renderStatsCharts = renderStatsCharts;
window.gameShowBadgeInfo = gameShowBadgeInfo;
window.gameInjectManagerModals = gameInjectManagerModals;
window.gameOpenManagerPanelAuth = gameOpenManagerPanelAuth;
window.closeManagerPanel = closeManagerPanel;
window.openManagerPanelView = openManagerPanelView;
window.switchManagerTab = switchManagerTab;
window.gameRenderManagerAnalytics = gameRenderManagerAnalytics;
window.gameOpenTaskDetails = gameOpenTaskDetails;
window.gameOpenTopModal = gameOpenTopModal;
window.gameOpenImpactModal = gameOpenImpactModal;
window.rbi_openQualityDaySettings = rbi_openQualityDaySettings;
window.rbi_renderFmeaHistory = rbi_renderFmeaHistory;
window.rbi_renderFmeaRegistry = rbi_renderFmeaRegistry;
window.rbi_viewFmea = rbi_viewFmea;
window.rbi_closeFmeaViewModal = rbi_closeFmeaViewModal;
window.rbi_openFmeaBindModal = rbi_openFmeaBindModal;
window.rbi_closeFmeaBindModal = rbi_closeFmeaBindModal;
window.rbi_saveFmeaBind = rbi_saveFmeaBind;
window.rbi_onFmeaBindProjectAllChange = rbi_onFmeaBindProjectAllChange;
window.rbi_onFmeaBindProjectChange = rbi_onFmeaBindProjectChange;
window.rbi_generateFmeaTable = rbi_generateFmeaTable;
window.rbi_addManualFmeaRow = rbi_addManualFmeaRow;
window.gameRenderAssignedProjectChips = gameRenderAssignedProjectChips;
window.gameOpenAiKbModal = gameOpenAiKbModal;
window.GameRender = GameRender;

// Делегирование inline onclick/onchange (инициатива «Разбор inline
// onclick/onchange», см. _ai/INDEX_HTML_HANDLERS_MAP.md / _ai/ROADMAP.md).
// Namespace `data-game-action` (не общий `data-action` ai.module.js —
// избегает двойного срабатывания при коллизии владения). Capture-фаза +
// ручной резолвер — тот же паттерн, что в knowledge.module.js/settings.module.js,
// применён для консистентности инициативы (сами 4 узла группы `gamification`
// не находятся внутри stopPropagation-контейнеров).
function bindGameActionDelegation() {
  if (window.__gameActionDelegationBound) return;
  window.__gameActionDelegationBound = true;

  const readArg = (el, valType, evt) => {
    switch (valType) {
      case 'element': return el;
      case 'event': return evt;
      case 'checked': return el.checked;
      case 'int': return parseInt(el.value, 10);
      case 'value': return el.value;
      default: return undefined;
    }
  };

  const dispatch = (el, evt) => {
    const action = el.dataset.gameAction;
    const fn = window[action];
    if (typeof fn !== 'function') return;
    const valType = el.dataset.gameActionValType;
    const arg = valType ? readArg(el, valType, evt) : el.dataset.actionArg;
    if (arg === undefined) {
      fn();
    } else {
      fn(arg);
    }
  };

  const resolveActionElement = (target, wantsChange) => {
    let el = target;
    while (el && el.nodeType === 1) {
      if (el.dataset && el.dataset.gameAction) {
        if (!!(el.dataset.actionEvent === 'change') === wantsChange) return el;
      }
      const inlineOnclick = el.getAttribute && el.getAttribute('onclick');
      if (!wantsChange && inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
      el = el.parentElement;
    }
    return null;
  };

  document.addEventListener('click', (e) => {
    const el = resolveActionElement(e.target, false);
    if (el) dispatch(el, e);
  }, true);

  document.addEventListener('change', (e) => {
    const el = resolveActionElement(e.target, true);
    if (el) dispatch(el, e);
  }, true);
}

export const GameModule = {
  id: 'game',
  routes: ['/game', '/game/:subTab', '/fmea', '/fmea/:id'],
  dependencies: ['storage', 'inspections', 'sync'],

  async init(ctx) {
    ctx.math      = window.RBI && window.RBI.utils && window.RBI.utils.math;
    ctx.toast     = window.RBI && window.RBI.utils && window.RBI.utils.toast;
    ctx.templates = window.RBI && window.RBI.utils && window.RBI.utils.templates;
    if (window.GameActions) window.GameActions.bindCtx(ctx);

    bindGameActionDelegation();

    if (window.GameState) window.GameState.syncFromLegacy();

    // once-guard: повторный init не должен копить document-listeners
    if (!document.__gameSyncListenersBound) {
      document.__gameSyncListenersBound = true;
      document.addEventListener('sync:completed', function () {
        if (window.GameActions) window.GameActions.syncFromLegacy();
      });
      document.addEventListener('inspection:created', function () {
        if (window.GameActions) window.GameActions.updatePlanProgress();
      });
    }


    if (!document.__gameLocaleChangedBound) {
      document.__gameLocaleChangedBound = true;
      ctx.events.on('i18n:localeChanged', function () {
        try {
          var abs = document.getElementById('absence-modal-overlay');
          if (abs) abs.remove();
          if (typeof window.injectAbsenceModal === 'function') window.injectAbsenceModal();
          if (typeof window.gameRenderDashboard === 'function') {
            var dash = document.getElementById('game-dashboard-container');
            if (dash) window.gameRenderDashboard();
          }
        } catch (e) {}
      });
    }

    ctx.events.emit('game:initialized');
  },

  mount(container, ctx) {
    if (window.GameRender) window.GameRender.renderDashboard();
  },

  unmount() {
    // document-listeners живут на всё приложение (once-bound) — не снимаем
  }
};

if (window.RBI && window.RBI.registry) {
  window.RBI.registry.register('module.game', GameModule);
}
