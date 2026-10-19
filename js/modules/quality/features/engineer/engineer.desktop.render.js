/**
 * engineer.desktop.render.js
 * Desktop Инженер (≥1280): shell как Analytics + desk-форматы подвкладок.
 * Mobile modules не переписывает (strangler DOM/CSS после paint).
 */

import { buildMeetingProtocolHtml } from '../meetings/meetings.protocol.js';


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

let _engineerDeskI18nBound = false;

const DESKTOP_MIN = 1280;
const WIDE_CLASS = 'rbi-engineer-desktop-wide';
const CSS_HREF = './css/engineer.desktop.css';
const TAB_ID = 'tab-engineer';
const SUBTABS_ID = 'engineer-subtabs-block';

let _resizeBound = false;
let _hooksBound = false;
let _shellApplied = false;
let _origSwitch = null;
let _origRender = null;
let _origRenderEngineerView = null;
let _origRenderTasks = null;
let _origRenderMeetings = null;
let _origRenderFmeaHistory = null;
let _origRenderFmeaRegistry = null;
let _origGameDash = null;
let _afterPaintTimer = null;
/** @type {{ project: string|null, meetingId: string|null }} */
let _meetingsDeskSel = { project: null, meetingId: null };
let _origOpenSavedMeeting = null;
let _origCloseMeetingEditor = null;
/** When true, openSavedMeeting shows fullscreen editor (not desk preview). */
let _meetingsFullscreenEdit = false;
/** @type {{ project: string|null, fmeaId: string|null, editing: boolean }} */
let _fmeaDeskSel = { project: null, fmeaId: null, editing: false };
let _fmeaEditReopenGuard = false;
let _origViewFmea = null;
let _origLoadFmeaToWorkspace = null;
let _origCreateEmptyFmea = null;
let _origGenerateFmeaTable = null;

function isDesktopViewport() {
  return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN;
}

function isQualityMode() {
  try {
    if (window.AppModeManager && window.AppModeManager.currentMode) {
      return window.AppModeManager.currentMode === 'quality';
    }
  } catch (_) { /* ignore */ }
  return /#\/quality\//i.test(String(location.hash || ''));
}

function isEngineerActive() {
  if (!isQualityMode()) return false;
  const hash = String(location.hash || '');
  if (hash && hash !== '#') {
    return /#\/quality\/engineer(\/|$|\?)/i.test(hash) || /^#\/quality\/engineer$/i.test(hash);
  }
  const tab = document.getElementById(TAB_ID);
  return !!(tab && tab.classList.contains('active'));
}

function visibleSubId() {
  const visible = document.querySelector('#tab-engineer .eng-sub-section:not(.hidden)');
  return visible && visible.id ? visible.id : null;
}

function currentSubId() {
  const fromDom = visibleSubId();
  if (fromDom) return fromDom;
  if (window.EngineerState && typeof window.EngineerState.getCurrentSubTab === 'function') {
    return window.EngineerState.getCurrentSubTab();
  }
  return 'eng-sub-tasks';
}

function rememberSubId(tabId) {
  if (!tabId) return;
  if (window.EngineerState && typeof window.EngineerState.setCurrentSubTab === 'function') {
    window.EngineerState.setCurrentSubTab(tabId);
  }
}

function ensureDesktopCss() {
  if (document.querySelector('link[data-engineer-desktop-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS_HREF;
  link.setAttribute('data-engineer-desktop-css', '1');
  document.head.appendChild(link);
}

function setWideLayout(on) {
  ensureDesktopCss();
  const root = document.getElementById('app-root');
  const body = document.body;
  if (on) {
    if (root) root.classList.add(WIDE_CLASS);
    if (body) body.classList.add(WIDE_CLASS);
  } else {
    if (root) root.classList.remove(WIDE_CLASS);
    if (body) body.classList.remove(WIDE_CLASS);
  }
}

function markSubSections() {
  const map = {
    'eng-sub-tasks': 'eng-desk-tasks',
    'eng-sub-meetings': 'eng-desk-meetings',
    'eng-sub-badges': 'eng-desk-profile',
    'eng-sub-impact': 'eng-desk-impact',
    'eng-sub-fmea': 'eng-desk-fmea'
  };
  Object.keys(map).forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.add(map[id]);
  });
}

/** Sync active: desktop = цвет (.active); mobile = чип как в аналитике (bg-white + shadow). */
function syncSubtabActive(subId) {
  const id = subId || currentSubId();
  const deskChrome = isDesktopViewport() && _shellApplied;
  const btns = document.querySelectorAll('#engineer-subtabs-block .sub-tab-btn');
  btns.forEach(function (btn) {
    const arg = btn.getAttribute('data-action-arg') || '';
    const on = arg === id;
    btn.classList.toggle('active', on);
    btn.classList.remove(
      'bg-white',
      'shadow-sm',
      'text-brand',
      'dark:bg-slate-700',
      'dark:text-indigo-400',
      'text-orange-600',
      'text-purple-600',
      'text-green-600'
    );
    if (on) {
      if (deskChrome) {
        btn.classList.add('text-brand');
      } else {
        btn.classList.add(
          'bg-white',
          'shadow-sm',
          'text-brand',
          'dark:bg-slate-700',
          'dark:text-indigo-400'
        );
      }
      btn.classList.remove('text-[var(--text-muted)]');
    } else {
      btn.classList.add('text-[var(--text-muted)]');
    }
  });
}

function scheduleAfterSubPaint(subId) {
  if (_afterPaintTimer) clearTimeout(_afterPaintTimer);
  _afterPaintTimer = setTimeout(function () {
    _afterPaintTimer = null;
    afterSubPaint(subId || currentSubId());
  }, 100);
}

function ensureSplitShell(host, accent) {
  let split = host.querySelector(':scope > .eng-desk-split');
  if (split) return split;
  split = document.createElement('div');
  split.className = 'eng-desk-split';
  const rail = document.createElement('aside');
  rail.className = 'eng-desk-rail eng-desk-rail-' + (accent || 'indigo');
  const viewer = document.createElement('div');
  viewer.className = 'eng-desk-viewer';
  viewer.innerHTML =
    '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.select_left', 'Выберите элемент слева для просмотра') + '</div>';
  split.appendChild(rail);
  split.appendChild(viewer);
  host.appendChild(split);
  return split;
}

function setViewerContent(viewer, htmlOrNode, title) {
  if (!viewer) return;
  viewer.classList.remove('eng-desk-viewer--task');
  viewer.classList.remove('eng-desk-viewer--meeting');
  viewer.classList.remove('eng-desk-viewer--fmea');
  viewer.classList.remove('eng-desk-viewer--fmea-edit');
  viewer.innerHTML = '';
  if (title) {
    const head = document.createElement('div');
    head.className = 'eng-desk-viewer-head';
    head.textContent = title;
    viewer.appendChild(head);
  }
  const body = document.createElement('div');
  body.className = 'eng-desk-viewer-body';
  if (typeof htmlOrNode === 'string') body.innerHTML = htmlOrNode;
  else if (htmlOrNode) body.appendChild(htmlOrNode);
  else {
    body.innerHTML = '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.blank', 'Пусто') + '</div>';
  }
  viewer.appendChild(body);
}

/** @type {{ section: string|null, groupKey: string|null, taskId: string|null }} */
let _tasksDeskSel = { section: null, groupKey: null, taskId: null };
let _origOpenTaskAction = null;

function findTaskById(taskId) {
  const list = window.rbi_tasksData || [];
  return list.find(function (t) {
    return String(t.id) === String(taskId);
  }) || null;
}

function taskRailLabel(task, card) {
  if (task) {
    return {
      title: task.taskType || task.title || _t('quality.engineer.desk.task', 'Задача'),
      sub: task.workTitle || task.templateTitle || task.contractor || '',
      critical: !!(task.priorityLvl === 4 || (card && card.getAttribute('data-critical') === '1'))
    };
  }
  const titleEl = card && card.querySelector('.text-\\[11px\\].font-black, .font-black');
  const subEl = card && card.querySelector('.text-\\[8px\\], .text-\\[9px\\]');
  return {
    title: (titleEl && titleEl.textContent.trim()) || _t('quality.engineer.desk.task', 'Задача'),
    sub: (subEl && subEl.textContent.trim()) || '',
    critical: !!(card && card.getAttribute('data-critical') === '1')
  };
}

function clearRailActive(rail) {
  if (!rail) return;
  rail.querySelectorAll('.eng-desk-rail-item, .eng-desk-task-row').forEach(function (b) {
    b.classList.remove('is-active');
  });
}

function buildCardsGrid(cards) {
  const wrap = document.createElement('div');
  wrap.className = 'eng-desk-task-cards';
  if (!cards.length) {
    wrap.innerHTML = '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.no_tasks', 'Нет задач') + '</div>';
    return wrap;
  }
  cards.forEach(function (card) {
    const clone = card.cloneNode(true);
    clone.classList.add('eng-desk-task-card');
    wrap.appendChild(clone);
  });
  return wrap;
}

function paintTaskDetailIntoViewer(viewer, taskId) {
  if (!viewer || !taskId || typeof window.rbi_openTaskAction !== 'function') return;
  Promise.resolve(window.rbi_openTaskAction(taskId)).catch(function () { /* ignore */ });
}

function stealTaskModalIntoViewer(viewer, taskId) {
  if (!viewer) return;
  const modal = document.getElementById('task-details-modal');
  const body = document.getElementById('task-details-body');
  const footer = document.getElementById('task-details-footer');
  if (modal) {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }
  const task = findTaskById(taskId);
  const title = (task && (task.contractor || task.taskType || task.title)) || _t('quality.engineer.desk.task', 'Задача');
  const subtitle =
    (task && (task.templateTitle || task.workTitle || task.taskType || '')) || '';

  viewer.classList.add('eng-desk-viewer--task');
  viewer.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'eng-desk-viewer-head eng-desk-task-detail-head';
  head.innerHTML =
    '<div class="eng-desk-task-detail-kicker">' + _t('quality.engineer.desk.task', 'Задача') + '</div>' +
    '<div class="eng-desk-task-detail-title">' +
    escapeHtml(title) +
    '</div>' +
    (subtitle
      ? '<div class="eng-desk-task-detail-sub">' + escapeHtml(subtitle) + '</div>'
      : '');
  viewer.appendChild(head);

  const pane = document.createElement('div');
  pane.className = 'eng-desk-viewer-body eng-desk-task-detail';

  const stack = document.createElement('div');
  stack.className = 'eng-desk-task-detail-stack';

  if (body) {
    const kids = Array.from(body.children);
    kids.forEach(function (node, idx) {
      // Skip mobile title block (duplicated in head)
      if (
        idx === 0 &&
        node.classList &&
        /mb-4/.test(node.className) &&
        node.querySelector('.font-black')
      ) {
        return;
      }
      const section = document.createElement('section');
      section.className = 'eng-desk-td-section';
      let label = _t('quality.engineer.desk.info', 'Сведения');
      const cls = String(node.className || '');
      const text = (node.textContent || '').slice(0, 200).toLowerCase();
      if (/суть/.test(text)) {
        label = _t('quality.engineer.desk.description', 'Описание');
        section.classList.add('eng-desk-td-section--brief');
      } else if (/прогресс/.test(text) && /дедлайн/.test(text)) {
        label = _t('quality.engineer.desk.deadlines', 'Сроки и прогресс');
        section.classList.add('eng-desk-td-section--meta');
      } else if (
        /зона|системн|риск|стабильн|сбор данных|желт|зелен|красн|профилактич/.test(text)
      ) {
        label = _t('quality.engineer.desk.context', 'Контекст');
        section.classList.add('eng-desk-td-section--context');
      } else if (/flex/.test(cls) && /gap-2/.test(cls)) {
        label = _t('quality.engineer.desk.deadlines', 'Сроки и прогресс');
        section.classList.add('eng-desk-td-section--meta');
      }
      const lab = document.createElement('div');
      lab.className = 'eng-desk-td-label';
      lab.textContent = label;
      const card = document.createElement('div');
      card.className = 'eng-desk-td-card';
      card.appendChild(node.cloneNode(true));
      section.appendChild(lab);
      section.appendChild(card);
      stack.appendChild(section);
    });
  }

  if (footer) {
    const primary = document.createElement('section');
    primary.className = 'eng-desk-td-section eng-desk-td-section--actions';
    primary.innerHTML = '<div class="eng-desk-td-label">' + _t('quality.engineer.desk.actions', 'Действия') + '</div>';
    const primaryCard = document.createElement('div');
    primaryCard.className = 'eng-desk-td-card eng-desk-task-detail-actions';

    const utils = document.createElement('section');
    utils.className = 'eng-desk-td-section eng-desk-td-section--utils';
    utils.innerHTML = '<div class="eng-desk-td-label">' + _t('quality.engineer.desk.manage', 'Управление') + '</div>';
    const utilsCard = document.createElement('div');
    utilsCard.className = 'eng-desk-td-card eng-desk-task-detail-utils-wrap';

    let hasPrimary = false;
    let hasUtils = false;
    Array.from(footer.children).forEach(function (child) {
      const clone = child.cloneNode(true);
      if (clone.classList && clone.classList.contains('grid')) {
        clone.classList.add('eng-desk-task-utils');
        utilsCard.appendChild(clone);
        hasUtils = true;
      } else {
        if (clone.tagName === 'BUTTON') clone.classList.add('eng-desk-task-cta');
        else if (clone.tagName === 'DIV') clone.classList.add('eng-desk-task-cta-wrap');
        primaryCard.appendChild(clone);
        hasPrimary = true;
      }
    });

    if (hasPrimary) {
      primary.appendChild(primaryCard);
      stack.appendChild(primary);
    }
    if (hasUtils) {
      utils.appendChild(utilsCard);
      stack.appendChild(utils);
    }
  }

  pane.appendChild(stack);
  viewer.appendChild(pane);
}

function ensureTasksDeskChrome(container) {
  let chrome = container.querySelector(':scope > .eng-desk-tasks-chrome');
  if (!chrome) {
    chrome = document.createElement('div');
    chrome.className = 'eng-desk-tasks-chrome';
    container.insertBefore(chrome, container.firstChild);
  }
  chrome.innerHTML = '';

  const actions = Array.from(container.children).find(function (el) {
    return el !== chrome && el.classList && el.classList.contains('grid') && el.classList.contains('grid-cols-2');
  });
  const filters = Array.from(container.children).find(function (el) {
    return el.tagName === 'DETAILS' && el.classList.contains('group/filters');
  });

  if (actions) {
    actions.classList.add('eng-desk-tasks-actions');
    chrome.appendChild(actions);
  }

  const tools = document.createElement('div');
  tools.className = 'eng-desk-tasks-tools';

  if (filters) {
    filters.setAttribute('hidden', '');
    filters.classList.add('eng-desk-tasks-filters-src');
    const hub = filters.querySelector('#hub-filters');
    const selects = filters.querySelector('.grid.grid-cols-2');
    const crit = filters.querySelector('#rbi-critical-only-btn');
    if (crit) crit.id = 'rbi-critical-only-btn-src';

    // Selects first (one row), chips below
    if (selects) {
      const selBlock = document.createElement('div');
      selBlock.className = 'eng-desk-tasks-toolblock eng-desk-tasks-toolblock--selects';
      const selClone = selects.cloneNode(true);
      selClone.classList.add('eng-desk-tasks-selects');
      selBlock.appendChild(selClone);
      tools.appendChild(selBlock);
    }
    if (hub) {
      const chipBlock = document.createElement('div');
      chipBlock.className = 'eng-desk-tasks-toolblock eng-desk-tasks-toolblock--chips';
      const hubClone = hub.cloneNode(true);
      hubClone.id = 'hub-filters';
      hubClone.classList.add('eng-desk-tasks-chips');
      chipBlock.appendChild(hubClone);
      tools.appendChild(chipBlock);
      hub.id = 'hub-filters-mobile-src';
    }
  }

  chrome.appendChild(tools);
  return chrome;
}

function contractorTitleFromGroup(g) {
  if (!g) return _t('quality.engineer.desk.group', 'Группа');
  // Mobile summary puts "Крит."/"Регламент" badge first with .font-black — skip it
  const titleEl = g.querySelector('summary .min-w-0 > div.font-black');
  let title = titleEl && titleEl.textContent.trim();
  if (title && !/^крит\.?$/i.test(title) && !/^регламент$/i.test(title)) return title;

  const card = g.querySelector('.task-card-item');
  const task = card && findTaskById(card.getAttribute('data-task-id'));
  if (task && task.contractor) {
    if (task.contractor === 'Системная') return _t('quality.engineer.desk.weekly', 'Еженедельные');
    if (task.contractor === 'Поручение') return _t('quality.engineer.desk.assignments', 'Поручения');
    return task.contractor;
  }
  return _t('quality.engineer.desk.group', 'Группа');
}

function paintTasksChrome() {
  const container = document.getElementById('rbi-tasks-container');
  if (!container) return;

  const liveSection = container.querySelector(
    ':scope > details[data-task-section]:not([hidden])'
  );
  const existingSplit = container.querySelector(':scope > .eng-desk-split');
  // Already transformed for this DOM — skip
  if (existingSplit && !liveSection) return;

  // Remove old kanban if present
  const oldKanban = container.querySelector('.eng-desk-kanban');
  if (oldKanban) {
    while (oldKanban.firstChild) container.appendChild(oldKanban.firstChild);
    oldKanban.remove();
  }

  container.querySelectorAll(':scope > .eng-desk-split, :scope > .eng-desk-tasks-chrome').forEach(function (el) {
    el.remove();
  });

  // If a prior pass left hidden mobile sections without chrome/actions, unhide filters/actions sources aren't recoverable — only sections
  ensureTasksDeskChrome(container);

  const sections = Array.from(container.querySelectorAll(':scope > details[data-task-section]'));
  if (!sections.length) {
    return;
  }

  const split = ensureSplitShell(container, 'indigo');
  const rail = split.querySelector('.eng-desk-rail');
  const viewer = split.querySelector('.eng-desk-viewer');
  rail.innerHTML = '';
  rail.classList.add('eng-desk-tasks-rail');

  const restore = {
    section: _tasksDeskSel.section,
    groupKey: _tasksDeskSel.groupKey,
    taskId: _tasksDeskSel.taskId
  };
  let restorePeriodBtn = null;
  let restoreGroupBtn = null;
  let restoreTaskRow = null;

  sections.forEach(function (sec) {
    const key = sec.getAttribute('data-task-section') || '';
    const titleEl = sec.querySelector('summary span');
    const secTitle =
      (titleEl && titleEl.childNodes[0] && titleEl.childNodes[0].textContent.trim()) || key;
    const countEl = sec.querySelector('summary .tabular-nums');
    const secCount = countEl ? countEl.textContent.trim() : '';
    const body = sec.querySelector(':scope > div');
    const groups = body ? Array.from(body.querySelectorAll(':scope details[data-task-group]')) : [];
    const flatCards = body
      ? Array.from(body.querySelectorAll(':scope > .grid .task-card-item, :scope > .space-y-2 .task-card-item'))
      : [];
    // Archive: cards directly in grid without contractor groups
    const archiveCards =
      !groups.length && body
        ? Array.from(body.querySelectorAll('.task-card-item'))
        : [];

    const folder = document.createElement('div');
    folder.className = 'eng-desk-tree-folder';
    folder.setAttribute('data-section', key);

    const folderBtn = document.createElement('button');
    folderBtn.type = 'button';
    folderBtn.className = 'eng-desk-rail-item eng-desk-tree-parent';
    folderBtn.innerHTML =
      '<span class="eng-desk-rail-name">' +
      escapeHtml(secTitle) +
      '</span><span class="eng-desk-rail-count">' +
      escapeHtml(secCount) +
      '</span>';

    const kids = document.createElement('div');
    kids.className = 'eng-desk-tree-kids';

    const allSectionCards = [];

    const showSectionCards = function () {
      const collapsing =
        folder.classList.contains('is-open') && folderBtn.classList.contains('is-active');
      if (collapsing) {
        folder.classList.remove('is-open');
        folderBtn.classList.remove('is-active');
        folder.querySelectorAll('.eng-desk-task-group.is-open').forEach(function (gw) {
          gw.classList.remove('is-open');
        });
        clearRailActive(rail);
        _tasksDeskSel = { section: null, groupKey: null, taskId: null };
        setViewerContent(
          viewer,
          null,
          null
        );
        viewer.innerHTML =
          '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.pick_period', 'Выберите период или подрядчика слева') + '</div>';
        return;
      }
      rail.querySelectorAll('.eng-desk-tree-folder.is-open').forEach(function (f) {
        if (f !== folder) f.classList.remove('is-open');
      });
      clearRailActive(rail);
      folderBtn.classList.add('is-active');
      folder.classList.add('is-open');
      _tasksDeskSel = { section: key, groupKey: null, taskId: null };
      const cards = allSectionCards.length
        ? allSectionCards
        : archiveCards.length
          ? archiveCards
          : flatCards;
      setViewerContent(viewer, buildCardsGrid(cards), secTitle);
    };

    folderBtn.addEventListener('click', showSectionCards);
    folder.appendChild(folderBtn);

    if (groups.length) {
      groups.forEach(function (g) {
        const gKey = g.getAttribute('data-task-group') || '';
        const gTitle = contractorTitleFromGroup(g);
        const gCountEl = g.querySelector('[data-group-count]');
        const gCount = gCountEl ? gCountEl.textContent.trim() : '';
        const gCards = Array.from(g.querySelectorAll('.task-card-item'));
        gCards.forEach(function (c) {
          allSectionCards.push(c);
        });

        const groupWrap = document.createElement('div');
        groupWrap.className = 'eng-desk-task-group';
        groupWrap.setAttribute('data-group', gKey);

        const childBtn = document.createElement('button');
        childBtn.type = 'button';
        childBtn.className = 'eng-desk-rail-item eng-desk-tree-child';
        childBtn.innerHTML =
          '<span class="eng-desk-rail-name">' +
          escapeHtml(gTitle) +
          '</span><span class="eng-desk-rail-count">' +
          escapeHtml(gCount || String(gCards.length)) +
          '</span>';

        const taskList = document.createElement('div');
        taskList.className = 'eng-desk-task-list';

        const showGroupCards = function (e) {
          if (e) e.stopPropagation();
          const collapsing =
            groupWrap.classList.contains('is-open') && childBtn.classList.contains('is-active');
          if (collapsing) {
            groupWrap.classList.remove('is-open');
            childBtn.classList.remove('is-active');
            clearRailActive(rail);
            folderBtn.classList.add('is-active');
            folder.classList.add('is-open');
            _tasksDeskSel = { section: key, groupKey: null, taskId: null };
            setViewerContent(viewer, buildCardsGrid(allSectionCards), secTitle);
            return;
          }
          folder.querySelectorAll('.eng-desk-task-group.is-open').forEach(function (gw) {
            if (gw !== groupWrap) gw.classList.remove('is-open');
          });
          clearRailActive(rail);
          childBtn.classList.add('is-active');
          folder.classList.add('is-open');
          groupWrap.classList.add('is-open');
          _tasksDeskSel = { section: key, groupKey: gKey, taskId: null };
          setViewerContent(viewer, buildCardsGrid(gCards), secTitle + ' · ' + gTitle);
        };

        childBtn.addEventListener('click', showGroupCards);

        gCards.forEach(function (card) {
          const taskId = card.getAttribute('data-task-id');
          const task = findTaskById(taskId);
          const meta = taskRailLabel(task, card);
          const row = document.createElement('button');
          row.type = 'button';
          row.className =
            'eng-desk-task-row' + (meta.critical ? ' is-critical' : '');
          row.setAttribute('data-task-id', taskId || '');
          row.innerHTML =
            '<span class="eng-desk-task-row-dot" aria-hidden="true"></span>' +
            '<span class="eng-desk-task-row-text">' +
            '<span class="eng-desk-task-row-title">' +
            escapeHtml(meta.title) +
            '</span>' +
            (meta.sub
              ? '<span class="eng-desk-task-row-sub">' + escapeHtml(meta.sub) + '</span>'
              : '') +
            '</span>';
          row.addEventListener('click', function (e) {
            e.stopPropagation();
            clearRailActive(rail);
            row.classList.add('is-active');
            folder.classList.add('is-open');
            groupWrap.classList.add('is-open');
            _tasksDeskSel = { section: key, groupKey: gKey, taskId: taskId };
            paintTaskDetailIntoViewer(viewer, taskId);
          });
          taskList.appendChild(row);
          if (restore.taskId && String(restore.taskId) === String(taskId)) {
            restoreTaskRow = row;
            restoreGroupBtn = childBtn;
            restorePeriodBtn = folderBtn;
          }
        });

        groupWrap.appendChild(childBtn);
        groupWrap.appendChild(taskList);
        kids.appendChild(groupWrap);

        if (restore.groupKey && restore.groupKey === gKey && !restore.taskId) {
          restoreGroupBtn = childBtn;
          restorePeriodBtn = folderBtn;
        }
      });
      folder.appendChild(kids);
    } else if (archiveCards.length) {
      archiveCards.forEach(function (c) {
        allSectionCards.push(c);
      });
      archiveCards.forEach(function (card) {
        const taskId = card.getAttribute('data-task-id');
        const task = findTaskById(taskId);
        const meta = taskRailLabel(task, card);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'eng-desk-task-row' + (meta.critical ? ' is-critical' : '');
        row.setAttribute('data-task-id', taskId || '');
        row.innerHTML =
          '<span class="eng-desk-task-row-dot" aria-hidden="true"></span>' +
          '<span class="eng-desk-task-row-text">' +
          '<span class="eng-desk-task-row-title">' +
          escapeHtml(meta.title) +
          '</span>' +
          (meta.sub
            ? '<span class="eng-desk-task-row-sub">' + escapeHtml(meta.sub) + '</span>'
            : '') +
          '</span>';
        row.addEventListener('click', function (e) {
          e.stopPropagation();
          clearRailActive(rail);
          row.classList.add('is-active');
          folder.classList.add('is-open');
          _tasksDeskSel = { section: key, groupKey: null, taskId: taskId };
          paintTaskDetailIntoViewer(viewer, taskId);
        });
        kids.appendChild(row);
        if (restore.taskId && String(restore.taskId) === String(taskId)) {
          restoreTaskRow = row;
          restorePeriodBtn = folderBtn;
        }
      });
      folder.appendChild(kids);
    }

    rail.appendChild(folder);
    sec.setAttribute('hidden', '');

    if (restore.section === key && !restore.groupKey && !restore.taskId) {
      restorePeriodBtn = folderBtn;
    }
  });

  // Restore selection or open first non-empty period
  if (restoreTaskRow) {
    const folder = restoreTaskRow.closest('.eng-desk-tree-folder');
    if (folder) folder.classList.add('is-open');
    const gw = restoreTaskRow.closest('.eng-desk-task-group');
    if (gw) gw.classList.add('is-open');
    restoreTaskRow.click();
  } else if (restoreGroupBtn) {
    const folder = restoreGroupBtn.closest('.eng-desk-tree-folder');
    if (folder) folder.classList.add('is-open');
    restoreGroupBtn.click();
  } else if (restorePeriodBtn && restore.section) {
    restorePeriodBtn.click();
  } else {
    const folders = Array.from(rail.querySelectorAll('.eng-desk-tree-folder'));
    let pick = folders[0];
    for (let i = 0; i < folders.length; i++) {
      const sec = sections[i];
      if (sec && sec.querySelector('.task-card-item, details[data-task-group]')) {
        pick = folders[i];
        break;
      }
    }
    if (pick) {
      pick.classList.add('is-open');
      const btn = pick.querySelector('.eng-desk-tree-parent');
      if (btn) btn.click();
    }
  }
}

function buildRatingRowsHtml() {
  let sorted = [];
  const myName =
    (document.getElementById('inp-inspector') && document.getElementById('inp-inspector').value.trim()) ||
    _t('quality.engineer.desk.unknown_inspector', 'Неизвестный инспектор');

  if (window.serverGlobalRating && Array.isArray(window.serverGlobalRating)) {
    sorted = window.serverGlobalRating.slice().sort(function (a, b) {
      return b.pi - a.pi;
    });
  } else if (window.allProfilesData) {
    sorted = Object.values(window.allProfilesData).sort(function (a, b) {
      return b.pi - a.pi;
    });
  }
  if (!sorted.length) {
    return '<div class="eng-desk-rating-empty">' + _t('quality.engineer.desk.empty.no_rating', 'Нет данных рейтинга') + '</div>';
  }

  const comps = window.COMPETENCIES || [];
  const getTier = window.getBadgeTier;
  const getSvg = window.getBadgeSvg;

  const rows = sorted
    .map(function (p, idx) {
      const isMe = p.name === myName;
      const lvl = (p.levelObj && p.levelObj.name) || '';
      let badgesHtml = '';
      if (p.badgesData && comps.length && typeof getTier === 'function' && typeof getSvg === 'function') {
        const active = [];
        comps.forEach(function (b) {
          const progress = p.badgesData[b.id] || 0;
          const tier = getTier(b, progress);
          if (tier > 0) active.push({ id: b.id, tier: tier });
        });
        active.sort(function (a, b) {
          return b.tier - a.tier;
        });
        badgesHtml = active
          .slice(0, 3)
          .map(function (b) {
            return (
              '<div class="eng-desk-rating-badge" title="' + _t('quality.engineer.desk.tier', 'Тир') + ' ' +
              b.tier +
              '">' +
              getSvg(b.id, b.tier, 'w-5 h-5') +
              '</div>'
            );
          })
          .join('');
      }
      return (
        '<div class="eng-desk-rating-row' +
        (isMe ? ' is-me' : '') +
        '">' +
        '<span class="eng-desk-rating-rank">' +
        (idx + 1) +
        '</span>' +
        '<div class="eng-desk-rating-meta">' +
        '<div class="eng-desk-rating-name">' +
        escapeHtml(p.name) +
        (isMe ? _t('quality.engineer.desk.you', ' (Вы)') : '') +
        '</div>' +
        '<div class="eng-desk-rating-sub">' +
        '<span class="eng-desk-rating-lvl">' +
        escapeHtml(lvl) +
        '</span>' +
        (badgesHtml ? '<div class="eng-desk-rating-badges">' + badgesHtml + '</div>' : '') +
        '</div>' +
        '</div>' +
        '<div class="eng-desk-rating-xp">' +
        (p.pi || 0) +
        '<span>XP</span></div>' +
        '</div>'
      );
    })
    .join('');

  const source = window.serverGlobalRating ? _t('quality.engineer.desk.rating_global', 'Глобальный рейтинг') : _t('quality.engineer.desk.rating_local', 'Локальный рейтинг');
  return (
    '<div class="eng-desk-rating-head">' +
    source +
    '</div><div class="eng-desk-rating-list">' +
    rows +
    '</div>'
  );
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paintProfileChrome() {
  const dash = document.getElementById('game-dashboard-container');
  if (!dash) return;
  dash.classList.add('eng-desk-game-dash');

  const hero = dash.querySelector(':scope > .grid.grid-cols-2');
  if (hero) hero.classList.add('eng-desk-prof-hero');

  // Ensure rating panel exists (replace modal button)
  let ratingPanel = dash.querySelector('.eng-desk-rating-panel');
  const topBtn = dash.querySelector('button[onclick*="gameOpenTopModal"]');
  if (topBtn && !ratingPanel) {
    ratingPanel = document.createElement('div');
    ratingPanel.className = 'eng-desk-rating-panel';
    topBtn.replaceWith(ratingPanel);
  }
  ratingPanel = dash.querySelector('.eng-desk-rating-panel');
  if (ratingPanel) {
    ratingPanel.innerHTML =
      '<div class="eng-desk-rating-title">' + _t('quality.engineer.desk.rating_title', 'Рейтинг инженеров') + '</div>' + buildRatingRowsHtml();
  }

  // Restructure once per render into primary (radar+rating) / secondary (impact+activity)
  if (!dash.querySelector('.eng-desk-prof-primary')) {
    const detailsList = Array.from(dash.querySelectorAll(':scope > details'));
    const skills = detailsList.find(function (d) {
      return /навык|влиян/i.test((d.querySelector('summary') && d.querySelector('summary').textContent) || '');
    });
    const activity = detailsList.find(function (d) {
      return /активн|рейтинг/i.test((d.querySelector('summary') && d.querySelector('summary').textContent) || '');
    });
    const badges = document.getElementById('badges-section');

    const skillsBody = skills && skills.querySelector(':scope > div');
    const actBody = activity && activity.querySelector(':scope > div');
    const radarTile = skillsBody && skillsBody.children[0];
    const impactTile = skillsBody && skillsBody.children[1];
    const xpTile = actBody && actBody.children[0];
    // rating may already be panel as second child
    const ratingNode = ratingPanel || (actBody && actBody.querySelector('.eng-desk-rating-panel'));

    if (radarTile && ratingNode) {
      const primary = document.createElement('section');
      primary.className = 'eng-desk-prof-primary';
      const radarWrap = document.createElement('div');
      radarWrap.className = 'eng-desk-prof-tile eng-desk-prof-radar-tile';
      const radarLabel = document.createElement('div');
      radarLabel.className = 'eng-desk-prof-tile-label';
      radarLabel.textContent = _t('quality.engineer.desk.competencies', 'Компетенции');
      radarWrap.appendChild(radarLabel);
      radarWrap.appendChild(radarTile);
      radarTile.classList.add('eng-desk-prof-radar-inner');
      const host = radarTile.querySelector('div[style]');
      if (host) host.classList.add('eng-desk-radar-host');

      ratingNode.classList.add('eng-desk-prof-tile', 'eng-desk-prof-rating-tile');
      primary.appendChild(radarWrap);
      primary.appendChild(ratingNode);

      const secondary = document.createElement('section');
      secondary.className = 'eng-desk-prof-secondary';
      if (impactTile) {
        impactTile.classList.add('eng-desk-prof-tile', 'eng-desk-prof-impact-tile');
        secondary.appendChild(impactTile);
      }
      if (xpTile) {
        const xpWrap = document.createElement('div');
        xpWrap.className = 'eng-desk-prof-tile eng-desk-prof-activity-tile';
        xpWrap.appendChild(xpTile);
        secondary.appendChild(xpWrap);
      }

      if (skills) skills.remove();
      if (activity) activity.remove();

      const insertBefore = badges || null;
      if (insertBefore) {
        dash.insertBefore(primary, insertBefore);
        dash.insertBefore(secondary, insertBefore);
      } else {
        dash.appendChild(primary);
        dash.appendChild(secondary);
      }
    }
  } else if (ratingPanel) {
    ratingPanel.innerHTML =
      '<div class="eng-desk-rating-title">' + _t('quality.engineer.desk.rating_title', 'Рейтинг инженеров') + '</div>' + buildRatingRowsHtml();
  }

  const badges = document.getElementById('badges-section');
  if (badges) {
    badges.open = true;
    badges.classList.add('eng-desk-prof-badges');
    const grid = badges.querySelector(':scope > div');
    if (grid) {
      grid.classList.add('eng-desk-prof-badges-grid');
      Array.from(grid.children).forEach(function (cell) {
        cell.classList.add('eng-desk-prof-badge-cell');
      });
    }
  }

  setTimeout(function () {
    try {
      if (typeof window.renderRadarChart === 'function') window.renderRadarChart();
      if (typeof window.renderStatsCharts === 'function') window.renderStatsCharts();
    } catch (_) { /* ignore */ }
  }, 80);
}

function findMeetingById(id) {
  const list = window.rbi_meetingsData || [];
  return (
    list.find(function (m) {
      return String(m.id) === String(id);
    }) || null
  );
}

function meetingIdFromCard(card) {
  if (!card) return '';
  const oc = card.getAttribute('onclick') || '';
  const m = oc.match(/rbi_openSavedMeeting\(['"]([^'"]+)['"]\)/);
  if (m) return m[1];
  const btn = card.querySelector('[onclick*="rbi_openSavedMeeting"]');
  if (btn) {
    const o2 = btn.getAttribute('onclick') || '';
    const m2 = o2.match(/rbi_openSavedMeeting\(['"]([^'"]+)['"]\)/);
    if (m2) return m2[1];
  }
  return '';
}

/** Calendar date without UTC day-shift (YYYY-MM-DD → local DD.MM.YYYY). */
function formatMeetingDate(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[3] + '.' + m[2] + '.' + m[1];
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return dd + '.' + mm + '.' + d.getFullYear();
}

/** Period chosen in meeting setup when building agenda (WEEK/MONTH/ALL) — never agenda deadlines. */
function meetingPeriodLabel(meet) {
  if (!meet) return '';
  const text = String(meet.periodText || meet.periodLabel || '').trim();
  if (text) return text;
  const code = String(meet.period || meet.setupPeriod || '').toUpperCase();
  if (code === 'MONTH' || code === '30') return _t('quality.engineer.period.30d', '30 дней');
  if (code === 'ALL') return _t('quality.engineer.period.all', 'Всё время');
  if (code === 'WEEK' || code === '7') return _t('quality.engineer.period.7d', '7 дней');
  return '';
}

function meetingRailMeta(meet, card) {
  if (meet) {
    const agenda = Array.isArray(meet.agenda) ? meet.agenda : [];
    const done = agenda.filter(function (a) {
      return a && a.isDone;
    }).length;
    const date = formatMeetingDate(meet.date);
    const period = meetingPeriodLabel(meet);
    const lines = [];
    if (date) lines.push(_t('quality.engineer.meta.held', 'Проведено: {date}', { date: date }));
    if (period) lines.push(_t('quality.engineer.meta.review_for', 'Разбор за: {period}', { period: period }));
    if (agenda.length) lines.push(_t('quality.engineer.meta.questions_short', '{done}/{total} вопр.', { done: done, total: agenda.length }));
    return {
      title: meet.title || _t('quality.engineer.desk.protocol', 'Протокол'),
      lines: lines,
      date: date
    };
  }
  const titleEl = card && card.querySelector('.font-black, .font-bold');
  const subEl = card && card.querySelector('.text-\\[9px\\]');
  return {
    title: (titleEl && titleEl.textContent.trim()) || _t('quality.engineer.desk.protocol', 'Протокол'),
    lines: subEl && subEl.textContent.trim() ? [subEl.textContent.trim()] : [],
    date: ''
  };
}

function markMeetingRailActive(meetingId) {
  const rail = document.querySelector('#rbi-meeting-container .eng-desk-rail');
  if (!rail || !meetingId) return;
  clearRailActive(rail);
  const rows = rail.querySelectorAll('.eng-desk-meet-row');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].getAttribute('data-meeting-id')) === String(meetingId)) {
      rows[i].classList.add('is-active');
      const folder = rows[i].closest('.eng-desk-tree-folder');
      if (folder) {
        folder.classList.add('is-open');
        _meetingsDeskSel.project =
          folder.getAttribute('data-project') || _meetingsDeskSel.project;
      }
      break;
    }
  }
}

function buildMeetingCardsGrid(cards) {
  const wrap = document.createElement('div');
  const isList =
    typeof window.getKnowledgeViewMode === 'function' &&
    window.getKnowledgeViewMode('meetings') === 'list';
  wrap.className = 'eng-desk-meet-cards' + (isList ? ' is-list' : '');
  if (!cards.length) {
    wrap.innerHTML = '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.no_protocols', 'Нет протоколов') + '</div>';
    return wrap;
  }
  cards.forEach(function (card) {
    const clone = card.cloneNode(true);
    clone.classList.add('eng-desk-meet-card');
    wrap.appendChild(clone);
  });
  return wrap;
}

function paintMeetingDetailIntoViewer(viewer, meetingId) {
  paintMeetingPreviewIntoViewer(viewer, meetingId);
}

function openMeetingFullscreenEditor(meetingId) {
  if (!meetingId || typeof _origOpenSavedMeeting !== 'function') {
    if (typeof window.rbi_openSavedMeeting === 'function') {
      _meetingsFullscreenEdit = true;
      Promise.resolve(window.rbi_openSavedMeeting(meetingId)).finally(function () {
        _meetingsFullscreenEdit = false;
      });
    }
    return;
  }
  _meetingsFullscreenEdit = true;
  Promise.resolve(_origOpenSavedMeeting.call(window, meetingId)).finally(function () {
    _meetingsFullscreenEdit = false;
  });
}

function paintMeetingPreviewIntoViewer(viewer, meetingId) {
  if (!viewer || !meetingId) return;
  const meet = findMeetingById(meetingId);
  if (!meet) {
    setViewerContent(
      viewer,
      '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.protocol_missing', 'Протокол не найден') + '</div>',
      _t('quality.engineer.desk.protocol', 'Протокол')
    );
    return;
  }

  _meetingsDeskSel.meetingId = meetingId;
  markMeetingRailActive(meetingId);

  const title = meet.title || _t('quality.engineer.desk.protocol', 'Протокол');
  const project = String(
    meet.projectName || meet.project || meet.project_display_name || ''
  ).trim();
  const dateLabel = formatMeetingDate(meet.date);
  const safeId = String(meetingId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  viewer.classList.add('eng-desk-viewer--meeting');
  viewer.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'eng-desk-viewer-head eng-desk-meet-detail-head';
  head.innerHTML =
    '<div class="eng-desk-meet-detail-top">' +
    '<button type="button" class="eng-desk-meet-back" data-eng-meet-back="1">' +
    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path></svg>' +
    _t('quality.engineer.desk.back_list', 'К списку') + '</button>' +
    '<div class="eng-desk-meet-detail-actions">' +
    '<button type="button" class="eng-desk-meet-act eng-desk-meet-act--edit" data-eng-meet-edit="1">' + _t('quality.engineer.desk.edit', 'Редактировать') + '</button>' +
    '<button type="button" onclick="typeof rbi_printMeetingPdf===\'function\'&&rbi_printMeetingPdf(\'' +
    safeId +
    '\',\'script\')" class="eng-desk-meet-act eng-desk-meet-act--indigo">PDF</button>' +
    '<button type="button" onclick="typeof rbi_printMeetingPdf===\'function\'&&rbi_printMeetingPdf(\'' +
    safeId +
    '\',\'browser\')" class="eng-desk-meet-act">' + _t('quality.engineer.desk.print', 'Печать') + '</button>' +
    '<button type="button" onclick="(typeof rbi_exportMeetingDocx===\'function\'&&rbi_exportMeetingDocx(\'' +
    safeId +
    '\'))||(typeof exportMeetingDocx===\'function\'&&exportMeetingDocx(\'' +
    safeId +
    '\'))" class="eng-desk-meet-act eng-desk-meet-act--sky">Word</button>' +
    '</div></div>' +
    '<div class="eng-desk-meet-detail-kicker">' + _t('quality.engineer.desk.protocol_preview', 'Предпросмотр протокола') + '</div>' +
    '<div class="eng-desk-meet-detail-title">' +
    escapeHtml(title) +
    '</div>' +
    (project || dateLabel
      ? '<div class="eng-desk-meet-detail-sub">' +
        escapeHtml([project, dateLabel].filter(Boolean).join(' · ')) +
        '</div>'
      : '');
  viewer.appendChild(head);

  head.querySelector('[data-eng-meet-back]').addEventListener('click', function () {
    backFromMeetingDetail(viewer);
  });
  head.querySelector('[data-eng-meet-edit]').addEventListener('click', function () {
    openMeetingFullscreenEditor(meetingId);
  });

  const pane = document.createElement('div');
  pane.className = 'eng-desk-viewer-body eng-desk-meet-detail eng-desk-meet-preview';
  const paper = document.createElement('div');
  paper.className = 'eng-desk-meet-preview-paper';
  paper.innerHTML = '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.building_doc', 'Формируем документ…') + '</div>';
  pane.appendChild(paper);
  viewer.appendChild(pane);

  Promise.resolve(buildMeetingProtocolHtml(meet))
    .then(function (html) {
      if (_meetingsDeskSel.meetingId !== meetingId) return;
      paper.innerHTML = html || '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.protocol', 'Пустой протокол') + '</div>';
      if (typeof window.rbiHydrateLocalImages === 'function') {
        window.rbiHydrateLocalImages(paper);
      }
    })
    .catch(function () {
      paper.innerHTML =
        '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.preview_fail', 'Не удалось сформировать предпросмотр') + '</div>';
    });
}

function backFromMeetingDetail(viewer) {
  const project = _meetingsDeskSel.project;
  _meetingsDeskSel.meetingId = null;
  const rail = document.querySelector('#rbi-meeting-container .eng-desk-rail');
  if (rail && project) {
    const folders = rail.querySelectorAll('.eng-desk-tree-folder');
    for (let i = 0; i < folders.length; i++) {
      if (folders[i].getAttribute('data-project') === project) {
        const btn = folders[i].querySelector('.eng-desk-tree-parent');
        if (btn) {
          folders[i].classList.remove('is-open');
          btn.classList.remove('is-active');
          btn.click();
          return;
        }
      }
    }
  }
  if (viewer) {
    viewer.classList.remove('eng-desk-viewer--meeting');
    viewer.innerHTML =
      '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.pick_meeting', 'Выберите объект или протокол слева') + '</div>';
  }
}

function paintMeetingsChrome() {
  const container = document.getElementById('rbi-meeting-container');
  if (!container) return;
  container.classList.add('eng-desk-meet-host');

  // «Совещание в процессе» (Meeting Workspace: повестка + подвал Сохранить/PDF/ИИ) —
  // самостоятельный full-width экран, не список сохранённых протоколов. Split-шасси
  // (rail+viewer) сюда не накладывается — иначе под подвалом остаётся лишний
  // пустой rail/viewer (баг: пустые поля под кнопкой «Сохранить» на десктопе).
  if (container.querySelector('#meeting-footer-btn')) {
    container.querySelectorAll(':scope > .eng-desk-split').forEach(function (el) {
      el.remove();
    });
    return;
  }

  const liveGroup = Array.from(container.children).find(function (el) {
    return (
      el.classList &&
      !el.classList.contains('eng-desk-split') &&
      !el.hasAttribute('hidden') &&
      el.querySelector &&
      el.querySelector('.chevron-icon')
    );
  });
  const existingSplit = container.querySelector(':scope > .eng-desk-split');
  if (existingSplit && !liveGroup) return;

  container.querySelectorAll(':scope > .eng-desk-split').forEach(function (el) {
    el.remove();
  });

  const mobileGroups = Array.from(container.children).filter(function (el) {
    return el.querySelector && el.querySelector('.chevron-icon');
  });

  mobileGroups.forEach(function (el) {
    el.setAttribute('hidden', '');
    el.classList.add('eng-desk-group-source');
  });

  const split = ensureSplitShell(container, 'orange');
  const rail = split.querySelector('.eng-desk-rail');
  const viewer = split.querySelector('.eng-desk-viewer');
  rail.innerHTML = '';
  rail.classList.add('eng-desk-meet-rail');

  if (!mobileGroups.length) {
    setViewerContent(
      viewer,
      '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.no_active_protocols', 'Активных протоколов нет') + '</div>',
      _t('quality.engineer.desk.meetings', 'Совещания')
    );
    return;
  }

  const restore = {
    project: _meetingsDeskSel.project,
    meetingId: _meetingsDeskSel.meetingId
  };
  let restoreProjectBtn = null;
  let restoreMeetingRow = null;

  mobileGroups.forEach(function (groupEl) {
    const titleEl = groupEl.querySelector('.font-black');
    const pName = (titleEl && titleEl.textContent.trim()) || _t('quality.engineer.desk.project', 'Объект');
    const cards = Array.from(
      groupEl.querySelectorAll('[onclick*="rbi_openSavedMeeting"]')
    ).filter(function (el) {
      // Card root itself has onclick; skip nested action-sheet buttons
      return el.getAttribute('onclick') && /rbi_openSavedMeeting/.test(el.getAttribute('onclick'));
    });

    const folder = document.createElement('div');
    folder.className = 'eng-desk-tree-folder';
    folder.setAttribute('data-project', pName);

    const folderBtn = document.createElement('button');
    folderBtn.type = 'button';
    folderBtn.className = 'eng-desk-rail-item eng-desk-tree-parent';
    folderBtn.innerHTML =
      '<span class="eng-desk-rail-name">' +
      escapeHtml(pName) +
      '</span><span class="eng-desk-rail-count">' +
      cards.length +
      '</span>';

    const kids = document.createElement('div');
    kids.className = 'eng-desk-tree-kids';

    const showProjectCards = function () {
      const collapsing =
        folder.classList.contains('is-open') && folderBtn.classList.contains('is-active');
      if (collapsing) {
        folder.classList.remove('is-open');
        folderBtn.classList.remove('is-active');
        clearRailActive(rail);
        _meetingsDeskSel = { project: null, meetingId: null };
        viewer.classList.remove('eng-desk-viewer--meeting');
        viewer.innerHTML =
          '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.pick_meeting', 'Выберите объект или протокол слева') + '</div>';
        return;
      }
      rail.querySelectorAll('.eng-desk-tree-folder.is-open').forEach(function (f) {
        if (f !== folder) f.classList.remove('is-open');
      });
      clearRailActive(rail);
      folderBtn.classList.add('is-active');
      folder.classList.add('is-open');
      _meetingsDeskSel = { project: pName, meetingId: null };
      viewer.classList.remove('eng-desk-viewer--meeting');
      setViewerContent(viewer, buildMeetingCardsGrid(cards), pName);
    };

    folderBtn.addEventListener('click', showProjectCards);
    folder.appendChild(folderBtn);

    cards.forEach(function (card) {
      const meetingId = meetingIdFromCard(card);
      const meet = findMeetingById(meetingId);
      const meta = meetingRailMeta(meet, card);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'eng-desk-task-row eng-desk-meet-row';
      row.setAttribute('data-meeting-id', meetingId || '');
      row.innerHTML =
        '<span class="eng-desk-task-row-dot" aria-hidden="true"></span>' +
        '<span class="eng-desk-task-row-text">' +
        '<span class="eng-desk-task-row-title">' +
        escapeHtml(meta.title) +
        '</span>' +
        (meta.lines && meta.lines.length
          ? '<span class="eng-desk-task-row-sub">' +
            meta.lines
              .map(function (line) {
                return '<span class="eng-desk-meet-row-line">' + escapeHtml(line) + '</span>';
              })
              .join('') +
            '</span>'
          : '') +
        '</span>';
      row.addEventListener('click', function (e) {
        e.stopPropagation();
        clearRailActive(rail);
        row.classList.add('is-active');
        folder.classList.add('is-open');
        _meetingsDeskSel = { project: pName, meetingId: meetingId };
        paintMeetingPreviewIntoViewer(viewer, meetingId);
      });
      kids.appendChild(row);
      if (restore.meetingId && String(restore.meetingId) === String(meetingId)) {
        restoreMeetingRow = row;
        restoreProjectBtn = folderBtn;
      }
    });

    folder.appendChild(kids);
    rail.appendChild(folder);

    if (restore.project === pName && !restore.meetingId) {
      restoreProjectBtn = folderBtn;
    }
  });

  if (restoreMeetingRow) {
    const folder = restoreMeetingRow.closest('.eng-desk-tree-folder');
    if (folder) folder.classList.add('is-open');
    restoreMeetingRow.click();
  } else if (restoreProjectBtn && restore.project) {
    restoreProjectBtn.click();
  } else {
    const first = rail.querySelector('.eng-desk-tree-parent');
    if (first) first.click();
  }
}

function fmeaGroupLabels(f) {
  if (Array.isArray(f.projectNames) && f.projectNames.length) {
    return [...new Set(f.projectNames.map(function (n) { return String(n).trim(); }).filter(Boolean))];
  }
  const raw = String(f.project_display_name || f.projectName || f.project_canonical_key || f.project || '').trim();
  if (!raw) return [_t('quality.engineer.desk.no_project', 'Без объекта')];
  if (raw === 'Все объекты') return [raw];
  if (raw.includes(',')) {
    const parts = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length > 1) return [...new Set(parts)];
  }
  return [raw];
}

function getFmeaRecords() {
  if (typeof window.rbi_fmeaRecords !== 'undefined' && window.rbi_fmeaRecords) {
    return window.rbi_fmeaRecords;
  }
  if (
    window.RBI &&
    window.RBI.services &&
    window.RBI.services.tasks &&
    typeof window.RBI.services.tasks.getFmeaSync === 'function'
  ) {
    return window.RBI.services.tasks.getFmeaSync() || [];
  }
  return [];
}

function findFmeaById(id) {
  return (
    (getFmeaRecords() || []).find(function (f) {
      return String(f.id) === String(id);
    }) || null
  );
}

function fmeaIdFromCard(card) {
  if (!card) return '';
  const oc = card.getAttribute('onclick') || '';
  const m = oc.match(/rbi_viewFmea\(['"]([^'"]+)['"]\)/);
  if (m) return m[1];
  return '';
}

function fmeaRailMeta(f, card) {
  if (f) {
    const defectN = (f.defects || []).length;
    const date = formatMeetingDate(f.date);
    const period = String(f.periodName || f.periodText || '').trim();
    const lines = [];
    if (date) lines.push(_t('quality.engineer.meta.held', 'Проведено: {date}', { date: date }));
    if (period) lines.push(_t('quality.engineer.meta.review_for', 'Разбор за: {period}', { period: period }));
    if (defectN) lines.push(_t('quality.engineer.meta.defects_short', '{n} деф.', { n: defectN }));
    return { title: f.title || 'FMEA', lines: lines };
  }
  const titleEl = card && card.querySelector('.font-bold, .font-black');
  const subEl = card && card.querySelector('.text-\\[9px\\]');
  return {
    title: (titleEl && titleEl.textContent.trim()) || 'FMEA',
    lines: subEl && subEl.textContent.trim() ? [subEl.textContent.trim()] : []
  };
}

function buildFmeaCardsGrid(cards) {
  const wrap = document.createElement('div');
  const isList =
    typeof window.getKnowledgeViewMode === 'function' &&
    window.getKnowledgeViewMode('fmea') === 'list';
  wrap.className = 'eng-desk-fmea-cards' + (isList ? ' is-list' : '');
  if (!cards.length) {
    wrap.innerHTML = '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.no_records', 'Нет записей') + '</div>';
    return wrap;
  }
  cards.forEach(function (card) {
    const clone = card.cloneNode(true);
    clone.classList.add('eng-desk-fmea-card');
    wrap.appendChild(clone);
  });
  return wrap;
}

function markFmeaRailActive(fmeaId) {
  const rail = document.querySelector('#fmea-registry-list .eng-desk-rail');
  if (!rail || !fmeaId) return;
  clearRailActive(rail);
  const rows = rail.querySelectorAll('.eng-desk-fmea-row');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].getAttribute('data-fmea-id')) === String(fmeaId)) {
      rows[i].classList.add('is-active');
      const folder = rows[i].closest('.eng-desk-tree-folder');
      if (folder) {
        folder.classList.add('is-open');
        _fmeaDeskSel.project =
          folder.getAttribute('data-project') || _fmeaDeskSel.project;
      }
      break;
    }
  }
}

async function buildFmeaPreviewHtml(record) {
  if (!record) return '';
  const defects = Array.isArray(record.defects) ? record.defects.slice() : [];
  defects.sort(function (a, b) {
    return (parseInt(b.rpn, 10) || 0) - (parseInt(a.rpn, 10) || 0);
  });

  const rows = [];
  for (let i = 0; i < defects.length; i++) {
    const d = defects[i];
    let rpnColor = 'text-green-600 bg-green-50 border-green-200';
    if ((d.rpn || 0) >= 300) rpnColor = 'text-orange-600 bg-orange-50 border-orange-200';
    if ((d.rpn || 0) >= 600) rpnColor = 'text-danger bg-danger-soft border-danger-soft';

    let photoHtml =
      '<div class="text-rbi-caption text-muted italic border border-dashed border-slate-300 p-2 rounded text-center">' + _t('quality.engineer.desk.empty.no_photo', 'Нет фото') + '</div>';
    if (d.photo) {
      let realSrc = '';
      try {
        if (typeof PhotoManager !== 'undefined' && PhotoManager.getAsyncUrl) {
          realSrc = await PhotoManager.getAsyncUrl(d.photo);
        }
      } catch (_) { /* ignore */ }
      if (!realSrc && typeof window.getPhotoSrc === 'function') {
        realSrc = window.getPhotoSrc(d.photo);
      }
      if (realSrc) {
        photoHtml =
          '<img src="' +
          realSrc +
          '" class="w-14 h-14 object-cover rounded-lg border border-slate-300 cursor-pointer" onclick="openPhotoViewer(\'' +
          String(d.photo).replace(/'/g, "\\'") +
          '\')">';
      }
    }

    rows.push(
      '<div class="eng-desk-fmea-defect-card">' +
        '<div class="eng-desk-fmea-defect-top">' +
        '<div class="eng-desk-fmea-defect-photo">' +
        photoHtml +
        '</div>' +
        '<div class="eng-desk-fmea-defect-main">' +
        '<div class="eng-desk-fmea-defect-work">' +
        escapeHtml(d.workTitle || '') +
        '</div>' +
        '<div class="eng-desk-fmea-defect-contr">' +
        escapeHtml(d.contractor || '') +
        '</div>' +
        '<div class="eng-desk-fmea-defect-name">' +
        escapeHtml(d.defectName || '') +
        ' (' + _t('quality.engineer.fmea.repeats', 'повторов') + ': ' +
        escapeHtml(String(d.count || 0)) +
        ')</div>' +
        '</div>' +
        '<div class="eng-desk-fmea-defect-rpn ' +
        rpnColor +
        '"><div class="eng-desk-fmea-defect-rpn-lab">RPN</div><div class="eng-desk-fmea-defect-rpn-val">' +
        escapeHtml(String(d.rpn || 0)) +
        '</div></div></div>' +
        '<div class="eng-desk-fmea-defect-grid">' +
        '<div><span>' + _t('quality.engineer.fmea.cause', 'Причина') + ' (' +
        escapeHtml(d.stage || '-') +
        '):</span>' +
        escapeHtml(d.cause || '-') +
        '</div>' +
        '<div><span>' + _t('quality.engineer.fmea.effects', 'Последствия:') + '</span>' +
        escapeHtml(d.effect || '-') +
        '</div>' +
        '<div class="is-fix"><span>' + _t('quality.engineer.fmea.fix', 'Устранение:') + '</span>' +
        escapeHtml(d.fix || '-') +
        '</div>' +
        '<div class="is-prevent"><span>' + _t('quality.engineer.fmea.prevent', 'Предотвращение:') + '</span>' +
        escapeHtml(d.prevent || '-') +
        '</div>' +
        '</div></div>'
    );
  }

  const projectLabel =
    String(
      record.project_display_name || record.projectName || record.project || ''
    ).trim() || _t('quality.engineer.desk.no_project', 'Без объекта');
  const dateLabel = formatMeetingDate(record.date);
  const period = String(record.periodName || record.periodText || '—').trim();

  return (
    '<div class="eng-desk-fmea-preview-meta">' +
    '<div><span>' + _t('quality.engineer.fmea.engineer', 'Инженер') + '</span><b>' +
    escapeHtml(record.author || '—') +
    '</b></div>' +
    '<div><span>' + _t('quality.engineer.fmea.held', 'Проведено') + '</span><b>' +
    escapeHtml(dateLabel || '—') +
    '</b></div>' +
    '<div><span>' + _t('quality.engineer.fmea.review_for', 'Разбор за') + '</span><b>' +
    escapeHtml(period) +
    '</b></div>' +
    '<div><span>' + _t('quality.engineer.desk.project', 'Объект') + '</span><b>' +
    escapeHtml(projectLabel) +
    '</b></div>' +
    '</div>' +
    (rows.length
      ? rows.join('')
      : '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.no_defects', 'Дефекты не заполнены') + '</div>')
  );
}

function paintFmeaPreviewIntoViewer(viewer, fmeaId) {
  if (!viewer || !fmeaId) return;
  const record = findFmeaById(fmeaId);
  if (!record) {
    setViewerContent(
      viewer,
      '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.record_missing', 'Запись не найдена') + '</div>',
      'FMEA'
    );
    return;
  }

  _fmeaDeskSel.fmeaId = fmeaId;
  _fmeaDeskSel.editing = false;
  markFmeaRailActive(fmeaId);

  const title = record.title || 'FMEA';
  const project = String(
    record.project_display_name || record.projectName || record.project || ''
  ).trim();
  const dateLabel = formatMeetingDate(record.date);
  const period = String(record.periodName || record.periodText || '').trim();
  const safeId = String(fmeaId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  viewer.classList.add('eng-desk-viewer--fmea');
  viewer.classList.remove('eng-desk-viewer--fmea-edit');
  viewer.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'eng-desk-viewer-head eng-desk-fmea-detail-head';
  head.innerHTML =
    '<div class="eng-desk-fmea-detail-top">' +
    '<button type="button" class="eng-desk-fmea-back" data-eng-fmea-back="1">' +
    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path></svg>' +
    _t('quality.engineer.desk.back_list', 'К списку') + '</button>' +
    '<div class="eng-desk-fmea-detail-actions">' +
    '<button type="button" class="eng-desk-fmea-act eng-desk-fmea-act--edit" data-eng-fmea-edit="1">' + _t('quality.engineer.desk.edit', 'Редактировать') + '</button>' +
    '<button type="button" onclick="typeof rbi_exportFmeaExcel===\'function\'&&rbi_exportFmeaExcel(\'' +
    safeId +
    '\')" class="eng-desk-fmea-act eng-desk-fmea-act--green">Excel</button>' +
    '<button type="button" onclick="typeof rbi_printFmeaPdf===\'function\'&&rbi_printFmeaPdf(\'' +
    safeId +
    '\',\'script\')" class="eng-desk-fmea-act eng-desk-fmea-act--indigo">PDF</button>' +
    '<button type="button" onclick="typeof rbi_printFmeaPdf===\'function\'&&rbi_printFmeaPdf(\'' +
    safeId +
    '\',\'browser\')" class="eng-desk-fmea-act">' + _t('quality.engineer.desk.print', 'Печать') + '</button>' +
    '</div></div>' +
    '<div class="eng-desk-fmea-detail-kicker">' + _t('quality.engineer.desk.fmea_preview', 'Предпросмотр FMEA') + '</div>' +
    '<div class="eng-desk-fmea-detail-title">' +
    escapeHtml(title) +
    '</div>' +
    '<div class="eng-desk-fmea-detail-sub">' +
    escapeHtml([project, dateLabel, period ? 'Разбор за ' + period : ''].filter(Boolean).join(' · ')) +
    '</div>';
  viewer.appendChild(head);

  head.querySelector('[data-eng-fmea-back]').addEventListener('click', function () {
    backFromFmeaDetail(viewer);
  });
  head.querySelector('[data-eng-fmea-edit]').addEventListener('click', function () {
    openFmeaDesktopEditor(fmeaId);
  });

  const pane = document.createElement('div');
  pane.className = 'eng-desk-viewer-body eng-desk-fmea-detail eng-desk-fmea-preview';
  const paper = document.createElement('div');
  paper.className = 'eng-desk-fmea-preview-paper';
  paper.innerHTML = '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.building_report', 'Формируем отчёт…') + '</div>';
  pane.appendChild(paper);
  viewer.appendChild(pane);

  Promise.resolve(buildFmeaPreviewHtml(record))
    .then(function (html) {
      if (_fmeaDeskSel.fmeaId !== fmeaId || _fmeaDeskSel.editing) return;
      paper.innerHTML = html || '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.report', 'Пустой отчёт') + '</div>';
      if (typeof window.rbiHydrateLocalImages === 'function') {
        window.rbiHydrateLocalImages(paper);
      }
    })
    .catch(function () {
      paper.innerHTML =
        '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.preview_fail', 'Не удалось сформировать предпросмотр') + '</div>';
    });
}

/** Make sure GameActions._getFmea() can see this record (strict id ===). */
function withFmeaRecordVisible(rec, run) {
  if (!rec || typeof run !== 'function') return run && run();
  const patches = [];
  function patchTasks(tasksObj) {
    if (!tasksObj || typeof tasksObj.getFmeaSync !== 'function') return;
    const origGet = tasksObj.getFmeaSync.bind(tasksObj);
    const live = origGet();
    // Prefer mutating live array so strict find(m => m.id === id) works with rec.id
    if (Array.isArray(live) && !live.find(function (f) { return f.id === rec.id; })) {
      live.push(rec);
      return;
    }
    patches.push(function () {
      tasksObj.getFmeaSync = origGet;
    });
    tasksObj.getFmeaSync = function () {
      const list = origGet() || [];
      if (!list.find(function (f) { return f.id === rec.id; })) {
        return list.concat([rec]);
      }
      return list;
    };
  }
  try {
    patchTasks(window.RBI && window.RBI.services && window.RBI.services.tasks);
    patchTasks(
      window.GameActions && window.GameActions._ctx && window.GameActions._ctx.tasks
    );
    if (typeof window.rbi_fmeaRecords === 'undefined' || !window.rbi_fmeaRecords) {
      window.rbi_fmeaRecords = [rec];
    } else if (
      !window.rbi_fmeaRecords.find(function (f) {
        return f.id === rec.id;
      })
    ) {
      window.rbi_fmeaRecords.push(rec);
    }
  } catch (_) { /* ignore */ }
  try {
    return run(rec.id);
  } finally {
    patches.forEach(function (restore) {
      try {
        restore();
      } catch (_) { /* ignore */ }
    });
  }
}

function openFmeaDesktopEditor(fmeaId) {
  _fmeaDeskSel.editing = true;
  _fmeaDeskSel.fmeaId = fmeaId || _fmeaDeskSel.fmeaId;
  const rec = findFmeaById(fmeaId);
  const fn = _origLoadFmeaToWorkspace || window.rbi_loadFmeaToWorkspace;
  if (typeof fn !== 'function' || !rec) return;

  const root = document.getElementById('rbi-fmea-container');
  if (root) ensureFmeaWorkspaceSlot(root);

  withFmeaRecordVisible(rec, function (id) {
    fn.call(window, id);
  });

  // Load remounts registry DOM — re-apply desk chrome while editing is sticky
  if (_shellApplied) paintFmeaChrome();

  const viewer = document.querySelector('#fmea-registry-list .eng-desk-viewer');
  const ws = document.getElementById('fmea-workspace');
  if (viewer && ws && ws.querySelector('.fmea-row')) {
    stealFmeaWorkspaceIntoViewer(viewer, rec.id);
  }
  setTimeout(function () {
    if (!_fmeaDeskSel.editing) return;
    const v = document.querySelector('#fmea-registry-list .eng-desk-viewer');
    const w = document.getElementById('fmea-workspace');
    if (v && w && w.querySelector('.fmea-row') && !v.classList.contains('eng-desk-viewer--fmea-edit')) {
      stealFmeaWorkspaceIntoViewer(v, _fmeaDeskSel.fmeaId);
    }
  }, 160);
}

function stealFmeaWorkspaceIntoViewer(viewer, fmeaId) {
  if (!viewer) return;
  const root = document.getElementById('rbi-fmea-container');
  let workspace = document.getElementById('fmea-workspace');
  if (!workspace || !workspace.innerHTML.trim()) return;

  _fmeaDeskSel.editing = true;
  if (fmeaId != null && fmeaId !== '') _fmeaDeskSel.fmeaId = fmeaId;
  markFmeaRailActive(_fmeaDeskSel.fmeaId);

  const record = findFmeaById(_fmeaDeskSel.fmeaId);
  const title = (record && record.title) || _t('quality.engineer.desk.fmea_edit_title', 'Редактирование FMEA');

  // Park outside viewer BEFORE clearing — otherwise viewer.innerHTML destroys #fmea-workspace
  if (root && (workspace.parentElement === viewer || viewer.contains(workspace))) {
    root.appendChild(workspace);
  }

  viewer.classList.add('eng-desk-viewer--fmea', 'eng-desk-viewer--fmea-edit');
  viewer.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'eng-desk-viewer-head eng-desk-fmea-detail-head';
  head.innerHTML =
    '<div class="eng-desk-fmea-detail-top">' +
    '<button type="button" class="eng-desk-fmea-back" data-eng-fmea-back="1">' +
    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"></path></svg>' +
    _t('quality.engineer.desk.back_preview', 'К предпросмотру') + '</button>' +
    '</div>' +
    '<div class="eng-desk-fmea-detail-kicker">' + _t('quality.engineer.desk.editing', 'Редактирование') + '</div>' +
    '<div class="eng-desk-fmea-detail-title">' +
    escapeHtml(title) +
    '</div>';
  viewer.appendChild(head);

  workspace = document.getElementById('fmea-workspace');
  head.querySelector('[data-eng-fmea-back]').addEventListener('click', function () {
    const id = _fmeaDeskSel.fmeaId;
    _fmeaDeskSel.editing = false;
    const wsNode = document.getElementById('fmea-workspace');
    if (wsNode) {
      wsNode.innerHTML = '';
      if (root && wsNode.parentElement !== root) root.appendChild(wsNode);
      wsNode.setAttribute('hidden', '');
      wsNode.classList.remove('eng-desk-fmea-workspace-live');
    }
    if (id) paintFmeaPreviewIntoViewer(viewer, id);
    else backFromFmeaDetail(viewer);
  });

  const pane = document.createElement('div');
  pane.className = 'eng-desk-viewer-body eng-desk-fmea-detail eng-desk-fmea-edit-host';
  pane.id = 'eng-desk-fmea-editor-host';

  workspace.removeAttribute('hidden');
  workspace.classList.add('eng-desk-fmea-workspace-live');
  pane.appendChild(workspace);
  viewer.appendChild(pane);

  if (typeof window.rbiHydrateLocalImages === 'function') {
    window.rbiHydrateLocalImages(pane);
  }
}

function ensureFmeaWorkspaceSlot(root) {
  let workspace = document.getElementById('fmea-workspace');
  if (!workspace) {
    workspace = document.createElement('div');
    workspace.id = 'fmea-workspace';
    root.appendChild(workspace);
  }
  // Always park on root before list remount so split.remove() cannot destroy it
  if (workspace.parentElement !== root) root.appendChild(workspace);
  if (!workspace.closest('.eng-desk-fmea-edit-host')) {
    workspace.setAttribute('hidden', '');
    workspace.classList.add('eng-desk-fmea-ws-src');
  }
  return workspace;
}

function backFromFmeaDetail(viewer) {
  const project = _fmeaDeskSel.project;
  _fmeaDeskSel.fmeaId = null;
  _fmeaDeskSel.editing = false;
  const workspace = document.getElementById('fmea-workspace');
  const root = document.getElementById('rbi-fmea-container');
  if (workspace && root) {
    workspace.innerHTML = '';
    workspace.setAttribute('hidden', '');
    workspace.classList.remove('eng-desk-fmea-workspace-live');
    if (workspace.parentElement !== root) root.appendChild(workspace);
  }
  const rail = document.querySelector('#fmea-registry-list .eng-desk-rail');
  if (rail && project) {
    const folders = rail.querySelectorAll('.eng-desk-tree-folder');
    for (let i = 0; i < folders.length; i++) {
      if (folders[i].getAttribute('data-project') === project) {
        const btn = folders[i].querySelector('.eng-desk-tree-parent');
        if (btn) {
          folders[i].classList.remove('is-open');
          btn.classList.remove('is-active');
          btn.click();
          return;
        }
      }
    }
  }
  if (viewer) {
    viewer.classList.remove('eng-desk-viewer--fmea', 'eng-desk-viewer--fmea-edit');
    viewer.innerHTML =
      '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.pick_fmea', 'Выберите объект или запись слева') + '</div>';
  }
}

function paintFmeaChrome() {
  const root = document.getElementById('rbi-fmea-container');
  const list = document.getElementById('fmea-registry-list');
  if (!root || !list) return;
  root.classList.add('eng-desk-fmea-host');
  list.classList.add('eng-desk-fmea-registry');
  // Park workspace BEFORE destroying previous split
  ensureFmeaWorkspaceSlot(root);

  const liveGroup = Array.from(list.children).find(function (el) {
    return (
      el.classList &&
      !el.classList.contains('eng-desk-split') &&
      !el.hasAttribute('hidden') &&
      el.querySelector &&
      el.querySelector('.chevron-icon')
    );
  });
  const existingSplit = list.querySelector(':scope > .eng-desk-split');
  if (existingSplit && !liveGroup) {
    if (_fmeaDeskSel.editing) {
      const viewer = existingSplit.querySelector('.eng-desk-viewer');
      const ws = document.getElementById('fmea-workspace');
      if (viewer && ws && ws.querySelector('.fmea-row')) {
        stealFmeaWorkspaceIntoViewer(viewer, _fmeaDeskSel.fmeaId);
      }
    }
    return;
  }

  list.querySelectorAll(':scope > .eng-desk-split').forEach(function (el) {
    el.remove();
  });
  ensureFmeaWorkspaceSlot(root);

  const mobileGroups = Array.from(list.children).filter(function (el) {
    return el.querySelector && el.querySelector('.chevron-icon');
  });
  mobileGroups.forEach(function (el) {
    el.setAttribute('hidden', '');
    el.classList.add('eng-desk-group-source');
  });

  const split = ensureSplitShell(list, 'purple');
  const rail = split.querySelector('.eng-desk-rail');
  const viewer = split.querySelector('.eng-desk-viewer');
  rail.innerHTML = '';
  rail.classList.add('eng-desk-fmea-rail');

  if (!mobileGroups.length) {
    setViewerContent(
      viewer,
      '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.fmea_archive', 'Архив пуст — сформируйте анализ сверху') + '</div>',
      'FMEA'
    );
    // New draft in workspace?
    const ws = document.getElementById('fmea-workspace');
    if (ws && ws.querySelector('.fmea-row')) {
      _fmeaDeskSel.editing = true;
      stealFmeaWorkspaceIntoViewer(viewer, null);
    }
    return;
  }

  const restore = {
    project: _fmeaDeskSel.project,
    fmeaId: _fmeaDeskSel.fmeaId,
    editing: _fmeaDeskSel.editing
  };
  let restoreProjectBtn = null;
  let restoreFmeaRow = null;

  mobileGroups.forEach(function (groupEl) {
    const titleEl = groupEl.querySelector('.font-black');
    const pName = (titleEl && titleEl.textContent.trim()) || _t('quality.engineer.desk.project', 'Объект');
    const cards = Array.from(
      groupEl.querySelectorAll('[onclick*="rbi_viewFmea"]')
    ).filter(function (el) {
      return el.getAttribute('onclick') && /rbi_viewFmea/.test(el.getAttribute('onclick'));
    });

    const folder = document.createElement('div');
    folder.className = 'eng-desk-tree-folder';
    folder.setAttribute('data-project', pName);

    const folderBtn = document.createElement('button');
    folderBtn.type = 'button';
    folderBtn.className = 'eng-desk-rail-item eng-desk-tree-parent';
    folderBtn.innerHTML =
      '<span class="eng-desk-rail-name">' +
      escapeHtml(pName) +
      '</span><span class="eng-desk-rail-count">' +
      cards.length +
      '</span>';

    const kids = document.createElement('div');
    kids.className = 'eng-desk-tree-kids';

    const showProjectCards = function () {
      const collapsing =
        folder.classList.contains('is-open') && folderBtn.classList.contains('is-active');
      if (collapsing) {
        folder.classList.remove('is-open');
        folderBtn.classList.remove('is-active');
        clearRailActive(rail);
        _fmeaDeskSel = { project: null, fmeaId: null, editing: false };
        viewer.classList.remove('eng-desk-viewer--fmea', 'eng-desk-viewer--fmea-edit');
        viewer.innerHTML =
          '<div class="eng-desk-viewer-empty">' + _t('quality.engineer.desk.empty.pick_fmea', 'Выберите объект или запись слева') + '</div>';
        return;
      }
      rail.querySelectorAll('.eng-desk-tree-folder.is-open').forEach(function (f) {
        if (f !== folder) f.classList.remove('is-open');
      });
      clearRailActive(rail);
      folderBtn.classList.add('is-active');
      folder.classList.add('is-open');
      _fmeaDeskSel = { project: pName, fmeaId: null, editing: false };
      viewer.classList.remove('eng-desk-viewer--fmea', 'eng-desk-viewer--fmea-edit');
      setViewerContent(viewer, buildFmeaCardsGrid(cards), pName);
    };

    folderBtn.addEventListener('click', showProjectCards);
    folder.appendChild(folderBtn);

    cards.forEach(function (card) {
      const fmeaId = fmeaIdFromCard(card);
      const rec = findFmeaById(fmeaId);
      const meta = fmeaRailMeta(rec, card);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'eng-desk-task-row eng-desk-fmea-row';
      row.setAttribute('data-fmea-id', fmeaId || '');
      row.innerHTML =
        '<span class="eng-desk-task-row-dot" aria-hidden="true"></span>' +
        '<span class="eng-desk-task-row-text">' +
        '<span class="eng-desk-task-row-title">' +
        escapeHtml(meta.title) +
        '</span>' +
        (meta.lines && meta.lines.length
          ? '<span class="eng-desk-task-row-sub">' +
            meta.lines
              .map(function (line) {
                return '<span class="eng-desk-fmea-row-line">' + escapeHtml(line) + '</span>';
              })
              .join('') +
            '</span>'
          : '') +
        '</span>';
      row.addEventListener('click', function (e) {
        e.stopPropagation();
        clearRailActive(rail);
        row.classList.add('is-active');
        folder.classList.add('is-open');
        _fmeaDeskSel = { project: pName, fmeaId: fmeaId, editing: false };
        paintFmeaPreviewIntoViewer(viewer, fmeaId);
      });
      kids.appendChild(row);
      if (restore.fmeaId && String(restore.fmeaId) === String(fmeaId)) {
        restoreFmeaRow = row;
        restoreProjectBtn = folderBtn;
      }
    });

    folder.appendChild(kids);
    rail.appendChild(folder);

    if (restore.project === pName && !restore.fmeaId) {
      restoreProjectBtn = folderBtn;
    }
  });

  const ws = document.getElementById('fmea-workspace');
  if (restore.editing) {
    if (restoreFmeaRow) {
      const folder = restoreFmeaRow.closest('.eng-desk-tree-folder');
      if (folder) folder.classList.add('is-open');
      restoreFmeaRow.classList.add('is-active');
    }
    _fmeaDeskSel.editing = true;
    _fmeaDeskSel.fmeaId = restore.fmeaId;
    _fmeaDeskSel.project = restore.project;
    if (ws && ws.querySelector('.fmea-row')) {
      stealFmeaWorkspaceIntoViewer(viewer, restore.fmeaId);
    } else if (restore.fmeaId && !_fmeaEditReopenGuard) {
      _fmeaEditReopenGuard = true;
      try {
        openFmeaDesktopEditor(restore.fmeaId);
      } finally {
        setTimeout(function () {
          _fmeaEditReopenGuard = false;
        }, 400);
      }
    }
  } else if (restoreFmeaRow) {
    const folder = restoreFmeaRow.closest('.eng-desk-tree-folder');
    if (folder) folder.classList.add('is-open');
    restoreFmeaRow.click();
  } else if (restoreProjectBtn && restore.project) {
    restoreProjectBtn.click();
  } else {
    const first = rail.querySelector('.eng-desk-tree-parent');
    if (first) first.click();
  }
}

function paintFmeaSplit() {
  paintFmeaChrome();
}

function transformProjectGroups() {
  /* legacy no-op — replaced by tree+viewer painters */
}

function afterSubPaint(subId) {
  if (!_shellApplied) return;
  markSubSections();
  const id = subId || currentSubId();
  const tab = document.getElementById(TAB_ID);
  if (tab) tab.setAttribute('data-eng-desk-sub', id);
  syncSubtabActive(id);

  if (id === 'eng-sub-tasks') paintTasksChrome();
  if (id === 'eng-sub-meetings') paintMeetingsChrome();
  if (id === 'eng-sub-badges') paintProfileChrome();
  if (id === 'eng-sub-fmea') paintFmeaSplit();
}

/** Strip desk DOM so mobile layout can remount cleanly (analytics-style). */
function clearEngineerDesktopArtifacts() {
  _tasksDeskSel = { section: null, groupKey: null, taskId: null };
  _meetingsDeskSel = { project: null, meetingId: null };
  _fmeaDeskSel = { project: null, fmeaId: null, editing: false };

  const tasks = document.getElementById('rbi-tasks-container');
  if (tasks) {
    tasks
      .querySelectorAll(':scope > .eng-desk-tasks-chrome, :scope > .eng-desk-split, :scope > .eng-desk-kanban')
      .forEach(function (el) {
        el.remove();
      });
  }

  const meet = document.getElementById('rbi-meeting-container');
  if (meet) {
    meet.classList.remove('eng-desk-meet-host');
    meet.querySelectorAll(':scope > .eng-desk-split').forEach(function (el) {
      el.remove();
    });
    meet.querySelectorAll('.eng-desk-group-source').forEach(function (el) {
      el.removeAttribute('hidden');
      el.classList.remove('eng-desk-group-source');
    });
  }

  const fmea = document.getElementById('rbi-fmea-container');
  if (fmea) {
    fmea.classList.remove('eng-desk-fmea-host');
    const list = document.getElementById('fmea-registry-list');
    if (list) {
      list.classList.remove('eng-desk-fmea-registry');
      list.querySelectorAll(':scope > .eng-desk-split').forEach(function (el) {
        el.remove();
      });
      list.querySelectorAll('.eng-desk-group-source').forEach(function (el) {
        el.removeAttribute('hidden');
        el.classList.remove('eng-desk-group-source');
      });
    }
    const ws = document.getElementById('fmea-workspace');
    if (ws) ws.classList.remove('eng-desk-fmea-workspace');
  }

  const dash = document.getElementById('game-dashboard-container');
  if (dash) {
    dash.classList.remove('eng-desk-game-dash');
  }

  [
    'eng-desk-tasks',
    'eng-desk-meetings',
    'eng-desk-profile',
    'eng-desk-impact',
    'eng-desk-fmea'
  ].forEach(function (cls) {
    document.querySelectorAll('.' + cls).forEach(function (el) {
      el.classList.remove(cls);
    });
  });
}

/** Re-paint mobile surfaces. Profile desk DOM is sticky across tabs — always scrub if present. */
function remountActiveSubTab() {
  const dash = document.getElementById('game-dashboard-container');
  const profileDirty =
    dash &&
    (dash.querySelector('.eng-desk-prof-primary') ||
      dash.querySelector('.eng-desk-rating-panel') ||
      dash.classList.contains('eng-desk-game-dash'));
  if (profileDirty) {
    const gameDash =
      (window.RBI &&
        window.RBI.services &&
        window.RBI.services.game &&
        window.RBI.services.game.renderDashboard) ||
      window.gameRenderDashboard;
    if (typeof gameDash === 'function') {
      try {
        gameDash();
      } catch (_) {
        /* ignore */
      }
    }
    if (dash) dash.classList.remove('eng-desk-game-dash');
  }

  const id = currentSubId();
  try {
    if (id === 'eng-sub-tasks' && typeof window.rbi_renderTasksList === 'function') {
      window.rbi_renderTasksList(true);
    } else if (id === 'eng-sub-meetings' && typeof window.rbi_renderMeetingTab === 'function') {
      window.rbi_renderMeetingTab();
    } else if (id === 'eng-sub-badges') {
      // already remounted above when dirty; if not dirty still ensure paint path
      if (!profileDirty) {
        const gameDash =
          (window.RBI &&
            window.RBI.services &&
            window.RBI.services.game &&
            window.RBI.services.game.renderDashboard) ||
          window.gameRenderDashboard;
        if (typeof gameDash === 'function') gameDash();
      }
    } else if (id === 'eng-sub-fmea') {
      if (typeof window.rbi_renderFmeaHistory === 'function') window.rbi_renderFmeaHistory();
      else if (typeof window.rbi_renderFmeaRegistry === 'function') window.rbi_renderFmeaRegistry();
    } else if (id === 'eng-sub-impact' && typeof window.rbi_renderImpactTab === 'function') {
      window.rbi_renderImpactTab();
    }
  } catch (_) {
    /* ignore */
  }
}

export function showEngineerDesktop() {
  if (!isDesktopViewport() || !isEngineerActive()) {
    teardownEngineerDesktop();
    return;
  }
  const tab = document.getElementById(TAB_ID);
  const subtabs = document.getElementById(SUBTABS_ID);
  if (!tab || !subtabs) return;

  const wasApplied = _shellApplied;
  setWideLayout(true);
  tab.classList.add('engineer-desktop-active');
  subtabs.classList.remove('max-w-4xl', 'mx-auto');
  subtabs.classList.add('eng-desk-subtabs');
  markSubSections();
  _shellApplied = true;

  if (!wasApplied) {
    // Crossing mobile → desktop: remount then desk-paint via hooks / afterSubPaint
    remountActiveSubTab();
    scheduleAfterSubPaint(currentSubId());
  } else {
    afterSubPaint(currentSubId());
  }
}

export function teardownEngineerDesktop() {
  const wasApplied = _shellApplied;
  // Drop flag first so remount hooks do not re-apply desk chrome
  _shellApplied = false;

  if (wasApplied) {
    clearEngineerDesktopArtifacts();
    remountActiveSubTab();
  }

  const tab = document.getElementById(TAB_ID);
  const subtabs = document.getElementById(SUBTABS_ID);
  if (tab) {
    tab.classList.remove('engineer-desktop-active');
    tab.removeAttribute('data-eng-desk-sub');
  }
  if (subtabs) {
    subtabs.classList.remove('eng-desk-subtabs');
    if (!subtabs.classList.contains('max-w-4xl')) {
      subtabs.classList.add('max-w-4xl', 'mx-auto');
    }
  }
  setWideLayout(false);
}

function syncEngineerDesktop() {
  if (isDesktopViewport() && isEngineerActive()) {
    showEngineerDesktop();
  } else {
    teardownEngineerDesktop();
  }
}

function wrapEngineerFns() {
  if (typeof window.rbi_switchEngineerSubTab === 'function' && !_origSwitch) {
    _origSwitch = window.rbi_switchEngineerSubTab;
    window.rbi_switchEngineerSubTab = async function (tabId, btnElement) {
      rememberSubId(tabId);
      syncSubtabActive(tabId);
      const r = await _origSwitch.apply(this, arguments);
      queueMicrotask(function () {
        const id = tabId || currentSubId();
        rememberSubId(id);
        syncSubtabActive(id);
        if (_shellApplied) scheduleAfterSubPaint(id);
        else syncEngineerDesktop();
      });
      return r;
    };
  }
  if (typeof window.rbi_renderEngineerTab === 'function' && !_origRender) {
    _origRender = window.rbi_renderEngineerTab;
    window.rbi_renderEngineerTab = async function () {
      const r = await _origRender.apply(this, arguments);
      queueMicrotask(function () {
        if (_shellApplied) scheduleAfterSubPaint(currentSubId());
        else syncEngineerDesktop();
      });
      return r;
    };
  }
  if (window.AppViews && typeof window.AppViews.renderEngineer === 'function' && !_origRenderEngineerView) {
    _origRenderEngineerView = window.AppViews.renderEngineer;
    window.AppViews.renderEngineer = function () {
      const r = _origRenderEngineerView.apply(this, arguments);
      queueMicrotask(function () {
        setTimeout(syncEngineerDesktop, 60);
      });
      return r;
    };
  }
  if (typeof window.rbi_renderTasksList === 'function' && !_origRenderTasks) {
    _origRenderTasks = window.rbi_renderTasksList;
    window.rbi_renderTasksList = function () {
      const r = _origRenderTasks.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        if (_shellApplied && currentSubId() === 'eng-sub-tasks') scheduleAfterSubPaint('eng-sub-tasks');
      });
      return r;
    };
  }
  if (typeof window.rbi_openTaskAction === 'function' && !_origOpenTaskAction) {
    _origOpenTaskAction = window.rbi_openTaskAction;
    window.rbi_openTaskAction = function (taskId) {
      const r = _origOpenTaskAction.apply(this, arguments);
      return Promise.resolve(r).finally(function () {
        if (!_shellApplied || currentSubId() !== 'eng-sub-tasks') return;
        const viewer = document.querySelector('#rbi-tasks-container .eng-desk-viewer');
        if (!viewer) return;
        stealTaskModalIntoViewer(viewer, taskId);
        _tasksDeskSel.taskId = taskId || _tasksDeskSel.taskId;
        const rail = document.querySelector('#rbi-tasks-container .eng-desk-rail');
        if (!rail || !taskId) return;
        clearRailActive(rail);
        const rows = rail.querySelectorAll('.eng-desk-task-row');
        for (let i = 0; i < rows.length; i++) {
          if (String(rows[i].getAttribute('data-task-id')) === String(taskId)) {
            rows[i].classList.add('is-active');
            const folder = rows[i].closest('.eng-desk-tree-folder');
            if (folder) folder.classList.add('is-open');
            const gw = rows[i].closest('.eng-desk-task-group');
            if (gw) gw.classList.add('is-open');
            break;
          }
        }
      });
    };
  }
  if (typeof window.rbi_renderMeetingTab === 'function' && !_origRenderMeetings) {
    _origRenderMeetings = window.rbi_renderMeetingTab;
    window.rbi_renderMeetingTab = function () {
      const r = _origRenderMeetings.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        if (_shellApplied && currentSubId() === 'eng-sub-meetings') scheduleAfterSubPaint('eng-sub-meetings');
      });
      return r;
    };
  }
  if (typeof window.rbi_openSavedMeeting === 'function' && !_origOpenSavedMeeting) {
    _origOpenSavedMeeting = window.rbi_openSavedMeeting;
    window.rbi_openSavedMeeting = function (meetingId) {
      if (
        _shellApplied &&
        currentSubId() === 'eng-sub-meetings' &&
        !_meetingsFullscreenEdit &&
        meetingId
      ) {
        const viewer = document.querySelector('#rbi-meeting-container .eng-desk-viewer');
        if (viewer) {
          paintMeetingPreviewIntoViewer(viewer, meetingId);
          return Promise.resolve();
        }
      }
      return Promise.resolve(_origOpenSavedMeeting.apply(this, arguments));
    };
  }
  if (typeof window.rbi_closeMeetingProtocolEditor === 'function' && !_origCloseMeetingEditor) {
    _origCloseMeetingEditor = window.rbi_closeMeetingProtocolEditor;
    window.rbi_closeMeetingProtocolEditor = function () {
      const r = _origCloseMeetingEditor.apply(this, arguments);
      return Promise.resolve(r).finally(function () {
        if (!_shellApplied || currentSubId() !== 'eng-sub-meetings') return;
        const id = _meetingsDeskSel.meetingId;
        const viewer = document.querySelector('#rbi-meeting-container .eng-desk-viewer');
        if (viewer && id) paintMeetingPreviewIntoViewer(viewer, id);
      });
    };
  }
  if (typeof window.rbi_renderFmeaHistory === 'function' && !_origRenderFmeaHistory) {
    _origRenderFmeaHistory = window.rbi_renderFmeaHistory;
    window.rbi_renderFmeaHistory = function () {
      const r = _origRenderFmeaHistory.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        if (_shellApplied && currentSubId() === 'eng-sub-fmea') scheduleAfterSubPaint('eng-sub-fmea');
      });
      return r;
    };
  }
  if (typeof window.rbi_renderFmeaRegistry === 'function' && !_origRenderFmeaRegistry) {
    _origRenderFmeaRegistry = window.rbi_renderFmeaRegistry;
    window.rbi_renderFmeaRegistry = function () {
      const r = _origRenderFmeaRegistry.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        if (_shellApplied && currentSubId() === 'eng-sub-fmea') scheduleAfterSubPaint('eng-sub-fmea');
      });
      return r;
    };
  }
  if (typeof window.rbi_viewFmea === 'function' && !_origViewFmea) {
    _origViewFmea = window.rbi_viewFmea;
    window.rbi_viewFmea = function (fmeaId) {
      if (_shellApplied && currentSubId() === 'eng-sub-fmea' && fmeaId && !_fmeaDeskSel.editing) {
        const viewer = document.querySelector('#fmea-registry-list .eng-desk-viewer');
        if (viewer) {
          paintFmeaPreviewIntoViewer(viewer, fmeaId);
          return Promise.resolve();
        }
      }
      return Promise.resolve(_origViewFmea.apply(this, arguments));
    };
  }
  if (typeof window.rbi_loadFmeaToWorkspace === 'function' && !_origLoadFmeaToWorkspace) {
    _origLoadFmeaToWorkspace = window.rbi_loadFmeaToWorkspace;
    window.rbi_loadFmeaToWorkspace = function (fmeaId) {
      if (_shellApplied && currentSubId() === 'eng-sub-fmea') {
        _fmeaDeskSel.editing = true;
        _fmeaDeskSel.fmeaId = fmeaId || _fmeaDeskSel.fmeaId;
      }
      const rec = findFmeaById(fmeaId);
      let r;
      if (rec) {
        r = withFmeaRecordVisible(rec, function (id) {
          return _origLoadFmeaToWorkspace.call(window, id);
        });
      } else {
        r = _origLoadFmeaToWorkspace.apply(this, arguments);
      }
      return Promise.resolve(r).finally(function () {
        if (!_shellApplied || currentSubId() !== 'eng-sub-fmea') return;
        // Direct ES-import callers may skip the registry window-wrap — force chrome
        paintFmeaChrome();
        const viewer = document.querySelector('#fmea-registry-list .eng-desk-viewer');
        const ws = document.getElementById('fmea-workspace');
        if (viewer && ws && ws.querySelector('.fmea-row')) {
          stealFmeaWorkspaceIntoViewer(viewer, (rec && rec.id) || fmeaId || _fmeaDeskSel.fmeaId);
        }
      });
    };
  }
  // «Пустой бланк» / «Сформировать» пишут новый черновик в #fmea-workspace, но на
  // десктопе paintFmeaChrome() при непустом архиве держит #fmea-workspace hidden
  // (запаркован рядом с rail+viewer split) — без явного steal-в-viewer после
  // генерации черновик оставался невидимым (баг: кнопки «не реагируют» на ПК,
  // на мобильном работает, т.к. там нет split-шасси).
  function stealNewFmeaDraftIntoViewer() {
    if (!_shellApplied || currentSubId() !== 'eng-sub-fmea') return;
    _fmeaDeskSel.editing = true;
    _fmeaDeskSel.fmeaId = null;
    paintFmeaChrome();
    const viewer = document.querySelector('#fmea-registry-list .eng-desk-viewer');
    const ws = document.getElementById('fmea-workspace');
    if (viewer && ws && ws.innerHTML.trim()) {
      stealFmeaWorkspaceIntoViewer(viewer, null);
    }
  }
  if (typeof window.rbi_createEmptyFmea === 'function' && !_origCreateEmptyFmea) {
    _origCreateEmptyFmea = window.rbi_createEmptyFmea;
    window.rbi_createEmptyFmea = function () {
      const r = _origCreateEmptyFmea.apply(this, arguments);
      Promise.resolve(r).finally(stealNewFmeaDraftIntoViewer);
      return r;
    };
  }
  if (typeof window.rbi_generateFmeaTable === 'function' && !_origGenerateFmeaTable) {
    _origGenerateFmeaTable = window.rbi_generateFmeaTable;
    window.rbi_generateFmeaTable = function () {
      const r = _origGenerateFmeaTable.apply(this, arguments);
      Promise.resolve(r).finally(stealNewFmeaDraftIntoViewer);
      return r;
    };
  }
  const gameDash =
    (window.RBI && window.RBI.services && window.RBI.services.game && window.RBI.services.game.renderDashboard) ||
    window.gameRenderDashboard;
  if (typeof gameDash === 'function' && !_origGameDash) {
    _origGameDash = gameDash;
    const wrapped = function () {
      const r = _origGameDash.apply(this, arguments);
      Promise.resolve(r).finally(function () {
        if (_shellApplied && currentSubId() === 'eng-sub-badges') scheduleAfterSubPaint('eng-sub-badges');
      });
      return r;
    };
    window.gameRenderDashboard = wrapped;
    if (window.RBI && window.RBI.services && window.RBI.services.game) {
      window.RBI.services.game.renderDashboard = wrapped;
    }
  }
}

function bindHooks() {
  if (_hooksBound) return;
  _hooksBound = true;

  if (!_engineerDeskI18nBound && window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
    _engineerDeskI18nBound = true;
    window.RBI.events.on('i18n:localeChanged', function () {
      try {
        if (!isEngineerActive() || !_shellApplied) return;
        afterSubPaint(currentSubId());
      } catch (_e) { /* ignore */ }
    });
  }
  wrapEngineerFns();
  setTimeout(wrapEngineerFns, 0);
  setTimeout(wrapEngineerFns, 500);
  setTimeout(wrapEngineerFns, 1500);

  window.__rbiAfterTasksListRender = function () {
    if (_shellApplied && currentSubId() === 'eng-sub-tasks') {
      // Immediate: chips call _renderTasksList directly; debounce left a mobile flash
      afterSubPaint('eng-sub-tasks');
    }
  };

  window.addEventListener('hashchange', function () {
    queueMicrotask(function () {
      setTimeout(syncEngineerDesktop, 0);
      setTimeout(syncEngineerDesktop, 80);
    });
  });

  // AppRouter.navigate использует replaceState — hashchange не всегда приходит.
  if (window.RBI && window.RBI.events && typeof window.RBI.events.on === 'function') {
    window.RBI.events.on('appMode:changed', function () {
      queueMicrotask(function () {
        setTimeout(syncEngineerDesktop, 0);
        setTimeout(syncEngineerDesktop, 100);
      });
    });
  }

  document.addEventListener('click', function (e) {
    const subBtn = e.target.closest('#engineer-subtabs-block .sub-tab-btn');
    if (subBtn) {
      const arg = subBtn.getAttribute('data-action-arg');
      if (arg) syncSubtabActive(arg);
    }
    const nav = e.target.closest(
      '.app-nav2-item, .nav-item, [data-path*="engineer"], [href*="engineer"], #engineer-subtabs-block .sub-tab-btn'
    );
    if (nav) {
      queueMicrotask(function () {
        setTimeout(syncEngineerDesktop, 80);
      });
    }
  });
}

function bindResize() {
  if (_resizeBound) return;
  _resizeBound = true;
  let t = null;
  let lastDesktop = isDesktopViewport();
  window.addEventListener('resize', function () {
    if (t) clearTimeout(t);
    t = setTimeout(function () {
      if (!isEngineerActive()) {
        lastDesktop = isDesktopViewport();
        return;
      }
      const nowDesktop = isDesktopViewport();
      if (nowDesktop === lastDesktop) return;
      lastDesktop = nowDesktop;
      // Breakpoint crossed — apply/drop desk shell immediately (analytics pattern)
      if (!nowDesktop) {
        try {
          teardownEngineerDesktop();
        } catch (_) {
          /* ignore */
        }
      } else {
        try {
          showEngineerDesktop();
        } catch (_) {
          /* ignore */
        }
      }
    }, 120);
  });
}

function boot() {
  bindHooks();
  bindResize();
  syncEngineerDesktop();
  setTimeout(syncEngineerDesktop, 400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

window.__engineerDesktop = {
  show: showEngineerDesktop,
  teardown: teardownEngineerDesktop,
  sync: syncEngineerDesktop,
  afterSubPaint: afterSubPaint
};
