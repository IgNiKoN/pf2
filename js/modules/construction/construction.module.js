// ─── construction.module.js — Фаза 15: контракт платформы для модуля Construction
// ES-модуль. Features подтягиваются side-effect import (порядок = бывшие static теги).
// state/actions/render — именованные import ниже.

import './features/construction-core.js';
import './features/defect-form.js';
import './features/pdf-viewer.js';
import './features/admin.js';
import './features/acceptance.js';
import './features/transfer.js';

import { ConstructionState } from './construction.state.js';
import { ConstructionActions } from './construction.actions.js';
import { ConstructionRender } from './construction.render.js';

window.ConstructionState = ConstructionState;
window.ConstructionActions = ConstructionActions;
window.ConstructionRender = ConstructionRender;

var _listeners = [];

function on(target, event, handler) {
  target.addEventListener(event, handler);
  _listeners.push({ target: target, event: event, handler: handler });
}

function off() {
  _listeners.forEach(function (l) {
    l.target.removeEventListener(l.event, l.handler);
  });
  _listeners = [];
}

export var ConstructionModule = {
  id: 'construction',
  routes: ['/construction', '/construction/:subTab'],
  dependencies: ['storage', 'constManager', 'constAcceptance', 'transferManager'],

  init: function (ctx) {
    ctx.math      = window.RBI && window.RBI.utils && window.RBI.utils.math;
    ctx.toast     = window.RBI && window.RBI.utils && window.RBI.utils.toast;
    ctx.templates = window.RBI && window.RBI.utils && window.RBI.utils.templates;
    if (window.ConstructionActions) window.ConstructionActions.bindCtx(ctx);
    if (window.ConstManager && typeof window.ConstManager.bindCtx === 'function') window.ConstManager.bindCtx(ctx);
    if (window.ConstDefectForm && typeof window.ConstDefectForm.bindCtx === 'function') window.ConstDefectForm.bindCtx(ctx);
    if (window.UniversalPdfViewer && typeof window.UniversalPdfViewer.bindCtx === 'function') window.UniversalPdfViewer.bindCtx(ctx);
    if (window.ConstAdmin && typeof window.ConstAdmin.bindCtx === 'function') window.ConstAdmin.bindCtx(ctx);
    if (window.ConstAcceptance && typeof window.ConstAcceptance.bindCtx === 'function') window.ConstAcceptance.bindCtx(ctx);
    if (window.TransferManager && typeof window.TransferManager.bindCtx === 'function') window.TransferManager.bindCtx(ctx);

    // Синхронизация ConstructionState из window.ConstManager.*
    if (window.ConstructionState && typeof window.ConstructionState.syncFromLegacy === 'function') {
      window.ConstructionState.syncFromLegacy();
    }

    // sync:completed → данные в память; full-render ConstManager.init только
    // вне активного экрана. На активном — markDirty, paint через flush только
    // если DOM ещё скелетон/пуст (см. sync-ui-defer.flushDirtyActiveViews).
    on(document, 'sync:completed', function () {
      if (window.ConstructionState && typeof window.ConstructionState.syncFromLegacy === 'function') {
        window.ConstructionState.syncFromLegacy();
      }
      if (window.RBI && window.RBI.utils && window.RBI.utils.syncUi && window.RBI.utils.syncUi.markDirty) {
        window.RBI.utils.syncUi.markDirty('construction');
      } else if (window.syncDirtyFlags) {
        window.syncDirtyFlags.construction = true;
      }
      if (typeof window.shouldDeferFullRender === 'function' && window.shouldDeferFullRender('construction')) {
        return;
      }
      // Экран не активен — можно тихо пересобрать off-screen.
      var syncUi = window.RBI && window.RBI.utils && window.RBI.utils.syncUi;
      var constructionActive = syncUi && typeof syncUi.isViewActive === 'function'
        ? syncUi.isViewActive('construction')
        : false;
      if (!constructionActive && window.ConstructionActions) {
        window.ConstructionActions.init();
        if (window.syncDirtyFlags) window.syncDirtyFlags.construction = false;
      }
    });

    on(document, 'audit:defectsCreated', function (e) {
      if (window.ConstructionActions) {
        window.ConstructionActions.handleDefectsCreated(e.detail && e.detail.defects);
      }
    });

    on(document, 'audit:acceptanceStatusChanged', function (e) {
      if (window.ConstructionActions) {
        window.ConstructionActions.handleAcceptanceStatusChanged(e.detail && e.detail.requestId, e.detail && e.detail.status);
      }
    });

    on(document, 'sharedPhotoEditor:defectFixSaved', function (e) {
      if (window.ConstructionActions) {
        window.ConstructionActions.handleDefectFixSaved(e.detail || {});
      }
    });

    document.dispatchEvent(new CustomEvent('construction:initialized'));
    console.log('[RBI Module] construction.module initialized');
  },

  mount: function (container, ctx) {
    var subTab = (ctx && ctx.subTab) ||
                 (window.ConstructionState ? window.ConstructionState.activeSubTab : 'defects');
    if (window.ConstructionRender) {
      window.ConstructionRender.render(subTab);
    }
  },

  unmount: function () {
    off();
  }
};

// Регистрация: перезапишет legacy stub, зарегистрированный в construction.legacy.js
if (window.RBI && window.RBI.registry) {
  window.RBI.registry.register('module.construction', ConstructionModule);
} else {
  document.addEventListener('rbi:ready', function () {
    if (window.RBI && window.RBI.registry) {
      window.RBI.registry.register('module.construction', ConstructionModule);
    }
  }, { once: true });
}

window.ConstructionModule = ConstructionModule;
export default ConstructionModule;
