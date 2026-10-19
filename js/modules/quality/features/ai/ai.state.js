// === AI State — Фаза 19 ===
// Изолированное состояние AI-модуля.
// Экспортируется через ES export; публикацию в window.AIState для legacy-кода
// делает ai.module.js (entry).

function _getSetting(key) {
  return ((AIState._ctx && AIState._ctx.settings) || window.RBI.services.settings).get(key);
}

const AIState = {
    _ctx: null,
    bindCtx(ctx) { this._ctx = ctx; },
    _isEnabled: false,
    _authMode: 'corporate',
    _isProcessing: false,
    _lastError: null,

    /** Живая ссылка на флаг из appSettings */
    isEnabled() {
      return !!_getSetting('aiEnabled');
    },

    /** Живая ссылка на режим авторизации из appSettings */
    getAuthMode() {
      return _getSetting('aiAuthMode') || 'corporate';
    },

    isProcessing() {
      return this._isProcessing;
    },

    setProcessing(v) {
      this._isProcessing = !!v;
    },

    /** Снимает текущие значения из appSettings → внутренние поля */
    syncFromLegacy() {
      this._isEnabled = !!_getSetting('aiEnabled');
      this._authMode = _getSetting('aiAuthMode') || 'corporate';
    }
};

export { AIState };
