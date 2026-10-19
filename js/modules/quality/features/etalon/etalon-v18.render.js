// etalon-v18.render.js — разметка полноэкранного конструктора «Акт-Эталон (Бета)».
// Структура полей 1:1 повторяет 11 разделов Шаблон_акта_эталона_в_18.html,
// но верстка адаптирована под мобильный/табличный UI платформы (карточки вместо
// широких таблиц с фиксированной шириной колонок) и без встроенного PNG
// регламента (~1.78 МБ) — справка вынесена в краткий текстовый блок ниже.

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

  function _sectionTitle(num, title, hint) {
    return '' +
      '<div class="text-rbi-body font-black text-ink uppercase tracking-widest mb-2 px-1 flex items-center gap-2 mt-5">' +
      '<span class="w-5 h-5 rounded-full bg-brand-soft text-brand text-rbi-caption flex items-center justify-center font-black shrink-0">' + num + '</span>' +
      title + '</div>' +
      (hint ? '<div class="text-rbi-caption text-muted font-medium px-1 mb-2">' + hint + '</div>' : '');
  }

  function _tableBlock(tableId, headers, addLabel) {
    var ths = headers.map(function (h) { return '<th class="text-left px-2 py-1.5 font-black text-rbi-caption uppercase text-muted border-b border-surface">' + h + '</th>'; }).join('');
    return '' +
      '<div class="overflow-x-auto rounded-xl border border-surface mb-2">' +
      '<table id="' + tableId + '" class="w-full text-rbi-label">' +
      '<thead><tr><th class="w-8 px-2 py-1.5 border-b border-surface">№</th>' + ths + '</tr></thead>' +
      '<tbody></tbody>' +
      '</table></div>' +
      '<div class="flex gap-2 mb-1">' +
      '<button onclick="window.rbi_etalonV18AddRow(\'' + tableId + '\')" class="flex-1 bg-brand-soft text-brand py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95">+ ' + addLabel + '</button>' +
      '<button onclick="window.rbi_etalonV18RemoveRow(\'' + tableId + '\')" class="px-4 bg-danger-soft text-danger py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95">− ' + _t('quality.etalon.btn.remove', 'Удалить') + '</button>' +
      '</div>';
  }

  function _radioRow(name, options) {
    return options.map(function (o) {
      return '<label class="flex items-start gap-2 py-1.5 text-rbi-label font-medium text-ink">' +
        '<input type="radio" name="' + name + '" value="' + o.value + '" class="mt-0.5">' +
        '<span>' + o.label + '</span></label>';
    }).join('');
  }

  function renderMarkup() {
    var html = '';
    html += '<div id="etalon-v18-view" class="hidden bg-[var(--bg-main)] fixed inset-0 z-[3000] h-screen pb-32 overflow-y-auto custom-scrollbar">';
    html += '<div class="bg-surface/90 backdrop-blur-md border-b border-surface p-4 mb-4 shadow-sm sticky top-0 z-40 flex justify-between items-center gap-2">';
    html += '<button onclick="closeEtalonV18Constructor()" class="text-rbi-label font-bold text-muted flex items-center gap-1 active:scale-95 bg-surface px-3 py-2 rounded-lg transition-colors shrink-0">';
    html += '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path></svg> ' + _t('quality.etalon.btn.back', 'Назад');
    html += '</button>';
    html += '<div class="text-rbi-label font-black text-ink uppercase tracking-widest text-center flex-1 truncate px-1" id="etv18-title-text">' + _t('quality.etalon.v18.title', 'Акт-Эталон (Бета)') + '</div>';
    html += '<div class="flex gap-1.5 shrink-0">';
    html += '<button onclick="saveEtalonV18Act(false)" class="text-rbi-caption font-bold text-ink bg-surface border border-surface px-3 py-2 rounded-lg active:scale-95 shadow-sm transition-colors">' + _t('quality.etalon.btn.save', 'Сохранить') + '</button>';
    html += '<button onclick="saveEtalonV18Act(true)" class="text-rbi-caption font-bold text-white bg-brand px-3 py-2 rounded-lg active:scale-95 shadow-md transition-colors">' + _t('quality.etalon.btn.print', 'Печать') + '</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="space-y-1 px-3 max-w-3xl mx-auto">';

    html += '<div class="bg-brand-soft border border-brand-soft rounded-xl p-3 text-rbi-caption text-brand font-medium mb-3">';
    html += _t('quality.etalon.v18.intro', 'Структурированный акт согласования эталонного образца (11 разделов). Заполняется по факту осмотра выполненного образца до начала массового производства аналогичных работ.');
    html += '</div>';

    html += '<div class="bg-surface border border-surface rounded-2xl p-4 shadow-sm space-y-3">';
    html += '<div class="text-rbi-body font-black uppercase text-brand mb-1 border-b border-surface pb-2">' + _t('quality.etalon.section.binding', 'Привязка эталона') + '</div>';
    html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.label.project', 'Объект *') + '</label><input type="text" id="etv18-project" autocomplete="off" class="input-base text-rbi-body font-bold"></div>';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.label.contractor', 'Подрядчик *') + '</label><input type="text" id="etv18-contractor" autocomplete="off" class="input-base text-rbi-body font-bold"></div>';
    html += '</div>';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.label.template', 'Вид работ (Чек-лист) *') + '</label><select id="etv18-template" class="input-base text-rbi-body font-bold"></select></div>';
    html += '</div>';

    html += _sectionTitle('0', _t('quality.etalon.v18.section.act_data', 'Данные акта'));
    html += '<div class="bg-surface border border-surface rounded-2xl p-4 shadow-sm space-y-3">';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.v18.label.sample_type', 'Вид эталона') + '</label>';
    html += '<div class="flex flex-wrap gap-3 text-rbi-label font-medium">';
    html += '<label class="flex items-center gap-1"><input type="checkbox" id="etv18-type-smr"> ' + _t('quality.etalon.v18.type.smr', 'СМР') + '</label>';
    html += '<label class="flex items-center gap-1"><input type="checkbox" id="etv18-type-product"> ' + _t('quality.etalon.v18.type.product', 'изделие') + '</label>';
    html += '<label class="flex items-center gap-1"><input type="checkbox" id="etv18-type-node"> ' + _t('quality.etalon.v18.type.node', 'конструктивный узел') + '</label>';
    html += '<label class="flex items-center gap-1"><input type="checkbox" id="etv18-type-finish"> ' + _t('quality.etalon.v18.type.finish', 'фрагмент отделки') + '</label>';
    html += '<label class="flex items-center gap-1"><input type="checkbox" id="etv18-type-other"> ' + _t('quality.etalon.v18.type.other', 'иной:') + '</label>';
    html += '</div>';
    html += '<input type="text" id="etv18-type-other-text" class="input-base text-rbi-label mt-1" placeholder="' + _t('quality.etalon.v18.placeholder.type_other', 'например: опытный образец фасадного узла') + '">';
    html += '</div>';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.v18.label.address', 'Адрес объекта') + '</label><input type="text" id="etv18-address" class="input-base text-rbi-label" placeholder="' + _t('quality.etalon.v18.placeholder.address', 'например: г. Санкт-Петербург, ул. Примерная, д. 10') + '"></div>';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.v18.label.photo_object', 'Объект (для листа фотофиксации)') + '</label><input type="text" id="etv18-object" class="input-base text-rbi-label"></div>';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.v18.label.sample_name', 'Наименование эталона') + '</label><input type="text" id="etv18-name" class="input-base text-rbi-label" placeholder="' + _t('quality.etalon.v18.placeholder.sample_name', 'например: угловое безстоечное остекление витража') + '"></div>';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.v18.label.location', 'Место устройства / установки *') + '</label><input type="text" id="etv18-location" class="input-base text-rbi-label" placeholder="' + _t('quality.etalon.v18.placeholder.location', 'например: корпус 1, секция 2, 1-й этаж, оси 5–6') + '"></div>';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.v18.label.inspection_date', 'Дата осмотра') + '</label><input type="date" id="etv18-inspection-date" class="input-base text-rbi-label"></div>';
    html += '</div>';

    html += _sectionTitle('1', _t('quality.etalon.v18.section.participants', 'Участники рассмотрения'));
    html += '<div class="overflow-x-auto rounded-xl border border-surface mb-2">';
    html += '<table id="etv18-participantsTable" class="w-full text-rbi-label"><thead><tr>';
    html += '<th class="w-8 px-2 py-1.5 border-b border-surface">№</th>';
    html += '<th class="text-left px-2 py-1.5 font-black text-rbi-caption uppercase text-muted border-b border-surface">' + _t('quality.etalon.v18.col.organization', 'Организация') + '</th>';
    html += '<th class="text-left px-2 py-1.5 font-black text-rbi-caption uppercase text-muted border-b border-surface">' + _t('quality.etalon.v18.col.position', 'Должность') + '</th>';
    html += '<th class="text-left px-2 py-1.5 font-black text-rbi-caption uppercase text-muted border-b border-surface">' + _t('quality.etalon.v18.col.name', 'Ф.И.О.') + '</th>';
    html += '</tr></thead><tbody></tbody></table></div>';
    html += '<div class="flex gap-2 mb-1">';
    html += '<button onclick="window.rbi_etalonV18AddParticipant()" class="flex-1 bg-brand-soft text-brand py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95">+ ' + _t('quality.etalon.v18.btn.add_participant', 'Участника') + '</button>';
    html += '<button onclick="window.rbi_etalonV18RemoveParticipant()" class="px-4 bg-danger-soft text-danger py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95">− ' + _t('quality.etalon.btn.remove', 'Удалить') + '</button>';
    html += '</div>';

    html += _sectionTitle('2', _t('quality.etalon.v18.section.scope', 'Состав, границы и область применения эталона'));
    html += '<div class="bg-surface border border-surface rounded-2xl p-4 shadow-sm space-y-3">';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.v18.label.sample_composition', 'Состав и границы эталона') + '</label><textarea id="etv18-sampleComposition" class="input-base text-rbi-label h-14 resize-none" placeholder="' + _t('quality.etalon.v18.placeholder.sample_composition', 'например: стойки, ригели, стеклопакет, герметизация и все согласуемые примыкания') + '"></textarea></div>';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.v18.label.application_zone', 'Область применения эталона') + '</label><textarea id="etv18-applicationZone" class="input-base text-rbi-label h-14 resize-none" placeholder="' + _t('quality.etalon.v18.placeholder.application_zone', 'например: все витражи первого этажа корпусов 1–3') + '"></textarea></div>';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.v18.label.sample_size', 'Размер / объём образца') + '</label><input type="text" id="etv18-sampleSize" class="input-base text-rbi-label" placeholder="' + _t('quality.etalon.v18.placeholder.sample_size', 'например: 1 участок размером 3,0 × 2,8 м') + '"></div>';
    html += '<div><label class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 block">' + _t('quality.etalon.v18.label.not_included', 'Исключения из согласования') + '</label><textarea id="etv18-notIncluded" class="input-base text-rbi-label h-14 resize-none" placeholder="' + _t('quality.etalon.v18.placeholder.not_included', 'например: внутренние откосы и чистовая отделка стен') + '"></textarea></div>';
    html += '</div>';

    html += _sectionTitle('3', _t('quality.etalon.v18.section.documents', 'Исходные документы'));
    html += _tableBlock('documentsTable', [
      _t('quality.etalon.v18.col.document', 'Документ'),
      _t('quality.etalon.v18.col.designation', 'Обозначение / номер / дата')
    ], _t('quality.etalon.v18.btn.add_document', 'документ'));

    html += _sectionTitle('4', _t('quality.etalon.v18.section.solutions', 'Согласованное техническое и визуальное решение'));
    html += _tableBlock('solutionsTable', [
      _t('quality.etalon.v18.col.element', 'Элемент / параметр'),
      _t('quality.etalon.v18.col.solution', 'Согласованное решение')
    ], _t('quality.etalon.v18.btn.add_row', 'строку'));

    html += _sectionTitle('5', _t('quality.etalon.v18.section.materials', 'Примененные материалы, комплектующие и изделия'));
    html += _tableBlock('materialsTable', [
      _t('quality.etalon.v18.col.material_name', 'Наименование'),
      _t('quality.etalon.v18.col.mark', 'Марка/тип'),
      _t('quality.etalon.v18.col.manufacturer', 'Производитель'),
      _t('quality.etalon.v18.col.quality_doc', 'Документ качества'),
      _t('quality.etalon.v18.col.color', 'Цвет/фактура')
    ], _t('quality.etalon.v18.btn.add_material', 'материал'));

    html += _sectionTitle('6', _t('quality.etalon.v18.section.controls', 'Контрольные параметры эталона'), _t('quality.etalon.v18.hint.controls', 'Должны подтверждать соответствие требованиям рабочей документации, ГОСТ, СП, стандартов компании.'));
    html += '<div class="overflow-x-auto rounded-xl border border-surface mb-2">';
    html += '<table id="etv18-controlTable" class="w-full text-rbi-label"><thead><tr>';
    html += '<th class="w-8 px-2 py-1.5 border-b border-surface">№</th>';
    html += '<th class="text-left px-2 py-1.5 font-black text-rbi-caption uppercase text-muted border-b border-surface">' + _t('quality.etalon.v18.col.criterion', 'Критерий') + '</th>';
    html += '<th class="text-left px-2 py-1.5 font-black text-rbi-caption uppercase text-muted border-b border-surface">' + _t('quality.etalon.v18.col.basis', 'Основание') + '</th>';
    html += '<th class="text-left px-2 py-1.5 font-black text-rbi-caption uppercase text-muted border-b border-surface">' + _t('quality.etalon.v18.col.requirement', 'Требование') + '</th>';
    html += '<th class="text-left px-2 py-1.5 font-black text-rbi-caption uppercase text-muted border-b border-surface">' + _t('quality.etalon.v18.col.actual', 'Факт') + '</th>';
    html += '<th class="text-left px-2 py-1.5 font-black text-rbi-caption uppercase text-muted border-b border-surface">' + _t('quality.etalon.v18.col.compliance', 'Соотв.') + '</th>';
    html += '</tr></thead><tbody></tbody></table></div>';
    html += '<div class="flex gap-2 mb-1">';
    html += '<button onclick="window.rbi_etalonV18AddControlRow()" class="flex-1 bg-brand-soft text-brand py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95">+ ' + _t('quality.etalon.v18.btn.add_control', 'Параметр') + '</button>';
    html += '<button onclick="window.rbi_etalonV18RemoveControlRow()" class="px-4 bg-danger-soft text-danger py-2 rounded-lg text-rbi-caption font-bold uppercase active:scale-95">− ' + _t('quality.etalon.btn.remove', 'Удалить') + '</button>';
    html += '</div>';

    html += _sectionTitle('7', _t('quality.etalon.v18.section.tests', 'Результаты осмотра и испытаний'));
    html += _tableBlock('testsTable', [
      _t('quality.etalon.v18.col.test_type', 'Вид проверки'),
      _t('quality.etalon.v18.col.method', 'Метод / средство'),
      _t('quality.etalon.v18.col.result', 'Результат / протокол')
    ], _t('quality.etalon.v18.btn.add_test', 'испытание'));

    html += _sectionTitle('8', _t('quality.etalon.v18.section.remarks', 'Замечания и обязательные корректировки'));
    html += _tableBlock('remarksTable', [
      _t('quality.etalon.v18.col.remark', 'Замечание'),
      _t('quality.etalon.v18.col.responsible', 'Ответственный'),
      _t('quality.etalon.v18.col.deadline', 'Срок'),
      _t('quality.etalon.v18.col.closure', 'Отметка об устранении')
    ], _t('quality.etalon.v18.btn.add_remark', 'замечание'));

    html += _sectionTitle('9', _t('quality.etalon.v18.section.decision', 'Решение комиссии'));
    html += '<div class="bg-surface border border-surface rounded-2xl p-4 shadow-sm space-y-3">';
    html += '<div class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1">' + _t('quality.etalon.v18.label.final_decision', 'Итоговое решение') + '</div>';
    html += _radioRow('etv18-decision', [
      { value: 'accepted', label: _t('quality.etalon.v18.decision.accepted', 'согласован как эталон для последующего выполнения / поставки') },
      { value: 'conditional', label: _t('quality.etalon.v18.decision.conditional', 'согласован после устранения замечаний раздела 8') },
      { value: 'rejected', label: _t('quality.etalon.v18.decision.rejected', 'не согласован, требуется повторное предъявление') }
    ]);
    html += '<div class="text-rbi-caption font-bold text-[var(--text-muted)] uppercase mb-1 mt-3">' + _t('quality.etalon.v18.label.storage', 'Сохранность эталона') + '</div>';
    html += _radioRow('etv18-storage', [
      { value: 'stored', label: _t('quality.etalon.v18.storage.stored', 'сохраняется на объекте до завершения соответствующего вида работ') },
      { value: 'removed', label: _t('quality.etalon.v18.storage.removed', 'демонтируется после фотофиксации и оформления документации') },
      { value: 'concealed', label: _t('quality.etalon.v18.storage.concealed', 'скрывается последующими работами после фотофиксации и оформления документации') }
    ]);
    html += '<input type="text" id="etv18-storage-place" class="input-base text-rbi-label mt-2" placeholder="' + _t('quality.etalon.v18.placeholder.storage_place', 'Место хранения / расположения / ответственный') + '">';
    html += '</div>';

    html += _sectionTitle('10', _t('quality.etalon.v18.section.attachments', 'Приложения'));
    html += _tableBlock('attachmentsTable', [
      _t('quality.etalon.v18.col.attachment_name', 'Наименование приложения'),
      _t('quality.etalon.v18.col.qty', 'Кол-во листов/файлов'),
      _t('quality.etalon.v18.col.note', 'Примечание')
    ], _t('quality.etalon.v18.btn.add_attachment', 'приложение'));

    html += _sectionTitle('11', _t('quality.etalon.v18.section.photos', 'Лист фотофиксации эталонного образца'));
    html += '<div id="etv18-photo-grid"></div>';
    html += '<button onclick="window.rbi_etalonV18AddPhoto()" class="w-full bg-brand-soft border border-dashed border-brand-soft text-brand py-4 rounded-2xl font-bold text-rbi-label uppercase active:scale-95 flex items-center justify-center gap-2 transition-colors mb-6">';
    html += '+ ' + _t('quality.etalon.v18.btn.add_photo', 'Добавить фото');
    html += '</button>';

    html += '</div>';
    html += '</div>';

    return html;
  }

  var EtalonV18Render = {
    mount: function () {
      if (document.getElementById('etalon-v18-view')) return;
      var root = (window.RBI && window.RBI.services && window.RBI.services.shell)
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals') || document.body;
      root.insertAdjacentHTML('beforeend', renderMarkup());
    },

    remountIfOpen: function () {
      var view = document.getElementById('etalon-v18-view');
      if (!view) return;
      var wasOpen = !view.classList.contains('hidden');
      var editingId = null;
      var openContext = null;
      var draft = null;
      if (window.EtalonV18Actions) {
        editingId = window.EtalonV18Actions._getEditingId ? window.EtalonV18Actions._getEditingId() : null;
        openContext = window.EtalonV18Actions._getOpenContext ? window.EtalonV18Actions._getOpenContext() : null;
        if (wasOpen) draft = window.EtalonV18Actions._collectNewDraft();
      }
      view.outerHTML = renderMarkup();
      if (wasOpen && window.EtalonV18Actions && openContext) {
        window._rbiEtalonV18SkipDraft = true;
        window.EtalonV18Actions.openConstructor(openContext);
        if (editingId) {
          window.EtalonV18Actions.editAct(editingId);
        } else if (draft) {
          window.EtalonV18Actions._applyNewDraft(draft).catch(function (e) {
            console.warn('[EtalonV18Render] locale remount draft restore failed', e);
          });
        }
      }
    }
  };

  window.EtalonV18Render = EtalonV18Render;
}());

console.log('[EtalonV18Render] etalon-v18.render.js loaded');
