/**
 * knowledge.desktop.nodes.js
 * Desktop Узлы (≥1280): sticky chrome + Pattern G (rail слева / просмотр справа).
 *
 * Mobile-логика не дублируется: фильтры/поиск/CTA — те же DOM и window.*.
 * Превью — inline; PDF — iframe; «На весь экран» → openNodeViewer.
 */

/** @type {boolean} */
let _painting = false;

/** @type {{ nodeId: string|null, blobUrl: string|null }} */
let _sel = { nodeId: null, blobUrl: null };

/** @type {Record<string, boolean>} */
let _railFold = {};

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
  const el = document.getElementById('node-search-input');
  return (el && el.value ? el.value : '').toLowerCase();
}

function allNodes() {
  const sys = Array.isArray(window.SYSTEM_NODES) ? window.SYSTEM_NODES : [];
  const custom = Array.isArray(window.customNodes) ? window.customNodes : [];
  return sys.concat(custom);
}

function isSystemNode(node) {
  if (!node) return false;
  const custom = Array.isArray(window.customNodes) ? window.customNodes : [];
  return !custom.find(function (n) {
    return String(n.id) === String(node.id);
  });
}

function categoryOf(node) {
  return node.category || (node.data && node.data.category) || 'Без категории';
}

function compareByTitle(a, b) {
  const ta = String(a.title || a.name || '');
  const tb = String(b.title || b.name || '');
  return ta.localeCompare(tb, 'ru', { numeric: true, sensitivity: 'base' });
}

/** Те же правила, что renderNodesList. */
function getFilteredNodes() {
  const searchInput = getSearchTerm();
  const currentEngineer = getCurrentEngineer();

  return allNodes().filter(function (node) {
    const title = String(
      node.title || node.name || (node.data && node.data.title) || ''
    ).toLowerCase();
    const desc = String(
      node.desc ||
        node.description ||
        (node.data && node.data.desc) ||
        (node.data && node.data.description) ||
        ''
    ).toLowerCase();
    const category = String(categoryOf(node)).toLowerCase();
    const owner = node.owner || (node.data && node.data.owner) || '';
    const sys = isSystemNode(node);

    const matchSearch =
      title.includes(searchInput) ||
      desc.includes(searchInput) ||
      category.includes(searchInput);
    const matchOwner =
      window.nodeOwnerFilter === 'ALL' || sys || owner === currentEngineer;

    return matchSearch && matchOwner;
  });
}

function findNode(id) {
  return (
    allNodes().find(function (n) {
      return String(n.id) === String(id);
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
      const u = await PM.getAsyncUrl(ref);
      if (u) return u;
    }
    if (typeof window.getPhotoSrc === 'function') return window.getPhotoSrc(ref);
  } catch (_) { /* ignore */ }
  return null;
}

async function resolvePdfSrc(url) {
  if (!url) return null;
  const raw = String(url);
  const PM = typeof window.PhotoManager !== 'undefined' ? window.PhotoManager : null;

  async function toBlobUrl(buf) {
    if (!buf) return null;
    return URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
  }

  try {
    if (raw.indexOf('data:application/pdf') === 0 && typeof window.base64ToArrayBuffer === 'function') {
      return toBlobUrl(await window.base64ToArrayBuffer(url));
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
      const real = await PM.getAsyncUrl(url);
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
    console.warn('[kb-desk-nodes] PDF resolve failed', e);
  }
  return null;
}

function nodeFiles(node) {
  let files = Array.isArray(node.attachments) ? node.attachments.slice() : [];
  if (!files.length && node.img) {
    const isPdf =
      String(node.img).includes('application/pdf') ||
      String(node.img).toLowerCase().endsWith('.pdf');
    files = [{ type: isPdf ? 'pdf' : 'image', url: node.img, name: isPdf ? 'Документ.pdf' : 'Фото' }];
  }
  return files;
}

function ensureChrome(mainView) {
  let chrome = mainView.querySelector(':scope > .kb-desk-nodes-chrome');
  if (!chrome) {
    chrome = document.createElement('div');
    chrome.className = 'kb-desk-nodes-chrome';
    const filters = document.getElementById('node-filters-block');
    if (filters && filters.parentElement === mainView) {
      mainView.insertBefore(chrome, filters);
      chrome.appendChild(filters);
    } else if (filters) {
      chrome.appendChild(filters);
      mainView.insertBefore(chrome, mainView.firstChild);
    } else {
      mainView.insertBefore(chrome, mainView.firstChild);
    }
  } else {
    const filters = document.getElementById('node-filters-block');
    if (filters && filters.parentElement !== chrome) chrome.appendChild(filters);
  }

  const manageToggle = mainView.querySelector(
    '[data-knowledge-action="toggleNodeManagePanel"]:not(.kb-desk-nodes-btn)'
  );
  if (manageToggle) {
    manageToggle.classList.add('kb-desk-nodes-src-hidden');
    if (manageToggle.parentElement !== chrome) chrome.appendChild(manageToggle);
  }
  const manage = document.getElementById('node-manage-body');
  if (manage) {
    manage.classList.add('kb-desk-nodes-src-hidden');
    manage.style.maxHeight = '0px';
    manage.style.opacity = '0';
    manage.style.marginTop = '0px';
    if (manage.parentElement !== chrome) chrome.appendChild(manage);
  }
  return chrome;
}

function ensureSplit(mainView) {
  let split = mainView.querySelector(':scope > .kb-desk-nodes-split');
  if (split) return split;
  split = document.createElement('div');
  split.className = 'kb-desk-nodes-split';
  const rail = document.createElement('aside');
  rail.className = 'kb-desk-nodes-rail';
  const viewer = document.createElement('div');
  viewer.className = 'kb-desk-nodes-viewer';
  viewer.innerHTML =
    '<div class="kb-desk-nodes-viewer-empty">Выберите узел слева — справа откроется просмотр</div>';
  split.appendChild(rail);
  split.appendChild(viewer);
  mainView.appendChild(split);
  return split;
}

function layoutNodesToolbar() {
  const filters = document.getElementById('node-filters-block');
  if (!filters) return;
  filters.classList.add('kb-desk-nodes-filters');

  let row1 = filters.querySelector(':scope > .kb-desk-nodes-row1');
  let row2 = filters.querySelector(':scope > .kb-desk-nodes-row2');
  if (!row1 || !row2) {
    if (row1) row1.remove();
    if (row2) row2.remove();
    row1 = document.createElement('div');
    row1.className = 'kb-desk-nodes-row kb-desk-nodes-row1';
    row2 = document.createElement('div');
    row2.className = 'kb-desk-nodes-row kb-desk-nodes-row2';
    filters.appendChild(row1);
    filters.appendChild(row2);
  }

  const search = document.getElementById('node-search-input');
  const searchWrap = search && search.closest('.relative');
  if (searchWrap) {
    searchWrap.classList.add('kb-desk-nodes-search-wrap');
    if (searchWrap.parentElement !== row1) {
      row1.insertBefore(searchWrap, row1.firstChild);
    }
  }
  if (search && !search.dataset.kbDeskPh) {
    search.dataset.kbDeskPh = '1';
    search.placeholder = 'Поиск узлов и деталей…';
  }

  // mobile «Создать» в первой строке — прячем, desk CTA в actions
  const mobileCreate = filters.querySelector(
    '[data-knowledge-action="openNodeConstructor"]:not(.kb-desk-nodes-btn)'
  );
  if (mobileCreate) {
    mobileCreate.classList.add('kb-desk-nodes-src-hidden');
  }

  let actions = row1.querySelector('.kb-desk-nodes-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'kb-desk-nodes-actions';
    actions.innerHTML =
      '<button type="button" class="kb-desk-nodes-btn" data-kb-desk-nodes="import" title="Импорт JSON">↑ Импорт</button>' +
      '<button type="button" class="kb-desk-nodes-btn" data-knowledge-action="exportNodeJson" title="Экспорт JSON">↓ Экспорт</button>' +
      '<button type="button" class="kb-desk-nodes-btn" data-knowledge-action="exportNodeJsCode" title="Выгрузка в JS-код">↓ Код</button>' +
      '<button type="button" class="kb-desk-nodes-btn kb-desk-nodes-btn-primary" data-knowledge-action="openNodeConstructor" title="Создать узел">+ Создать</button>';
    row1.appendChild(actions);
    const importBtn = actions.querySelector('[data-kb-desk-nodes="import"]');
    if (importBtn) {
      importBtn.addEventListener('click', function () {
        const input = document.getElementById('node-import-input');
        if (input) input.click();
      });
    }
  }
  if (actions.parentElement !== row1) row1.appendChild(actions);

  let tools = row2.querySelector('.kb-desk-nodes-tools');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'kb-desk-nodes-tools';
    row2.appendChild(tools);
  }

  const ownerLabel =
    filters.querySelector('.kb-desk-nodes-owner') ||
    filters.querySelector('label.flex.items-center');
  if (ownerLabel) {
    ownerLabel.classList.add('kb-desk-nodes-owner');
    if (ownerLabel.parentElement !== tools) {
      tools.insertBefore(ownerLabel, tools.firstChild);
    }
  }

  const offline =
    filters.querySelector(
      'button[onclick*="downloadMissingCloudFiles"]'
    ) ||
    tools.querySelector('button[onclick*="downloadMissingCloudFiles"]');
  if (offline) {
    if (offline.parentElement !== tools) tools.appendChild(offline);
  }

  // view-mode toggle — скрыт на desk (rail вместо cards/list)
  const modeToggle = document.getElementById('nodes-view-mode-toggle');
  if (modeToggle) modeToggle.classList.add('kb-desk-nodes-src-hidden');
}

function unwrapNodesToolbar(filters) {
  if (!filters) return;
  const rows = filters.querySelectorAll(':scope > .kb-desk-nodes-row');
  if (!rows.length) return;

  filters.querySelectorAll('.kb-desk-nodes-actions').forEach(function (el) {
    el.remove();
  });
  filters.querySelectorAll('.kb-desk-nodes-src-hidden').forEach(function (el) {
    el.classList.remove('kb-desk-nodes-src-hidden');
  });

  const searchWrap = filters.querySelector('.kb-desk-nodes-search-wrap');
  const owner = filters.querySelector('.kb-desk-nodes-owner');
  const offline = filters.querySelector(
    'button[onclick*="downloadMissingCloudFiles"]'
  );

  // вернуть в исходный порядок: поиск+создать сверху, owner-блок собирает renderNodesList
  const firstFlex = filters.querySelector(':scope > .flex.justify-between');
  if (searchWrap && firstFlex) {
    const rel = firstFlex.querySelector('.relative') || firstFlex;
    if (searchWrap.parentElement !== firstFlex && searchWrap.parentElement !== rel) {
      firstFlex.insertBefore(searchWrap, firstFlex.firstChild);
    }
  }
  if (owner && firstFlex) {
    /* owner живёт в injected block от renderNodesList — оставим в tools до remount */
  }
  if (offline && firstFlex) {
    const right = firstFlex.querySelector('.flex.items-center.gap-2');
    if (right && offline.parentElement !== right) right.appendChild(offline);
  }

  rows.forEach(function (r) {
    r.remove();
  });
}

function ensureCategoryBlock(parent, cat) {
  const foldKey = 'cat:' + cat;
  const open =
    _railFold[foldKey] === true
      ? true
      : _railFold[foldKey] === false
        ? false
        : false; // по умолчанию свёрнуто

  const block = document.createElement('div');
  block.className = 'kb-desk-nodes-rail-work' + (open ? ' is-open' : '');
  block.setAttribute('data-cat', cat);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'kb-desk-nodes-rail-work-toggle';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.innerHTML =
    '<span class="kb-desk-nodes-rail-work-name">' +
    escapeHtml(cat) +
    '</span>' +
    '<span class="kb-desk-nodes-rail-work-chev" aria-hidden="true"></span>';

  const body = document.createElement('div');
  body.className = 'kb-desk-nodes-rail-work-body';

  toggle.addEventListener('click', function () {
    const next = !block.classList.contains('is-open');
    block.classList.toggle('is-open', next);
    _railFold[foldKey] = next;
    toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
  });

  block.appendChild(toggle);
  block.appendChild(body);
  parent.appendChild(block);
  return { block: block, body: body };
}

function paintViewerHead(viewer, node) {
  const sys = isSystemNode(node);
  const head = document.createElement('div');
  head.className = 'kb-desk-nodes-viewer-head';
  head.innerHTML =
    '<div class="kb-desk-nodes-viewer-head-main">' +
    '<div class="kb-desk-nodes-viewer-kicker">' +
    escapeHtml(categoryOf(node)) +
    (sys ? ' · Система' : node.owner ? ' · ' + escapeHtml(node.owner) : '') +
    '</div>' +
    '<h2 class="kb-desk-nodes-viewer-title">' +
    escapeHtml(node.title || node.name || 'Без названия') +
    (sys
      ? ' <span class="kb-desk-nodes-sys-badge">СИС</span>'
      : '') +
    '</h2></div>' +
    '<div class="kb-desk-nodes-viewer-actions"></div>';

  const actions = head.querySelector('.kb-desk-nodes-viewer-actions');

  const files = nodeFiles(node);
  const pdf = files.find(function (f) {
    return f.type === 'pdf' || (f.url && String(f.url).includes('application/pdf'));
  });
  if (pdf) {
    const browserBtn = document.createElement('button');
    browserBtn.type = 'button';
    browserBtn.className = 'kb-desk-nodes-viewer-btn kb-desk-nodes-viewer-btn-primary';
    browserBtn.textContent = 'В браузере';
    browserBtn.addEventListener('click', async function () {
      const src = await resolvePdfSrc(pdf.url);
      if (!src) {
        if (typeof window.showToast === 'function') {
          window.showToast('⚠️ PDF недоступен');
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
  fullBtn.className = 'kb-desk-nodes-viewer-btn';
  fullBtn.textContent = 'На весь экран';
  fullBtn.addEventListener('click', function () {
    if (typeof window.openNodeViewer === 'function') window.openNodeViewer(node.id);
  });
  actions.appendChild(fullBtn);

  if (!sys) {
    const isOwner =
      !node.owner || node.owner === getCurrentEngineer();
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'kb-desk-nodes-viewer-btn is-muted';
    menuBtn.textContent = 'Управление';
    menuBtn.addEventListener('click', function () {
      if (typeof window.openUniversalActionSheet === 'function') {
        window.openUniversalActionSheet(
          node.id,
          'node',
          String(node.title || node.name || '').replace(/'/g, "\\'"),
          isOwner
        );
      }
    });
    actions.appendChild(menuBtn);
  }

  viewer.appendChild(head);
}

async function paintNodePreview(viewer, node) {
  if (!viewer || !node) return;
  viewer.innerHTML = '';
  viewer.classList.add('kb-desk-nodes-viewer--active');
  paintViewerHead(viewer, node);

  const body = document.createElement('div');
  body.className = 'kb-desk-nodes-viewer-body';
  viewer.appendChild(body);

  const files = nodeFiles(node);
  const media = document.createElement('div');
  media.className = 'kb-desk-nodes-media';

  if (!files.length) {
    media.innerHTML =
      '<div class="kb-desk-nodes-viewer-empty">Нет вложенных файлов</div>';
  } else {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isPdf =
        file.type === 'pdf' ||
        (file.url && String(file.url).includes('application/pdf'));
      if (isPdf) {
        const frame = document.createElement('div');
        frame.className = 'kb-desk-nodes-pdf-frame';
        frame.innerHTML =
          '<div class="kb-desk-nodes-pdf-loading">Загрузка PDF…</div>';
        media.appendChild(frame);
        const src = await resolvePdfSrc(file.url);
        if (_sel.nodeId !== node.id) return;
        revokePreviewBlob();
        if (src && String(src).indexOf('blob:') === 0) _sel.blobUrl = src;
        frame.innerHTML = '';
        if (src) {
          const iframe = document.createElement('iframe');
          iframe.className = 'kb-desk-nodes-pdf-iframe';
          iframe.title = file.name || node.title || 'PDF';
          iframe.src = src;
          frame.appendChild(iframe);
        } else {
          frame.innerHTML =
            '<button type="button" class="kb-desk-nodes-pdf-fallback">PDF · открыть</button>';
          frame.querySelector('button').addEventListener('click', function () {
            if (typeof window.openNodeAttachmentPdf === 'function') {
              window.openNodeAttachmentPdf(
                file.url,
                file.name || 'Документ',
                file.size || ''
              );
            }
          });
        }
      } else {
        const url = await resolvePhotoUrl(file.url);
        if (_sel.nodeId !== node.id) return;
        const fig = document.createElement('button');
        fig.type = 'button';
        fig.className = 'kb-desk-nodes-photo';
        fig.innerHTML = url
          ? '<img src="' + escapeHtml(url) + '" alt="">'
          : '<span class="kb-desk-nodes-photo-empty">Нет фото</span>';
        fig.addEventListener('click', function () {
          if (typeof window.openPhotoViewer === 'function') {
            window.openPhotoViewer(file.url);
          }
        });
        media.appendChild(fig);
      }
    }
  }
  body.appendChild(media);

  const desc = document.createElement('section');
  desc.className = 'kb-desk-nodes-block';
  desc.innerHTML =
    '<h3>Описание</h3><p>' +
    escapeHtml(node.desc || node.description || 'Описание отсутствует') +
    '</p>';
  body.appendChild(desc);

  if (Array.isArray(node.materials) && node.materials.length) {
    const mat = document.createElement('section');
    mat.className = 'kb-desk-nodes-block';
    mat.innerHTML =
      '<h3>Спецификация материалов</h3>' +
      '<table class="kb-desk-nodes-mat"><tbody>' +
      node.materials
        .map(function (m) {
          return (
            '<tr><td>' +
            escapeHtml(m.name || '') +
            '</td><td>' +
            escapeHtml(m.qty || '') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table>';
    body.appendChild(mat);
  }

  const links = [];
  if (node.linkedDoc) {
    links.push({
      kind: 'doc',
      id: node.linkedDoc,
      label: 'Норматив (НД)'
    });
  }
  if (node.linkedTwiId) {
    links.push({
      kind: 'twi',
      id: node.linkedTwiId,
      label: 'TWI карта'
    });
  }
  const checklistKey = node.linkedChecklistKey || node.linkedTwiChecklistKey;
  if (checklistKey && !String(checklistKey).includes('|')) {
    links.push({
      kind: 'checklist',
      id: checklistKey,
      label: 'Чек-лист'
    });
  }
  if (links.length) {
    const box = document.createElement('div');
    box.className = 'kb-desk-nodes-links';
    box.innerHTML =
      '<div class="kb-desk-nodes-links-title">Связанные материалы</div>';
    links.forEach(function (L) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kb-desk-nodes-link';
      btn.textContent = L.label;
      btn.addEventListener('click', function () {
        if (L.kind === 'doc') {
          if (
            String(L.id).startsWith('sys_') ||
            String(L.id).startsWith('usr_')
          ) {
            if (typeof window.openDocViewer === 'function') window.openDocViewer(L.id);
          } else if (typeof window.findAndOpenND === 'function') {
            window.findAndOpenND(L.id);
          }
        } else if (L.kind === 'twi' && typeof window.openTwiViewer === 'function') {
          window.openTwiViewer(L.id);
        } else if (L.kind === 'checklist') {
          if (typeof window.openKnowledgeLinkedChecklist === 'function') {
            window.openKnowledgeLinkedChecklist(L.id);
          }
        }
      });
      box.appendChild(btn);
    });
    body.appendChild(box);
  }
}

function selectNode(nodeId, rail) {
  _sel.nodeId = nodeId;
  if (rail) {
    rail.querySelectorAll('.kb-desk-nodes-rail-row.is-active').forEach(function (el) {
      el.classList.remove('is-active');
    });
    const row = rail.querySelector(
      '.kb-desk-nodes-rail-row[data-node-id="' +
        String(nodeId).replace(/"/g, '\\"') +
        '"]'
    );
    if (row) row.classList.add('is-active');
  }
  const viewer = document.querySelector('#ref-sub-nodes .kb-desk-nodes-viewer');
  const node = findNode(nodeId);
  if (viewer && node) paintNodePreview(viewer, node);
}

function paintRail(rail, viewer) {
  const list = getFilteredNodes();
  rail.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'kb-desk-nodes-rail-head';
  head.innerHTML =
    '<div class="kb-desk-nodes-rail-head-title">Библиотека узлов</div>' +
    '<div class="kb-desk-nodes-rail-head-sub">' +
    list.length +
    ' узлов</div>';
  rail.appendChild(head);

  if (!list.length) {
    viewer.innerHTML =
      '<div class="kb-desk-nodes-viewer-empty">Узлы не найдены</div>';
    return null;
  }

  const byCat = {};
  list.forEach(function (node) {
    const cat = categoryOf(node);
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(node);
  });
  Object.keys(byCat).forEach(function (cat) {
    byCat[cat].sort(compareByTitle);
  });

  const cats = Object.keys(byCat).sort(function (a, b) {
    return a.localeCompare(b, 'ru', { sensitivity: 'base' });
  });

  let preferredRow = null;
  const preferred =
    _sel.nodeId ||
    (cats[0] && byCat[cats[0]][0] && byCat[cats[0]][0].id) ||
    null;

  cats.forEach(function (cat) {
    const { body } = ensureCategoryBlock(rail, cat);
    const count = document.createElement('span');
    count.className = 'kb-desk-nodes-rail-work-count';
    count.textContent = String(byCat[cat].length);
    const toggle = body.parentElement.querySelector('.kb-desk-nodes-rail-work-toggle');
    if (toggle) toggle.appendChild(count);

    byCat[cat].forEach(function (node) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'kb-desk-nodes-rail-row';
      row.setAttribute('data-node-id', node.id);
      const sys = isSystemNode(node);
      row.innerHTML =
        '<span class="kb-desk-nodes-rail-row-title">' +
        escapeHtml(node.title || node.name || 'Узел') +
        '</span>' +
        (sys
          ? '<span class="kb-desk-nodes-rail-row-badge">СИС</span>'
          : '');
      row.addEventListener('click', function () {
        selectNode(node.id, rail);
        // раскрыть категорию выбранного
        const foldKey = 'cat:' + cat;
        _railFold[foldKey] = true;
        const block = body.parentElement;
        if (block) {
          block.classList.add('is-open');
          const t = block.querySelector('.kb-desk-nodes-rail-work-toggle');
          if (t) t.setAttribute('aria-expanded', 'true');
        }
      });
      body.appendChild(row);
      if (preferred && String(node.id) === String(preferred)) {
        preferredRow = row;
        // выбранная категория открыта
        _railFold['cat:' + cat] = true;
        body.parentElement.classList.add('is-open');
        const t = body.parentElement.querySelector(
          '.kb-desk-nodes-rail-work-toggle'
        );
        if (t) t.setAttribute('aria-expanded', 'true');
      }
    });
  });

  return preferredRow || rail.querySelector('.kb-desk-nodes-rail-row');
}

/** После renderNodesList: обновить rail/preview (карточки mobile скрыты). */
export function remountNodesList() {
  const section = document.getElementById('ref-sub-nodes');
  const mainView = document.getElementById('nodes-main-view');
  if (!section || section.classList.contains('hidden')) return;
  if (!section.classList.contains('kb-desk-nodes') || !mainView) return;

  const ctor = document.getElementById('node-constructor-view');
  if (ctor && !ctor.classList.contains('hidden')) return;

  const cards = document.getElementById('nodes-list-container');
  if (cards) {
    cards.setAttribute('hidden', '');
    cards.classList.add('kb-desk-nodes-list-source');
  }

  layoutNodesToolbar();

  const split = ensureSplit(mainView);
  const rail = split.querySelector('.kb-desk-nodes-rail');
  const viewer = split.querySelector('.kb-desk-nodes-viewer');
  const row = paintRail(rail, viewer);
  if (row) {
    const id = row.getAttribute('data-node-id');
    if (id) selectNode(id, rail);
  }
}

export function paintNodesChrome() {
  const section = document.getElementById('ref-sub-nodes');
  const mainView = document.getElementById('nodes-main-view');
  if (!section || section.classList.contains('hidden') || !mainView) return;
  if (_painting) {
    remountNodesList();
    return;
  }
  _painting = true;
  try {
    section.classList.add('kb-desk-nodes');
    ensureChrome(mainView);
    ensureSplit(mainView);
    if (typeof window.renderNodesList === 'function') {
      window.renderNodesList();
    }
    layoutNodesToolbar();
    remountNodesList();
  } finally {
    _painting = false;
  }
}

export function clearNodesDesktopArtifacts() {
  revokePreviewBlob();
  _sel = { nodeId: null, blobUrl: null };

  const filters = document.getElementById('node-filters-block');
  if (filters) {
    unwrapNodesToolbar(filters);
    filters.classList.remove('kb-desk-nodes-filters');
    filters
      .querySelectorAll(
        '.kb-desk-nodes-search-wrap, .kb-desk-nodes-owner, .kb-desk-nodes-src-hidden'
      )
      .forEach(function (el) {
        el.classList.remove(
          'kb-desk-nodes-search-wrap',
          'kb-desk-nodes-owner',
          'kb-desk-nodes-src-hidden'
        );
      });
    const search = document.getElementById('node-search-input');
    if (search) delete search.dataset.kbDeskPh;
  }

  const mainView = document.getElementById('nodes-main-view');
  if (mainView) {
    const chrome = mainView.querySelector(':scope > .kb-desk-nodes-chrome');
    const filtersEl = document.getElementById('node-filters-block');
    const manageToggle = mainView.querySelector(
      '[data-knowledge-action="toggleNodeManagePanel"]'
    );
    const manage = document.getElementById('node-manage-body');
    if (chrome && filtersEl) {
      if (filtersEl.parentElement === chrome) {
        mainView.insertBefore(filtersEl, chrome);
      }
      if (manageToggle && manageToggle.parentElement === chrome) {
        filtersEl.appendChild(manageToggle);
      }
      if (manage && manage.parentElement === chrome) {
        filtersEl.appendChild(manage);
      }
      chrome.remove();
    }
    mainView
      .querySelectorAll(':scope > .kb-desk-nodes-split')
      .forEach(function (el) {
        el.remove();
      });
  }

  const cards = document.getElementById('nodes-list-container');
  if (cards) {
    cards.removeAttribute('hidden');
    cards.classList.remove('kb-desk-nodes-list-source');
  }

  const section = document.getElementById('ref-sub-nodes');
  if (section) section.classList.remove('kb-desk-nodes');
}
