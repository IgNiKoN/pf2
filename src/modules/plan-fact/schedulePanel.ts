/**
 * Раздел «График»: расчёт сроков по сохранённой ВОР объекта, диаграмма и реестр норм.
 *
 * Панель не считает сама — расчёт в `domain/schedule.ts`, нормы в `domain/norms.ts`,
 * календарь в `domain/calendar.ts`. Здесь управление (дата старта, неделя, нерабочие даты,
 * параллельные этажи, правка норм) и отображение.
 *
 * Нормы правит ПТО: при наличии права таблица норм редактируемая, иначе — только чтение
 * с прямой пометкой, какие нормы ПТО не подтверждал.
 */

import { loadCalendar, normalizeNonWorkingDays, saveCalendar } from './domain/calendar.ts';
import { decimalToNumber, formatDecimal } from './domain/decimal.ts';
import { canManageNorms, listNorms, normsForSchedule, resetNorm, saveNorm, type NormRecord } from './domain/norms.ts';
import {
  buildSchedule, finishDate, formatDate, type ExcludedItem, type ScheduleItem, type ScheduleResult, type ScheduleRow
} from './domain/schedule.ts';
import { NO_SORT, sortRows, type SortState, type SortValue } from './domain/sort.ts';
import { listWorRows } from './domain/store.ts';
import { bindSortableTable, sortableHeaderClass } from './sortableTable.ts';

interface PanelState {
  objectId: string;
  ganttSort: SortState;
  normsSort: SortState;
  /** Черновики правок норм: сортировка не должна стирать набранное. */
  normDrafts: Record<string, { norm?: string; crew?: string; lag?: string }>;
  startDate: string;
  workWeek: number;
  nonWorkingDays: string[];
  parallelFloors: number;
  norms: NormRecord[];
  canEditNorms: boolean;
  result: ScheduleResult | null;
  sourceRows: number;
  note: string;
  error: string;
  busy: boolean;
  showNorms: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const state: PanelState = {
  objectId: '',
  ganttSort: { ...NO_SORT },
  normsSort: { ...NO_SORT },
  normDrafts: {},
  startDate: todayIso(),
  workWeek: 5,
  nonWorkingDays: [],
  parallelFloors: 1,
  norms: [],
  canEditNorms: false,
  result: null,
  sourceRows: 0,
  note: '',
  error: '',
  busy: false,
  showNorms: false
};

function root(): HTMLElement | null {
  return document.getElementById('pf-schedule-root');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Смонтировать панель: смена объекта сбрасывает расчёт и перечитывает ВОР объекта. */
export async function mountSchedulePanel(objectId: string): Promise<void> {
  const container = root();
  if (!container) return;
  if (state.objectId !== objectId) {
    state.objectId = objectId;
    state.result = null;
    state.note = '';
    state.error = '';
  }
  try {
    state.canEditNorms = canManageNorms();
    state.norms = await listNorms();
    const calendar = await loadCalendar();
    state.workWeek = calendar.workWeek;
    state.nonWorkingDays = calendar.nonWorkingDays;
    const rows = state.objectId ? await listWorRows(state.objectId) : [];
    state.sourceRows = rows.length;
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.sourceRows = 0;
  }
  render();
}

function confirmedNormCount(): number {
  return state.norms.filter((norm) => norm.source === 'pto').length;
}

function statsHtml(): string {
  const result = state.result;
  if (!result) return '';
  const finish = finishDate(state.startDate, result.totalDays, state.workWeek, state.nonWorkingDays);
  const card = (label: string, value: string, tone = 'text-ink'): string => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml(value)}</div>
    </div>`;
  const unconfirmedRows = result.rows.filter((row) => !row.confirmed).length;

  return `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${card('Строк в графике', String(result.rows.length))}
      ${card('Человеко-дней', formatDecimal(result.totalManDays, 2))}
      ${card('Длительность, дней', formatDecimal(result.totalDays, 2))}
      ${card('Окончание', formatDate(finish))}
      ${card('Этажей', String(result.floors.length))}
      ${card('Нерабочих дат учтено', String(state.nonWorkingDays.length))}
      ${card('Исключено из расчёта', String(result.excluded.length), result.excluded.length > 0 ? 'text-danger' : 'text-ink')}
      ${card('Нормы задал ПТО', `${confirmedNormCount()} из ${state.norms.length}`,
        confirmedNormCount() === 0 ? 'text-danger' : 'text-ink')}
      ${unconfirmedRows > 0
        ? `<div class="col-span-2 sm:col-span-4 text-rbi-caption text-danger">В графике ${unconfirmedRows} строк
           по нормам, которые ПТО не подтверждал: сроки по ним ориентировочные.</div>`
        : ''}
    </div>`;
}

function warningsHtml(): string {
  const warnings = state.result?.warnings ?? [];
  if (warnings.length === 0) return '';
  const items = warnings.map((warning) => `<li class="text-rbi-caption text-muted">${escapeHtml(warning)}</li>`).join('');
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Что важно знать про этот график</div>
      <ul class="space-y-0.5">${items}</ul>
    </div>`;
}

/** Одна полоса Ганта: положение и длина — в процентах от общей длительности. */
function barHtml(row: ScheduleRow, total: number): string {
  const left = total > 0 ? (decimalToNumber(row.start) / total) * 100 : 0;
  const width = total > 0 ? Math.max(1.5, (decimalToNumber(row.duration) / total) * 100) : 100;
  const tone = row.confirmed ? 'bg-brand' : 'bg-warning';
  const title = `${row.name}: ${formatDecimal(row.qty)} ${row.unit} · ${formatDecimal(row.manDays, 2)} чел-дн · `
    + `бригада ${row.crew} · ${formatDecimal(row.duration, 2)} дн`
    + (row.confirmed ? '' : ' · норму не подтверждал ПТО');
  return `<div class="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full ${tone}" `
    + `style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%" title="${escapeHtml(title)}"></div>`;
}

/** Колонки диаграммы: сортировка внутри этажа. */
const GANTT_COLUMNS: { key: string; title: string; value: (row: ScheduleRow) => SortValue }[] = [
  { key: 'work', title: 'Работа', value: (row) => row.name },
  { key: 'qty', title: 'Объём', value: (row) => row.qty },
  { key: 'duration', title: 'Длительность', value: (row) => row.duration },
  { key: 'start', title: 'Начало', value: (row) => row.start }
];

function ganttValue(row: ScheduleRow, key: string): SortValue {
  const column = GANTT_COLUMNS.find((item) => item.key === key);
  return column ? column.value(row) : '';
}

function ganttHtml(): string {
  const result = state.result;
  if (!result || result.rows.length === 0) return '';
  const total = decimalToNumber(result.totalDays);

  const ganttHead = `<tr class="text-rbi-caption text-muted text-left">
      ${GANTT_COLUMNS.map((column) => {
        const active = state.ganttSort.key === column.key;
        return `<th data-sort-key="${escapeHtml(column.key)}"
          class="${sortableHeaderClass(active, 'py-1 pr-3 font-normal')}">${escapeHtml(column.title)}</th>`;
      }).join('')}
      <th class="py-1 w-full font-normal">Диаграмма</th>
      <th class="py-1 pl-3 font-normal">Дни</th>
    </tr>`;

  const floors = result.floors.map((floor) => {
    const rows = sortRows(result.rows.filter((row) => row.floor === floor), state.ganttSort, ganttValue);
    const body = rows.map((row) => `
      <tr class="border-b border-surface">
        <td class="py-1 pr-3 text-rbi-caption text-ink whitespace-nowrap">${escapeHtml(row.name)}${row.confirmed ? '' : ' ·'}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${formatDecimal(row.qty)} ${escapeHtml(row.unit)}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${formatDecimal(row.duration, 2)} дн</td>
        <td class="py-1 w-full">
          <div class="relative h-4 bg-brand-soft rounded-full">${barHtml(row, total)}</div>
        </td>
        <td class="py-1 pl-3 text-rbi-caption text-muted whitespace-nowrap">${formatDecimal(row.start, 1)}–${formatDecimal(row.end, 1)}</td>
      </tr>`).join('');
    return `
      <div class="mb-3">
        <div class="text-rbi-body font-bold text-ink mb-1">Этаж ${escapeHtml(floor)}</div>
        <table class="w-full" data-pf-gantt-table="${escapeHtml(floor)}">
          <thead>${ganttHead}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }).join('');

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="flex items-center justify-between gap-2 mb-2">
        <div class="text-rbi-body font-bold text-ink">Диаграмма работ</div>
        <div class="text-rbi-caption text-muted">старт ${escapeHtml(state.startDate.split('-').reverse().join('.'))} ·
          всего ${formatDecimal(result.totalDays, 2)} дн · шкала в днях от старта</div>
      </div>
      ${floors}
    </div>`;
}

function loadHtml(): string {
  const result = state.result;
  if (!result || result.load.length === 0) return '';
  const peak = Math.max(...result.load, 1);
  const bars = result.load.slice(0, 120).map((people, day) => {
    const height = Math.round((people / peak) * 100);
    return `<div class="flex-1 min-w-[3px]" title="день ${day}: ${people} чел.">
      <div class="bg-brand rounded-sm" style="height:${Math.max(people > 0 ? 6 : 2, height)}%;opacity:${people > 0 ? 1 : 0.2}"></div>
    </div>`;
  }).join('');
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Загрузка людей по дням (максимум ${peak} чел.)</div>
      <div class="flex items-end gap-[2px] h-16">${bars}</div>
      <div class="text-rbi-caption text-muted mt-1">Перегруз здесь виден, но расчёт его не блокирует —
        решение за тем, кто ведёт график.</div>
    </div>`;
}

function excludedHtml(): string {
  const excluded = state.result?.excluded ?? [];
  if (excluded.length === 0) return '';
  const reasonText: Record<ExcludedItem['reason'], string> = {
    'unresolved-work': 'вид работ не сопоставлен',
    'unit-mismatch': 'единица не совпала со справочником',
    'no-norm': 'нет нормы выработки'
  };
  const rows = excluded.slice(0, 12).map((entry) => `
    <li class="text-rbi-caption text-muted">${escapeHtml(entry.rawWork || '—')} ·
      ${formatDecimal(entry.qty)} ${escapeHtml(entry.unit || '')} · ${escapeHtml(reasonText[entry.reason])}</li>`).join('');
  const more = excluded.length > 12 ? `<li class="text-rbi-caption text-muted">…и ещё ${excluded.length - 12}</li>` : '';
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Не попало в график: ${excluded.length}</div>
      <ul class="space-y-0.5">${rows}${more}</ul>
    </div>`;
}

/** Реестр норм: читаемый всем, редактируемый тем, у кого право ПТО. */
/** Колонки реестра норм. */
const NORM_COLUMNS: { key: string; title: string; value: (row: NormRecord) => SortValue }[] = [
  { key: 'work', title: 'Вид работ', value: (row) => row.name },
  { key: 'norm', title: 'Выработка', value: (row) => row.norm },
  { key: 'crew', title: 'Бригада', value: (row) => row.crew },
  { key: 'lag', title: 'Пауза', value: (row) => row.lag },
  { key: 'source', title: 'Источник', value: (row) => (row.source === 'pto' ? 'задал ПТО' : 'норма заказчика') }
];

function normsValue(row: NormRecord, key: string): SortValue {
  const column = NORM_COLUMNS.find((item) => item.key === key);
  return column ? column.value(row) : '';
}

function draftValue(key: string, field: 'norm' | 'crew' | 'lag', fallback: string): string {
  const draft = state.normDrafts[key];
  const value = draft ? draft[field] : undefined;
  return value === undefined ? fallback : value;
}

function normsHtml(): string {
  if (!state.showNorms) return '';
  const rows = sortRows(state.norms, state.normsSort, normsValue).map((norm) => {
    const source = norm.source === 'pto'
      ? `задал ПТО${norm.confirmedBy ? ` · ${escapeHtml(norm.confirmedBy)}` : ''}${norm.confirmedAt ? ` · ${escapeHtml(norm.confirmedAt.slice(0, 10))}` : ''}`
      : 'норма заказчика — ПТО не подтверждал';

    if (!state.canEditNorms) {
      return `
        <tr class="border-b border-surface">
          <td class="py-1 pr-3 text-rbi-caption text-ink">${escapeHtml(norm.name)}</td>
          <td class="py-1 pr-3 text-rbi-caption text-muted">${formatDecimal(norm.norm)} ${escapeHtml(norm.unit)}/чел·дн</td>
          <td class="py-1 pr-3 text-rbi-caption text-muted">${norm.crew} чел.</td>
          <td class="py-1 pr-3 text-rbi-caption text-muted">${formatDecimal(norm.lag)} сут</td>
          <td class="py-1 text-rbi-caption ${norm.source === 'pto' ? 'text-muted' : 'text-danger'}">${source}</td>
        </tr>`;
    }

    const key = escapeHtml(norm.workKey);
    return `
      <tr class="border-b border-surface" data-pf-norm-row="${key}">
        <td class="py-1 pr-3 text-rbi-caption text-ink">${escapeHtml(norm.name)}</td>
        <td class="py-1 pr-3 whitespace-nowrap">
          <input id="pf-norm-${key}" type="text" inputmode="decimal" value="${escapeHtml(draftValue(norm.workKey, 'norm', norm.norm))}"
            class="w-20 bg-surface border border-surface text-ink text-rbi-caption rounded-lg px-2 py-1" />
          <span class="text-rbi-caption text-muted">${escapeHtml(norm.unit)}/чел·дн</span>
        </td>
        <td class="py-1 pr-3">
          <input id="pf-crew-${key}" type="number" min="1" step="1" value="${escapeHtml(draftValue(norm.workKey, 'crew', String(norm.crew)))}"
            class="w-16 bg-surface border border-surface text-ink text-rbi-caption rounded-lg px-2 py-1" />
        </td>
        <td class="py-1 pr-3">
          <input id="pf-lag-${key}" type="text" inputmode="decimal" value="${escapeHtml(draftValue(norm.workKey, 'lag', norm.lag))}"
            class="w-16 bg-surface border border-surface text-ink text-rbi-caption rounded-lg px-2 py-1" />
        </td>
        <td class="py-1 pr-3 text-rbi-caption ${norm.source === 'pto' ? 'text-muted' : 'text-danger'}">${source}</td>
        <td class="py-1 whitespace-nowrap">
          <button type="button" data-pf-norm-save="${key}"
            class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Сохранить</button>
          <button type="button" data-pf-norm-reset="${key}"
            class="text-rbi-caption font-bold text-muted border border-surface px-2 py-1 rounded-lg">Сбросить</button>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-1">Нормы выработки: ПТО задал ${confirmedNormCount()} из ${state.norms.length}</div>
      <div class="text-rbi-caption text-muted mb-2">
        ${state.canEditNorms
          ? 'Право ПТО есть у вашей роли: правьте выработку, состав бригады и паузу — норма сохраняется в реестр компании.'
          : 'Норму задаёт ПТО. У вашей роли права на правку нет, поэтому таблица только для чтения.'}
        Базовое наполнение — агрегатные нормы заказчика из формы «График.xlsx».
      </div>
      <table id="pf-norms-table" class="w-full min-w-[720px]">
        <thead><tr class="text-rbi-caption text-muted text-left">
          ${NORM_COLUMNS.map((column) => {
            const active = state.normsSort.key === column.key;
            return `<th data-sort-key="${escapeHtml(column.key)}"
              class="${sortableHeaderClass(active, 'py-1 pr-3 font-normal')}">${escapeHtml(column.title)}</th>`;
          }).join('')}
          <th class="py-1 font-normal"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** Рабочий календарь: неделя и нерабочие даты компании. */
function calendarHtml(): string {
  const weekOptions = [5, 6, 7].map((week) =>
    `<option value="${week}"${week === state.workWeek ? ' selected' : ''}>${week} дней</option>`).join('');
  const days = state.nonWorkingDays.map((day) => `
    <li class="inline-flex items-center gap-1 bg-surface border border-surface rounded-lg px-2 py-1 mr-1 mb-1">
      <span class="text-rbi-caption text-ink">${escapeHtml(day)}</span>
      <button type="button" data-pf-day-remove="${escapeHtml(day)}"
        class="text-rbi-caption text-danger font-bold" title="Убрать нерабочий день">×</button>
    </li>`).join('');

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Рабочий календарь</div>
      <div class="flex flex-wrap items-end gap-2 mb-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Рабочая неделя</span>
          <select id="pf-work-week" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5">${weekOptions}</select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Нерабочий день</span>
          <input id="pf-day-input" type="date"
            class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <button type="button" id="pf-day-add"
          class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl">Добавить</button>
      </div>
      ${state.nonWorkingDays.length
        ? `<ul class="list-none p-0 m-0">${days}</ul>
           <div class="text-rbi-caption text-muted">Нерабочие даты сдвигают календарную дату окончания;
             длительность в рабочих днях не меняется.</div>`
        : '<div class="text-rbi-caption text-muted">Нерабочих дат нет: учитываются только выходные выбранной недели.</div>'}
    </div>`;
}

function render(): void {
  const container = root();
  if (!container) return;

  const hasWor = state.sourceRows > 0;
  const canBuild = hasWor && !state.busy;
  const floorOptions = [1, 2, 3, 4].map((count) =>
    `<option value="${count}"${count === state.parallelFloors ? ' selected' : ''}>${count}</option>`).join('');

  container.innerHTML = `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-2">Параметры графика</div>
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Начало работ</span>
          <input id="pf-start-date" type="date" value="${escapeHtml(state.startDate)}"
            class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Параллельных этажей</span>
          <select id="pf-parallel" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5">${floorOptions}</select>
        </label>
        <button type="button" id="pf-build" ${canBuild ? '' : 'disabled'}
          class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl disabled:opacity-50">Построить график</button>
        <button type="button" id="pf-norms-toggle"
          class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl">
          ${state.showNorms ? 'Скрыть нормы' : 'Показать нормы'}</button>
      </div>
      <div class="text-rbi-caption text-muted mt-2">
        ${hasWor
          ? `Источник — сохранённая ВОР объекта: ${state.sourceRows} позиций. График строится только по сопоставленным работам, у которых есть норма.`
          : 'В этом объекте нет сохранённой ВОР: сначала разберите форму заказчика в разделе «ВОР».'}
        ${state.busy ? ' · идёт расчёт…' : ''}
      </div>
      ${state.note ? `<div class="text-rbi-caption text-brand mt-1">${escapeHtml(state.note)}</div>` : ''}
      ${state.error ? `<div class="text-rbi-body text-danger mt-1">${escapeHtml(state.error)}</div>` : ''}
    </div>
    ${calendarHtml()}
    ${statsHtml()}
    ${warningsHtml()}
    ${ganttHtml()}
    ${loadHtml()}
    ${excludedHtml()}
    ${normsHtml()}
  `;

  bind();
}

function bind(): void {
  const container = root();
  if (!container) return;

  // Сортировка диаграммы (по каждому этажу) и реестра норм — по нажатию на заголовок.
  container.querySelectorAll<HTMLElement>('[data-pf-gantt-table]').forEach((table) => {
    bindSortableTable(table, state.ganttSort, (next) => {
      state.ganttSort = next;
      render();
    });
  });
  bindSortableTable(container.querySelector<HTMLElement>('#pf-norms-table'), state.normsSort, (next) => {
    state.normsSort = next;
    render();
  });

  // Черновики правок норм: сохраняются при перерисовке (в том числе при сортировке).
  for (const field of ['norm', 'crew', 'lag'] as const) {
    container.querySelectorAll<HTMLInputElement>(`[id^="pf-${field}-"]`).forEach((input) => {
      input.addEventListener('input', () => {
        const workKey = (input.id || '').replace(`pf-${field}-`, '');
        if (!workKey) return;
        state.normDrafts[workKey] = { ...(state.normDrafts[workKey] || {}), [field]: input.value };
      });
    });
  }

  container.querySelector<HTMLInputElement>('#pf-start-date')?.addEventListener('change', (event) => {
    state.startDate = (event.target as HTMLInputElement).value || todayIso();
    state.result = null;
    state.note = '';
    render();
  });

  container.querySelector<HTMLSelectElement>('#pf-work-week')?.addEventListener('change', (event) => {
    void runCalendarSave({ workWeek: Number((event.target as HTMLSelectElement).value) || 5 });
  });

  container.querySelector<HTMLSelectElement>('#pf-parallel')?.addEventListener('change', (event) => {
    state.parallelFloors = Number((event.target as HTMLSelectElement).value) || 1;
    state.result = null;
    render();
  });

  container.querySelector<HTMLButtonElement>('#pf-day-add')?.addEventListener('click', () => {
    const input = container.querySelector<HTMLInputElement>('#pf-day-input');
    const value = input?.value ?? '';
    if (!value) return;
    void runCalendarSave({ nonWorkingDays: [...state.nonWorkingDays, value] });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-pf-day-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const day = button.getAttribute('data-pf-day-remove') ?? '';
      void runCalendarSave({ nonWorkingDays: state.nonWorkingDays.filter((item) => item !== day) });
    });
  });

  container.querySelector<HTMLButtonElement>('#pf-build')?.addEventListener('click', () => {
    void runBuild();
  });

  container.querySelector<HTMLButtonElement>('#pf-norms-toggle')?.addEventListener('click', () => {
    state.showNorms = !state.showNorms;
    render();
  });

  container.querySelectorAll<HTMLButtonElement>('[data-pf-norm-save]').forEach((button) => {
    button.addEventListener('click', () => {
      void runNormSave(button.getAttribute('data-pf-norm-save') ?? '');
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-pf-norm-reset]').forEach((button) => {
    button.addEventListener('click', () => {
      void runNormReset(button.getAttribute('data-pf-norm-reset') ?? '');
    });
  });
}

async function runCalendarSave(patch: { workWeek?: number; nonWorkingDays?: string[] }): Promise<void> {
  state.error = '';
  try {
    const saved = await saveCalendar(
      patch.workWeek ?? state.workWeek,
      normalizeNonWorkingDays(patch.nonWorkingDays ?? state.nonWorkingDays)
    );
    state.workWeek = saved.workWeek;
    state.nonWorkingDays = saved.nonWorkingDays;
    state.note = `Календарь сохранён: ${saved.workWeek} дней в неделю, нерабочих дат — ${saved.nonWorkingDays.length}.`;
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function runNormSave(workKey: string): Promise<void> {
  const container = root();
  state.error = '';
  state.note = '';
  try {
    const selector = (id: string): string => `[id="${id}"]`;
    const norm = container?.querySelector<HTMLInputElement>(selector(`pf-norm-${workKey}`))?.value ?? '';
    const crew = container?.querySelector<HTMLInputElement>(selector(`pf-crew-${workKey}`))?.value ?? '';
    const lag = container?.querySelector<HTMLInputElement>(selector(`pf-lag-${workKey}`))?.value ?? '';
    const result = await saveNorm({ workKey, norm, crew, lag });
    if (!result.ok) {
      state.error = result.error ?? 'Не удалось сохранить норму';
    } else {
      state.note = `Норма «${result.record?.name ?? workKey}» сохранена: ${result.record?.norm} на человека в день.`;
      delete state.normDrafts[workKey];
      state.norms = await listNorms();
      state.result = null;
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function runNormReset(workKey: string): Promise<void> {
  state.error = '';
  state.note = '';
  try {
    const result = await resetNorm(workKey);
    if (!result.ok) {
      state.error = result.error ?? 'Не удалось сбросить норму';
    } else {
      state.note = 'Норма возвращена к черновику из формы заказчика.';
      delete state.normDrafts[workKey];
      state.norms = await listNorms();
      state.result = null;
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  render();
}

async function runBuild(): Promise<void> {
  if (!state.objectId) return;
  state.busy = true;
  state.error = '';
  state.note = '';
  render();
  try {
    const stored = await listWorRows(state.objectId);
    const items: ScheduleItem[] = stored.map((row) => ({
      section: row.section,
      floor: row.floor,
      place: row.place,
      workKey: row.workId,
      rawWork: row.workRaw,
      // Нормы заданы в канонической единице: сырое написание из формы («S, м2») не годится.
      unit: row.unit || row.unitRaw || '',
      qty: row.quantity
    }));
    const result = buildSchedule({
      items,
      norms: await normsForSchedule(),
      startDate: state.startDate,
      workWeek: state.workWeek,
      parallelFloors: state.parallelFloors,
      nonWorkingDays: state.nonWorkingDays
    });
    state.result = result;
    state.note = `В графике ${result.rows.length} строк по ${result.floors.length} этажам.`;
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.result = null;
  }
  state.busy = false;
  render();
}
