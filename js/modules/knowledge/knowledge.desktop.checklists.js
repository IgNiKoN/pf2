/**
 * knowledge.desktop.checklists.js
 * Desktop Ч/л (≥1280): Pattern G — rail слева, справа тот же контент, что на mobile.
 *
 * Функционал не дублируется и не переписывается:
 * - выбор чек-листа → #ref-checklist-selector + changeRefTemplate / renderReferenceTab
 * - поиск → #ref-search → renderReferenceTab (как mobile)
 * - Создать / Excel / экспорт / формат → те же data-reference-action
 * - Управление → toggleManagePanel (копия / изменить / удалить)
 * - превью требований → steal #reference-items (HTML из renderReferenceTab)
 */

/** @type {{ checklistKey: string|null }} */
let _sel = { checklistKey: null };

/** @type {boolean} */
let _painting = false;

/** Сворачивание секций rail (persist across re-paint) */
let _railFold = { sys: true, user: true };

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getUserTemplates() {
  return window.userTemplates || {};
}

function countItems(groups) {
  let n = 0;
  (groups || []).forEach(function (g) {
    n += (g.items || []).length;
  });
  return n;
}

function _templatesSvc() {
  return (window.RBI && window.RBI.services && window.RBI.services.templates) || null;
}

/** Указатель официальной версии для sys-ключа, если есть (иначе null). */
function officialPointerFor(key) {
  const companySvc = window.RBI && window.RBI.services && window.RBI.services.company;
  if (!companySvc || typeof companySvc.getOfficialTemplates !== 'function') return null;
  const ptr = companySvc.getOfficialTemplates()[key];
  return ptr && ptr.type === 'user' ? ptr : null;
}

function listChecklists() {
  const out = [];
  const sys = window.SYSTEM_TEMPLATES || {};
  const templatesSvc = _templatesSvc();
  Object.keys(sys)
    .sort(function (a, b) {
      return String(sys[a].title || a).localeCompare(String(sys[b].title || b), 'ru');
    })
    .forEach(function (key) {
      const t = sys[key];
      const ptr = officialPointerFor(key);
      const eff = templatesSvc && typeof templatesSvc.getEffectiveTemplate === 'function'
        ? templatesSvc.getEffectiveTemplate(key)
        : null;
      out.push({
        id: 'sys_' + key,
        slug: key,
        kind: 'sys',
        title: (t && t.title) || key,
        itemCount: countItems((eff && eff.groups) || (t && t.groups)),
        officialPointer: ptr
      });
    });

  const user = getUserTemplates();
  Object.keys(user)
    .filter(function (key) {
      return !(user[key] && user[key]._deleted);
    })
    .sort(function (a, b) {
      return String(user[a].title || a).localeCompare(String(user[b].title || b), 'ru');
    })
    .forEach(function (key) {
      const t = user[key];
      out.push({
        id: 'user_' + key,
        slug: key,
        kind: 'user',
        title: (t && t.title) || key,
        itemCount: countItems(t && t.groups)
      });
    });

  return out;
}

function syncMobileSelector(checklistId) {
  const refSelect = document.getElementById('ref-checklist-selector');
  if (!refSelect || !checklistId) return;
  if (refSelect.value !== checklistId) {
    let has = false;
    for (let i = 0; i < refSelect.options.length; i++) {
      if (refSelect.options[i].value === checklistId) {
        has = true;
        break;
      }
    }
    if (!has) {
      const list = listChecklists();
      const cl = list.find(function (c) {
        return c.id === checklistId;
      });
      if (cl) {
        const opt = document.createElement('option');
        opt.value = cl.id;
        opt.textContent = cl.title;
        const group = document.getElementById(
          cl.kind === 'user' ? 'ref-user-group' : 'ref-system-group'
        );
        if (group) group.appendChild(opt);
        else refSelect.appendChild(opt);
      }
    }
    refSelect.value = checklistId;
  }
  const label = document.getElementById('ref-selector-label');
  const opt = refSelect.options[refSelect.selectedIndex];
  if (label && opt) {
    label.innerHTML =
      escapeHtml(String(opt.textContent || '').replace('▼', '').trim()) +
      ' <span>▼</span>';
  }
}

/**
 * Desk chrome: поиск + инструменты + понятные CTA конструктора/копии.
 * Закреплён под сабтабами (flex chrome / scroll stage — как История в аналитике).
 */
function syncCloneSelectValue(slug) {
  let sel = document.getElementById('clone-sys-select');
  if (!sel) {
    sel = document.createElement('select');
    sel.id = 'clone-sys-select';
    sel.className = 'kb-desk-cl-clone-select-hidden';
    sel.setAttribute('aria-hidden', 'true');
    const filters = document.getElementById('ref-filters-block');
    if (filters) filters.appendChild(sel);
  }
  const sys = window.SYSTEM_TEMPLATES || {};
  const keys = Object.keys(sys).sort(function (a, b) {
    return String(sys[a].title || a).localeCompare(String(sys[b].title || b), 'ru');
  });
  let html = '<option value="">Выбрать...</option>';
  keys.forEach(function (k) {
    html +=
      '<option value="' +
      escapeHtml(k) +
      '">' +
      escapeHtml((sys[k] && sys[k].title) || k) +
      '</option>';
  });
  sel.innerHTML = html;
  if (slug && sys[slug]) sel.value = slug;
  return sel;
}

function updatePrimaryCtas() {
  const cloneBtn = document.querySelector('.kb-desk-cl-btn-clone');
  const hint = document.querySelector('.kb-desk-cl-cta-hint');
  if (!cloneBtn) return;

  const id = _sel.checklistKey || '';
  const isSys = id.indexOf('sys_') === 0;
  const slug = isSys ? id.slice(4) : '';
  const sys = window.SYSTEM_TEMPLATES || {};
  const title = (slug && sys[slug] && sys[slug].title) || '';

  syncCloneSelectValue(slug || '');

  if (isSys && title) {
    cloneBtn.disabled = false;
    cloneBtn.classList.remove('is-disabled');
    cloneBtn.innerHTML =
      'Сделать копию и править' +
      '<span class="kb-desk-cl-btn-sub">' +
      escapeHtml(title) +
      '</span>';
    cloneBtn.title = 'Создать свой шаблон на основе «' + title + '» и открыть конструктор';
    if (hint) {
      hint.textContent =
        'Выбран системный «' + title + '». Копия откроется в конструкторе.';
    }
  } else {
    cloneBtn.disabled = true;
    cloneBtn.classList.add('is-disabled');
    cloneBtn.innerHTML =
      'Сделать копию и править' +
      '<span class="kb-desk-cl-btn-sub">Сначала выберите системный слева</span>';
    cloneBtn.title = 'Выберите системный чек-лист в списке слева';
    if (hint) {
      hint.textContent =
        'Чтобы править на базе системного — выберите его слева и нажмите «Сделать копию».';
    }
  }
}

function cloneSelectedSystem() {
  const id = _sel.checklistKey || '';
  if (id.indexOf('sys_') !== 0) {
    if (typeof window.showToast === 'function') {
      window.showToast('Выберите системный чек-лист слева');
    }
    return;
  }
  const slug = id.slice(4);
  syncCloneSelectValue(slug);
  if (typeof window.cloneSystemTemplateToCustom === 'function') {
    window.cloneSystemTemplateToCustom();
  }
}

function ensureChrome(section) {
  let chrome = section.querySelector(':scope > .kb-desk-cl-chrome');
  if (!chrome) {
    chrome = document.createElement('div');
    chrome.className = 'kb-desk-cl-chrome';
    const filters = document.getElementById('ref-filters-block');
    if (filters && filters.parentElement === section) {
      section.insertBefore(chrome, filters);
      chrome.appendChild(filters);
    } else if (filters) {
      chrome.appendChild(filters);
      section.insertBefore(chrome, section.firstChild);
    } else {
      section.insertBefore(chrome, section.firstChild);
    }
  } else {
    const filters = document.getElementById('ref-filters-block');
    if (filters && filters.parentElement !== chrome) {
      chrome.appendChild(filters);
    }
  }
  return chrome;
}

function layoutFiltersAsToolbar() {
  const filters = document.getElementById('ref-filters-block');
  if (!filters) return;
  filters.classList.add('kb-desk-cl-filters');

  let actions = filters.querySelector(':scope > .kb-desk-cl-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'kb-desk-cl-actions';
    actions.innerHTML =
      '<button type="button" class="kb-desk-cl-btn" ' +
      'data-reference-action="triggerExcelImport" title="Импорт из Excel">↑ Excel</button>' +
      '<button type="button" class="kb-desk-cl-btn" title="Экспорт в код" ' +
      'data-reference-action="exportAllTemplatesJson">↓ В код</button>' +
      '<button type="button" class="kb-desk-cl-btn" title="Формат Excel" ' +
      'data-reference-action="showExcelHelp">Формат?</button>' +
      '<button type="button" class="kb-desk-cl-btn kb-desk-cl-btn-manage" ' +
      'title="Изменить или удалить пользовательские шаблоны">' +
      '<span class="kb-desk-cl-btn-manage-icon" aria-hidden="true">⚙</span>' +
      '<span class="kb-desk-cl-btn-manage-text">Мои шаблоны</span></button>';
    const searchRow = filters.querySelector(':scope > .relative.mb-2');
    if (searchRow) searchRow.insertAdjacentElement('afterend', actions);
    else filters.appendChild(actions);

    const gear = actions.querySelector('.kb-desk-cl-btn-manage');
    if (gear) {
      gear.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.toggleManagePanel === 'function') {
          window.toggleManagePanel();
        }
        syncManageOpenClass();
        document
          .querySelectorAll('#settings-user-templates-list #clone-sys-select')
          .forEach(function (el) {
            el.removeAttribute('id');
          });
      });
    }
  }

  let ctas = filters.querySelector(':scope > .kb-desk-cl-ctas');
  if (!ctas) {
    ctas = document.createElement('div');
    ctas.className = 'kb-desk-cl-ctas';
    ctas.innerHTML =
      '<button type="button" class="kb-desk-cl-cta kb-desk-cl-cta-create" ' +
      'data-reference-action="openTemplateBuilder">' +
      '<span class="kb-desk-cl-cta-title">Создать с нуля</span>' +
      '<span class="kb-desk-cl-cta-sub">Пустой шаблон в конструкторе</span>' +
      '</button>' +
      '<button type="button" class="kb-desk-cl-cta kb-desk-cl-btn-clone">' +
      '<span class="kb-desk-cl-cta-title">Сделать копию и править</span>' +
      '<span class="kb-desk-cl-btn-sub">Сначала выберите системный слева</span>' +
      '</button>' +
      '<p class="kb-desk-cl-cta-hint"></p>';
    actions.insertAdjacentElement('afterend', ctas);

    const cloneBtn = ctas.querySelector('.kb-desk-cl-btn-clone');
    if (cloneBtn) {
      cloneBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (cloneBtn.disabled) return;
        cloneSelectedSystem();
      });
    }
  }

  syncCloneSelectValue(
    _sel.checklistKey && _sel.checklistKey.indexOf('sys_') === 0
      ? _sel.checklistKey.slice(4)
      : ''
  );
  updatePrimaryCtas();

  const srcToggle = filters.querySelector(
    ':scope > [data-knowledge-action="toggleManagePanel"]'
  );
  if (srcToggle) srcToggle.classList.add('kb-desk-cl-src-hidden');

  // старая строка clone-select (если осталась) — убрать
  filters.querySelectorAll(':scope > .kb-desk-cl-clone').forEach(function (el) {
    el.remove();
  });

  const manageBody = document.getElementById('ref-manage-body');
  if (manageBody) {
    manageBody.classList.add('kb-desk-cl-manage-panel');
    if (!filters.dataset.kbDeskToolbarReady) {
      filters.dataset.kbDeskToolbarReady = '1';
      manageBody.style.maxHeight = '0px';
      manageBody.style.opacity = '0';
      manageBody.style.overflow = 'hidden';
      manageBody.style.marginTop = '0px';
      manageBody.classList.remove('kb-desk-cl-manage-open');
      const gearBtn = filters.querySelector('.kb-desk-cl-btn-manage');
      if (gearBtn) gearBtn.classList.remove('is-active');
    }
  }
  const toggleIcon = document.getElementById('ref-manage-toggle-icon');
  if (toggleIcon) toggleIcon.style.display = 'none';

  const search = document.getElementById('ref-search');
  if (search && !search.dataset.kbDeskPh) {
    search.dataset.kbDeskPh = '1';
    search.placeholder = 'Поиск по требованиям, ГОСТ, СП…';
  }
}

function syncManageOpenClass() {
  const manageBody = document.getElementById('ref-manage-body');
  const gear = document.querySelector('#ref-filters-block .kb-desk-cl-btn-manage');
  if (!manageBody) return;
  const open =
    manageBody.style.maxHeight &&
    manageBody.style.maxHeight !== '0px' &&
    manageBody.style.maxHeight !== '0';
  manageBody.classList.toggle('kb-desk-cl-manage-open', !!open);
  if (gear) gear.classList.toggle('is-active', !!open);
}

function ensureSplitShell(host) {
  let split = host.querySelector(':scope > .kb-desk-split');
  if (split) return split;
  split = document.createElement('div');
  split.className = 'kb-desk-split';
  const rail = document.createElement('aside');
  rail.className = 'kb-desk-rail kb-desk-rail-indigo';
  const viewer = document.createElement('div');
  viewer.className = 'kb-desk-viewer';
  viewer.innerHTML =
    '<div class="kb-desk-viewer-empty">Выберите чек-лист слева</div>';
  split.appendChild(rail);
  split.appendChild(viewer);
  host.appendChild(split);
  return split;
}

function clearRailActive(rail) {
  if (!rail) return;
  rail.querySelectorAll('.is-active').forEach(function (el) {
    el.classList.remove('is-active');
  });
}

/** Вернуть #reference-items на место в секции (до удаления split). */
function restoreItemsHome() {
  const section = document.getElementById('ref-sub-checklists');
  const itemsRoot = document.getElementById('reference-items');
  if (!section || !itemsRoot) return;
  if (itemsRoot.parentElement === section) return;
  const filters = document.getElementById('ref-filters-block');
  if (filters && filters.parentElement === section) {
    filters.insertAdjacentElement('afterend', itemsRoot);
  } else {
    section.appendChild(itemsRoot);
  }
}

/**
 * Правая панель = тот же DOM, что рисует mobile renderReferenceTab.
 */
export function remountChecklistsItems() {
  const section = document.getElementById('ref-sub-checklists');
  const split = section && section.querySelector(':scope > .kb-desk-split');
  const viewer = split && split.querySelector('.kb-desk-viewer');
  const itemsRoot = document.getElementById('reference-items');
  if (!viewer || !itemsRoot) return;

  viewer.classList.add('kb-desk-viewer--cl');

  let body = viewer.querySelector(':scope > .kb-desk-cl-mobile-host');
  if (!body) {
    viewer.innerHTML = '';
    body = document.createElement('div');
    body.className = 'kb-desk-viewer-body kb-desk-cl-mobile-host';
    viewer.appendChild(body);
  } else {
    // Убрать placeholder empty, не трогая items
    viewer.querySelectorAll(':scope > .kb-desk-viewer-empty').forEach(function (el) {
      el.remove();
    });
  }

  itemsRoot.removeAttribute('hidden');
  itemsRoot.classList.add('kb-desk-items-host');
  itemsRoot.classList.remove('kb-desk-items-source');
  if (itemsRoot.parentElement !== body) {
    body.appendChild(itemsRoot);
  }
}

export function selectChecklist(checklistId, opts) {
  const options = opts || {};
  _sel.checklistKey = checklistId;
  syncMobileSelector(checklistId);
  const refSelect = document.getElementById('ref-checklist-selector');
  if (!refSelect || !refSelect.value) return;

  if (options.skipRender) {
    remountChecklistsItems();
    return;
  }

  // Тот же путь, что mobile: changeRefTemplate → renderReferenceTab
  if (typeof window.changeRefTemplate === 'function') {
    window.changeRefTemplate(refSelect);
  } else if (typeof window.renderReferenceTab === 'function') {
    window.renderReferenceTab();
  } else {
    remountChecklistsItems();
  }

  // Подсветить выбранный ряд в rail после навигации из кросс-ссылки
  try {
    const rail = document.querySelector('#ref-sub-checklists .kb-desk-rail');
    if (rail) {
      rail.querySelectorAll('.kb-desk-cl-list-row.is-active').forEach(function (el) {
        el.classList.remove('is-active');
      });
      const row = rail.querySelector(
        '.kb-desk-cl-list-row[data-checklist-id="' +
          String(checklistId).replace(/"/g, '\\"') +
          '"]'
      );
      if (row) {
        row.classList.add('is-active');
        if (typeof row.scrollIntoView === 'function') {
          row.scrollIntoView({ block: 'nearest' });
        }
      }
    }
  } catch (_) {
    /* ignore */
  }
}

function makeRailSection(kind, title, count) {
  const open = _railFold[kind] !== false;
  const block = document.createElement('div');
  block.className =
    'kb-desk-rail-section' + (open ? ' is-open' : '');
  block.setAttribute('data-rail-kind', kind);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'kb-desk-rail-section-toggle';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.innerHTML =
    '<span class="kb-desk-rail-section-name">' +
    escapeHtml(title) +
    ' <span class="kb-desk-rail-section-count">' +
    count +
    '</span></span>' +
    '<span class="kb-desk-rail-section-chevron" aria-hidden="true">▾</span>';

  const body = document.createElement('div');
  body.className = 'kb-desk-rail-section-body';

  toggle.addEventListener('click', function () {
    const next = !block.classList.contains('is-open');
    block.classList.toggle('is-open', next);
    _railFold[kind] = next;
    toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
  });

  block.appendChild(toggle);
  block.appendChild(body);
  return { block: block, body: body };
}

function paintRail(rail, viewer) {
  const list = listChecklists();
  rail.innerHTML = '';

  const railHead = document.createElement('div');
  railHead.className = 'kb-desk-rail-head';
  railHead.innerHTML =
    '<div class="kb-desk-rail-head-title">Библиотека</div>' +
    '<div class="kb-desk-rail-head-sub">Выберите чек-лист для просмотра</div>';
  rail.appendChild(railHead);

  if (!list.length) {
    if (viewer) {
      viewer.innerHTML =
        '<div class="kb-desk-viewer-empty">Нет доступных чек-листов</div>';
    }
    return null;
  }

  const sysList = list.filter(function (c) {
    return c.kind !== 'user';
  });
  const userList = list.filter(function (c) {
    return c.kind === 'user';
  });

  const sysSec = makeRailSection('sys', 'Системные', sysList.length);
  const userSec = makeRailSection('user', 'Пользовательские', userList.length);

  const refSelect = document.getElementById('ref-checklist-selector');
  const preferred =
    _sel.checklistKey ||
    (refSelect && refSelect.value) ||
    (list[0] && list[0].id) ||
    null;

  let preferredRow = null;

  function addRow(cl, host) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'kb-desk-cl-list-row';
    row.setAttribute('data-checklist-id', cl.id);
    row.setAttribute('data-checklist-kind', cl.kind);
    const officialBadge = cl.officialPointer
      ? ' <span title="изменён компанией, v' +
        escapeHtml(String(cl.officialPointer.version)) + '">✎</span>'
      : '';
    row.innerHTML =
      '<span class="kb-desk-cl-list-text">' +
      '<span class="kb-desk-cl-list-title">' +
      escapeHtml(cl.title) + officialBadge +
      '</span>' +
      '<span class="kb-desk-cl-list-sub">' +
      (cl.kind === 'user' ? 'Свой · ' : '') +
      cl.itemCount +
      ' требований</span></span>';

    row.addEventListener('click', function () {
      clearRailActive(rail);
      row.classList.add('is-active');
      selectChecklist(cl.id);
      updatePrimaryCtas();
    });

    host.appendChild(row);
    if (preferred && preferred === cl.id) preferredRow = row;
  }

  sysList.forEach(function (cl) {
    addRow(cl, sysSec.body);
  });
  userList.forEach(function (cl) {
    addRow(cl, userSec.body);
  });

  if (!sysList.length) {
    const empty = document.createElement('div');
    empty.className = 'kb-desk-rail-empty';
    empty.textContent = 'Нет системных чек-листов';
    sysSec.body.appendChild(empty);
  }
  if (!userList.length) {
    const empty = document.createElement('div');
    empty.className = 'kb-desk-rail-empty';
    empty.textContent = 'Нет своих — «Создать с нуля» или копия системного';
    userSec.body.appendChild(empty);
  }

  rail.appendChild(sysSec.block);
  rail.appendChild(userSec.block);

  if (preferredRow) {
    const sec = preferredRow.closest('.kb-desk-rail-section');
    if (sec && !sec.classList.contains('is-open')) {
      sec.classList.add('is-open');
      const kind = sec.getAttribute('data-rail-kind');
      if (kind) _railFold[kind] = true;
      const t = sec.querySelector('.kb-desk-rail-section-toggle');
      if (t) t.setAttribute('aria-expanded', 'true');
    }
  }

  return preferredRow || rail.querySelector('.kb-desk-cl-list-row');
}

export function paintChecklistsChrome() {
  const section = document.getElementById('ref-sub-checklists');
  if (!section || section.classList.contains('hidden')) return;
  if (_painting) {
    remountChecklistsItems();
    return;
  }
  _painting = true;
  try {
    section.classList.add('kb-desk-checklists');
    ensureChrome(section);
    layoutFiltersAsToolbar();

    // Не уничтожаем split с украденным #reference-items
    const split = ensureSplitShell(section);
    const rail = split.querySelector('.kb-desk-rail');
    const viewer = split.querySelector('.kb-desk-viewer');

    const activeRow = paintRail(rail, viewer);
    if (!activeRow) return;

    clearRailActive(rail);
    activeRow.classList.add('is-active');
    const id = activeRow.getAttribute('data-checklist-id');
    const refSelect = document.getElementById('ref-checklist-selector');
    const already =
      refSelect && refSelect.value === id && document.getElementById('reference-items');

    if (already && refSelect.value) {
      _sel.checklistKey = id;
      remountChecklistsItems();
      updatePrimaryCtas();
    } else {
      selectChecklist(id);
      updatePrimaryCtas();
    }
  } finally {
    _painting = false;
  }
}

export function clearChecklistsDesktopArtifacts() {
  _sel = { checklistKey: null };
  restoreItemsHome();

  const section = document.getElementById('ref-sub-checklists');
  const filters = document.getElementById('ref-filters-block');
  if (section && filters) {
    const chrome = section.querySelector(':scope > .kb-desk-cl-chrome');
    if (chrome && filters.parentElement === chrome) {
      section.insertBefore(filters, chrome);
    }
  }
  if (section) {
    section.classList.remove('kb-desk-checklists');
    section.querySelectorAll(':scope > .kb-desk-split, :scope > .kb-desk-cl-chrome').forEach(function (el) {
      el.remove();
    });
  }
  const itemsRoot = document.getElementById('reference-items');
  if (itemsRoot) {
    itemsRoot.removeAttribute('hidden');
    itemsRoot.classList.remove('kb-desk-items-source', 'kb-desk-items-host');
  }
  if (filters) {
    filters.classList.remove('kb-desk-cl-filters');
    delete filters.dataset.kbDeskToolbarReady;
    filters
      .querySelectorAll(
        ':scope > .kb-desk-cl-actions, :scope > .kb-desk-cl-clone, :scope > .kb-desk-cl-ctas, :scope > .kb-desk-cl-clone-select-hidden, #clone-sys-select.kb-desk-cl-clone-select-hidden'
      )
      .forEach(function (el) {
        el.remove();
      });
    const hiddenSel = filters.querySelector('#clone-sys-select');
    if (hiddenSel && hiddenSel.classList.contains('kb-desk-cl-clone-select-hidden')) {
      hiddenSel.remove();
    }
  }
  const srcToggle = document.querySelector(
    '#ref-filters-block > [data-knowledge-action="toggleManagePanel"]'
  );
  if (srcToggle) {
    srcToggle.classList.remove('kb-desk-cl-src-hidden', 'kb-desk-cl-manage-label');
    srcToggle.style.pointerEvents = '';
    const labelSpan = srcToggle.querySelector('span');
    if (labelSpan) labelSpan.textContent = '⚙️ Управление шаблонами';
  }
  const toggleIcon = document.getElementById('ref-manage-toggle-icon');
  if (toggleIcon) {
    toggleIcon.style.display = '';
    toggleIcon.textContent = '▾';
  }
  const manageBody = document.getElementById('ref-manage-body');
  if (manageBody) {
    manageBody.classList.remove(
      'kb-desk-cl-manage-open',
      'kb-desk-cl-manage-panel',
      'kb-desk-cl-manage-was-forced'
    );
    manageBody.style.maxHeight = '';
    manageBody.style.opacity = '';
    manageBody.style.overflow = '';
    manageBody.style.marginTop = '';
  }
}

export function getChecklistsDeskSel() {
  return { checklistKey: _sel.checklistKey };
}
