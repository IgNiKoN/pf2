// user-context.service.js — UserContextService (Auth Gate + User Context, Шаг 1, §29 п.10)
//
// Read-only агрегатор уже существующих источников данных пользователя
// (permission.service.js, app-mode.service.js, window.syncConfig.projectCode).
// Не создаёт нового состояния, не пишет ни в один источник, не вводит
// матрицу прав по модулям (companyId/availableModules — константы до
// появления реального multi-tenant/ролевого разграничения, см. §23).

(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  // Fallback-список на случай, если company.service.js по какой-то причине
  // не загружен (порядок скриптов нарушен) — не единственный источник истины,
  // основной источник — CompanyService.getCompany().enabledModules.
  var FALLBACK_AVAILABLE_MODULES = ['quality', 'sk', 'settings', 'knowledge', 'construction', 'game', 'ai'];

  var UserContextService = {
    getUserContext: function () {
      var permissions = window.RBI && window.RBI.services && window.RBI.services.permissions;
      var appMode = window.RBI && window.RBI.services && window.RBI.services.appMode;
      var company = window.RBI && window.RBI.services && window.RBI.services.company;
      var companyData = company ? company.getCompany() : null;

      var id = permissions ? permissions.getCurrentEngineerName() : 'Инженер';
      var role = permissions ? permissions.getCurrentRole() : 'guest';
      var enabledModules = companyData ? companyData.enabledModules : FALLBACK_AVAILABLE_MODULES.slice();
      var allowedModules = permissions ? permissions.getAllowedModules(role) : enabledModules;
      var availableModules = enabledModules.filter(function (m) {
        return allowedModules.indexOf(m) !== -1;
      });

      return {
        id: id,
        name: id,
        role: role,
        companyId: companyData ? companyData.id : 'rbi',
        projectCode: (window.syncConfig && window.syncConfig.projectCode) || '',
        availableModules: availableModules,
        defaultModule: appMode ? appMode.getMode() : 'quality'
      };
    }
  };

  window.RBI = window.RBI || {};
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.userContext = UserContextService;
  if (window.RBI.registry && window.RBI.registry.register) {
    window.RBI.registry.register('service.userContext', UserContextService);
  }

  console.log('[UserContextService] user-context.service.js loaded');
}());
