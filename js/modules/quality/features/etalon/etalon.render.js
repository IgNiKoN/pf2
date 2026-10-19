// etalon.render.js — Фаза 18: рендер-диспетчер модуля Etalon
//
// Примечание: etalon.js не содержит отдельных render-функций —
// вся отрисовка встроена в openEtalonConstructor и openEtalonViewer.
// EtalonRender делегирует в EtalonActions (тонкий диспетчер).

function _etalonRenderT(key, fallback, vars) {
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

(function () {
  function _t(key, fallback, vars) {
    return _etalonRenderT(key, fallback, vars);
  }

  const EtalonRender = {

    /**
     * Открыть конструктор эталона.
     * Делегирует в EtalonActions.openConstructor().
     */
    openConstructor(params) {
      if (window.EtalonActions) {
        var p = params || {};
        window.EtalonActions.openConstructor(
          p.contractor,
          p.templateKey,
          p.templateTitle,
          p.projectName,
          p.statusKey
        );
      } else {
        console.warn('[EtalonRender] EtalonActions недоступен');
      }
    },

    /**
     * Открыть просмотр акта.
     * Делегирует в EtalonActions.openViewer().
     */
    openViewer(id) {
      if (window.EtalonActions) {
        window.EtalonActions.openViewer(id);
      } else {
        console.warn('[EtalonRender] EtalonActions недоступен');
      }
    },

    /**
     * Пересобирает статическую разметку #etalon-constructor-view при смене локали.
     * Если конструктор открыт — сохраняет черновик и восстанавливает поля.
     */
    remountConstructorChrome: function () {
      var view = document.getElementById('etalon-constructor-view');
      if (!view) return;
      var wasOpen = !view.classList.contains('hidden');
      var draft = null;
      var editingId = window.currentEditingEtalonId;
      var openParams = null;
      if (wasOpen && window.EtalonActions) {
        draft = window.EtalonActions._collectNewDraft();
        openParams = window.EtalonActions._getOpenContext ? window.EtalonActions._getOpenContext() : null;
      }
      view.outerHTML = renderConstructorMarkup();
      if (wasOpen && window.EtalonActions && openParams) {
        window.currentEditingEtalonId = editingId;
        window._rbiEtalonSkipDraft = true;
        window.EtalonActions.openConstructor(
          openParams.contractor,
          openParams.templateKey,
          openParams.templateTitle,
          openParams.projectName,
          openParams.statusKey
        );
        if (editingId) {
          window.EtalonActions.editAct(editingId);
        } else if (draft) {
          window.EtalonActions._applyNewDraft(draft).catch(function (e) {
            console.warn('[EtalonRender] locale remount draft restore failed', e);
          });
        }
      }
    }
  };

  window.EtalonRender = EtalonRender;
})();

console.log('[EtalonRender] etalon.render.js loaded');

// Разметка #etalon-constructor-view перенесена из index.html (под-инициатива 1
// «Полная очистка index.html») — HTML 1:1, eager-монтаж в #app-modals.
function renderConstructorMarkup() {
  return `
    <div id="etalon-constructor-view"
        class="hidden bg-[var(--bg-main)] fixed inset-0 z-[3000] h-screen pb-32 overflow-y-auto custom-scrollbar">
        <div
            class="bg-surface/90 backdrop-blur-md border-b border-surface p-4 mb-4 shadow-sm sticky top-0 z-40 flex justify-between items-center">
            <button data-etalon-action="closeEtalonConstructor"
                class="text-rbi-label font-bold text-muted flex items-center gap-1 active:scale-95 bg-surface px-3 py-2 rounded-lg transition-colors">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path>
                </svg> ${_etalonRenderT('quality.etalon.btn.back', 'Назад')}
            </button>
            <div class="text-rbi-body font-black text-ink uppercase tracking-widest text-center"
                id="etalon-title-text">${_etalonRenderT('quality.etalon.title.act', 'Акт-Эталон')}</div>
            <button data-etalon-action="saveEtalonAct"
                class="text-rbi-label font-bold text-white bg-brand px-4 py-2 rounded-lg active:scale-95 shadow-md transition-colors">${_etalonRenderT('quality.etalon.btn.save', 'Сохранить')}</button>
        </div>

        <div class="space-y-4 px-3 max-w-2xl mx-auto">
            <!-- БЛОК 1: Основные данные и Привязка -->
            <div
                class="bg-surface border border-surface rounded-2xl p-4 shadow-sm space-y-3">
                <div
                    class="text-rbi-body font-black uppercase text-brand mb-1 border-b border-surface pb-2">
                    ${_etalonRenderT('quality.etalon.section.binding', 'Привязка эталона')}</div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">${_etalonRenderT('quality.etalon.label.project', 'Объект *')}</label>
                        <div class="relative"><input type="text" id="etalon-project" autocomplete="off"
                                class="input-base text-rbi-body font-bold text-ink"
                                placeholder="${_etalonRenderT('quality.etalon.placeholder.project', 'Название объекта...')}"></div>
                    </div>
                    <div>
                        <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">${_etalonRenderT('quality.etalon.label.contractor', 'Подрядчик *')}</label>
                        <div class="relative"><input type="text" id="etalon-contractor" autocomplete="off"
                                class="input-base text-rbi-body font-bold text-ink"
                                placeholder="${_etalonRenderT('quality.etalon.placeholder.contractor', 'ООО Ромашка...')}"></div>
                    </div>
                </div>
                <div>
                    <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">${_etalonRenderT('quality.etalon.label.template', 'Вид работ (Чек-лист) *')}</label>
                    <select id="etalon-template"
                        class="input-base text-rbi-body font-bold text-ink"></select>
                </div>

                <div
                    class="text-rbi-body font-black uppercase text-brand mb-1 border-b border-surface pb-2 mt-4 pt-3">
                    ${_etalonRenderT('quality.etalon.section.location_participants', 'Расположение и Участники')}</div>
                <div>
                    <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">${_etalonRenderT('quality.etalon.label.location', 'Локация (Оси, Этаж) *')}</label>
                    <input type="text" id="etalon-location" class="input-base text-rbi-body"
                        placeholder="${_etalonRenderT('quality.etalon.placeholder.location', 'Напр: Секция 1, Этаж 5, Оси А-Б')}">
                </div>
                <div>
                    <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">${_etalonRenderT('quality.etalon.label.participants', 'Комиссия (Участники) *')}</label>
                    <div id="etalon-participants-list" class="space-y-2 mb-2"></div>
                    <div class="flex gap-2">
                        <button type="button" data-etalon-action="rbi_addEtalonParticipantRow" class="flex-1 bg-brand-soft text-brand py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95">+ ${_etalonRenderT('quality.etalon.btn.add_participant', 'Участника')}</button>
                        <button type="button" data-etalon-action="rbi_removeEtalonParticipantRow" class="px-4 bg-danger-soft text-danger py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95">− ${_etalonRenderT('quality.etalon.btn.remove', 'Удалить')}</button>
                    </div>
                </div>
                <div>
                    <label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">${_etalonRenderT('quality.etalon.label.deviations', 'Допущения (Если есть)')}</label>
                    <textarea id="etalon-deviations" class="input-base text-rbi-label h-14 resize-none"
                        placeholder="${_etalonRenderT('quality.etalon.placeholder.deviations', 'Отклонений не выявлено')}"></textarea>
                </div>
            </div>

            <!-- БЛОК 2: Элементы эталона -->
            <div>
                <div
                    class="text-rbi-body font-black text-ink uppercase tracking-widest mb-3 px-1 flex items-center gap-2">
                    <svg class="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z">
                        </path>
                    </svg> ${_etalonRenderT('quality.etalon.section.nodes', 'Фиксация узлов')}
                </div>
                <div id="etalon-elements-container"></div>
                <button data-etalon-action="addEtalonElement"
                    class="w-full bg-brand-soft border border-dashed border-brand-soft text-brand py-4 rounded-2xl font-bold text-rbi-label uppercase active:scale-95 flex items-center justify-center gap-2 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path>
                    </svg> ${_etalonRenderT('quality.etalon.btn.add_element', 'Добавить узел эталона')}
                </button>
            </div>
        </div>
    </div>
`;
}

if (window.EtalonRender) {
  window.EtalonRender.renderConstructorMarkup = renderConstructorMarkup;
}

(function mountEtalonConstructorViewMarkup() {
  if (document.getElementById('etalon-constructor-view')) return;
  var root = window.RBI && window.RBI.services && window.RBI.services.shell
    ? window.RBI.services.shell.getModalsRoot()
    : document.getElementById('app-modals') || document.body;
  if (!root) return;
  root.insertAdjacentHTML('beforeend', renderConstructorMarkup());
}());
