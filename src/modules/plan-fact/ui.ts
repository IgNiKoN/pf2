/**
 * Экран модуля plan-fact (ПФ-1): каркас, выбор реального объекта RBI и разделы приложения.
 *
 * ПФ-1 намеренно не показывает выдуманных данных: если объекта нет или роль не имеет
 * доступа — экран говорит об этом, а не рисует демо-строки. Содержимое разделов
 * (ВОР, график, факт) появляется в блоках ПФ-2…ПФ-4.
 */

import type { PlanFactState, PlanFactTab, RbiObject } from './types';
import { listVisibleObjects, objectDisplayName, planFactServices, rebuildObjects, scopeLabel } from './objects';
import { planFactQueue, syncPlanFact } from './domain/cloud';
import { buildWorExport, formatExportSummary, writeWorWorkbook } from './domain/export';
import { listFacts } from './domain/fact';
import { listWorRows } from './domain/store';
import { mountContoursPanel } from './contoursPanel';
import { mountWorksPanel } from './worksPanel';
import { mountDashboardPanel } from './dashboardPanel';
import { mountForemanPanel, mountPlanFactPanel } from './factPanel';
import { mountSchedulePanel } from './schedulePanel';
import { mountVorPanel } from './vorPanel';

const TABS: Array<{ id: PlanFactTab; label: string }> = [
  { id: 'summary', label: 'Сводка' },
  { id: 'vor', label: 'ВОР' },
  { id: 'contours', label: 'Контуры' },
  { id: 'works', label: 'Справочник' },
  { id: 'schedule', label: 'График' },
  { id: 'foreman', label: 'Прораб' },
  { id: 'fact', label: 'План / факт' }
];

const SECTION_TEXT: Record<PlanFactTab, { title: string; text: string }> = {
  summary: {
    title: 'Сводка по объектам',
    text: 'Состояние по всем видимым объектам: объёмы, план и факт, расхождения, что ждёт решения.'
  },
  works: {
    title: 'Справочник видов работ',
    text: 'Виды работ и связки названий из форм: справочник компании, ведёт ПТО.'
  },
  contours: {
    title: 'Контуры объёмов',
    text: 'Объёмы по РД, договору, предложению ПТО, утверждению РП и приёмке заказчиком. Незаполненный контур — это не ноль.'
  },
  vor: {
    title: 'Ведомость объёмов работ',
    text: 'Здесь появится загрузка формы заказчика (XLSX), сопоставление работ и структуры объекта и сама ВОР по выбранному объекту.'
  },
  schedule: {
    title: 'График производства работ',
    text: 'Расчёт по объёму, норме и составу бригады: календарь, загрузка людей и порядок работ. Считается от ВОР этого объекта.'
  },
  foreman: {
    title: 'Прораб',
    text: 'Ввод факта выполнения по объекту с работой без сети: очередь отправки и подтверждение при появлении связи.'
  },
  fact: {
    title: 'План / факт',
    text: 'Свод план-факт по этажам и видам работ с отклонениями. Строится на данных ВОР и введённого факта.'
  }
};

const state: PlanFactState = { objectId: '', tab: 'vor' };

export function currentTab(): PlanFactTab {
  return state.tab;
}

export function currentObjectId(): string {
  return state.objectId;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mountPlanFactShell(): void {
  const shell = planFactServices().shell;
  const content =
    (shell && typeof shell.getContentRoot === 'function' ? shell.getContentRoot() : null) ||
    document.getElementById('app-content') ||
    document.getElementById('app-root');
  if (!content) return;
  if (document.getElementById('tab-plan-fact')) return;

  const section = document.createElement('div');
  section.id = 'tab-plan-fact';
  section.className = 'view-section hidden';
  section.innerHTML = '<div class="p-3 sm:p-4"><div id="plan-fact-root"></div></div>';
  content.appendChild(section);
}

function headerHtml(): string {
  return `
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="min-w-0">
        <h2 class="text-rbi-title font-bold tracking-tight text-ink">План/Факт СМР</h2>
        <p class="text-rbi-caption text-muted mt-0.5">Ведомость объёмов работ, график и факт выполнения по объекту</p>
      </div>
      <div class="shrink-0 flex items-center gap-2">
        <button type="button" id="pf-export"
          class="text-rbi-caption font-bold text-brand border border-brand-soft px-2.5 py-1.5 rounded-xl">Выгрузить XLSX</button>
        <button type="button" id="pf-refresh"
          class="text-rbi-caption font-bold text-brand border border-brand-soft px-2.5 py-1.5 rounded-xl">Обновить</button>
      </div>
    </div>
    <div id="pf-export-note" class="mb-3"></div>
    <div id="pf-cloud-strip" class="bg-surface border border-surface rounded-xl px-3 py-2 mb-3">
      <span class="text-rbi-caption text-muted">Состояние облака проверяется…</span>
    </div>`;
}

function objectsHtml(objects: RbiObject[]): string {
  if (!objects.length) {
    return `
      <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
        <div class="text-rbi-body font-bold text-ink">Объекты недоступны</div>
        <p class="text-rbi-caption text-muted mt-1">Объектная область вашей роли: ${escapeHtml(scopeLabel())}.
        Если объект должен быть виден — его назначает администратор компании в разделе «Доступ и роли».</p>
      </div>`;
  }

  const options = objects
    .map((object) => {
      const selected = object.id === state.objectId ? ' selected' : '';
      return `<option value="${escapeHtml(object.id)}"${selected}>${escapeHtml(objectDisplayName(object))}</option>`;
    })
    .join('');

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 flex flex-wrap items-center gap-2">
      <label class="text-rbi-label text-muted" for="pf-object-select">Объект</label>
      <select id="pf-object-select"
        class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5 min-w-0 flex-1 sm:flex-none">
        ${options}
      </select>
      <span class="text-rbi-caption text-muted">${escapeHtml(scopeLabel())} · всего: ${objects.length}</span>
    </div>`;
}

function tabsHtml(): string {
  const buttons = TABS.map((tab) => {
    const active = tab.id === state.tab;
    const cls = active
      ? 'text-brand border-brand'
      : 'text-muted border-transparent';
    return `<button type="button" data-pf-tab="${tab.id}"
      class="px-3 py-1.5 text-rbi-body font-bold border-b-2 ${cls}">${escapeHtml(tab.label)}</button>`;
  }).join('');
  return `<div class="flex items-center gap-1 border-b border-surface mb-3 overflow-x-auto">${buttons}</div>`;
}

/** Раздел без доступных объектов: вкладка работает, но данных для неё нет. */
function emptyBodyHtml(): string {
  const section = SECTION_TEXT[state.tab];
  return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-body text-muted mt-3">${escapeHtml(section.text)}</p>
      <p class="text-rbi-caption text-danger mt-3">В модуле нет доступных вам объектов, поэтому показать нечего.
      Обратитесь к администратору: доступ к объектам выдаётся в настройках компании.</p>
    </div>`;
}

function bodyHtml(objects: RbiObject[]): string {
  const section = SECTION_TEXT[state.tab];
  const object = objects.find((item) => item.id === state.objectId) || null;
  const objectLine = object
    ? `Объект: ${escapeHtml(objectDisplayName(object))}`
    : 'Объект не выбран';

  // Рабочие разделы: их панели рисуют себя в этих контейнерах.
  if (state.tab === 'foreman' || state.tab === 'fact') {
    const rootId = state.tab === 'foreman' ? 'pf-foreman-root' : 'pf-planfact-root';
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">${escapeHtml(objectLine)}</p>
      <div id="${rootId}" class="mt-3">
        <div class="text-rbi-caption text-muted">Раздел загружается…</div>
      </div>
    </div>`;
  }

  if (state.tab === 'summary') {
    // Сводка — по проекту, а не по выбранному объекту: руководителю нужны все объекты сразу.
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">Только для чтения: сводка ничего не меняет.</p>
      <div id="pf-dashboard-root" class="mt-3">
        <div class="text-rbi-caption text-muted">Собираю сводку…</div>
      </div>
    </div>`;
  }

  if (state.tab === 'works') {
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">Справочник компании: правка влияет на все объекты.</p>
      <div id="pf-works-root" class="mt-3">
        <div class="text-rbi-caption text-muted">Раздел загружается…</div>
      </div>
    </div>`;
  }

  if (state.tab === 'contours') {
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">${escapeHtml(objectLine)}</p>
      <div id="pf-contours-root" class="mt-3">
        <div class="text-rbi-caption text-muted">Раздел загружается…</div>
      </div>
    </div>`;
  }

  if (state.tab === 'schedule') {
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">${escapeHtml(objectLine)}</p>
      <div id="pf-schedule-root" class="mt-3">
        <div class="text-rbi-caption text-muted">Раздел загружается…</div>
      </div>
    </div>`;
  }

  if (state.tab === 'vor') {
    return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">${escapeHtml(objectLine)}</p>
      <div id="pf-vor-root" class="mt-3">
        <div class="text-rbi-caption text-muted">Раздел загружается…</div>
      </div>
    </div>`;
  }

  return `
    <div class="bg-surface border border-surface rounded-xl p-4">
      <div class="text-rbi-body font-bold text-ink">${escapeHtml(section.title)}</div>
      <p class="text-rbi-caption text-muted mt-1">${escapeHtml(objectLine)}</p>
      <p class="text-rbi-body text-muted mt-3">${escapeHtml(section.text)}</p>
      <p class="text-rbi-caption text-muted mt-3">Раздел в разработке: данных пока нет, заглушек вместо объёмов
      и факта модуль не показывает.</p>
    </div>`;
}

function bind(root: HTMLElement): void {
  const select = root.querySelector<HTMLSelectElement>('#pf-object-select');
  if (select) {
    select.addEventListener('change', () => {
      state.objectId = select.value;
      renderPlanFact();
    });
  }

  root.querySelectorAll<HTMLButtonElement>('[data-pf-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.getAttribute('data-pf-tab');
      if (tab === 'summary' || tab === 'vor' || tab === 'contours' || tab === 'works' || tab === 'schedule' || tab === 'foreman' || tab === 'fact') {
        state.tab = tab;
        renderPlanFact();
        // Верхняя вкладка ведёт за собой маршрут: рейл и кнопка «назад» остаются согласованными.
        if (_sectionNavigator) _sectionNavigator(tab);
      }
    });
  });

  const exportButton = root.querySelector<HTMLButtonElement>('#pf-export');
  if (exportButton) {
    exportButton.addEventListener('click', () => {
      void runExport();
    });
  }

  const refresh = root.querySelector<HTMLButtonElement>('#pf-refresh');
  if (refresh) {
    refresh.addEventListener('click', () => {
      refresh.disabled = true;
      rebuildObjects()
        .then(() => renderPlanFact())
        .catch(() => renderPlanFact())
        .then(() => { refresh.disabled = false; });
    });
  }
}

function _cloudTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Полоса состояния облака: очередь отправки видна как есть. Показывать «всё сохранено»,
 * когда записи лежат на устройстве, нельзя — это и есть та ложь, из-за которой продукт
 * перестают считать продуктом.
 */
async function refreshCloudStrip(): Promise<void> {
  const strip = document.getElementById('pf-cloud-strip');
  if (!strip) return;
  let state: Awaited<ReturnType<typeof planFactQueue>>;
  try {
    state = await planFactQueue();
  } catch (_error) {
    strip.innerHTML = '<span class="text-rbi-caption text-danger">Облако недоступно: очередь остаётся на устройстве.</span>';
    return;
  }

  if (!state.enabled) {
    strip.innerHTML = `<span class="text-rbi-caption text-muted">Облако не подключено: синхронизация с проектом не настроена,
      данные хранятся на устройстве.</span>`;
    return;
  }

  const last = state.lastResult;
  const lastLine = last
    ? last.skipped
      ? `последняя попытка: отложена (${last.skipped === 'offline' ? 'нет сети' : last.skipped === 'no-session' ? 'нет сессии' : 'синк выключен'})`
      : `последняя синхронизация: ${_cloudTime(last.at)} · отправлено ${last.pushed}, получено ${last.pulled}${last.failed ? `, ошибок ${last.failed}` : ''}`
    : 'синхронизация ещё не запускалась';

  strip.innerHTML = `
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-rbi-body text-ink">В очереди: <span class="font-bold">${state.pending}</span></span>
      <span class="text-rbi-caption text-muted">${lastLine}</span>
      <button type="button" id="pf-cloud-sync"
        class="text-rbi-caption font-bold text-brand border border-brand-soft px-2.5 py-1.5 rounded-xl">Синхронизировать</button>
      ${state.pending > 0 ? '<span class="text-rbi-caption text-danger">есть несохранённое в облаке</span>' : ''}
    </div>`;

  strip.querySelector<HTMLButtonElement>('#pf-cloud-sync')?.addEventListener('click', () => {
    void runCloudSync();
  });
}

function _exportNote(html: string): void {
  const note = document.getElementById('pf-export-note');
  if (note) note.innerHTML = html;
}

/**
 * Выгрузка XLSX по ТЗ VOR-034: полная ВОР, свод по этажам, замечания и лист «О выгрузке».
 * Если выгружать нечего (нет объекта или нет сохранённой ВОР) — говорим прямо, а не отдаём пустой файл.
 */
async function runExport(): Promise<void> {
  const objects = listVisibleObjects();
  const object = objects.find((item) => item.id === state.objectId) || null;
  if (!object) {
    _exportNote('<span class="text-rbi-caption text-danger">Сначала выберите объект: выгружать нечего.</span>');
    return;
  }

  _exportNote('<span class="text-rbi-caption text-muted">Готовим выгрузку…</span>');
  try {
    const worRows = await listWorRows(state.objectId);
    if (worRows.length === 0) {
      _exportNote('<span class="text-rbi-caption text-danger">В этом объекте нет сохранённой ВОР: '
        + 'сначала разберите форму заказчика в разделе «ВОР».</span>');
      return;
    }
    const factRows = await listFacts(state.objectId);
    const result = buildWorExport({ objectName: objectDisplayName(object), worRows, factRows });
    const written = writeWorWorkbook(result);
    // Поверхность для смоука: проверяем состав книги и статистику без разбора файла.
    (window as unknown as { __PF_LAST_EXPORT?: unknown }).__PF_LAST_EXPORT = {
      filename: result.filename,
      sheets: result.sheets.map((sheet) => sheet.name),
      stats: result.stats,
      ok: written.ok,
      error: written.error ?? null
    };
    _exportNote(written.ok
      ? `<span class="text-rbi-caption text-brand">${escapeHtml(formatExportSummary(result))}</span>`
      : `<span class="text-rbi-caption text-danger">Выгрузка не прошла: ${escapeHtml(String(written.error))}</span>`);
  } catch (error) {
    _exportNote(`<span class="text-rbi-caption text-danger">Выгрузка не прошла: ${escapeHtml(error instanceof Error ? error.message : String(error))}</span>`);
  }
}

async function runCloudSync(): Promise<void> {
  const strip = document.getElementById('pf-cloud-strip');
  if (strip) {
    strip.innerHTML = '<span class="text-rbi-caption text-muted">Синхронизация…</span>';
  }
  const result = await syncPlanFact();
  renderPlanFact();
  if (result.error) {
    const current = document.getElementById('pf-cloud-strip');
    if (current) {
      current.innerHTML = `<span class="text-rbi-caption text-danger">Синхронизация не прошла: ${escapeHtml(result.error)}</span>`;
    }
  }
}

export function setPlanFactTab(tab: PlanFactTab): void {
  state.tab = tab;
  renderPlanFact();
}

/** Текущая подвкладка — нужна ядру, чтобы свести URL и экран в одну точку правды. */
export function getPlanFactTab(): PlanFactTab {
  return state.tab;
}

let _sectionNavigator: ((tab: PlanFactTab) => void) | null = null;

/**
 * Приёмник навигации для верхних вкладок: клик по вкладке должен менять не только
 * экран, но и маршрут — иначе левый рейл (он живёт по URL) остаётся подсвеченным на
 * старой вкладке. Роут→экран идёт через setPlanFactTab, экран→роут — через этот колбэк.
 */
export function setSectionNavigator(navigator: ((tab: PlanFactTab) => void) | null): void {
  _sectionNavigator = navigator;
}

export function renderPlanFact(): void {
  const root = document.getElementById('plan-fact-root');
  if (!root) return;

  const objects = listVisibleObjects();
  if (state.objectId && !objects.some((item) => item.id === state.objectId)) state.objectId = '';
  if (!state.objectId && objects.length) state.objectId = objects[0].id;

  // Вкладки показываем всегда, даже когда объектов нет: рейл в режиме «План/Факт» никуда
  // не исчезает, и переключение раздела обязано быть видимым, а не молча менять URL.
  // «Справочник» и «Сводка» не зависят от выбранного объекта: справочник корпоративный,
  // сводка — по всем видимым объектам сразу.
  const objectFreeSection = state.tab === 'works' || state.tab === 'summary';
  root.innerHTML = headerHtml() + objectsHtml(objects) + tabsHtml()
    + (objects.length || objectFreeSection ? bodyHtml(objects) : emptyBodyHtml());
  bind(root);

  if (state.tab === 'works') void mountWorksPanel();
  if (state.tab === 'summary') void mountDashboardPanel();
  if (!objects.length) return;

  if (state.tab === 'vor') void mountVorPanel(state.objectId);
  if (state.tab === 'schedule') void mountSchedulePanel(state.objectId);
  if (state.tab === 'contours') void mountContoursPanel(state.objectId);
  if (state.tab === 'foreman') void mountForemanPanel(state.objectId);
  if (state.tab === 'fact') void mountPlanFactPanel(state.objectId);

  void refreshCloudStrip();
}
