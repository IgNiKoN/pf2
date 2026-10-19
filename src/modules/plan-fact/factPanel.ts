/**
 * Разделы «Прораб» и «План/факт»: ввод факта, история со сторно и свод план-факт.
 *
 * Панели не считают сами — домен в `domain/fact.ts`. Здесь интерфейс и состояние.
 * Исправление факта оформлено как корректировка (сторно): исходная запись остаётся видна
 * с прежним объёмом и пометкой, что она исправлена.
 */

import { formatDecimal } from './domain/decimal.ts';
import {
  activeFacts, buildPlanFactSummary, canRecordFact, correctFact, listFacts, recordFact,
  type FactRecord, type PlanFactRow
} from './domain/fact.ts';
import { NO_SORT, sortRows, type SortState, type SortValue } from './domain/sort.ts';
import { bindSortableTable, sortableHeaderClass } from './sortableTable.ts';
import { listWorRows, type PlanFactWorRecord } from './domain/store.ts';

interface FactState {
  objectId: string;
  summarySort: SortState;
  worRows: PlanFactWorRecord[];
  facts: FactRecord[];
  canRecord: boolean;
  workKey: string;
  floor: string;
  place: string;
  quantity: string;
  factDate: string;
  comment: string;
  correctingId: string;
  correctionValue: string;
  correctionReason: string;
  note: string;
  error: string;
  busy: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const state: FactState = {
  objectId: '',
  summarySort: { ...NO_SORT },
  worRows: [],
  facts: [],
  canRecord: false,
  workKey: '',
  floor: '',
  place: '',
  quantity: '',
  factDate: todayIso(),
  comment: '',
  correctingId: '',
  correctionValue: '',
  correctionReason: '',
  note: '',
  error: '',
  busy: false
};

function foremanRoot(): HTMLElement | null {
  return document.getElementById('pf-foreman-root');
}

function planFactRoot(): HTMLElement | null {
  return document.getElementById('pf-planfact-root');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadFactState(objectId: string): Promise<void> {
  if (state.objectId !== objectId) {
    state.objectId = objectId;
    state.note = '';
    state.error = '';
    state.correctingId = '';
  }
  state.canRecord = canRecordFact();
  try {
    state.worRows = objectId ? await listWorRows(objectId) : [];
    state.facts = objectId ? await listFacts(objectId) : [];
    if (!state.workKey) state.workKey = state.worRows[0]?.workId ?? '';
    if (!state.floor) state.floor = state.worRows[0]?.floor ?? '';
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.worRows = [];
    state.facts = [];
  }
}

export async function mountForemanPanel(objectId: string): Promise<void> {
  await loadFactState(objectId);
  renderForeman();
}

export async function mountPlanFactPanel(objectId: string): Promise<void> {
  await loadFactState(objectId);
  renderPlanFact();
}

/** Виды работ объекта — из сохранённой ВОР: факт вносится по позиции плана, а не «из воздуха». */
function worksOf(): { workKey: string; workRaw: string; unit: string }[] {
  const map = new Map<string, { workKey: string; workRaw: string; unit: string }>();
  for (const row of state.worRows) {
    const key = row.workId ?? `raw:${row.workRaw}`;
    if (!map.has(key)) map.set(key, { workKey: row.workId ?? '', workRaw: row.workRaw, unit: row.unit || row.unitRaw || '' });
  }
  return [...map.values()].sort((left, right) => left.workRaw.localeCompare(right.workRaw, 'ru'));
}

function floorsOf(): string[] {
  return [...new Set(state.worRows.map((row) => row.floor))].sort((left, right) => left.localeCompare(right, 'ru'));
}

function selectedWork(): { workKey: string; workRaw: string; unit: string } | null {
  const works = worksOf();
  return works.find((work) => work.workKey === state.workKey) ?? works[0] ?? null;
}

function factRowHtml(record: FactRecord): string {
  const superseded = record.supersededBy !== null;
  const correcting = state.correctingId === record.id;
  const marks = [
    superseded ? '<span class="text-danger">исправлен корректировкой</span>' : '',
    record.correctsId ? '<span class="text-muted">корректировка</span>' : '',
    record.status === 'pending' ? '<span class="text-muted">в очереди</span>' : '<span class="text-muted">передан</span>'
  ].filter(Boolean).join(' · ');

  return `
    <li class="py-2 border-b border-surface">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="text-rbi-body text-ink">${escapeHtml(record.workRaw)} ·
            <span class="font-bold">${escapeHtml(formatDecimal(record.quantity))} ${escapeHtml(record.unit)}</span></div>
          <div class="text-rbi-caption text-muted">
            ${escapeHtml(record.floor)} этаж · ${escapeHtml(record.place || '—')} · ${escapeHtml(record.factDate)} ·
            ${escapeHtml(record.author)} · версия ${record.revision} · ${marks}
          </div>
          ${record.comment ? `<div class="text-rbi-caption text-muted">Комментарий: ${escapeHtml(record.comment)}</div>` : ''}
        </div>
        ${state.canRecord && !superseded
          ? `<button type="button" data-pf-correct="${escapeHtml(record.id)}"
               class="shrink-0 text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Корректировать</button>`
          : ''}
      </div>
      ${correcting ? `
        <div class="flex flex-wrap items-end gap-2 mt-2">
          <label class="flex flex-col gap-1">
            <span class="text-rbi-label text-muted">Новый объём</span>
            <input id="pf-correct-value" type="text" inputmode="decimal"
              class="w-24 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1" />
          </label>
          <label class="flex flex-col gap-1 flex-1 min-w-[160px]">
            <span class="text-rbi-label text-muted">Причина корректировки</span>
            <input id="pf-correct-reason" type="text"
              class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1" />
          </label>
          <button type="button" id="pf-correct-apply"
            class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl">Подтвердить</button>
          <button type="button" id="pf-correct-cancel"
            class="text-rbi-body font-bold text-muted border border-surface px-3 py-1.5 rounded-xl">Отмена</button>
        </div>
        <div class="text-rbi-caption text-muted mt-1">Объём исходной записи не меняется: будет создана
          новая версия со ссылкой на неё.</div>` : ''}
    </li>`;
}

function entryFormHtml(): string {
  const works = worksOf();
  if (works.length === 0) {
    return `<div class="text-rbi-caption text-muted">В объекте нет сохранённой ВОР: сначала разберите форму
      заказчика в разделе «ВОР» — факт вносится по позициям плана.</div>`;
  }
  if (!state.canRecord) {
    return `<div class="text-rbi-caption text-muted">Факт вносит прораб (или инженер): у вашей роли права на
      ввод факта нет. Записи объекта видны ниже.</div>`;
  }

  const workOptions = works.map((work) =>
    `<option value="${escapeHtml(work.workKey)}"${work.workKey === state.workKey ? ' selected' : ''}>${escapeHtml(work.workRaw)}</option>`).join('');
  const floorOptions = floorsOf().map((floor) =>
    `<option value="${escapeHtml(floor)}"${floor === state.floor ? ' selected' : ''}>${escapeHtml(floor)}</option>`).join('');
  const unit = selectedWork()?.unit ?? '';

  return `
    <div class="flex flex-wrap items-end gap-2">
      <label class="flex flex-col gap-1">
        <span class="text-rbi-label text-muted">Работа</span>
        <select id="pf-fact-work" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5 max-w-[240px]">${workOptions}</select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-rbi-label text-muted">Этаж</span>
        <select id="pf-fact-floor" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5">${floorOptions}</select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-rbi-label text-muted">Помещение</span>
        <input id="pf-fact-place" type="text" value="${escapeHtml(state.place)}" placeholder="кв. 15а"
          class="w-28 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-rbi-label text-muted">Объём${unit ? `, ${escapeHtml(unit)}` : ''}</span>
        <input id="pf-fact-qty" type="text" inputmode="decimal" value="${escapeHtml(state.quantity)}"
          class="w-24 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-rbi-label text-muted">Дата</span>
        <input id="pf-fact-date" type="date" value="${escapeHtml(state.factDate)}"
          class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
      </label>
      <label class="flex flex-col gap-1 flex-1 min-w-[160px]">
        <span class="text-rbi-label text-muted">Комментарий</span>
        <input id="pf-fact-comment" type="text" value="${escapeHtml(state.comment)}"
          class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
      </label>
      <button type="button" id="pf-fact-add" ${state.busy ? 'disabled' : ''}
        class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl disabled:opacity-50">Внести факт</button>
    </div>`;
}

function renderForeman(): void {
  const container = foremanRoot();
  if (!container) return;

  const active = activeFacts(state.facts);
  const queue = state.facts.filter((record) => record.status === 'pending').length;

  container.innerHTML = `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-2">Ввод факта выполнения</div>
      ${entryFormHtml()}
      <div class="text-rbi-caption text-muted mt-2">
        Объект: ${state.worRows.length} позиций ВОР, действующих записей факта: ${active.length},
        в очереди отправки: ${queue}.
        ${state.busy ? ' · запись…' : ''}
      </div>
      ${state.note ? `<div class="text-rbi-caption text-brand mt-1">${escapeHtml(state.note)}</div>` : ''}
      ${state.error ? `<div class="text-rbi-body text-danger mt-1">${escapeHtml(state.error)}</div>` : ''}
    </div>
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Внесённый факт (${state.facts.length})</div>
      ${state.facts.length === 0
        ? '<div class="text-rbi-caption text-muted">Записей факта по этому объекту пока нет.</div>'
        : `<ul class="list-none p-0 m-0">${state.facts.map(factRowHtml).join('')}</ul>`}
      ${state.facts.length > 0
        ? `<div class="text-rbi-caption text-muted mt-2">Факт не перезаписывается: исправление оформляется
           корректировкой, исходная запись остаётся в истории со своим объёмом. Отправка в облако —
           отдельный шаг, пока записи лежат в очереди на устройстве.</div>`
        : ''}
    </div>
  `;

  bindForeman();
}

function bindSummarySort(): void {
  const container = planFactRoot();
  if (!container) return;
  bindSortableTable(container.querySelector<HTMLElement>('#pf-planfact-table'), state.summarySort, (next) => {
    state.summarySort = next;
    renderPlanFact();
  });
}

function bindForeman(): void {
  const container = foremanRoot();
  if (!container) return;

  container.querySelector<HTMLSelectElement>('#pf-fact-work')?.addEventListener('change', (event) => {
    state.workKey = (event.target as HTMLSelectElement).value;
    renderForeman();
  });
  container.querySelector<HTMLSelectElement>('#pf-fact-floor')?.addEventListener('change', (event) => {
    state.floor = (event.target as HTMLSelectElement).value;
  });
  container.querySelector<HTMLInputElement>('#pf-fact-place')?.addEventListener('input', (event) => {
    state.place = (event.target as HTMLInputElement).value;
  });
  container.querySelector<HTMLInputElement>('#pf-fact-qty')?.addEventListener('input', (event) => {
    state.quantity = (event.target as HTMLInputElement).value;
  });
  container.querySelector<HTMLInputElement>('#pf-fact-date')?.addEventListener('change', (event) => {
    state.factDate = (event.target as HTMLInputElement).value || todayIso();
  });
  container.querySelector<HTMLInputElement>('#pf-fact-comment')?.addEventListener('input', (event) => {
    state.comment = (event.target as HTMLInputElement).value;
  });
  container.querySelector<HTMLButtonElement>('#pf-fact-add')?.addEventListener('click', () => {
    void runRecord();
  });

  container.querySelectorAll<HTMLButtonElement>('[data-pf-correct]').forEach((button) => {
    button.addEventListener('click', () => {
      state.correctingId = button.getAttribute('data-pf-correct') ?? '';
      state.correctionValue = '';
      state.correctionReason = '';
      state.error = '';
      state.note = '';
      renderForeman();
    });
  });
  container.querySelector<HTMLInputElement>('#pf-correct-value')?.addEventListener('input', (event) => {
    state.correctionValue = (event.target as HTMLInputElement).value;
  });
  container.querySelector<HTMLInputElement>('#pf-correct-reason')?.addEventListener('input', (event) => {
    state.correctionReason = (event.target as HTMLInputElement).value;
  });
  container.querySelector<HTMLButtonElement>('#pf-correct-apply')?.addEventListener('click', () => {
    void runCorrection();
  });
  container.querySelector<HTMLButtonElement>('#pf-correct-cancel')?.addEventListener('click', () => {
    state.correctingId = '';
    renderForeman();
  });
}

async function runRecord(): Promise<void> {
  const work = selectedWork();
  if (!work) return;
  state.busy = true;
  state.error = '';
  state.note = '';
  renderForeman();
  try {
    const result = await recordFact({
      objectId: state.objectId,
      section: state.worRows.find((row) => row.floor === state.floor)?.section ?? '',
      floor: state.floor,
      place: state.place.trim() || 'по договору',
      workKey: work.workKey || null,
      workRaw: work.workRaw,
      unit: work.unit,
      quantity: state.quantity,
      factDate: state.factDate,
      comment: state.comment
    });
    if (!result.ok) {
      state.error = result.error ?? 'Не удалось внести факт';
    } else {
      state.note = `Факт внесён: ${result.record?.quantity} ${work.unit} — «${work.workRaw}».`;
      state.quantity = '';
      state.comment = '';
      state.facts = await listFacts(state.objectId);
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  state.busy = false;
  renderForeman();
  renderPlanFact();
}

async function runCorrection(): Promise<void> {
  const originalId = state.correctingId;
  if (!originalId) return;
  state.busy = true;
  state.error = '';
  state.note = '';
  renderForeman();
  try {
    const result = await correctFact(originalId, {
      quantity: state.correctionValue,
      comment: state.correctionReason
    });
    if (!result.ok) {
      state.error = result.error ?? 'Не удалось оформить корректировку';
    } else {
      state.note = `Корректировка внесена: ${result.record?.quantity} (версия ${result.record?.revision}). Исходная запись сохранена.`;
      state.correctingId = '';
      state.correctionValue = '';
      state.correctionReason = '';
      state.facts = await listFacts(state.objectId);
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  state.busy = false;
  renderForeman();
  renderPlanFact();
}

/** Колонки свода: одна точка правды для заголовка и сортировки. */
const SUMMARY_COLUMNS: { key: string; title: string; value: (row: PlanFactRow) => SortValue }[] = [
  { key: 'floor', title: 'Этаж', value: (row) => row.floor },
  { key: 'work', title: 'Работа', value: (row) => row.workRaw },
  { key: 'unit', title: 'ЕИ', value: (row) => row.unit },
  { key: 'plan', title: 'План', value: (row) => row.plan },
  { key: 'fact', title: 'Факт', value: (row) => row.fact },
  { key: 'deviation', title: 'Отклонение', value: (row) => row.deviation },
  { key: 'percent', title: 'Выполнено', value: (row) => row.percent }
];

function summaryValue(row: PlanFactRow, key: string): SortValue {
  const column = SUMMARY_COLUMNS.find((item) => item.key === key);
  return column ? column.value(row) : '';
}

function renderPlanFact(): void {
  const container = planFactRoot();
  if (!container) return;

  const worRows = state.worRows.map((row) => ({
    section: row.section,
    floor: row.floor,
    place: row.place,
    workRaw: row.workRaw,
    workId: row.workId,
    workMatch: (row.workMatch === 'manual' ? 'manual' : row.workMatch === 'auto' ? 'auto' : 'unresolved') as 'auto' | 'manual' | 'unresolved',
    matchReason: row.matchReason,
    unitRaw: row.unitRaw,
    unit: null,
    quantity: row.quantity,
    fragment: { sheet: row.sheet, row: row.rowNumber, column: row.column, rawValue: null }
  }));

  const summary = buildPlanFactSummary(worRows, state.facts, { floorOrder: floorsOf() });

  const card = (label: string, value: string, tone = 'text-ink'): string => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml(value)}</div>
    </div>`;

  const rows = sortRows(summary.rows, state.summarySort, summaryValue).map((row) => {
    const behind = row.deviation.startsWith('-') === false && row.deviation !== '0';
    return `
      <tr class="border-b border-surface">
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml(row.floor)}</td>
        <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml(row.workRaw)}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml(row.unit)}</td>
        <td class="py-1 pr-3 text-rbi-body text-ink text-right">${formatDecimal(row.plan)}</td>
        <td class="py-1 pr-3 text-rbi-body text-ink text-right">${formatDecimal(row.fact)}</td>
        <td class="py-1 pr-3 text-rbi-body text-right ${behind ? 'text-danger' : 'text-ink'}">${formatDecimal(row.deviation)}</td>
        <td class="py-1 text-rbi-caption text-muted text-right">${row.percent === null ? '—' : `${escapeHtml(row.percent)}%`}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${card('Позиций в своде', String(summary.rows.length))}
      ${card('План', formatDecimal(summary.totalPlan))}
      ${card('Факт', formatDecimal(summary.totalFact))}
      ${card('Отклонение', formatDecimal(summary.totalDeviation),
        summary.totalDeviation !== '0' && !summary.totalDeviation.startsWith('-') ? 'text-danger' : 'text-ink')}
      ${card('Выполнение', summary.totalPercent === null ? '—' : `${summary.totalPercent}%`)}
      ${card('Записей факта', String(state.facts.length))}
      ${card('В очереди отправки', String(summary.factsInQueue))}
      ${card('Исправлено сторно', String(summary.corrected))}
    </div>
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-2">План-факт по этажам и видам работ</div>
      ${summary.rows.length === 0
        ? '<div class="text-rbi-caption text-muted">Нет ни плана, ни факта по этому объекту.</div>'
        : `<table id="pf-planfact-table" class="w-full min-w-[720px]">
            <thead><tr class="text-rbi-caption text-muted text-left">
              ${SUMMARY_COLUMNS.map((column) => {
                const active = state.summarySort.key === column.key;
                const align = ['plan', 'fact', 'deviation', 'percent'].includes(column.key) ? 'text-right' : '';
                return `<th data-sort-key="${escapeHtml(column.key)}"
                  class="${sortableHeaderClass(active, `py-1 pr-3 font-normal ${align}`)}">${escapeHtml(column.title)}</th>`;
              }).join('')}
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`}
      <div class="text-rbi-caption text-muted mt-2">
        План — из сохранённой ВОР объекта, факт — из действующих записей (исправленные сторно не считаются).
        Облачная отправка факта появится отдельным шагом: сейчас записи ждут на устройстве.
        Сортировка — нажатием на заголовок колонки.
      </div>
    </div>
  `;

  bindSummarySort();
}
