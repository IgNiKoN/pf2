/**
 * knowledge.desktop.practices.js
 * Desktop Практики + Эталоны (≥1280): sticky chrome + Pattern G.
 *
 * Mobile rbi_renderPracticesTab / конструкторы не переписываются.
 * «+ Создать» → rbi_openKbCreateChoice (Практика | Акт-Эталон classic/v18/v18b).
 * Превью inline; «На весь экран» → rbi_openPracticeViewer / openEtalonViewer.
 */

/** @type {boolean} */
let _painting = false;

/** @type {{ kind: string|null, id: string|null }} */
let _sel = { kind: null, id: null };

/** @type {Record<string, boolean>} */
let _railFold = {};

/** @type {string} */
let _search = '';

/** Инкремент при каждом select — отсекает устаревшие async paint. */
let _paintGen = 0;

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function getEtalonActs() {
  if (Array.isArray(window.etalonActsArray)) return window.etalonActsArray;
  if (Array.isArray(window.etalonActs)) return window.etalonActs;
  return [];
}

function objectLabel(item) {
  const raw =
    item.projectName ||
    item.project ||
    item.objectName ||
    item.project_display_name ||
    '';
  return String(raw).trim() || 'Без объекта';
}

function etalonLabel(item) {
  if (item.source_kind === 'act_v18') return 'Эталон (Бета)';
  if (item.source_kind === 'act_v18b') return 'Эталон (Бета 2)';
  return 'Эталон';
}

function itemTitle(item) {
  if (item._uiType === 'etalon' || item._deskKind === 'etalon') {
    return item.projectName || item.contractorName || 'Эталон';
  }
  return item.title || 'Практика';
}

async function resolvePhotoUrl(ref) {
  if (!ref) return null;
  const PM = typeof window.PhotoManager !== 'undefined' ? window.PhotoManager : null;
  try {
    if (PM && typeof PM.getAsyncUrl === 'function') {
      const u = await PM.getAsyncUrl(ref);
      if (u) return u;
    }
    if (typeof window.getPhotoSrc === 'function') return window.getPhotoSrc(ref);
  } catch (_) { /* ignore */ }
  return null;
}

/** URL + ориентация — как в TWI desktop preview. */
async function loadPhotoMeta(ref) {
  if (!ref) return null;
  const url = await resolvePhotoUrl(ref);
  if (!url) return null;
  const dims = await new Promise(function (resolve) {
    try {
      const img = new Image();
      img.onload = function () {
        resolve({
          w: img.naturalWidth || img.width || 1,
          h: img.naturalHeight || img.height || 1
        });
      };
      img.onerror = function () {
        resolve({ w: 1, h: 1 });
      };
      img.src = url;
    } catch (_) {
      resolve({ w: 1, h: 1 });
    }
  });
  const orientation =
    dims.h > dims.w * 1.08
      ? 'portrait'
      : dims.w > dims.h * 1.08
        ? 'landscape'
        : 'square';
  return { ref: ref, url: url, orientation: orientation, w: dims.w, h: dims.h };
}

function etalonCoverRefs(item) {
  const refs = [];
  const els = item.details && item.details.elements;
  if (Array.isArray(els)) {
    els.forEach(function (el) {
      if (el && el.photo) refs.push(el.photo);
    });
  }
  const v18 = item.details && item.details.actV18 && item.details.actV18.photos;
  if (Array.isArray(v18)) {
    v18.forEach(function (p) {
      if (p && p.photo) refs.push(p.photo);
    });
  }
  const v18b = item.details && item.details.actV18b && item.details.actV18b.photos;
  if (Array.isArray(v18b)) {
    v18b.forEach(function (p) {
      if (p && p.photo) refs.push(p.photo);
    });
  }
  return refs;
}

/** Те же фильтры типов/владельца, что mobile + desk-поиск. */
function getFilteredMixed() {
  const currentEngineer = getCurrentEngineer();
  const q = String(_search || '').toLowerCase().trim();
  const out = [];

  if (window.kbShowPractices !== false) {
    const pracs = Array.isArray(window.rbi_practicesData)
      ? window.rbi_practicesData
      : [];
    pracs.forEach(function (p) {
      if (p._deleted || !p.title) return;
      if (
        window.practiceOwnerFilter === 'MY' &&
        p.author !== currentEngineer
      ) {
        return;
      }
      const hay = [
        p.title,
        p.templateTitle,
        p.author,
        p.problem,
        p.solution,
        objectLabel(p)
      ]
        .join(' ')
        .toLowerCase();
      if (q && hay.indexOf(q) < 0) return;
      out.push(Object.assign({}, p, { _deskKind: 'practice' }));
    });
  }

  if (window.kbShowEtalons !== false) {
    getEtalonActs().forEach(function (e) {
      if (e._deleted) return;
      if (
        window.practiceOwnerFilter === 'MY' &&
        e.owner !== currentEngineer &&
        e.inspectorName !== currentEngineer
      ) {
        return;
      }
      const hay = [
        e.projectName,
        e.contractorName,
        e.templateTitle,
        e.inspectorName,
        objectLabel(e),
        etalonLabel(e)
      ]
        .join(' ')
        .toLowerCase();
      if (q && hay.indexOf(q) < 0) return;
      out.push(Object.assign({}, e, { _deskKind: 'etalon' }));
    });
  }

  out.sort(function (a, b) {
    return (
      new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)
    );
  });
  return out;
}

function findItem(kind, id) {
  if (kind === 'practice') {
    const list = Array.isArray(window.rbi_practicesData)
      ? window.rbi_practicesData
      : [];
    const p = list.find(function (x) {
      return String(x.id) === String(id);
    });
    return p ? Object.assign({}, p, { _deskKind: 'practice' }) : null;
  }
  const e = getEtalonActs().find(function (x) {
    return String(x.id) === String(id);
  });
  return e ? Object.assign({}, e, { _deskKind: 'etalon' }) : null;
}

function getFiltersPanel() {
  const list = document.getElementById('practices-list-container');
  if (!list) return null;
  // mobile: previousElementSibling — панель фильтров (должен оставаться соседом list)
  let prev = list.previousElementSibling;
  while (prev && prev.id === 'practices-auto-detector') {
    prev = prev.previousElementSibling;
  }
  if (prev && prev.classList && prev.classList.contains('kb-desk-prac-split')) {
    prev = prev.previousElementSibling;
  }
  return prev;
}

function ensureSplit(section) {
  let split = section.querySelector(':scope > .kb-desk-prac-split');
  if (split) return split;
  split = document.createElement('div');
  split.className = 'kb-desk-prac-split';
  const rail = document.createElement('aside');
  rail.className = 'kb-desk-prac-rail';
  const viewer = document.createElement('div');
  viewer.className = 'kb-desk-prac-viewer';
  viewer.innerHTML =
    '<div class="kb-desk-prac-viewer-empty">Выберите практику или эталон слева</div>';
  split.appendChild(rail);
  split.appendChild(viewer);
  const list = document.getElementById('practices-list-container');
  if (list && list.parentElement === section) {
    // split ПОСЛЕ list, чтобы previousElementSibling list оставался filters
    if (list.nextSibling) section.insertBefore(split, list.nextSibling);
    else section.appendChild(split);
  } else {
    section.appendChild(split);
  }
  return split;
}

function layoutPracticesToolbar() {
  const filters = getFiltersPanel();
  if (!filters) return;
  filters.classList.add('kb-desk-prac-filters');

  try {
    // Сохранить чипы/owner/offline до удаления desk-строк (иначе уничтожаются)
    const keepChips = [];
    filters.querySelectorAll('.kb-type-chip').forEach(function (btn) {
      keepChips.push(btn);
    });
    const ownerKeep = filters.querySelector('label.flex.items-center, .kb-desk-prac-owner');
    const offlineKeep = filters.querySelector(
      'button[onclick*="downloadMissingCloudFiles"]'
    );

    filters.querySelectorAll(':scope > .kb-desk-prac-row').forEach(function (el) {
      el.remove();
    });

    const row1 = document.createElement('div');
    row1.className = 'kb-desk-prac-row kb-desk-prac-row1';
    const row2 = document.createElement('div');
    row2.className = 'kb-desk-prac-row kb-desk-prac-row2';

    // спрятать mobile-шапку «Библиотека… / Создать»
    const headRow = filters.querySelector(':scope > .flex.justify-between');
    if (headRow) headRow.classList.add('kb-desk-prac-src-hidden');

    const searchWrap = document.createElement('div');
    searchWrap.className = 'kb-desk-prac-search-wrap';
    searchWrap.innerHTML =
      '<span class="kb-desk-prac-search-ico" aria-hidden="true">' +
      '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>' +
      '</svg></span>' +
      '<input type="search" class="input-base kb-desk-prac-search" placeholder="Поиск практик и эталонов…" autocomplete="off">';
    const searchInput = searchWrap.querySelector('input');
    if (searchInput) {
      searchInput.value = _search;
      searchInput.addEventListener('input', function () {
        _search = searchInput.value || '';
        remountPracticesList();
      });
    }
    row1.appendChild(searchWrap);

    const actions = document.createElement('div');
    actions.className = 'kb-desk-prac-actions';
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'kb-desk-prac-btn kb-desk-prac-btn-primary';
    createBtn.setAttribute('data-kb-desk-prac', 'create');
    createBtn.title = 'Создать практику или эталон';
    createBtn.textContent = '+ Создать';
    createBtn.addEventListener('click', function () {
      if (typeof window.rbi_openKbCreateChoice === 'function') {
        window.rbi_openKbCreateChoice();
      }
    });
    actions.appendChild(createBtn);
    row1.appendChild(actions);

    const col = filters.querySelector(':scope > .flex.flex-col');
    const chips = document.createElement('div');
    chips.className = 'kb-desk-prac-chips';
    keepChips.forEach(function (btn) {
      chips.appendChild(btn);
    });
    if (!keepChips.length && col) {
      col.querySelectorAll('.kb-type-chip').forEach(function (btn) {
        chips.appendChild(btn);
      });
    }
    if (chips.childNodes.length) row2.appendChild(chips);

    const tools = document.createElement('div');
    tools.className = 'kb-desk-prac-tools';

    const owner =
      ownerKeep || filters.querySelector('label.flex.items-center');
    if (owner) {
      owner.classList.add('kb-desk-prac-owner');
      tools.appendChild(owner);
    }

    const offline =
      offlineKeep ||
      filters.querySelector('button[onclick*="downloadMissingCloudFiles"]');
    if (offline) tools.appendChild(offline);

    const mode = document.getElementById('practices-view-mode-toggle');
    if (mode) mode.classList.add('kb-desk-prac-src-hidden');

    row2.appendChild(tools);
    filters.appendChild(row1);
    filters.appendChild(row2);

    if (col) col.classList.add('kb-desk-prac-src-hidden');
  } catch (e) {
    console.warn('[kb-desk-prac] layout failed', e);
  }
}

function makeTypeSection(kind, title, count) {
  const foldKey = 'type:' + kind;
  const open = _railFold[foldKey] !== false; // типы открыты по умолчанию
  const block = document.createElement('div');
  block.className =
    'kb-desk-prac-rail-section' +
    (open ? ' is-open' : '') +
    (kind === 'practice' ? ' is-practice' : ' is-etalon');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'kb-desk-prac-rail-toggle';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.innerHTML =
    '<span class="kb-desk-prac-rail-name">' +
    escapeHtml(title) +
    ' <span class="kb-desk-prac-rail-count">' +
    count +
    '</span></span>' +
    '<span class="kb-desk-prac-rail-chevron" aria-hidden="true">▾</span>';

  const body = document.createElement('div');
  body.className = 'kb-desk-prac-rail-body';

  toggle.addEventListener('click', function () {
    const next = !block.classList.contains('is-open');
    block.classList.toggle('is-open', next);
    _railFold[foldKey] = next;
    toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
  });

  block.appendChild(toggle);
  block.appendChild(body);
  return { block: block, body: body };
}

function makeObjectBlock(parent, objName) {
  const foldKey = 'obj:' + objName;
  const open = _railFold[foldKey] === true; // объекты свёрнуты по умолчанию
  const block = document.createElement('div');
  block.className = 'kb-desk-prac-rail-work' + (open ? ' is-open' : '');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'kb-desk-prac-rail-work-toggle';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.innerHTML =
    '<span class="kb-desk-prac-rail-work-name">' +
    escapeHtml(objName) +
    '</span>' +
    '<span class="kb-desk-prac-rail-work-chev" aria-hidden="true"></span>';

  const body = document.createElement('div');
  body.className = 'kb-desk-prac-rail-work-body';

  toggle.addEventListener('click', function () {
    const next = !block.classList.contains('is-open');
    block.classList.toggle('is-open', next);
    _railFold[foldKey] = next;
    toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
  });

  block.appendChild(toggle);
  block.appendChild(body);
  parent.appendChild(block);
  return { block: block, body: body, toggle: toggle };
}

async function appendPhotoGrid(host, urls, opts) {
  const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (!list.length) return;
  const variant = (opts && opts.variant) || (opts && opts.etalon ? 'etalon' : 'stage');

  const metas = [];
  for (let i = 0; i < list.length; i++) {
    const meta = await loadPhotoMeta(list[i]);
    if (meta) metas.push(meta);
  }
  if (!metas.length) return;

  let portraits = 0;
  let landscapes = 0;
  metas.forEach(function (m) {
    if (m.orientation === 'portrait') portraits++;
    else landscapes++;
  });
  const pairClass =
    metas.length === 1
      ? ' is-single'
      : portraits === metas.length
        ? ' is-pair-portrait'
        : landscapes === metas.length
          ? ' is-pair-landscape'
          : ' is-mixed';

  const grid = document.createElement('div');
  grid.className =
    'kb-desk-prac-photos kb-desk-prac-photos--' + variant + pairClass;

  metas.forEach(function (meta) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'kb-desk-prac-photo kb-desk-prac-photo--' + (meta.orientation || 'square');
    btn.setAttribute('data-photo', meta.ref);
    btn.innerHTML =
      '<span class="kb-desk-prac-photo-frame">' +
      '<img src="' +
      escapeHtml(meta.url) +
      '" alt=""></span>';
    btn.addEventListener('click', function () {
      if (typeof window.openPhotoViewer === 'function') {
        window.openPhotoViewer(meta.ref);
      }
    });
    grid.appendChild(btn);
  });
  host.appendChild(grid);
}

function addViewerBtn(host, label, cls, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'kb-desk-prac-viewer-btn' + (cls ? ' ' + cls : '');
  b.textContent = label;
  b.addEventListener('click', fn);
  host.appendChild(b);
  return b;
}

async function paintPracticePreview(viewer, item, gen) {
  viewer.innerHTML = '';
  viewer.classList.add('kb-desk-prac-viewer--active');

  const head = document.createElement('div');
  head.className = 'kb-desk-prac-viewer-head';
  head.innerHTML =
    '<div class="kb-desk-prac-viewer-head-top">' +
    '<div class="kb-desk-prac-viewer-kicker">Практика' +
    (item.templateTitle ? ' · ' + escapeHtml(item.templateTitle) : '') +
    (item.author ? ' · ' + escapeHtml(item.author) : '') +
    (!item.isPublished ? ' · Черновик' : '') +
    (item.deltaUrk > 0 ? ' · ΔУРК +' + escapeHtml(item.deltaUrk) + '%' : '') +
    '</div>' +
    '<div class="kb-desk-prac-viewer-actions"></div></div>' +
    '<div class="kb-desk-prac-viewer-title-row">' +
    '<h2 class="kb-desk-prac-viewer-title">' +
    escapeHtml(item.title || 'Без названия') +
    '</h2></div>' +
    (objectLabel(item) !== 'Без объекта'
      ? '<p class="kb-desk-prac-viewer-meta">' +
        escapeHtml(objectLabel(item)) +
        '</p>'
      : '');

  const actions = head.querySelector('.kb-desk-prac-viewer-actions');
  addViewerBtn(actions, 'Открыть', 'kb-desk-prac-viewer-btn-primary', function () {
    if (typeof window.rbi_openPracticeViewer === 'function') {
      window.rbi_openPracticeViewer(item.id);
    }
  });
  const isOwner = item.author === getCurrentEngineer();
  addViewerBtn(actions, '⋯', 'is-muted', function () {
    if (typeof window.openUniversalActionSheet === 'function') {
      window.openUniversalActionSheet(
        item.id,
        'practice',
        String(item.title || '').replace(/'/g, "\\'"),
        isOwner,
        item.isPublished ? 'published' : 'draft'
      );
    }
  });
  viewer.appendChild(head);

  const body = document.createElement('div');
  body.className = 'kb-desk-prac-viewer-body';

  const beforeUrls =
    item.photosBefore && item.photosBefore.length
      ? item.photosBefore
      : item.photoBefore
        ? [item.photoBefore]
        : [];
  const afterUrls =
    item.photosAfter && item.photosAfter.length
      ? item.photosAfter
      : item.photoAfter
        ? [item.photoAfter]
        : [];
  const processUrls = item.photosProcess || [];

  const stages = document.createElement('div');
  stages.className = 'kb-desk-prac-stages';

  const left = document.createElement('section');
  left.className = 'kb-desk-prac-stage is-before';
  left.innerHTML =
    '<div class="kb-desk-prac-stage-label">' +
    (item.deltaUrk > 0 ? 'Было · проблема' : 'Исходная ситуация') +
    '</div>';
  await appendPhotoGrid(left, beforeUrls, { variant: 'stage' });
  if (gen != null && gen !== _paintGen) return;
  const leftText = document.createElement('p');
  leftText.className = 'kb-desk-prac-stage-text';
  leftText.textContent = item.problem || '—';
  left.appendChild(leftText);
  stages.appendChild(left);

  const right = document.createElement('section');
  right.className = 'kb-desk-prac-stage is-after';
  right.innerHTML =
    '<div class="kb-desk-prac-stage-label">' +
    (item.deltaUrk > 0 ? 'Стало · решение' : 'Решение и результат') +
    '</div>';
  await appendPhotoGrid(right, afterUrls, { variant: 'stage' });
  if (gen != null && gen !== _paintGen) return;
  const rightText = document.createElement('p');
  rightText.className = 'kb-desk-prac-stage-text';
  rightText.textContent = item.solution || '—';
  right.appendChild(rightText);
  stages.appendChild(right);
  body.appendChild(stages);

  if (processUrls.length) {
    const proc = document.createElement('section');
    proc.className = 'kb-desk-prac-block';
    proc.innerHTML = '<h3>Процесс</h3>';
    await appendPhotoGrid(proc, processUrls, { variant: 'etalon' });
    if (gen != null && gen !== _paintGen) return;
    body.appendChild(proc);
  }

  if (item.takeaway) {
    const t = document.createElement('section');
    t.className = 'kb-desk-prac-block is-takeaway';
    t.innerHTML =
      '<h3>Вывод</h3><p>' + escapeHtml(item.takeaway) + '</p>';
    body.appendChild(t);
  }

  if (Array.isArray(item.docs) && item.docs.length) {
    const docs = document.createElement('section');
    docs.className = 'kb-desk-prac-block';
    docs.innerHTML = '<h3>Документы</h3>';
    const ul = document.createElement('div');
    ul.className = 'kb-desk-prac-docs';
    item.docs.forEach(function (d) {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'kb-desk-prac-doc';
      a.textContent = d.name || 'Файл';
      a.addEventListener('click', function () {
        if (typeof window.openPhotoViewer === 'function') {
          window.openPhotoViewer(d.url);
        }
      });
      ul.appendChild(a);
    });
    docs.appendChild(ul);
    body.appendChild(docs);
  }

  const tools = document.createElement('div');
  tools.className = 'kb-desk-prac-tools';
  addViewerBtn(tools, 'PDF', '', function () {
    if (typeof window.rbi_printPracticePdf === 'function') {
      window.rbi_printPracticePdf(item.id, 'script');
    }
  });
  addViewerBtn(tools, 'Печать', '', function () {
    if (typeof window.rbi_printPracticePdf === 'function') {
      window.rbi_printPracticePdf(item.id, 'browser');
    }
  });
  addViewerBtn(tools, 'PPTX', '', function () {
    if (typeof window.rbi_exportPracticePptx === 'function') {
      window.rbi_exportPracticePptx(item.id);
    }
  });
  body.appendChild(tools);

  if (gen != null && gen !== _paintGen) return;
  viewer.appendChild(body);
}

function etalonMetaRows(item) {
  const d = item.details || {};
  const a = d.actV18 || d.actV18b || {};
  const rows = [];
  rows.push(['Объект', item.projectName || '—']);
  rows.push(['Подрядчик', item.contractorName || '—']);
  rows.push(['Вид работ', item.templateTitle || a.workName || '—']);
  rows.push(['Инспектор', item.inspectorName || '—']);
  rows.push([
    'Дата',
    item.date ? new Date(item.date).toLocaleString('ru-RU') : '—'
  ]);
  if (item.location || a.objectAddress) {
    rows.push(['Локация', item.location || a.objectAddress || '—']);
  }
  if (d.participants && (!Array.isArray(d.participants) || d.participants.length)) {
    const participantsText = Array.isArray(d.participants)
      ? d.participants.map(function (p) {
        const name = (p && p.name) || '';
        const role = (p && p.role) || '';
        return (name && role) ? (name + ' — ' + role) : (name || role);
      }).filter(Boolean).join('; ')
      : d.participants;
    if (participantsText) rows.push(['Участники', participantsText]);
  }
  if (d.deviations) rows.push(['Отклонения', d.deviations]);
  if (a.objectAddress && !item.location) {
    /* already added */
  }
  return rows;
}

async function paintEtalonPreview(viewer, item, gen) {
  viewer.innerHTML = '';
  viewer.classList.add('kb-desk-prac-viewer--active');

  const kindLabel = etalonLabel(item);
  const head = document.createElement('div');
  head.className = 'kb-desk-prac-viewer-head';
  head.innerHTML =
    '<div class="kb-desk-prac-viewer-head-top">' +
    '<div class="kb-desk-prac-viewer-kicker">' +
    escapeHtml(kindLabel) +
    (item.templateTitle ? ' · ' + escapeHtml(item.templateTitle) : '') +
    '</div>' +
    '<div class="kb-desk-prac-viewer-actions"></div></div>' +
    '<h2 class="kb-desk-prac-viewer-title">' +
    escapeHtml(item.projectName || 'Без проекта') +
    '</h2>' +
    '<p class="kb-desk-prac-viewer-meta">' +
    escapeHtml(item.contractorName || 'Подрядчик не указан') +
    (item.inspectorName
      ? ' · ' + escapeHtml(item.inspectorName)
      : '') +
    '</p>';

  const actions = head.querySelector('.kb-desk-prac-viewer-actions');
  addViewerBtn(
    actions,
    item.source_kind === 'act_v18' || item.source_kind === 'act_v18b'
      ? 'Открыть акт'
      : 'Открыть',
    'kb-desk-prac-viewer-btn-primary',
    function () {
      if (typeof window.openEtalonViewer === 'function') {
        window.openEtalonViewer(item.id);
      }
    }
  );

  const isOwner = (item.owner || item.inspectorName) === getCurrentEngineer();
  addViewerBtn(actions, '⋯', 'is-muted', function () {
    if (typeof window.openUniversalActionSheet === 'function') {
      window.openUniversalActionSheet(
        item.id,
        'etalon',
        String(item.contractorName || '').replace(/'/g, "\\'"),
        isOwner
      );
    }
  });
  viewer.appendChild(head);

  const body = document.createElement('div');
  body.className = 'kb-desk-prac-viewer-body';

  // компактная мета-таблица вместо карточек
  const meta = document.createElement('dl');
  meta.className = 'kb-desk-prac-meta-list';
  etalonMetaRows(item).forEach(function (pair) {
    const row = document.createElement('div');
    row.className = 'kb-desk-prac-meta-row';
    row.innerHTML =
      '<dt>' +
      escapeHtml(pair[0]) +
      '</dt><dd>' +
      escapeHtml(pair[1]) +
      '</dd>';
    meta.appendChild(row);
  });
  body.appendChild(meta);

  const d = item.details || {};
  const elements = Array.isArray(d.elements) ? d.elements : [];

  if (elements.length) {
    const wrap = document.createElement('div');
    wrap.className = 'kb-desk-prac-elements';
    const h = document.createElement('h3');
    h.className = 'kb-desk-prac-section-title';
    h.textContent = 'Зафиксированные элементы';
    wrap.appendChild(h);

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const card = document.createElement('section');
      card.className = 'kb-desk-prac-element';
      card.innerHTML =
        '<div class="kb-desk-prac-element-title">' +
        escapeHtml(i + 1 + '. ' + (el.name || 'Без названия')) +
        '</div>' +
        '<p class="kb-desk-prac-element-desc">' +
        escapeHtml(el.desc || 'Нет описания') +
        '</p>';
      let photos = [];
      try {
        if (
          window.EtalonActions &&
          typeof window.EtalonActions._photosFromElementData === 'function'
        ) {
          photos = window.EtalonActions._photosFromElementData(el) || [];
        } else if (el.photo) {
          photos = [el.photo];
        } else if (Array.isArray(el.photos)) {
          photos = el.photos;
        }
      } catch (_) {
        if (el.photo) photos = [el.photo];
      }
      await appendPhotoGrid(card, photos, { variant: 'etalon' });
      if (gen != null && gen !== _paintGen) return;
      wrap.appendChild(card);
    }
    body.appendChild(wrap);
  } else {
    const refs = etalonCoverRefs(item);
    if (refs.length) {
      const gallery = document.createElement('section');
      gallery.className = 'kb-desk-prac-block';
      gallery.innerHTML = '<h3>Фото акта</h3>';
      await appendPhotoGrid(gallery, refs.slice(0, 12), { variant: 'etalon' });
      if (gen != null && gen !== _paintGen) return;
      body.appendChild(gallery);
    }

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'kb-desk-prac-open-cta';
    cta.textContent =
      item.source_kind === 'act_v18' || item.source_kind === 'act_v18b'
        ? 'Открыть полный акт в конструкторе'
        : 'Открыть полный просмотр';
    cta.addEventListener('click', function () {
      if (typeof window.openEtalonViewer === 'function') {
        window.openEtalonViewer(item.id);
      }
    });
    body.appendChild(cta);
  }

  if (d.pdfData) {
    const pdf = document.createElement('button');
    pdf.type = 'button';
    pdf.className = 'kb-desk-prac-pdf';
    pdf.innerHTML =
      '<span class="kb-desk-prac-pdf-badge">PDF</span>' +
      '<span>' +
      escapeHtml(d.pdfName || 'Прикреплённый PDF') +
      '</span>';
    pdf.addEventListener('click', function () {
      if (typeof window.openFakePdfViewer === 'function') {
        window.openFakePdfViewer(d.pdfData, d.pdfName || 'Документ.pdf');
      }
    });
    body.appendChild(pdf);
  }

  if (gen != null && gen !== _paintGen) return;
  viewer.appendChild(body);
}

function selectItem(kind, id, rail) {
  _sel = { kind: kind, id: id };
  const gen = ++_paintGen;
  if (rail) {
    rail.querySelectorAll('.kb-desk-prac-rail-row.is-active').forEach(function (el) {
      el.classList.remove('is-active');
    });
    const row = rail.querySelector(
      '.kb-desk-prac-rail-row[data-kind="' +
        kind +
        '"][data-id="' +
        String(id).replace(/"/g, '\\"') +
        '"]'
    );
    if (row) row.classList.add('is-active');
  }
  const viewer = document.querySelector('#ref-sub-practices .kb-desk-prac-viewer');
  const item = findItem(kind, id);
  if (!viewer || !item) return;
  if (kind === 'practice') paintPracticePreview(viewer, item, gen);
  else paintEtalonPreview(viewer, item, gen);
}

function paintRail(rail, viewer) {
  const list = getFilteredMixed();
  rail.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'kb-desk-prac-rail-head';
  head.innerHTML =
    '<div class="kb-desk-prac-rail-head-title">Библиотека</div>' +
    '<div class="kb-desk-prac-rail-head-sub">' +
    list.length +
    '</div>';
  rail.appendChild(head);

  if (!list.length) {
    viewer.innerHTML =
      '<div class="kb-desk-prac-viewer-empty">В библиотеке пока пусто</div>';
    return null;
  }

  const byType = { practice: {}, etalon: {} };
  list.forEach(function (item) {
    const kind = item._deskKind;
    const obj = objectLabel(item);
    if (!byType[kind][obj]) byType[kind][obj] = [];
    byType[kind][obj].push(item);
  });

  let preferredRow = null;
  const preferredKind = _sel.kind;
  const preferredId = _sel.id;

  // Эталоны сверху, Практики ниже
  ['etalon', 'practice'].forEach(function (kind) {
    const objs = Object.keys(byType[kind]);
    if (!objs.length) return;
    let total = 0;
    objs.forEach(function (o) {
      total += byType[kind][o].length;
    });
    const sec = makeTypeSection(
      kind,
      kind === 'practice' ? 'Практики' : 'Эталоны',
      total
    );
    rail.appendChild(sec.block);

    objs.sort(function (a, b) {
      if (a === 'Без объекта') return 1;
      if (b === 'Без объекта') return -1;
      return a.localeCompare(b, 'ru', { sensitivity: 'base' });
    });

    objs.forEach(function (objName) {
      const { body, block, toggle } = makeObjectBlock(sec.body, objName);
      const count = document.createElement('span');
      count.className = 'kb-desk-prac-rail-work-count';
      count.textContent = String(byType[kind][objName].length);
      toggle.appendChild(count);

      byType[kind][objName].forEach(function (item) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'kb-desk-prac-rail-row';
        row.setAttribute('data-kind', kind);
        row.setAttribute('data-id', item.id);
        const sub =
          kind === 'practice'
            ? item.templateTitle || ''
            : item.contractorName || item.templateTitle || '';
        row.innerHTML =
          '<span class="kb-desk-prac-rail-row-title">' +
          escapeHtml(itemTitle(item)) +
          '</span>' +
          (sub
            ? '<span class="kb-desk-prac-rail-row-sub">' +
              escapeHtml(sub) +
              '</span>'
            : '') +
          (kind === 'practice' && !item.isPublished
            ? '<span class="kb-desk-prac-rail-row-badge">Черн.</span>'
            : '');
        row.addEventListener('click', function () {
          _railFold['obj:' + objName] = true;
          block.classList.add('is-open');
          toggle.setAttribute('aria-expanded', 'true');
          selectItem(kind, item.id, rail);
        });
        row.addEventListener('dblclick', function () {
          if (kind === 'practice' && typeof window.rbi_openPracticeViewer === 'function') {
            window.rbi_openPracticeViewer(item.id);
          } else if (typeof window.openEtalonViewer === 'function') {
            window.openEtalonViewer(item.id);
          }
        });
        body.appendChild(row);

        if (
          preferredKind === kind &&
          preferredId &&
          String(item.id) === String(preferredId)
        ) {
          preferredRow = row;
          _railFold['obj:' + objName] = true;
          block.classList.add('is-open');
          toggle.setAttribute('aria-expanded', 'true');
        }
      });
    });
  });

  if (!preferredRow) {
    preferredRow = rail.querySelector('.kb-desk-prac-rail-row');
    if (preferredRow) {
      const objBlock = preferredRow.closest('.kb-desk-prac-rail-work');
      if (objBlock) {
        objBlock.classList.add('is-open');
        const t = objBlock.querySelector('.kb-desk-prac-rail-work-toggle');
        if (t) t.setAttribute('aria-expanded', 'true');
      }
    }
  }
  return preferredRow;
}

export function remountPracticesList() {
  const section = document.getElementById('ref-sub-practices');
  if (!section || section.classList.contains('hidden')) return;
  if (!section.classList.contains('kb-desk-prac')) return;

  // конструкторы эталона открыты как fullscreen
  const etalonOpen =
    document.querySelector('#etalon-constructor-view:not(.hidden)') ||
    document.querySelector('#etalon-v18-view:not(.hidden)') ||
    document.querySelector('#etalon-v18b-view:not(.hidden)');
  if (etalonOpen) return;

  const list = document.getElementById('practices-list-container');
  if (list) {
    list.setAttribute('hidden', '');
    list.classList.add('kb-desk-prac-list-source');
  }

  try {
    layoutPracticesToolbar();
    const split = ensureSplit(section);
    const rail = split.querySelector('.kb-desk-prac-rail');
    const viewer = split.querySelector('.kb-desk-prac-viewer');
    if (!rail || !viewer) return;
    const row = paintRail(rail, viewer);
    if (row) {
      selectItem(
        row.getAttribute('data-kind'),
        row.getAttribute('data-id'),
        rail
      );
    }
  } catch (e) {
    console.warn('[kb-desk-prac] remount failed', e);
  }
}

export function paintPracticesChrome() {
  const section = document.getElementById('ref-sub-practices');
  if (!section || section.classList.contains('hidden')) return;

  const finish = function () {
    section.classList.add('kb-desk-prac');
    ensureSplit(section);
    remountPracticesList();
    _painting = false;
  };

  if (_painting) {
    remountPracticesList();
    return;
  }
  _painting = true;

  // Уже смонтировано — только remount (без повторного mobile-render)
  if (
    section.classList.contains('kb-desk-prac') &&
    section.querySelector(':scope > .kb-desk-prac-split') &&
    getFiltersPanel()
  ) {
    finish();
    return;
  }

  if (typeof window.rbi_renderPracticesTab === 'function') {
    Promise.resolve(window.rbi_renderPracticesTab())
      .catch(function () { /* ignore */ })
      .finally(finish);
  } else {
    finish();
  }
}

export function clearPracticesDesktopArtifacts() {
  _sel = { kind: null, id: null };
  _search = '';

  const filters = getFiltersPanel();
  if (filters) {
    filters.classList.remove('kb-desk-prac-filters');
    filters
      .querySelectorAll(
        '.kb-desk-prac-row, .kb-desk-prac-src-hidden, .kb-desk-prac-owner, .kb-desk-prac-search-wrap'
      )
      .forEach(function (el) {
        if (el.classList.contains('kb-desk-prac-row')) el.remove();
        else {
          el.classList.remove(
            'kb-desk-prac-src-hidden',
            'kb-desk-prac-owner',
            'kb-desk-prac-search-wrap'
          );
        }
      });
  }

  const section = document.getElementById('ref-sub-practices');
  if (section) {
    section
      .querySelectorAll(':scope > .kb-desk-prac-split')
      .forEach(function (el) {
        el.remove();
      });
    section.classList.remove('kb-desk-prac');
  }

  const list = document.getElementById('practices-list-container');
  if (list) {
    list.removeAttribute('hidden');
    list.classList.remove('kb-desk-prac-list-source');
  }
}
