/**
 * knowledge.desktop.docs.js
 * Desktop НД (≥1280): sticky chrome + Pattern G (rail слева / PDF справа).
 *
 * Mobile-логика не дублируется: фильтры/поиск/Только мои/CTA — те же DOM и window.*.
 * Превью PDF в правой панели через blob/https URL; «На весь экран» → openDocViewer;
 * «В браузере» → новая вкладка (blob/https), минуя iframe-превью.
 */

/** @type {boolean} */
let _painting = false;

/** @type {{ docId: string|null, blobUrl: string|null }} */
let _sel = { docId: null, blobUrl: null };

/** @type {Record<string, boolean>} fold state по типу (СП/ГОСТ/…) */
let _railFold = {};

/** Порядок секций типов; остальные — по алфавиту после. */
const RAIL_TYPE_ORDER = ['СП', 'ГОСТ', 'ПРОЕКТ'];

const RAIL_TYPE_LABELS = {
  ПРОЕКТ: 'Проект / РД',
};

function docTypeKey(doc) {
  return String(doc.type || (doc.data && doc.data.type) || 'Прочее') || 'Прочее';
}

function compareDocsByCode(a, b) {
  const ca = String(a.code || (a.data && a.data.code) || a.title || '');
  const cb = String(b.code || (b.data && b.data.code) || b.title || '');
  const byCode = ca.localeCompare(cb, 'ru', { numeric: true, sensitivity: 'base' });
  if (byCode !== 0) return byCode;
  const ta = String(a.title || a.name || '');
  const tb = String(b.title || b.name || '');
  return ta.localeCompare(tb, 'ru', { numeric: true, sensitivity: 'base' });
}

function sortTypeKeys(keys) {
  return keys.slice().sort(function (a, b) {
    const ia = RAIL_TYPE_ORDER.indexOf(a);
    const ib = RAIL_TYPE_ORDER.indexOf(b);
    if (ia >= 0 || ib >= 0) {
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    }
    return a.localeCompare(b, 'ru', { sensitivity: 'base' });
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getSearchTerm() {
  const el = document.getElementById('doc-search-input');
  return (el && el.value ? el.value : '').toLowerCase();
}

function getCurrentEngineer() {
  try {
    var perms = window.RBI && window.RBI.services && window.RBI.services.permissions;
    if (perms && typeof perms.getCurrentEngineerName === 'function') {
      return perms.getCurrentEngineerName() || 'Инженер';
    }
    if (window.RBI && window.RBI.services && window.RBI.services.settings) {
      return window.RBI.services.settings.get('engineerName') || 'Инженер';
    }
  } catch (_) { /* ignore */ }
  return 'Инженер';
}

function getAllDocs() {
  const sys = typeof window.SYSTEM_DOCS !== 'undefined' ? window.SYSTEM_DOCS : [];
  const custom = Array.isArray(window.customDocs) ? window.customDocs : [];
  return [].concat(sys || [], custom || []);
}

/** Те же правила, что renderDocsList. */
function getFilteredDocs() {
  const searchInput = getSearchTerm();
  const currentDocFilter = window.currentDocFilter || 'ALL';
  const ownerFilter = window.docOwnerFilter || 'ALL';
  const currentEngineer = getCurrentEngineer();

  return getAllDocs().filter(function (doc) {
    const code = String(doc.code || (doc.data && doc.data.code) || '').toLowerCase();
    const title = String(
      doc.title || doc.name || (doc.data && doc.data.title) || ''
    ).toLowerCase();
    const type = doc.type || (doc.data && doc.data.type) || '';
    const owner = doc.owner || (doc.data && doc.data.owner) || '';
    const isSystem =
      doc.isSystem || String(doc.id || '').indexOf('sys_') === 0;

    const matchSearch = code.includes(searchInput) || title.includes(searchInput);
    const matchFilter = currentDocFilter === 'ALL' || type === currentDocFilter;
    const matchOwner =
      ownerFilter === 'ALL' || isSystem || owner === currentEngineer;

    return matchSearch && matchFilter && matchOwner;
  });
}

function findDoc(id) {
  return (
    getAllDocs().find(function (d) {
      return String(d.id) === String(id);
    }) || null
  );
}

function revokePreviewBlob() {
  if (_sel.blobUrl && String(_sel.blobUrl).indexOf('blob:') === 0) {
    try {
      URL.revokeObjectURL(_sel.blobUrl);
    } catch (_) { /* ignore */ }
  }
  _sel.blobUrl = null;
}

function ensureChrome(section) {
  let chrome = section.querySelector(':scope > .kb-desk-docs-chrome');
  if (!chrome) {
    chrome = document.createElement('div');
    chrome.className = 'kb-desk-docs-chrome';
    const filters = document.getElementById('ref-docs-filters');
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
    const filters = document.getElementById('ref-docs-filters');
    if (filters && filters.parentElement !== chrome) {
      chrome.appendChild(filters);
    }
  }
  return chrome;
}

function ensureSplit(section) {
  let split = section.querySelector(':scope > .kb-desk-docs-split');
  if (split) return split;
  split = document.createElement('div');
  split.className = 'kb-desk-docs-split';
  const rail = document.createElement('aside');
  rail.className = 'kb-desk-docs-rail';
  const viewer = document.createElement('div');
  viewer.className = 'kb-desk-docs-viewer';
  viewer.innerHTML =
    '<div class="kb-desk-docs-viewer-empty">Выберите документ слева — справа откроется PDF</div>';
  split.appendChild(rail);
  split.appendChild(viewer);
  section.appendChild(split);
  return split;
}

function restoreDocsHome() {
  const section = document.getElementById('ref-sub-docs');
  if (!section) return;
  const filters = document.getElementById('ref-docs-filters');
  const list = document.getElementById('docs-list-container');
  const chrome = section.querySelector(':scope > .kb-desk-docs-chrome');
  if (filters && chrome && filters.parentElement === chrome) {
    section.insertBefore(filters, chrome);
  }
  if (list) {
    list.removeAttribute('hidden');
    list.classList.remove('kb-desk-docs-list-source');
    if (list.parentElement !== section) {
      section.appendChild(list);
    }
  }
}

function layoutDocsToolbar() {
  const filters = document.getElementById('ref-docs-filters');
  if (!filters) return;
  filters.classList.add('kb-desk-docs-filters');

  // Mobile CTA / view-mode — спрятать (desk-кнопки ниже)
  filters.querySelectorAll('button').forEach(function (btn) {
    if (btn.classList.contains('kb-desk-docs-btn')) return;
    if (btn.classList.contains('doc-filter-btn')) return;
    const oc = btn.getAttribute('onclick') || '';
    const da =
      btn.getAttribute('data-action') ||
      btn.getAttribute('data-knowledge-action') ||
      '';
    if (
      /openAiDocChat|openAddDocModal|exportDocsJsCode/.test(oc + ' ' + da)
    ) {
      btn.classList.add('kb-desk-docs-src-hidden');
    }
  });
  const viewToggle = document.getElementById('docs-view-mode-toggle');
  if (viewToggle) viewToggle.classList.add('kb-desk-docs-src-hidden');

  let row1 = filters.querySelector(':scope > .kb-desk-docs-row1');
  let row2 = filters.querySelector(':scope > .kb-desk-docs-row2');
  if (!row1 || !row2) {
    if (row1) row1.remove();
    if (row2) row2.remove();
    row1 = document.createElement('div');
    row1.className = 'kb-desk-docs-row kb-desk-docs-row1';
    row2 = document.createElement('div');
    row2.className = 'kb-desk-docs-row kb-desk-docs-row2';
    filters.appendChild(row1);
    filters.appendChild(row2);
  }

  const search = document.getElementById('doc-search-input');
  const searchWrap = search && search.closest('.relative');
  if (searchWrap) {
    searchWrap.classList.add('kb-desk-docs-search-wrap');
    if (searchWrap.parentElement !== row1) {
      row1.insertBefore(searchWrap, row1.firstChild);
    }
  }
  if (search && !search.dataset.kbDeskPh) {
    search.dataset.kbDeskPh = '1';
    search.placeholder = 'Поиск по коду или названию…';
  }

  let actions = row1.querySelector('.kb-desk-docs-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'kb-desk-docs-actions';
    actions.innerHTML =
      '<button type="button" class="kb-desk-docs-btn kb-desk-docs-btn-ai" data-action="openAiDocChat" title="Спросить ИИ по нормам">Спросить ИИ</button>' +
      '<button type="button" class="kb-desk-docs-btn" data-knowledge-action="exportDocsJsCode" title="Экспорт библиотеки в JS">↓ В код</button>' +
      '<button type="button" class="kb-desk-docs-btn kb-desk-docs-btn-primary" ' +
      'data-knowledge-action="openAddDocModal" title="Добавить свой нормативный документ">+ Свой НД</button>';
    row1.appendChild(actions);
  } else {
    const aiBtn = actions.querySelector(
      '.kb-desk-docs-btn[data-action="openAiDocChat"]'
    );
    if (aiBtn) aiBtn.classList.add('kb-desk-docs-btn-ai');
  }

  const chips = document.getElementById('doc-filters-container');
  if (chips) {
    chips.classList.add('kb-desk-docs-chips');
    if (chips.parentElement !== row2) {
      row2.insertBefore(chips, row2.firstChild);
    }
  }

  let tools = row2.querySelector('.kb-desk-docs-tools');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'kb-desk-docs-tools';
    row2.appendChild(tools);
  }

  const ownerLabel =
    filters.querySelector('.kb-desk-docs-owner') ||
    filters.querySelector('label.flex.items-center');
  if (ownerLabel) {
    ownerLabel.classList.add('kb-desk-docs-owner');
    if (ownerLabel.parentElement !== tools) {
      tools.insertBefore(ownerLabel, tools.firstChild);
    }
  }

  const offlineBtn = filters.querySelector(
    'button[onclick*="downloadMissingCloudFiles"]'
  );
  if (offlineBtn && offlineBtn.parentElement !== tools) {
    tools.appendChild(offlineBtn);
  }

  // Пустые mobile-ряды после переноса — скрыть
  filters.querySelectorAll(':scope > div.flex').forEach(function (el) {
    el.classList.add('kb-desk-docs-src-hidden');
  });
}

/** Вернуть DOM фильтров к mobile-раскладке (перед выходом с desktop). */
function unwrapDocsToolbar(filters) {
  if (!filters) return;
  const rows = filters.querySelectorAll(':scope > .kb-desk-docs-row');
  if (!rows.length) return;

  filters.querySelectorAll('.kb-desk-docs-actions').forEach(function (el) {
    el.remove();
  });

  filters.querySelectorAll('.kb-desk-docs-src-hidden').forEach(function (el) {
    el.classList.remove('kb-desk-docs-src-hidden');
  });

  const flexes = Array.prototype.slice.call(
    filters.querySelectorAll(':scope > div.flex')
  );
  const searchWrap = filters.querySelector('.kb-desk-docs-search-wrap');
  const chips = document.getElementById('doc-filters-container');
  const owner = filters.querySelector('.kb-desk-docs-owner');
  const offline = filters.querySelector(
    'button[onclick*="downloadMissingCloudFiles"]'
  );

  if (flexes[0]) {
    if (owner && owner.parentElement !== flexes[0]) {
      flexes[0].insertBefore(owner, flexes[0].firstChild);
    }
    const offlineHost =
      flexes[0].querySelector('.flex.items-center.gap-2') || flexes[0];
    if (offline && offline.parentElement !== offlineHost) {
      offlineHost.appendChild(offline);
    }
  }
  if (flexes[1] && searchWrap && searchWrap.parentElement !== flexes[1]) {
    flexes[1].insertBefore(searchWrap, flexes[1].firstChild);
  }
  if (chips) {
    const anchor = flexes[flexes.length - 1] || null;
    if (anchor) anchor.after(chips);
    else filters.appendChild(chips);
  }

  rows.forEach(function (r) {
    r.remove();
  });
}

/**
 * Открыть PDF в новой вкладке браузера (отдельный blob — не трогаем preview revoke).
 */
async function openDocInBrowser(doc) {
  if (!doc) return;
  const src = await resolvePdfSrc(doc);
  if (!src) {
    if (typeof window.showToast === 'function') {
      window.showToast('⚠️ У документа нет PDF-файла');
    }
    return;
  }
  const win = window.open(src, '_blank', 'noopener,noreferrer');
  if (!win && typeof window.showToast === 'function') {
    window.showToast('⚠️ Браузер заблокировал новую вкладку');
  }
}

function docHasPdf(doc) {
  if (!doc) return false;
  if (doc.pdfData) return true;
  if (doc.link && String(doc.link).indexOf('http') === 0) return true;
  return false;
}

function makeRailSection(kind, title, count) {
  const open = _railFold[kind] !== false;
  const block = document.createElement('div');
  block.className = 'kb-desk-docs-rail-section' + (open ? ' is-open' : '');
  block.setAttribute('data-rail-kind', kind);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'kb-desk-docs-rail-toggle';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.innerHTML =
    '<span class="kb-desk-docs-rail-name">' +
    escapeHtml(title) +
    ' <span class="kb-desk-docs-rail-count">' +
    count +
    '</span></span>' +
    '<span class="kb-desk-docs-rail-chevron" aria-hidden="true">▾</span>';

  const body = document.createElement('div');
  body.className = 'kb-desk-docs-rail-body';

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

/**
 * Загрузка PDF в blob URL — пути как в rbiOpenPdfInTwiViewer, без fullscreen sheet.
 */
async function resolvePdfSrc(doc) {
  if (!doc) return null;
  const pdfData = doc.pdfData;
  if (!pdfData) {
    if (doc.link && String(doc.link).indexOf('http') === 0) return String(doc.link);
    return null;
  }

  const raw = String(pdfData);
  const PM = typeof window.PhotoManager !== 'undefined' ? window.PhotoManager : null;

  async function bufferFromCache(key) {
    if (!key || !PM) return null;
    try {
      if (typeof PM.getAsyncUrl === 'function') {
        const localU = await PM.getAsyncUrl(key);
        if (localU && String(localU).indexOf('blob:') === 0) {
          const res = await fetch(localU);
          if (res.ok) return await res.arrayBuffer();
        }
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  async function toBlobUrl(buf) {
    if (!buf) return null;
    const blob = new Blob([buf], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  }

  try {
    if (raw.indexOf('local://') === 0 || raw.indexOf('cloud://') === 0) {
      if (PM && typeof PM.getBase64 === 'function' && typeof window.base64ToArrayBuffer === 'function') {
        const b64 = await PM.getBase64(pdfData);
        return toBlobUrl(await window.base64ToArrayBuffer(b64));
      }
    }
    if (raw.indexOf('data:application/pdf') === 0 && typeof window.base64ToArrayBuffer === 'function') {
      return toBlobUrl(await window.base64ToArrayBuffer(pdfData));
    }
    if (raw.indexOf('http') === 0) {
      if (typeof window.rbiLoadCloudPdfArrayBuffer === 'function') {
        return toBlobUrl(await window.rbiLoadCloudPdfArrayBuffer(raw));
      }
      const cached = await bufferFromCache(raw);
      if (cached) return toBlobUrl(cached);
      const res = await fetch(raw, { cache: 'no-store' });
      if (res.ok) return toBlobUrl(await res.arrayBuffer());
      return raw;
    }
    const cached = await bufferFromCache(pdfData);
    if (cached) return toBlobUrl(cached);
    if (PM && typeof PM.getAsyncUrl === 'function') {
      const real = await PM.getAsyncUrl(pdfData);
      if (real) {
        if (String(real).indexOf('blob:') === 0) return real;
        if (String(real).indexOf('http') === 0) {
          const res = await fetch(real, { cache: 'no-store' });
          if (res.ok) return toBlobUrl(await res.arrayBuffer());
          return real;
        }
      }
    }
  } catch (e) {
    console.warn('[kb-desk-docs] PDF resolve failed', e);
  }
  return null;
}

function paintViewerMeta(viewer, doc, opts) {
  const options = opts || {};
  const isSystem =
    doc.isSystem || String(doc.id || '').indexOf('sys_') === 0;
  const head = document.createElement('div');
  head.className = 'kb-desk-docs-viewer-head';
  head.innerHTML =
    '<div class="kb-desk-docs-viewer-head-main">' +
    '<div class="kb-desk-docs-viewer-kicker">' +
    escapeHtml(doc.type || 'НД') +
    (isSystem ? ' · Системный' : ' · Свой') +
    '</div>' +
    '<h2 class="kb-desk-docs-viewer-title">' +
    escapeHtml(doc.code || 'Без кода') +
    '</h2>' +
    '<p class="kb-desk-docs-viewer-sub">' +
    escapeHtml(doc.title || '') +
    '</p></div>' +
    '<div class="kb-desk-docs-viewer-actions"></div>';

  const actions = head.querySelector('.kb-desk-docs-viewer-actions');

  if (docHasPdf(doc)) {
    const browserBtn = document.createElement('button');
    browserBtn.type = 'button';
    browserBtn.className =
      'kb-desk-docs-viewer-btn kb-desk-docs-viewer-btn-primary';
    browserBtn.textContent = 'В браузере';
    browserBtn.title = 'Открыть PDF в новой вкладке';
    browserBtn.addEventListener('click', function () {
      openDocInBrowser(doc);
    });
    actions.appendChild(browserBtn);
  }

  const fullBtn = document.createElement('button');
  fullBtn.type = 'button';
  fullBtn.className = 'kb-desk-docs-viewer-btn';
  fullBtn.textContent = 'На весь экран';
  fullBtn.addEventListener('click', function () {
    if (typeof window.openDocViewer === 'function') {
      window.openDocViewer(doc.id);
    }
  });
  actions.appendChild(fullBtn);

  if (!isSystem) {
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'kb-desk-docs-viewer-btn is-muted';
    menuBtn.textContent = 'Управление';
    menuBtn.addEventListener('click', function () {
      if (typeof window.openUniversalActionSheet === 'function') {
        const owner =
          !doc.owner || doc.owner === getCurrentEngineer();
        window.openUniversalActionSheet(
          doc.id,
          'doc',
          String(doc.code || '').replace(/'/g, "\\'"),
          owner
        );
      }
    });
    actions.appendChild(menuBtn);
  }

  viewer.appendChild(head);

  if (options.note) {
    const note = document.createElement('div');
    note.className = 'kb-desk-docs-viewer-note';
    note.textContent = options.note;
    viewer.appendChild(note);
  }
}

async function paintDocPreview(viewer, doc) {
  if (!viewer || !doc) return;
  viewer.innerHTML = '';
  viewer.classList.add('kb-desk-docs-viewer--active');

  paintViewerMeta(viewer, doc, {});

  const frameWrap = document.createElement('div');
  frameWrap.className = 'kb-desk-docs-pdf-frame';
  frameWrap.innerHTML =
    '<div class="kb-desk-docs-pdf-loading">Загрузка PDF…</div>';
  viewer.appendChild(frameWrap);

  const src = await resolvePdfSrc(doc);
  // selection may have changed while loading
  if (_sel.docId !== doc.id) return;

  revokePreviewBlob();
  if (src && String(src).indexOf('blob:') === 0) {
    _sel.blobUrl = src;
  }

  frameWrap.innerHTML = '';
  if (src) {
    const iframe = document.createElement('iframe');
    iframe.className = 'kb-desk-docs-pdf-iframe';
    iframe.title = doc.code || doc.title || 'PDF';
    iframe.src = src;
    frameWrap.appendChild(iframe);
  } else {
    const empty = document.createElement('div');
    empty.className = 'kb-desk-docs-viewer-empty';
    empty.innerHTML =
      '<p>PDF-файл не прикреплён к этому документу.</p>' +
      '<p class="kb-desk-docs-viewer-empty-hint">Можно открыть карточку норматива или поискать в базе.</p>';
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'kb-desk-docs-viewer-btn kb-desk-docs-viewer-btn-primary';
    openBtn.textContent = 'Открыть карточку';
    openBtn.addEventListener('click', function () {
      if (typeof window.openDocViewer === 'function') {
        window.openDocViewer(doc.id);
      }
    });
    empty.appendChild(openBtn);
    frameWrap.appendChild(empty);
  }
}

function selectDoc(docId, rail) {
  _sel.docId = docId;
  if (rail) {
    rail.querySelectorAll('.kb-desk-docs-rail-row.is-active').forEach(function (el) {
      el.classList.remove('is-active');
    });
    const row = rail.querySelector(
      '.kb-desk-docs-rail-row[data-doc-id="' +
        String(docId).replace(/"/g, '\\"') +
        '"]'
    );
    if (row) row.classList.add('is-active');
  }
  const viewer = document.querySelector(
    '#ref-sub-docs .kb-desk-docs-viewer'
  );
  const doc = findDoc(docId);
  if (viewer && doc) {
    paintDocPreview(viewer, doc);
  }
}

function paintRail(rail, viewer) {
  const list = getFilteredDocs();
  rail.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'kb-desk-docs-rail-head';
  head.innerHTML =
    '<div class="kb-desk-docs-rail-head-title">Библиотека НД</div>' +
    '<div class="kb-desk-docs-rail-head-sub">' +
    list.length +
    ' документов</div>';
  rail.appendChild(head);

  if (!list.length) {
    viewer.innerHTML =
      '<div class="kb-desk-docs-viewer-empty">Документы не найдены</div>';
    return null;
  }

  const grouped = {};
  list.forEach(function (doc) {
    const key = docTypeKey(doc);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(doc);
  });

  Object.keys(grouped).forEach(function (key) {
    grouped[key].sort(compareDocsByCode);
  });

  const typeKeys = sortTypeKeys(Object.keys(grouped));
  let preferredRow = null;
  const preferred =
    _sel.docId ||
    (typeKeys[0] && grouped[typeKeys[0]][0] && grouped[typeKeys[0]][0].id) ||
    null;

  function addRow(doc, host) {
    const isSystem =
      doc.isSystem || String(doc.id || '').indexOf('sys_') === 0;
    const row = document.createElement('div');
    row.className = 'kb-desk-docs-rail-row';
    row.setAttribute('data-doc-id', doc.id);
    row.setAttribute('role', 'button');
    row.tabIndex = 0;

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'kb-desk-docs-rail-row-main';
    main.innerHTML =
      '<span class="kb-desk-docs-rail-row-code">' +
      escapeHtml(doc.code || '—') +
      '</span>' +
      '<span class="kb-desk-docs-rail-row-title">' +
      escapeHtml(doc.title || '') +
      '</span>' +
      '<span class="kb-desk-docs-rail-row-meta">' +
      escapeHtml(doc.type || '') +
      (isSystem ? '' : ' · свой') +
      '</span>';
    main.addEventListener('click', function () {
      selectDoc(doc.id, rail);
    });
    row.appendChild(main);

    if (docHasPdf(doc)) {
      const ext = document.createElement('button');
      ext.type = 'button';
      ext.className = 'kb-desk-docs-rail-open';
      ext.title = 'Открыть в браузере';
      ext.setAttribute('aria-label', 'Открыть в браузере');
      ext.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>';
      ext.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openDocInBrowser(doc);
      });
      row.appendChild(ext);
    }

    host.appendChild(row);
    if (preferred && String(preferred) === String(doc.id)) preferredRow = row;
  }

  typeKeys.forEach(function (typeKey) {
    const docs = grouped[typeKey];
    const label = RAIL_TYPE_LABELS[typeKey] || typeKey;
    const sec = makeRailSection(typeKey, label, docs.length);
    docs.forEach(function (d) {
      addRow(d, sec.body);
    });
    rail.appendChild(sec.block);
  });

  if (preferredRow) {
    const sec = preferredRow.closest('.kb-desk-docs-rail-section');
    if (sec && !sec.classList.contains('is-open')) {
      sec.classList.add('is-open');
      const kind = sec.getAttribute('data-rail-kind');
      if (kind) _railFold[kind] = true;
    }
  }

  return preferredRow || rail.querySelector('.kb-desk-docs-rail-row');
}

/** После renderDocsList: только обновить rail/preview (список mobile скрыт). */
export function remountDocsList() {
  const section = document.getElementById('ref-sub-docs');
  if (!section || section.classList.contains('hidden')) return;
  if (!section.classList.contains('kb-desk-docs')) return;

  const list = document.getElementById('docs-list-container');
  if (list) {
    list.setAttribute('hidden', '');
    list.classList.add('kb-desk-docs-list-source');
  }

  const split = ensureSplit(section);
  const rail = split.querySelector('.kb-desk-docs-rail');
  const viewer = split.querySelector('.kb-desk-docs-viewer');
  const row = paintRail(rail, viewer);
  if (row) {
    const id = row.getAttribute('data-doc-id');
    if (id) selectDoc(id, rail);
  }
}

export function paintDocsChrome() {
  const section = document.getElementById('ref-sub-docs');
  if (!section || section.classList.contains('hidden')) return;
  if (_painting) {
    remountDocsList();
    return;
  }
  _painting = true;
  try {
    section.classList.add('kb-desk-docs');
    ensureChrome(section);
    const filters = document.getElementById('ref-docs-filters');
    const needRender = !filters || !filters.dataset.initialized;
    if (needRender && typeof window.renderDocsList === 'function') {
      window.renderDocsList();
    }
    layoutDocsToolbar();
    remountDocsList();
  } finally {
    _painting = false;
  }
}

export function clearDocsDesktopArtifacts() {
  revokePreviewBlob();
  _sel = { docId: null, blobUrl: null };
  restoreDocsHome();

  const section = document.getElementById('ref-sub-docs');
  if (section) {
    section.classList.remove('kb-desk-docs');
    section
      .querySelectorAll(
        ':scope > .kb-desk-docs-chrome, :scope > .kb-desk-docs-split, :scope > .kb-desk-docs-stage'
      )
      .forEach(function (el) {
        el.remove();
      });
  }
  const filters = document.getElementById('ref-docs-filters');
  if (filters) {
    unwrapDocsToolbar(filters);
    filters.classList.remove('kb-desk-docs-filters');
    filters
      .querySelectorAll(
        '.kb-desk-docs-search-wrap, .kb-desk-docs-chips, .kb-desk-docs-owner, .kb-desk-docs-src-hidden'
      )
      .forEach(function (el) {
        el.classList.remove(
          'kb-desk-docs-search-wrap',
          'kb-desk-docs-chips',
          'kb-desk-docs-owner',
          'kb-desk-docs-src-hidden'
        );
      });
    const search = document.getElementById('doc-search-input');
    if (search) delete search.dataset.kbDeskPh;
  }
  const list = document.getElementById('docs-list-container');
  if (list) {
    list.removeAttribute('hidden');
    list.classList.remove('kb-desk-docs-list-source', 'kb-desk-docs-list-host');
  }
}
