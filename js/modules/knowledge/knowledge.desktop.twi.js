/**
 * knowledge.desktop.twi.js
 * Desktop TWI (≥1280): sticky chrome + Pattern G (rail слева / просмотр справа).
 *
 * Mobile-логика не дублируется: фильтры/чипы/поиск/CTA — те же DOM и window.*.
 * Превью INSPECTOR/WORKER — inline; PDF — iframe; «На весь экран» → openTwiViewer.
 */

/** @type {boolean} */
let _painting = false;

/** @type {number} */
let _previewGen = 0;

/** @type {{ twiId: string|null, blobUrl: string|null }} */
let _sel = { twiId: null, blobUrl: null };

/** @type {Record<string, boolean>} */
let _railFold = {};

const TYPE_ORDER = ['INSPECTOR', 'WORKER', 'PDF'];
const TYPE_LABELS = {
  INSPECTOR: 'Технадзор',
  WORKER: 'Инструкция',
  PDF: 'Регламент'
};

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

function getSearchTerm() {
  const el = document.getElementById('twi-search-input');
  return (el && el.value ? el.value : '').toLowerCase();
}

function cardTypeKey(card) {
  return String(card.type || (card.data && card.data.type) || '').toUpperCase() || 'OTHER';
}

function compareByTitle(a, b) {
  const ta = String(a.title || a.name || '');
  const tb = String(b.title || b.name || '');
  return ta.localeCompare(tb, 'ru', { numeric: true, sensitivity: 'base' });
}

function sortTypeKeys(keys) {
  return keys.slice().sort(function (a, b) {
    const ia = TYPE_ORDER.indexOf(a);
    const ib = TYPE_ORDER.indexOf(b);
    if (ia >= 0 || ib >= 0) {
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    }
    return a.localeCompare(b, 'ru', { sensitivity: 'base' });
  });
}

/** Те же правила, что renderTwiList. */
function getFilteredTwi() {
  const cards = Array.isArray(window.customTwiCards) ? window.customTwiCards : [];
  const searchInput = getSearchTerm();
  const currentEngineer = getCurrentEngineer();
  const showInspector = window.kbShowTwiInspector !== false;
  const showWorker = window.kbShowTwiWorker !== false;
  const showPdf = window.kbShowTwiPdf !== false;

  return cards.filter(function (card) {
    const title = String(
      card.title || card.name || (card.data && card.data.title) || ''
    ).toLowerCase();
    const checklistName = String(
      card.checklistName ||
        card.category ||
        (card.data && card.data.checklistName) ||
        'Без привязки'
    ).toLowerCase();
    const type = String(card.type || (card.data && card.data.type) || '').toLowerCase();
    const typeKey = cardTypeKey(card);
    const owner = card.owner || (card.data && card.data.owner) || '';

    const matchSearch =
      title.includes(searchInput) ||
      checklistName.includes(searchInput) ||
      type.includes(searchInput);
    const matchOwner =
      window.twiOwnerFilter === 'ALL' || owner === currentEngineer;
    const matchType =
      (typeKey === 'INSPECTOR' && showInspector) ||
      (typeKey === 'WORKER' && showWorker) ||
      (typeKey === 'PDF' && showPdf);

    return matchSearch && matchOwner && matchType;
  });
}

function findCard(id) {
  const cards = Array.isArray(window.customTwiCards) ? window.customTwiCards : [];
  return (
    cards.find(function (c) {
      return String(c.id) === String(id);
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

async function resolvePhotoUrl(ref) {
  if (!ref) return null;
  const PM = typeof window.PhotoManager !== 'undefined' ? window.PhotoManager : null;
  try {
    if (PM && typeof PM.getAsyncUrl === 'function') {
      // Desktop preview — полный файл; preferThumb только на mobile viewer.
      const u = await PM.getAsyncUrl(ref);
      if (u) return u;
    }
    if (typeof window.getPhotoSrc === 'function') return window.getPhotoSrc(ref);
  } catch (_) { /* ignore */ }
  return null;
}

/** URL + ориентация (как в mobile TWI viewer). */
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

function workNameOf(card) {
  return (
    card.checklistName ||
    card.category ||
    (card.data && card.data.checklistName) ||
    'Без привязки'
  );
}

function stripHtmlNorm(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .trim();
}

/** Полный норматив пункта чек-листа (item.t), как в mobile/Word. */
function resolveChecklistNorm(card) {
  const out = { itemName: '', normText: '' };
  if (!card) return out;
  try {
    const ck = String(card.checklistKey || '');
    const itemId = card.itemId;
    if (
      !ck ||
      itemId == null ||
      itemId === '' ||
      String(itemId) === 'ALL'
    ) {
      return out;
    }
    const type = ck.split('_')[0];
    const key = ck.replace(type + '_', '');
    let groups = [];
    const templates =
      window.RBI && window.RBI.services && window.RBI.services.templates
        ? window.RBI.services.templates
        : null;
    if (templates) {
      if (type === 'sys' && typeof templates.getSystemTemplates === 'function') {
        const sys = templates.getSystemTemplates()[key];
        if (sys && sys.groups) groups = sys.groups;
      } else if (typeof templates.getUserTemplates === 'function') {
        const user = templates.getUserTemplates()[key];
        if (user && user.groups) groups = user.groups;
      }
    }
    if (!groups.length) {
      const sys = window.SYSTEM_TEMPLATES || {};
      const user = window.userTemplates || {};
      if (type === 'sys' && sys[key] && sys[key].groups) groups = sys[key].groups;
      else if (user[key] && user[key].groups) groups = user[key].groups;
    }
    const flat =
      typeof window.getFlatList === 'function'
        ? window.getFlatList(groups || [])
        : [];
    const itemInfo = flat.find(function (i) {
      return String(i.id) === String(itemId);
    });
    if (itemInfo) {
      out.itemName = itemInfo.n || '';
      if (itemInfo.t) out.normText = stripHtmlNorm(itemInfo.t);
    }
  } catch (_) { /* ignore */ }
  return out;
}

function photoFigHtml(meta, label, variant) {
  if (!meta) {
    const emptyCls =
      'kb-desk-twi-photo-empty' + (variant === 'bad' ? ' bad' : ' ok');
    return (
      '<div class="' +
      emptyCls +
      '">' +
      escapeHtml(label === 'Брак' ? 'Нет фото брака' : 'Нет фото эталона') +
      '</div>'
    );
  }
  const orient = meta.orientation || 'portrait';
  const cls =
    'kb-desk-twi-photo kb-desk-twi-photo--' +
    orient +
    (variant === 'bad' ? ' kb-desk-twi-photo-bad' : ' kb-desk-twi-photo-ok');
  return (
    '<button type="button" class="' +
    cls +
    '" data-photo="' +
    escapeHtml(meta.ref) +
    '">' +
    (label
      ? '<span class="kb-desk-twi-photo-label">' + escapeHtml(label) + '</span>'
      : '') +
    '<span class="kb-desk-twi-photo-frame">' +
    '<img src="' +
    escapeHtml(meta.url) +
    '" alt=""></span></button>'
  );
}

function bindPhotoClicks(root) {
  if (!root) return;
  root.querySelectorAll('[data-photo]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const ref = btn.getAttribute('data-photo');
      if (ref && typeof window.openPhotoViewer === 'function') {
        window.openPhotoViewer(ref);
      }
    });
  });
}

function makeWorkGroup(kind, title, count) {
  const foldKey = 'work:' + kind;
  // Виды работ по умолчанию свёрнуты
  const open = _railFold[foldKey] === true;
  const block = document.createElement('div');
  block.className = 'kb-desk-twi-work' + (open ? ' is-open' : '');
  block.setAttribute('data-work-kind', kind);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'kb-desk-twi-work-toggle';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.innerHTML =
    '<span class="kb-desk-twi-work-name">' +
    escapeHtml(title) +
    '</span>' +
    '<span class="kb-desk-twi-work-count">' +
    count +
    '</span>' +
    '<span class="kb-desk-twi-work-chevron" aria-hidden="true">▾</span>';

  const body = document.createElement('div');
  body.className = 'kb-desk-twi-work-body';

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    const next = !block.classList.contains('is-open');
    block.classList.toggle('is-open', next);
    _railFold[foldKey] = next;
    toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
  });

  block.appendChild(toggle);
  block.appendChild(body);
  return { block: block, body: body };
}

async function resolvePdfSrc(card) {
  if (!card || !card.pdfData) return null;
  const pdfData = card.pdfData;
  const raw = String(pdfData);
  const PM = typeof window.PhotoManager !== 'undefined' ? window.PhotoManager : null;

  async function toBlobUrl(buf) {
    if (!buf) return null;
    return URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
  }

  try {
    if (raw.indexOf('data:application/pdf') === 0 && typeof window.base64ToArrayBuffer === 'function') {
      return toBlobUrl(await window.base64ToArrayBuffer(pdfData));
    }
    if (raw.indexOf('http') === 0) {
      if (typeof window.rbiLoadCloudPdfArrayBuffer === 'function') {
        return toBlobUrl(await window.rbiLoadCloudPdfArrayBuffer(raw));
      }
      const res = await fetch(raw, { cache: 'no-store' });
      if (res.ok) return toBlobUrl(await res.arrayBuffer());
      return raw;
    }
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
    if (PM && typeof PM.getBase64 === 'function' && typeof window.base64ToArrayBuffer === 'function') {
      const b64 = await PM.getBase64(pdfData);
      return toBlobUrl(await window.base64ToArrayBuffer(b64));
    }
  } catch (e) {
    console.warn('[kb-desk-twi] PDF resolve failed', e);
  }
  return null;
}

function ensureChrome(listView) {
  let chrome = listView.querySelector(':scope > .kb-desk-twi-chrome');
  if (!chrome) {
    chrome = document.createElement('div');
    chrome.className = 'kb-desk-twi-chrome';
    const filters = document.getElementById('twi-filters-block');
    if (filters && filters.parentElement === listView) {
      listView.insertBefore(chrome, filters);
      chrome.appendChild(filters);
    } else if (filters) {
      chrome.appendChild(filters);
      listView.insertBefore(chrome, listView.firstChild);
    } else {
      listView.insertBefore(chrome, listView.firstChild);
    }
  } else {
    const filters = document.getElementById('twi-filters-block');
    if (filters && filters.parentElement !== chrome) chrome.appendChild(filters);
  }

  // Mobile «Управление базой» + панель — спрятать (desk: Импорт/Экспорт в row1)
  const manageToggle = listView.querySelector(
    '[data-knowledge-action="toggleTwiManagePanel"]:not(.kb-desk-twi-btn)'
  );
  if (manageToggle) {
    manageToggle.classList.add('kb-desk-twi-src-hidden');
    if (manageToggle.parentElement !== chrome) chrome.appendChild(manageToggle);
  }
  const manage = document.getElementById('twi-manage-body');
  if (manage) {
    manage.classList.add('kb-desk-twi-src-hidden');
    manage.style.maxHeight = '0px';
    manage.style.opacity = '0';
    manage.style.marginTop = '0px';
    if (manage.parentElement !== chrome) chrome.appendChild(manage);
  }
  return chrome;
}

function ensureSplit(listView) {
  let split = listView.querySelector(':scope > .kb-desk-twi-split');
  if (split) return split;
  split = document.createElement('div');
  split.className = 'kb-desk-twi-split';
  const rail = document.createElement('aside');
  rail.className = 'kb-desk-twi-rail';
  const viewer = document.createElement('div');
  viewer.className = 'kb-desk-twi-viewer';
  viewer.innerHTML =
    '<div class="kb-desk-twi-viewer-empty">Выберите карту слева — справа откроется просмотр</div>';
  split.appendChild(rail);
  split.appendChild(viewer);
  listView.appendChild(split);
  return split;
}

function layoutTwiToolbar() {
  const filters = document.getElementById('twi-filters-block');
  if (!filters) return;
  filters.classList.add('kb-desk-twi-filters');

  // Как у НД: 2 строки — поиск+CTA / чипы+мои+офлайн
  let row1 = filters.querySelector(':scope > .kb-desk-twi-row1');
  let row2 = filters.querySelector(':scope > .kb-desk-twi-row2');
  if (!row1 || !row2) {
    if (row1) row1.remove();
    if (row2) row2.remove();
    row1 = document.createElement('div');
    row1.className = 'kb-desk-twi-row kb-desk-twi-row1';
    row2 = document.createElement('div');
    row2.className = 'kb-desk-twi-row kb-desk-twi-row2';
    filters.appendChild(row1);
    filters.appendChild(row2);
  }

  const search = document.getElementById('twi-search-input');
  const searchWrap = search && search.closest('.relative');
  if (searchWrap) {
    searchWrap.classList.add('kb-desk-twi-search-wrap');
    if (searchWrap.parentElement !== row1) {
      row1.insertBefore(searchWrap, row1.firstChild);
    }
  }
  if (search && !search.dataset.kbDeskPh) {
    search.dataset.kbDeskPh = '1';
    search.placeholder = 'Поиск по названию или виду работ…';
  }

  let actions = row1.querySelector('.kb-desk-twi-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'kb-desk-twi-actions';
    actions.innerHTML =
      '<button type="button" class="kb-desk-twi-btn" data-kb-desk-twi="import" title="Импорт JSON">↑ Импорт</button>' +
      '<button type="button" class="kb-desk-twi-btn" data-knowledge-action="exportTwiJson" title="Экспорт JSON">↓ Экспорт</button>' +
      '<button type="button" class="kb-desk-twi-btn kb-desk-twi-btn-primary" data-knowledge-action="openTwiConstructor" title="Создать TWI-карту">+ Создать</button>';
    row1.appendChild(actions);
    const importBtn = actions.querySelector('[data-kb-desk-twi="import"]');
    if (importBtn) {
      importBtn.addEventListener('click', function () {
        const input = document.getElementById('twi-import-input');
        if (input) input.click();
      });
    }
  }

  // Если actions уже были со старым «Управление» — обновить набор кнопок
  if (actions && !actions.querySelector('[data-kb-desk-twi="import"]')) {
    actions.innerHTML =
      '<button type="button" class="kb-desk-twi-btn" data-kb-desk-twi="import" title="Импорт JSON">↑ Импорт</button>' +
      '<button type="button" class="kb-desk-twi-btn" data-knowledge-action="exportTwiJson" title="Экспорт JSON">↓ Экспорт</button>' +
      '<button type="button" class="kb-desk-twi-btn kb-desk-twi-btn-primary" data-knowledge-action="openTwiConstructor" title="Создать TWI-карту">+ Создать</button>';
    const importBtn = actions.querySelector('[data-kb-desk-twi="import"]');
    if (importBtn) {
      importBtn.addEventListener('click', function () {
        const input = document.getElementById('twi-import-input');
        if (input) input.click();
      });
    }
  }

  if (actions.parentElement !== row1) row1.appendChild(actions);

  const typeFilters = document.getElementById('twi-type-filters');
  if (typeFilters) {
    typeFilters.classList.add('kb-desk-twi-chips');
    if (typeFilters.parentElement !== row2) {
      row2.insertBefore(typeFilters, row2.firstChild);
    }
  }

  let tools = row2.querySelector('.kb-desk-twi-tools');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'kb-desk-twi-tools';
    row2.appendChild(tools);
  }

  ensureMagicButton(row2, tools);

  const ownerLabel =
    filters.querySelector('.kb-desk-twi-owner') ||
    filters.querySelector('label.flex.items-center');
  if (ownerLabel) {
    ownerLabel.classList.add('kb-desk-twi-owner');
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

  const viewToggle = document.getElementById('twi-view-mode-toggle');
  if (viewToggle) viewToggle.classList.add('kb-desk-twi-src-hidden');

  // Пустые mobile-ряды и дубли CTA
  filters.querySelectorAll(':scope > .flex.flex-col, :scope > div.flex').forEach(
    function (el) {
      if (el.classList.contains('kb-desk-twi-row')) return;
      el.classList.add('kb-desk-twi-src-hidden');
    }
  );
  filters
    .querySelectorAll('button[data-knowledge-action="openTwiConstructor"]')
    .forEach(function (btn) {
      if (!btn.classList.contains('kb-desk-twi-btn')) {
        btn.classList.add('kb-desk-twi-src-hidden');
      }
    });

  syncMagicButton();
}

/** Пользователь открыл панель «Магия TWI» (переживает remount). */
let _magicPanelOpen = false;

/** Кнопка «Магия TWI» между чипами и «Только мои». */
function ensureMagicButton(row2, tools) {
  if (!row2) return;
  let btn = row2.querySelector(':scope > .kb-desk-twi-magic-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kb-desk-twi-magic-btn';
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', onMagicButtonClick);
    if (tools) row2.insertBefore(btn, tools);
    else row2.appendChild(btn);
  } else if (tools && btn.nextElementSibling !== tools) {
    row2.insertBefore(btn, tools);
  }
}

function applyMagicPanelVisibility() {
  const listView = document.getElementById('twi-list-view');
  const host =
    listView && listView.querySelector(':scope > .kb-desk-twi-magic');
  const block = document.getElementById('twi-magic-block');
  if (host) {
    // без [hidden]/display:none — иначе не анимируется выезд
    host.removeAttribute('hidden');
    host.setAttribute('aria-hidden', _magicPanelOpen ? 'false' : 'true');
    if (_magicPanelOpen) {
      // force reflow, если только что создан в is-hidden
      if (host.classList.contains('is-hidden')) {
        void host.offsetHeight;
      }
      host.classList.remove('is-hidden');
    } else {
      host.classList.add('is-hidden');
    }
  }
  // На desktop высота панели = host; внутренний collapse не нужен
  if (block) {
    block.classList.remove('magic-collapsed');
  }
  syncMagicButton();
}

function ensureMagicBlockMounted() {
  const listView = document.getElementById('twi-list-view');
  const search = document.getElementById('twi-search-input');
  // Магия в mobile-рендере скрывается при непустом поиске
  if (search && search.value) {
    search.value = '';
  }

  let block = document.getElementById('twi-magic-block');
  if (!block && typeof window.renderTwiList === 'function') {
    window.renderTwiList();
    remountTwiList();
    block = document.getElementById('twi-magic-block');
  }
  if (!block) return null;

  let host =
    listView && listView.querySelector(':scope > .kb-desk-twi-magic');
  if (!host && listView) {
    placeMagicBlock(listView, document.getElementById('twi-cards-container'));
    host = listView.querySelector(':scope > .kb-desk-twi-magic');
  }
  return block;
}

function openMagicPanel() {
  const block = ensureMagicBlockMounted();
  if (!block) {
    _magicPanelOpen = false;
    if (typeof window.showToast === 'function') {
      window.showToast('✨ Пока нет кандидатов для Магии TWI');
    }
    applyMagicPanelVisibility();
    return false;
  }
  _magicPanelOpen = true;
  applyMagicPanelVisibility();
  try {
    block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (_) { /* ignore */ }
  return true;
}

function closeMagicPanel() {
  _magicPanelOpen = false;
  applyMagicPanelVisibility();
}

function onMagicButtonClick(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (_magicPanelOpen) {
    closeMagicPanel();
    return;
  }
  // renderTwiList → finally remount; раскрываем после стабилизации DOM
  const opened = openMagicPanel();
  if (!opened) return;
  queueMicrotask(function () {
    setTimeout(function () {
      if (_magicPanelOpen) openMagicPanel();
    }, 0);
  });
}

function syncMagicButton() {
  const btn = document.querySelector(
    '#ref-sub-twi .kb-desk-twi-magic-btn'
  );
  if (!btn) return;
  let n = 0;
  try {
    if (typeof window.getMagicTwiCandidates === 'function') {
      n = window.getMagicTwiCandidates().length || 0;
    }
  } catch (_) {
    n = 0;
  }
  if (n <= 0 && _magicPanelOpen) {
    _magicPanelOpen = false;
  }
  btn.innerHTML =
    '<span class="kb-desk-twi-magic-dot" aria-hidden="true"></span>' +
    '<span class="kb-desk-twi-magic-label">Магия TWI</span>' +
    (n > 0
      ? '<span class="kb-desk-twi-magic-count">' + n + '</span>'
      : '');
  btn.classList.toggle('has-candidates', n > 0);
  btn.classList.toggle('is-open', _magicPanelOpen);
  btn.setAttribute('aria-pressed', _magicPanelOpen ? 'true' : 'false');
  btn.title = _magicPanelOpen
    ? 'Скрыть панель Магия TWI'
    : n > 0
      ? 'Показать Магию TWI — кандидатов: ' + n
      : 'Магия TWI — поиск эталонов OK/FAIL';
}

function unwrapTwiToolbar(filters) {
  if (!filters) return;
  const rows = filters.querySelectorAll(':scope > .kb-desk-twi-row');
  if (!rows.length) return;

  filters.querySelectorAll('.kb-desk-twi-actions').forEach(function (el) {
    el.remove();
  });
  filters.querySelectorAll('.kb-desk-twi-src-hidden').forEach(function (el) {
    el.classList.remove('kb-desk-twi-src-hidden');
  });

  const col = filters.querySelector(':scope > .flex.flex-col');
  const searchWrap = filters.querySelector('.kb-desk-twi-search-wrap');
  const typeFilters = document.getElementById('twi-type-filters');
  const owner = filters.querySelector('.kb-desk-twi-owner');
  const offline = filters.querySelector(
    'button[onclick*="downloadMissingCloudFiles"]'
  );

  if (col) {
    if (typeFilters && typeFilters.parentElement !== col) {
      col.insertBefore(typeFilters, col.firstChild);
    }
    // restore mid row: owner + offline host
    const mid = col.children[1];
    if (mid) {
      if (owner && owner.parentElement !== mid) {
        mid.insertBefore(owner, mid.firstChild);
      }
      const offlineHost =
        mid.querySelector('.flex.items-center.gap-2.shrink-0') || mid;
      if (offline && offline.parentElement !== offlineHost) {
        offlineHost.appendChild(offline);
      }
    }
    const searchRow = col.children[2] || col.lastElementChild;
    if (searchRow && searchWrap && searchWrap.parentElement !== searchRow) {
      searchRow.insertBefore(searchWrap, searchRow.firstChild);
    }
  }

  rows.forEach(function (r) {
    r.remove();
  });
}

function makeRailSection(kind, title, count) {
  const open = _railFold[kind] !== false;
  const block = document.createElement('div');
  const typeCls =
    kind === 'INSPECTOR'
      ? ' is-inspector'
      : kind === 'WORKER'
        ? ' is-worker'
        : kind === 'PDF'
          ? ' is-pdf'
          : '';
  block.className =
    'kb-desk-twi-rail-section' + (open ? ' is-open' : '') + typeCls;
  block.setAttribute('data-rail-kind', kind);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'kb-desk-twi-rail-toggle';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.innerHTML =
    '<span class="kb-desk-twi-rail-name">' +
    escapeHtml(title) +
    ' <span class="kb-desk-twi-rail-count">' +
    count +
    '</span></span>' +
    '<span class="kb-desk-twi-rail-chevron" aria-hidden="true">▾</span>';

  const body = document.createElement('div');
  body.className = 'kb-desk-twi-rail-body';

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

function paintViewerHead(viewer, card) {
  const typeKey = cardTypeKey(card);
  const label = TYPE_LABELS[typeKey] || typeKey;
  const norm = resolveChecklistNorm(card);
  const itemLabel = norm.itemName || card.title || 'Без названия';
  const head = document.createElement('div');
  head.className = 'kb-desk-twi-viewer-head';

  const metaBits = [];
  metaBits.push(escapeHtml(card.owner ? card.owner : 'Система'));
  if (typeKey === 'WORKER' && card.steps) {
    metaBits.push(card.steps.length + ' шагов');
  }
  if (typeKey === 'WORKER' && card.totalTime) {
    metaBits.push('~' + card.totalTime + ' мин');
  }

  head.innerHTML =
    '<div class="kb-desk-twi-viewer-head-top">' +
    '<div class="kb-desk-twi-viewer-kicker">' +
    escapeHtml(label) +
    (card.checklistName ? ' · ' + escapeHtml(card.checklistName) : '') +
    (metaBits.length ? ' · ' + metaBits.join(' · ') : '') +
    '</div>' +
    '<div class="kb-desk-twi-viewer-actions"></div>' +
    '</div>' +
    '<h2 class="kb-desk-twi-viewer-title">' +
    escapeHtml(itemLabel) +
    '</h2>' +
    (norm.normText
      ? '<p class="kb-desk-twi-viewer-norm">' +
        escapeHtml(norm.normText) +
        '</p>'
      : '');

  const actions = head.querySelector('.kb-desk-twi-viewer-actions');

  if (typeKey === 'PDF' && card.pdfData) {
    const browserBtn = document.createElement('button');
    browserBtn.type = 'button';
    browserBtn.className = 'kb-desk-twi-viewer-btn kb-desk-twi-viewer-btn-primary';
    browserBtn.textContent = 'В браузере';
    browserBtn.addEventListener('click', async function () {
      const src = await resolvePdfSrc(card);
      if (!src) {
        if (typeof window.showToast === 'function') {
          window.showToast('⚠️ У карты нет PDF');
        }
        return;
      }
      const w = window.open(src, '_blank', 'noopener,noreferrer');
      if (!w && typeof window.showToast === 'function') {
        window.showToast('⚠️ Браузер заблокировал вкладку');
      }
    });
    actions.appendChild(browserBtn);
  }

  const fullBtn = document.createElement('button');
  fullBtn.type = 'button';
  fullBtn.className = 'kb-desk-twi-viewer-btn';
  fullBtn.textContent = 'На весь экран';
  fullBtn.addEventListener('click', function () {
    if (typeof window.openTwiViewer === 'function') window.openTwiViewer(card.id);
  });
  actions.appendChild(fullBtn);

  const isOwner =
    !String(card.id || '').startsWith('sys_') &&
    (!card.owner || card.owner === getCurrentEngineer());
  if (!String(card.id || '').startsWith('sys_')) {
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'kb-desk-twi-viewer-btn is-muted';
    menuBtn.textContent = 'Управление';
    menuBtn.addEventListener('click', function () {
      if (typeof window.openUniversalActionSheet === 'function') {
        window.openUniversalActionSheet(
          card.id,
          'twi',
          String(card.title || '').replace(/'/g, "\\'"),
          isOwner
        );
      }
    });
    actions.appendChild(menuBtn);
  }

  viewer.appendChild(head);
}

async function paintInspectorBody(host, card, gen) {
  const goodMeta = card.photoGood ? await loadPhotoMeta(card.photoGood) : null;
  if (gen != null && gen !== _previewGen) return;
  const badMeta = card.photoBad ? await loadPhotoMeta(card.photoBad) : null;
  if (gen != null && gen !== _previewGen) return;

  const bothPortrait =
    goodMeta &&
    badMeta &&
    goodMeta.orientation === 'portrait' &&
    badMeta.orientation === 'portrait';
  const bothLandscape =
    goodMeta &&
    badMeta &&
    goodMeta.orientation !== 'portrait' &&
    badMeta.orientation !== 'portrait';

  let photosClass = 'kb-desk-twi-photos kb-desk-twi-photos--side';
  if (bothPortrait) photosClass += ' kb-desk-twi-photos--pair-portrait';
  else if (bothLandscape) photosClass += ' kb-desk-twi-photos--pair-landscape';
  else photosClass += ' kb-desk-twi-photos--mixed';

  host.innerHTML =
    '<div class="kb-desk-twi-body">' +
    '<div class="' +
    photosClass +
    '">' +
    photoFigHtml(goodMeta, 'Правильно', 'ok') +
    photoFigHtml(badMeta, 'Брак', 'bad') +
    '</div>' +
    '<section class="kb-desk-twi-block">' +
    '<h3>Почему это важно</h3>' +
    '<p>' +
    escapeHtml(card.whyImportant || 'Обоснование не заполнено') +
    '</p></section>' +
    '<section class="kb-desk-twi-block">' +
    '<h3>Как проверять</h3>' +
    '<p>' +
    escapeHtml(card.howToCheck || 'Методика не заполнена') +
    '</p></section>' +
    '</div>';

  bindPhotoClicks(host);
}

async function paintWorkerBody(host, card, gen) {
  const steps = Array.isArray(card.steps) ? card.steps : [];
  if (!steps.length) {
    host.innerHTML =
      '<div class="kb-desk-twi-viewer-empty">Шаги не заполнены</div>';
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'kb-desk-twi-body kb-desk-twi-steps';

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const refs =
      typeof window.normalizeItemPhotos === 'function'
        ? window.normalizeItemPhotos(step.photo)
        : step.photo
          ? [step.photo]
          : [];
    const metas = [];
    for (let j = 0; j < refs.length; j++) {
      if (gen != null && gen !== _previewGen) return;
      const meta = await loadPhotoMeta(refs[j]);
      if (gen != null && gen !== _previewGen) return;
      if (meta) metas.push(meta);
    }

    let photosHtml = '';
    if (metas.length) {
      let k = 0;
      while (k < metas.length) {
        const a = metas[k];
        const b = metas[k + 1];
        if (a && b && a.orientation === 'portrait' && b.orientation === 'portrait') {
          photosHtml +=
            '<div class="kb-desk-twi-step-photos kb-desk-twi-step-photos--pair">' +
            photoFigHtml(a, '', 'ok') +
            photoFigHtml(b, '', 'ok') +
            '</div>';
          k += 2;
        } else {
          photosHtml +=
            '<div class="kb-desk-twi-step-photos kb-desk-twi-step-photos--single">' +
            photoFigHtml(a, '', 'ok') +
            '</div>';
          k += 1;
        }
      }
    }

    const el = document.createElement('article');
    el.className = 'kb-desk-twi-step';
    el.innerHTML =
      '<div class="kb-desk-twi-step-top">' +
      '<span class="kb-desk-twi-step-num">Шаг ' +
      escapeHtml(step.order != null ? step.order : i + 1) +
      '</span>' +
      (step.time
        ? '<span class="kb-desk-twi-step-time">' +
          escapeHtml(step.time) +
          ' мин</span>'
        : '') +
      '</div>' +
      '<p class="kb-desk-twi-step-text">' +
      escapeHtml(step.text || '') +
      '</p>' +
      photosHtml;
    wrap.appendChild(el);
  }

  host.appendChild(wrap);
  bindPhotoClicks(host);
}

async function paintPdfBody(host, card, gen) {
  host.innerHTML =
    '<div class="kb-desk-twi-pdf-frame"><div class="kb-desk-twi-pdf-loading">Загрузка PDF…</div></div>';
  const frame = host.querySelector('.kb-desk-twi-pdf-frame');
  const src = await resolvePdfSrc(card);
  if (gen != null && gen !== _previewGen) return;
  if (_sel.twiId !== card.id) return;

  revokePreviewBlob();
  if (src && String(src).indexOf('blob:') === 0) _sel.blobUrl = src;

  frame.innerHTML = '';
  if (src) {
    const iframe = document.createElement('iframe');
    iframe.className = 'kb-desk-twi-pdf-iframe';
    iframe.title = card.title || 'PDF';
    iframe.src = src;
    frame.appendChild(iframe);
  } else {
    frame.innerHTML =
      '<div class="kb-desk-twi-viewer-empty">PDF-файл не прикреплён</div>';
  }
}

async function paintTwiPreview(viewer, card) {
  if (!viewer || !card) return;
  const gen = ++_previewGen;
  viewer.innerHTML = '';
  viewer.classList.add('kb-desk-twi-viewer--active');
  paintViewerHead(viewer, card);

  const body = document.createElement('div');
  body.className = 'kb-desk-twi-viewer-body';
  viewer.appendChild(body);

  const typeKey = cardTypeKey(card);
  if (typeKey === 'INSPECTOR') await paintInspectorBody(body, card, gen);
  else if (typeKey === 'WORKER') await paintWorkerBody(body, card, gen);
  else if (typeKey === 'PDF') await paintPdfBody(body, card, gen);
  else {
    body.innerHTML =
      '<div class="kb-desk-twi-viewer-empty">Неизвестный тип карты</div>';
  }
  if (gen !== _previewGen) return;

  // cross-links
  let links = '';
  if (card.videoLink) {
    links +=
      '<a class="kb-desk-twi-link" href="' +
      escapeHtml(card.videoLink) +
      '" target="_blank" rel="noopener">Видеоинструкция</a>';
  }
  if (card.linkedNodeId) {
    links +=
      '<button type="button" class="kb-desk-twi-link" data-link="node" data-id="' +
      escapeHtml(card.linkedNodeId) +
      '">Технический узел</button>';
  }
  if (card.linkedDocId) {
    links +=
      '<button type="button" class="kb-desk-twi-link" data-link="doc" data-id="' +
      escapeHtml(card.linkedDocId) +
      '">Норматив (НД)</button>';
  }
  if (card.checklistKey && !String(card.checklistKey).includes('|')) {
    links +=
      '<button type="button" class="kb-desk-twi-link" data-link="checklist" data-id="' +
      escapeHtml(card.checklistKey) +
      '">Чек-лист</button>';
  }
  if (links) {
    const box = document.createElement('div');
    box.className = 'kb-desk-twi-links';
    box.innerHTML =
      '<div class="kb-desk-twi-links-title">Связанные материалы</div>' + links;
    body.appendChild(box);
    box.querySelectorAll('[data-link]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const kind = btn.getAttribute('data-link');
        const id = btn.getAttribute('data-id');
        if (kind === 'node' && typeof window.openNodeViewer === 'function') {
          window.openNodeViewer(id);
        }
        if (kind === 'doc' && typeof window.openDocViewer === 'function') {
          window.openDocViewer(id);
        }
        if (
          kind === 'checklist' &&
          typeof window.openKnowledgeLinkedChecklist === 'function'
        ) {
          window.openKnowledgeLinkedChecklist(id);
        }
      });
    });
  }
}

function selectTwi(twiId, rail) {
  _previewGen += 1; // invalidate in-flight preview before switching
  revokePreviewBlob();
  _sel.twiId = twiId;
  if (rail) {
    rail.querySelectorAll('.kb-desk-twi-rail-row.is-active').forEach(function (el) {
      el.classList.remove('is-active');
    });
    const row = rail.querySelector(
      '.kb-desk-twi-rail-row[data-twi-id="' +
        String(twiId).replace(/"/g, '\\"') +
        '"]'
    );
    if (row) row.classList.add('is-active');
  }
  const viewer = document.querySelector('#ref-sub-twi .kb-desk-twi-viewer');
  const card = findCard(twiId);
  if (viewer && card) paintTwiPreview(viewer, card);
}

function paintRail(rail, viewer) {
  const list = getFilteredTwi();
  rail.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'kb-desk-twi-rail-head';
  head.innerHTML =
    '<div class="kb-desk-twi-rail-head-title">Библиотека TWI</div>' +
    '<div class="kb-desk-twi-rail-head-sub">' +
    list.length +
    ' карт</div>';
  rail.appendChild(head);

  if (!list.length) {
    viewer.innerHTML =
      '<div class="kb-desk-twi-viewer-empty">В библиотеке пока пусто</div>';
    return null;
  }

  // тип → вид работ → карточки
  const byType = {};
  list.forEach(function (card) {
    const typeKey = cardTypeKey(card);
    const work = workNameOf(card);
    if (!byType[typeKey]) byType[typeKey] = {};
    if (!byType[typeKey][work]) byType[typeKey][work] = [];
    byType[typeKey][work].push(card);
  });

  Object.keys(byType).forEach(function (typeKey) {
    Object.keys(byType[typeKey]).forEach(function (work) {
      byType[typeKey][work].sort(compareByTitle);
    });
  });

  const typeKeys = sortTypeKeys(Object.keys(byType));
  let preferredRow = null;
  const firstType = typeKeys[0];
  const firstWorks = firstType
    ? Object.keys(byType[firstType]).sort(function (a, b) {
        return a.localeCompare(b, 'ru', { sensitivity: 'base' });
      })
    : [];
  const preferred =
    _sel.twiId ||
    (firstWorks[0] &&
      byType[firstType][firstWorks[0]][0] &&
      byType[firstType][firstWorks[0]][0].id) ||
    null;

  function addRow(card, host) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'kb-desk-twi-rail-row';
    row.setAttribute('data-twi-id', card.id);
    row.innerHTML =
      '<span class="kb-desk-twi-rail-row-title">' +
      escapeHtml(card.title || '—') +
      '</span>' +
      '<span class="kb-desk-twi-rail-row-meta">' +
      escapeHtml(card.owner ? String(card.owner).split(' ')[0] : 'Система') +
      '</span>';
    row.addEventListener('click', function () {
      selectTwi(card.id, rail);
    });
    host.appendChild(row);
    if (preferred && String(preferred) === String(card.id)) preferredRow = row;
  }

  typeKeys.forEach(function (typeKey) {
    const worksMap = byType[typeKey];
    const workKeys = Object.keys(worksMap).sort(function (a, b) {
      return a.localeCompare(b, 'ru', { sensitivity: 'base' });
    });
    let typeCount = 0;
    workKeys.forEach(function (w) {
      typeCount += worksMap[w].length;
    });

    const sec = makeRailSection(
      typeKey,
      TYPE_LABELS[typeKey] || typeKey,
      typeCount
    );

    workKeys.forEach(function (work) {
      const cards = worksMap[work];
      const workSec = makeWorkGroup(typeKey + '|' + work, work, cards.length);
      cards.forEach(function (c) {
        addRow(c, workSec.body);
      });
      sec.body.appendChild(workSec.block);
    });

    rail.appendChild(sec.block);
  });

  if (preferredRow) {
    const typeSec = preferredRow.closest('.kb-desk-twi-rail-section');
    if (typeSec && !typeSec.classList.contains('is-open')) {
      typeSec.classList.add('is-open');
      const kind = typeSec.getAttribute('data-rail-kind');
      if (kind) _railFold[kind] = true;
    }
    // Виды работ по умолчанию свёрнуты — не раскрываем автоматически
  }

  return preferredRow || rail.querySelector('.kb-desk-twi-rail-row');
}

function placeMagicBlock(listView, cards) {
  if (!listView) return;
  let magic = cards && cards.querySelector('#twi-magic-block');
  let host = listView.querySelector(':scope > .kb-desk-twi-magic');

  // Уже перенесён в host — не удалять при повторном remount
  if (!magic && host) {
    magic = host.querySelector('#twi-magic-block');
    if (magic) {
      applyMagicPanelVisibility();
      return;
    }
    host.remove();
    return;
  }

  if (!magic) {
    if (host) host.remove();
    if (_magicPanelOpen) _magicPanelOpen = false;
    return;
  }

  if (!host) {
    host = document.createElement('div');
    host.className = 'kb-desk-twi-magic is-hidden';
    host.setAttribute('aria-hidden', 'true');
    const split = listView.querySelector(':scope > .kb-desk-twi-split');
    if (split) listView.insertBefore(host, split);
    else listView.appendChild(host);
  }
  if (magic.parentElement !== host) {
    host.innerHTML = '';
    host.appendChild(magic);
  }
  applyMagicPanelVisibility();
}

/** После renderTwiList: обновить rail/preview (карточки mobile скрыты). */
export function remountTwiList() {
  const section = document.getElementById('ref-sub-twi');
  const listView = document.getElementById('twi-list-view');
  if (!section || section.classList.contains('hidden')) return;
  if (!section.classList.contains('kb-desk-twi') || !listView) return;

  // конструктор открыт — не трогаем
  const ctor = document.getElementById('twi-constructor-view');
  if (ctor && !ctor.classList.contains('hidden')) return;

  const cards = document.getElementById('twi-cards-container');
  if (cards) {
    cards.setAttribute('hidden', '');
    cards.classList.add('kb-desk-twi-list-source');
  }

  placeMagicBlock(listView, cards);
  syncMagicButton();

  const split = ensureSplit(listView);
  const rail = split.querySelector('.kb-desk-twi-rail');
  const viewer = split.querySelector('.kb-desk-twi-viewer');
  const row = paintRail(rail, viewer);
  if (row) {
    const id = row.getAttribute('data-twi-id');
    if (id) selectTwi(id, rail);
  }
}

export function paintTwiChrome() {
  const section = document.getElementById('ref-sub-twi');
  const listView = document.getElementById('twi-list-view');
  if (!section || section.classList.contains('hidden') || !listView) return;
  if (_painting) {
    remountTwiList();
    return;
  }
  _painting = true;
  try {
    section.classList.add('kb-desk-twi');
    ensureChrome(listView);
    ensureSplit(listView);
    if (typeof window.renderTwiList === 'function') {
      window.renderTwiList();
    }
    layoutTwiToolbar();
    remountTwiList();
  } finally {
    _painting = false;
  }
}

export function clearTwiDesktopArtifacts() {
  revokePreviewBlob();
  _sel = { twiId: null, blobUrl: null };
  _magicPanelOpen = false;

  const filters = document.getElementById('twi-filters-block');
  if (filters) {
    unwrapTwiToolbar(filters);
    filters.classList.remove('kb-desk-twi-filters');
    filters
      .querySelectorAll(
        '.kb-desk-twi-search-wrap, .kb-desk-twi-chips, .kb-desk-twi-owner, .kb-desk-twi-src-hidden'
      )
      .forEach(function (el) {
        el.classList.remove(
          'kb-desk-twi-search-wrap',
          'kb-desk-twi-chips',
          'kb-desk-twi-owner',
          'kb-desk-twi-src-hidden'
        );
      });
    const search = document.getElementById('twi-search-input');
    if (search) delete search.dataset.kbDeskPh;
  }

  const listView = document.getElementById('twi-list-view');
  if (listView) {
    const chrome = listView.querySelector(':scope > .kb-desk-twi-chrome');
    const filtersEl = document.getElementById('twi-filters-block');
    const manageToggle = listView.querySelector(
      '[data-knowledge-action="toggleTwiManagePanel"]'
    );
    const manage = document.getElementById('twi-manage-body');
    if (chrome && filtersEl) {
      listView.insertBefore(filtersEl, chrome);
      if (manageToggle) filtersEl.after(manageToggle);
      if (manage) {
        const anchor = manageToggle || filtersEl;
        anchor.after(manage);
      }
      chrome.remove();
    }
    listView
      .querySelectorAll(
        ':scope > .kb-desk-twi-split, :scope > .kb-desk-twi-magic'
      )
      .forEach(function (el) {
        // вернуть magic в cards если есть
        const magic = el.querySelector('#twi-magic-block');
        const cards = document.getElementById('twi-cards-container');
        if (magic && cards) cards.insertBefore(magic, cards.firstChild);
        el.remove();
      });
  }

  const section = document.getElementById('ref-sub-twi');
  if (section) section.classList.remove('kb-desk-twi');

  const cards = document.getElementById('twi-cards-container');
  if (cards) {
    cards.removeAttribute('hidden');
    cards.classList.remove('kb-desk-twi-list-source');
  }
}
