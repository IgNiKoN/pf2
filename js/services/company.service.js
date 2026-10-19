// company.service.js — Minimal Company Context (§29, п.11)
//
// Config/context компании (single-tenant) — не multi-tenant engine.
// enabledModules — каталог business platform-modules (quality/construction/knowledge).
// knowledge — сквозной: при quality и/или construction всегда присутствует в каталоге
// (sanitize) и в init через BUNDLES; knowledge-only и empty shell [] допустимы.
// UI §37.2 Block 3: оверрайд в appSettings.enabledModules (prefs устройства /
// sync UI-профиля), не отдельная company-таблица. Feature-of / construction-v2 —
// через BUNDLES в app.entry; settings — ALWAYS_INIT (platform chrome).
// app.entry режет init по availableModules (= enabled ∩ getAllowedModules)
// + бандлы + ALWAYS_INIT.
//
// §23 Блок 2: roleMatrixOverrides — company SoT в памяти (+ mirror в
// appSettings для offline UI). Cloud: таблица rbi_company_settings.
// Пустой '{}' / нет строки = права как DEFAULT ROLE_MATRIX в permission.service.
//
// «Указатель официальной версии» (редактор системных чек-листов, Блок 1):
// officialTemplates — company SoT в памяти (+ mirror в appSettings), своя
// колонка rbi_company_settings.official_templates, свой dirty-флаг —
// НЕ переиспользует переменные/колонку role_matrix_overrides (push — отдельный
// upsert-вызов, риск гонки двух функций одной строки).

(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var DEFAULT_ENABLED_MODULES = ['quality', 'construction', 'knowledge', 'plan-fact'];
  var BUSINESS_ID_SET = { quality: true, construction: true, knowledge: true, 'plan-fact': true };
  var BUSINESS_ORDER = ['quality', 'construction', 'knowledge', 'plan-fact'];
  var COMPANY_ID = 'rbi';
  var SMOKE_MARKER = '__SMOKE_TEST__';

  /** In-memory company SoT for role matrix overrides. null = ещё не применяли cloud. */
  var _roleMatrixOverrides = null;
  var _roleMatrixDirty = false;
  var _roleMatrixUpdatedAt = null;

  /** In-memory company SoT for official template pointers. null = ещё не применяли cloud. */
  var _officialTemplates = null;
  var _officialTemplatesDirty = false;
  var _officialTemplatesUpdatedAt = null;

  function _settingsSvc() {
    return (window.RBI && window.RBI.services && window.RBI.services.settings) || null;
  }

  function _emit(name, payload) {
    try {
      if (window.RBI && window.RBI.events && typeof window.RBI.events.emit === 'function') {
        window.RBI.events.emit(name, payload);
      }
    } catch (_e) { /* ignore */ }
  }

  /**
   * Sanitize to business ids only: dedupe, order quality → construction → knowledge.
   * If quality or construction present → knowledge is forced on (cross-cutting).
   * Empty array is valid (empty shell). Invalid / non-array → null (use default).
   */
  function _sanitizeEnabledModules(ids) {
    if (!Array.isArray(ids)) return null;
    var seen = {};
    var cleaned = [];
    BUSINESS_ORDER.forEach(function (id) {
      if (ids.indexOf(id) >= 0 && BUSINESS_ID_SET[id] && !seen[id]) {
        seen[id] = true;
        cleaned.push(id);
      }
    });
    var hadOnlyJunk = ids.length > 0 && cleaned.length === 0 &&
      !ids.some(function (id) { return BUSINESS_ID_SET[id]; });
    if (hadOnlyJunk) return null;
    // Сквозной knowledge: обязателен вместе с quality / construction
    var needsKb = cleaned.indexOf('quality') >= 0 || cleaned.indexOf('construction') >= 0;
    if (needsKb && cleaned.indexOf('knowledge') < 0) {
      cleaned.push('knowledge');
    }
    return cleaned;
  }

  /**
   * Версия каталога модулей. Профили, сохранённые до появления новых модулей, не знают о них:
   * например до «План/Факт СМР» в сохранённом наборе стояли только quality/construction/knowledge.
   * Без миграции такой профиль навсегда остаётся без модуля, хотя компания его не выключала.
   *
   * Миграция добавляет только **новые** модули и не трогает осознанные выключения. После первого
   * применения версия записывается, поэтому если админ потом выключит модуль — он останется выключенным.
   */
  var ENABLED_MODULES_VERSION = 2;
  var ENABLED_MODULES_MIGRATIONS = [
    { toVersion: 2, add: ['plan-fact'] }
  ];

  function _readVersion() {
    var svc = _settingsSvc();
    var raw = (svc && typeof svc.get === 'function')
      ? svc.get('enabledModulesVersion')
      : (window.appSettings ? window.appSettings.enabledModulesVersion : null);
    var value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function _persistVersion(version) {
    var svc = _settingsSvc();
    if (svc && typeof svc.set === 'function') {
      return Promise.resolve(svc.set('enabledModulesVersion', version)).then(function () { return true; });
    }
    if (window.appSettings) {
      window.appSettings.enabledModulesVersion = version;
      window.appSettings.settingsUpdatedAt = Date.now();
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  /** Дополнить сохранённый набор модулями, которые появились после его сохранения. */
  function _migrateOverride(override) {
    if (override == null) return { modules: null, changed: false };
    var version = _readVersion();
    if (version >= ENABLED_MODULES_VERSION) return { modules: override, changed: false };
    var modules = override.slice();
    ENABLED_MODULES_MIGRATIONS.forEach(function (step) {
      if (version >= step.toVersion) return;
      step.add.forEach(function (id) {
        if (modules.indexOf(id) < 0) modules.push(id);
      });
    });
    var cleaned = _sanitizeEnabledModules(modules);
    return { modules: cleaned == null ? modules : cleaned, changed: true };
  }

  function _readOverride() {
    var svc = _settingsSvc();
    var raw = null;
    if (svc && typeof svc.get === 'function') {
      raw = svc.get('enabledModules');
    } else if (window.appSettings) {
      raw = window.appSettings.enabledModules;
    }
    if (raw == null) return null;
    return _sanitizeEnabledModules(raw);
  }

  function _persist(value) {
    var svc = _settingsSvc();
    if (svc && typeof svc.set === 'function') {
      return Promise.resolve(svc.set('enabledModules', value)).then(function () {
        return true;
      });
    }
    if (window.appSettings) {
      window.appSettings.enabledModules = value;
      window.appSettings.settingsUpdatedAt = Date.now();
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  function _cloneRoleOverrides(src) {
    var out = {};
    var raw = src && typeof src === 'object' && !Array.isArray(src) ? src : {};
    Object.keys(raw).forEach(function (key) {
      if (key === SMOKE_MARKER) {
        out[SMOKE_MARKER] = raw[SMOKE_MARKER];
        return;
      }
      var entry = raw[key];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      out[key] = Object.assign({}, entry);
      if (Array.isArray(entry.allowedModules)) {
        out[key].allowedModules = entry.allowedModules.slice();
      }
    });
    return out;
  }

  /** Meaningful SoT: at least one roleKey (не считая служебный smoke-маркер). */
  function _hasMeaningfulRoleKeys(map) {
    if (!map || typeof map !== 'object') return false;
    return Object.keys(map).some(function (k) {
      return k !== SMOKE_MARKER && map[k] && typeof map[k] === 'object';
    });
  }

  function _mirrorRoleOverridesLocal(map) {
    var safe = _cloneRoleOverrides(map);
    var svc = _settingsSvc();
    if (svc && typeof svc.set === 'function') {
      return Promise.resolve(svc.set('roleMatrixOverrides', safe)).then(function () {
        return true;
      });
    }
    if (window.appSettings) {
      window.appSettings.roleMatrixOverrides = safe;
      window.appSettings.settingsUpdatedAt = Date.now();
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  /**
   * Клонировать map указателей официальных версий: { systemKey: { type, ref,
   * version, updatedAt, updatedBy } }. Валидные записи только type 'system'|'user'.
   */
  function _cloneOfficialTemplates(src) {
    var out = {};
    var raw = src && typeof src === 'object' && !Array.isArray(src) ? src : {};
    Object.keys(raw).forEach(function (key) {
      var entry = raw[key];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      var type = entry.type === 'user' ? 'user' : (entry.type === 'system' ? 'system' : null);
      if (!type) return;
      out[key] = {
        type: type,
        ref: type === 'user' ? (entry.ref || null) : null,
        version: Number(entry.version) || 1,
        updatedAt: entry.updatedAt || null,
        updatedBy: entry.updatedBy || null
      };
    });
    return out;
  }

  function _mirrorOfficialTemplatesLocal(map) {
    var safe = _cloneOfficialTemplates(map);
    var svc = _settingsSvc();
    if (svc && typeof svc.set === 'function') {
      return Promise.resolve(svc.set('officialTemplates', safe)).then(function () {
        return true;
      });
    }
    if (window.appSettings) {
      window.appSettings.officialTemplates = safe;
      window.appSettings.settingsUpdatedAt = Date.now();
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  function _currentUserLabel() {
    try {
      if (window.appSettings && window.appSettings.inspectorName) {
        return String(window.appSettings.inspectorName);
      }
    } catch (_e) { /* ignore */ }
    return 'admin';
  }

  var CompanyService = {
    getDefaultEnabledModules: function () {
      return DEFAULT_ENABLED_MODULES.slice();
    },

    getCompany: function () {
      var override = _readOverride();
      var migrated = _migrateOverride(override);
      if (migrated.changed && migrated.modules) {
        // Сохраняем один раз: дальше выбор админа (включая выключение) главнее миграции.
        _persist(migrated.modules).then(function () {
          return _persistVersion(ENABLED_MODULES_VERSION);
        }).catch(function () { /* профиль только для чтения — переживём */ });
      }
      var enabled = migrated.modules != null ? migrated.modules : DEFAULT_ENABLED_MODULES.slice();
      return {
        id: COMPANY_ID,
        name: 'RBI',
        enabledModules: enabled.slice()
      };
    },

    /**
     * Persist enabledModules override (prefs). Empty [] allowed = empty shell.
     * @returns {Promise<{ error: string|null, enabledModules?: string[] }>}
     */
    setEnabledModules: function (ids) {
      var cleaned = _sanitizeEnabledModules(ids);
      if (cleaned == null) {
        return Promise.resolve({ error: 'invalid_modules' });
      }
      return _persist(cleaned).then(function (ok) {
        if (!ok) return { error: 'persist_failed' };
        _persistVersion(ENABLED_MODULES_VERSION).catch(function () {});
        _emit('company:enabledModulesChanged', { enabledModules: cleaned.slice() });
        return { error: null, enabledModules: cleaned.slice() };
      }).catch(function (e) {
        console.error('[CompanyService] setEnabledModules', e);
        return { error: e && e.message ? e.message : 'persist_failed' };
      });
    },

    /**
     * Clear override → default ['quality','construction','knowledge'].
     * @returns {Promise<{ error: string|null, enabledModules?: string[] }>}
     */
    resetEnabledModules: function () {
      return _persist(null).then(function (ok) {
        if (!ok) return { error: 'persist_failed' };
        var def = DEFAULT_ENABLED_MODULES.slice();
        _emit('company:enabledModulesChanged', { enabledModules: def });
        return { error: null, enabledModules: def };
      }).catch(function (e) {
        console.error('[CompanyService] resetEnabledModules', e);
        return { error: e && e.message ? e.message : 'persist_failed' };
      });
    },

    // --- §23 Блок 2: company role-matrix SoT ---

    getCompanyId: function () {
      return COMPANY_ID;
    },

    /**
     * Копия company-оверрайдов из памяти ({} если SoT ещё не задан).
     * Не включает fallback на local prefs — это делает permission.service.
     */
    getRoleMatrixOverrides: function () {
      return _cloneRoleOverrides(_roleMatrixOverrides || {});
    },

    /**
     * Есть ли company SoT с хотя бы одним roleKey (тогда он побеждает local).
     */
    hasCompanyRoleMatrixOverrides: function () {
      return _hasMeaningfulRoleKeys(_roleMatrixOverrides);
    },

    isRoleMatrixDirty: function () {
      return !!_roleMatrixDirty;
    },

    getRoleMatrixUpdatedAt: function () {
      return _roleMatrixUpdatedAt;
    },

    /**
     * Записать sparse overrides в company SoT + local mirror; пометить dirty для sync push.
     * @returns {Promise<{ error: string|null, overrides?: object }>}
     */
    setRoleMatrixOverrides: function (overrides) {
      var next = _cloneRoleOverrides(overrides);
      _roleMatrixOverrides = next;
      _roleMatrixDirty = true;
      _roleMatrixUpdatedAt = new Date().toISOString();
      try {
        localStorage.setItem('rbi_cloud_dirty', '1');
      } catch (_ls) { /* ignore */ }
      return _mirrorRoleOverridesLocal(next).then(function () {
        _emit('company:roleMatrixOverridesChanged', {
          overrides: _cloneRoleOverrides(next),
          source: 'local'
        });
        try {
          if (typeof window.triggerSync === 'function') {
            window.triggerSync('silent');
          }
        } catch (_sync) { /* ignore */ }
        return { error: null, overrides: _cloneRoleOverrides(next) };
      }).catch(function (e) {
        console.error('[CompanyService] setRoleMatrixOverrides', e);
        return { error: e && e.message ? e.message : 'persist_failed' };
      });
    },

    /**
     * Сброс company SoT → {} (DEFAULT в permission); dirty для push.
     * @returns {Promise<{ error: string|null, overrides?: object }>}
     */
    clearRoleMatrixOverrides: function () {
      return this.setRoleMatrixOverrides({});
    },

    /**
     * Применить оверрайды с cloud pull (без dirty). Пустой/null → очистить SoT.
     * Если локально dirty — не затирать (ожидаем push).
     * @returns {{ applied: boolean, skippedDirty?: boolean }}
     */
    applyRoleMatrixOverridesFromCloud: function (overrides, updatedAt) {
      if (_roleMatrixDirty) {
        return { applied: false, skippedDirty: true };
      }
      var next = _cloneRoleOverrides(overrides || {});
      _roleMatrixOverrides = next;
      _roleMatrixUpdatedAt = updatedAt || new Date().toISOString();
      _mirrorRoleOverridesLocal(next);
      _emit('company:roleMatrixOverridesChanged', {
        overrides: _cloneRoleOverrides(next),
        source: 'cloud'
      });
      return { applied: true };
    },

    /**
     * После успешного push — снять dirty (SoT уже в облаке).
     */
    markRoleMatrixSynced: function (updatedAt) {
      _roleMatrixDirty = false;
      if (updatedAt) _roleMatrixUpdatedAt = updatedAt;
    },

    /**
     * Пометить dirty вручную (редко; обычно setRoleMatrixOverrides).
     */
    markRoleMatrixDirty: function () {
      _roleMatrixDirty = true;
      _roleMatrixUpdatedAt = new Date().toISOString();
    },

    // --- Редактор системных чек-листов Блок 1: указатель официальной версии ---

    /**
     * Копия указателей официальных версий ({} если SoT ещё не задан).
     * Ключ — systemKey (ключ SYSTEM_TEMPLATES), значение —
     * { type: 'user', ref: userTemplateSlug, version, updatedAt, updatedBy }.
     * Отсутствие ключа = «Поставка» (нет оверрайда).
     */
    getOfficialTemplates: function () {
      return _cloneOfficialTemplates(_officialTemplates || {});
    },

    isOfficialTemplatesDirty: function () {
      return !!_officialTemplatesDirty;
    },

    getOfficialTemplatesUpdatedAt: function () {
      return _officialTemplatesUpdatedAt;
    },

    /**
     * Назначить официальную версию systemKey → указатель на user_template.
     * version = +1 относительно текущего указателя того же systemKey (иначе 1).
     * @returns {Promise<{ error: string|null, entry?: object }>}
     */
    setOfficialTemplate: function (systemKey, pointer) {
      if (!systemKey || !pointer || pointer.type !== 'user' || !pointer.ref) {
        return Promise.resolve({ error: 'invalid_pointer' });
      }
      var next = _cloneOfficialTemplates(_officialTemplates || {});
      var prevVersion = (next[systemKey] && Number(next[systemKey].version)) || 0;
      var entry = {
        type: 'user',
        ref: pointer.ref,
        version: prevVersion + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: _currentUserLabel()
      };
      next[systemKey] = entry;
      _officialTemplates = next;
      _officialTemplatesDirty = true;
      _officialTemplatesUpdatedAt = entry.updatedAt;
      try {
        localStorage.setItem('rbi_cloud_dirty', '1');
      } catch (_ls) { /* ignore */ }
      return _mirrorOfficialTemplatesLocal(next).then(function () {
        _emit('company:officialTemplatesChanged', {
          officialTemplates: _cloneOfficialTemplates(next),
          source: 'local'
        });
        try {
          if (typeof window.triggerSync === 'function') {
            window.triggerSync('silent');
          }
        } catch (_sync) { /* ignore */ }
        return { error: null, entry: Object.assign({}, entry) };
      }).catch(function (e) {
        console.error('[CompanyService] setOfficialTemplate', e);
        return { error: e && e.message ? e.message : 'persist_failed' };
      });
    },

    /**
     * Снять указатель («Вернуть к поставке»). Сама пользовательская копия
     * не удаляется — становится обычным неофициальным черновиком.
     * @returns {Promise<{ error: string|null }>}
     */
    clearOfficialTemplate: function (systemKey) {
      if (!systemKey) return Promise.resolve({ error: 'invalid_key' });
      var next = _cloneOfficialTemplates(_officialTemplates || {});
      if (!next[systemKey]) return Promise.resolve({ error: null });
      delete next[systemKey];
      _officialTemplates = next;
      _officialTemplatesDirty = true;
      _officialTemplatesUpdatedAt = new Date().toISOString();
      try {
        localStorage.setItem('rbi_cloud_dirty', '1');
      } catch (_ls) { /* ignore */ }
      return _mirrorOfficialTemplatesLocal(next).then(function () {
        _emit('company:officialTemplatesChanged', {
          officialTemplates: _cloneOfficialTemplates(next),
          source: 'local'
        });
        try {
          if (typeof window.triggerSync === 'function') {
            window.triggerSync('silent');
          }
        } catch (_sync) { /* ignore */ }
        return { error: null };
      }).catch(function (e) {
        console.error('[CompanyService] clearOfficialTemplate', e);
        return { error: e && e.message ? e.message : 'persist_failed' };
      });
    },

    /**
     * Применить указатели с cloud pull (без dirty). Если локально dirty —
     * не затирать (ожидаем push).
     * @returns {{ applied: boolean, skippedDirty?: boolean }}
     */
    applyOfficialTemplatesFromCloud: function (map, updatedAt) {
      if (_officialTemplatesDirty) {
        return { applied: false, skippedDirty: true };
      }
      var next = _cloneOfficialTemplates(map || {});
      _officialTemplates = next;
      _officialTemplatesUpdatedAt = updatedAt || new Date().toISOString();
      _mirrorOfficialTemplatesLocal(next);
      _emit('company:officialTemplatesChanged', {
        officialTemplates: _cloneOfficialTemplates(next),
        source: 'cloud'
      });
      return { applied: true };
    },

    /**
     * После успешного push — снять dirty (SoT уже в облаке).
     */
    markOfficialTemplatesSynced: function (updatedAt) {
      _officialTemplatesDirty = false;
      if (updatedAt) _officialTemplatesUpdatedAt = updatedAt;
    }
  };

  window.RBI = window.RBI || {};
  window.RBI.services = window.RBI.services || {};
  window.RBI.services.company = CompanyService;
  if (window.RBI.registry && window.RBI.registry.register) {
    window.RBI.registry.register('service.company', CompanyService);
  }

  console.log('[CompanyService] company.service.js loaded');
}());
