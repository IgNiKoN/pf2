/**
 * schedule.desktop.content.js
 * Desktop layout for Analytics → График (после mobile rbi_renderScheduleTab).
 * Mobile schedule.render/actions не трогаем — только перекомпоновка DOM.
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stageCount() {
  const data = Array.isArray(window.rbi_scheduleData) ? window.rbi_scheduleData : [];
  return data.filter((s) => s && !s._deleted).length;
}

/**
 * После mobile-paint: chrome + Гантт на всю ширину; редактор — свёрнутый details.
 * Повторный вызов безопасен — пересобирает из свежего #schedule-container.
 */
export function paintScheduleContent() {
  const root = document.getElementById('sub-schedule');
  const container = document.getElementById('schedule-container');
  if (!root || !container) return;
  if (!container.children.length) return;

  root.classList.add('ana-desk-sched');

  // Уже desk-структура (единственный child) — только счётчик.
  const existing = container.querySelector(':scope > .ana-desk-sched-exec');
  if (existing && container.children.length === 1) {
    const countEl = existing.querySelector('[data-sched-desk-count]');
    if (countEl) {
      const n = stageCount();
      countEl.textContent = n === 1 ? '1 этап' : (n + ' этапов');
    }
    return;
  }

  // Сохранить, был ли редактор открыт до remount (если desk уже был).
  const wasEditorOpen = !!container.querySelector('.ana-desk-sched-editor-fold[open]');

  const actionRow = container.querySelector(':scope > .flex.gap-2');
  const editorDetails = container.querySelector(':scope > details');
  const visualBlock = Array.prototype.find.call(container.children, (el) => (
    el !== actionRow && el !== editorDetails
  ));

  const n = stageCount();
  const countLabel = n === 1 ? '1 этап' : (n + ' этапов');

  const exec = document.createElement('div');
  exec.className = 'ana-desk-sched-exec';

  const chrome = document.createElement('div');
  chrome.className = 'ana-desk-sched-chrome';
  chrome.innerHTML = ''
    + '<header class="ana-desk-sched-hero">'
    + '  <div class="ana-desk-sched-hero-text">'
    + '    <h2 class="ana-desk-sched-title">График СМР</h2>'
    + '    <p class="ana-desk-sched-sub" data-sched-desk-count>' + esc(countLabel) + '</p>'
    + '  </div>'
    + '  <div class="ana-desk-sched-actions" data-sched-desk-actions></div>'
    + '</header>';

  const actionsHost = chrome.querySelector('[data-sched-desk-actions]');
  if (actionRow && actionsHost) {
    actionRow.classList.add('ana-desk-sched-action-row');
    actionsHost.appendChild(actionRow);
  }

  const ganttCard = document.createElement('section');
  ganttCard.className = 'ana-desk-sched-card ana-desk-sched-gantt';
  const ganttHead = document.createElement('div');
  ganttHead.className = 'ana-desk-sched-card-head';
  ganttHead.innerHTML = '<h3 class="ana-desk-sched-card-title">Визуализация</h3>'
    + '<p class="ana-desk-sched-card-hint">Узлы на полосах — запланированные задачи (наведите для подсказки)</p>';
  ganttCard.appendChild(ganttHead);
  const ganttBody = document.createElement('div');
  ganttBody.className = 'ana-desk-sched-gantt-body';
  if (visualBlock) {
    const kids = Array.prototype.slice.call(visualBlock.children);
    if (kids[0] && kids[0].tagName === 'H3') kids[0].remove();
    const maybeHint = visualBlock.firstElementChild;
    if (maybeHint && /Наведите|круглые узлы/i.test(maybeHint.textContent || '')) {
      maybeHint.remove();
    }
    ganttBody.appendChild(visualBlock);
  } else {
    ganttBody.innerHTML = '<div class="ana-desk-sched-empty">Нет данных для визуализации</div>';
  }
  ganttCard.appendChild(ganttBody);

  // Справка по вехам — свёрнута, чтобы не съедать Гантт
  const helpDetails = ganttBody.querySelector('details');
  if (helpDetails) {
    helpDetails.open = false;
    helpDetails.classList.add('ana-desk-sched-help');
  }

  // Редактор — только по запросу (не в колонке рядом с Ганттом)
  const editorFold = document.createElement('details');
  editorFold.className = 'ana-desk-sched-card ana-desk-sched-editor-fold';
  if (wasEditorOpen) editorFold.open = true;
  editorFold.innerHTML = ''
    + '<summary class="ana-desk-sched-editor-summary">'
    + '  <span class="ana-desk-sched-card-title">Редактор этапов</span>'
    + '  <span class="ana-desk-sched-editor-hint">Таблица, сохранение, очистка — по необходимости</span>'
    + '  <svg class="ana-desk-sched-chevron" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>'
    + '</summary>';

  const editorBody = document.createElement('div');
  editorBody.className = 'ana-desk-sched-editor-body';
  if (editorDetails) {
    const inner = editorDetails.querySelector(':scope > div');
    if (inner) editorBody.appendChild(inner);
    else editorBody.appendChild(editorDetails);
  } else {
    editorBody.innerHTML = '<div class="ana-desk-sched-empty">Редактор недоступен</div>';
  }
  editorFold.appendChild(editorBody);

  exec.appendChild(chrome);
  exec.appendChild(editorFold);
  exec.appendChild(ganttCard);

  container.innerHTML = '';
  container.appendChild(exec);
}

export function teardownScheduleDesktop() {
  const root = document.getElementById('sub-schedule');
  if (root) root.classList.remove('ana-desk-sched');
}

export const ScheduleDesktopContent = {
  paint: paintScheduleContent,
  teardown: teardownScheduleDesktop
};

if (typeof window !== 'undefined') {
  window.__anaDeskPaintSchedule = paintScheduleContent;
}
