/**
 * Раздел «ВОР»: загрузка формы заказчика, разбор, таблица и сохранение в объект.
 *
 * Панель не считает сама: чтение и нормализация — в `domain/**`, хранение — через
 * `domain/store.ts` (штатный сервис storage). Здесь только интерфейс и состояние панели.
 * Никаких выдуманных данных: если позиций нет — так и написано.
 */

import { analyze, autoMatchedWorks, totalsByWork, unresolvedWorks, type AnalyzeResult } from './domain/analyze.ts';
import { addDecimal, formatDecimal } from './domain/decimal.ts';
import { FORM_PROFILES, formProfileById, normalizeContextOf, type FormProfile } from './domain/profiles.ts';
import { countFormulaCells, pickSheet, rawRowsFromSheets, readXlsxSheets } from './domain/reader.ts';
import { NO_SORT, sortRows, type SortState, type SortValue } from './domain/sort.ts';
import { deleteImport, listImports, listWorRows, saveImport } from './domain/store.ts';
import { readCsvSheet } from './domain/csv.ts';
import { inspectFile } from './domain/fileGuard.ts';
import { analyzeAsync } from './domain/importer.ts';
import { text as cellText } from './domain/reader.ts';
import {
  applyTemplate, headerSignature, listTemplates, markTemplateUsed, removeTemplate, repointTemplate,
  saveTemplate, templateDiff, type MappingTemplate, type TemplateDiff
} from './domain/templates.ts';
import { buildCatalog, canManageWorks, catalogToNormalizeContext, listAliases, saveAlias } from './domain/works.ts';
import { WORK_ALIASES } from './domain/reference.ts';
import { bindSortableTable, sortableHeaderClass } from './sortableTable.ts';
import type { ColumnMapping, ImportProfile, WorRow, XlsxSheet } from './domain/types.ts';

/** Сколько строк таблицы рисуем: остальное — честной строкой «показано N из M». */
const TABLE_LIMIT = 200;

interface SavedImport {
  id: string;
  filename: string;
  sheet: string;
  profileTitle: string;
  createdAt: string;
  items: number;
  matched: number;
  matchedPercent: number;
}

interface PanelState {
  objectId: string;
  /** Виды работ из справочника: нужны для ручного сопоставления. */
  workOptions: { id: string; name: string; groupName: string }[];
  /** Сопоставлено программой, но не подтверждено ПТО (VOR-013). */
  autoMatched: { raw: string; workId: string; count: number; workTitle: string }[];
  canManageWorks: boolean;
  positionsSort: SortState;
  totalsSort: SortState;
  profileId: string;
  filename: string;
  /** Чем загружен файл: 'csv' или 'xlsx' — от этого зависит пояснение под полем файла. */
  fileKind: string;
  fileNote: string;
  sheets: XlsxSheet[];
  sheetName: string;
  /** Колонки, изменённые шаблоном или вручную: null — берём колонки профиля из кода. */
  columnOverrides: ColumnMapping[] | null;
  /** Нормализованные заголовки выбранного листа: для сопоставления колонок и проверки шаблона. */
  headerLabels: string[];
  /** Строка, из которой взята шапка (может отличаться от строки профиля). */
  headerRowUsed: number;
  headerNote: string;
  templates: MappingTemplate[];
  templateId: string;
  templateName: string;
  /** Что изменилось в колонках относительно выбранного шаблона. */
  templateWarning: TemplateDiff | null;
  analysis: AnalyzeResult | null;
  saved: SavedImport[];
  savedRows: number;
  savedByWork: { workTitle: string; unit: string; quantity: string }[];
  note: string;
  error: string;
  busy: boolean;
  /** Предупреждения защиты файла: показываются, но импорт не блокируют. */
  guardWarnings: string[];
  /** Прогресс импорта: без него полоска ничего не объясняет. */
  progress: { done: number; total: number; message: string } | null;
  /** Разбор прерван человеком: результат неполный, и это видно. */
  cancelled: boolean;
  /** Сколько строк попало в протокол проблем. */
  issuesTotal: number;
}

const state: PanelState = {
  workOptions: [],
  autoMatched: [],
  canManageWorks: false,
  positionsSort: { ...NO_SORT },
  totalsSort: { ...NO_SORT },
  objectId: '',
  profileId: FORM_PROFILES[0].id,
  filename: '',
  fileKind: '',
  fileNote: '',
  sheets: [],
  sheetName: '',
  /** Колонки, изменённые шаблоном или вручную: null — берём колонки профиля. */
  columnOverrides: null as ColumnMapping[] | null,
  headerLabels: [] as string[],
  headerRowUsed: 0,
  headerNote: '',
  templates: [] as MappingTemplate[],
  templateId: '',
  templateName: '',
  templateWarning: null as TemplateDiff | null,
  analysis: null,
  saved: [],
  savedRows: 0,
  savedByWork: [],
  note: '',
  error: '',
  busy: false,
  guardWarnings: [],
  progress: null,
  cancelled: false,
  issuesTotal: 0
};

function root(): HTMLElement | null {
  return document.getElementById('pf-vor-root');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function currentForm(): FormProfile {
  return formProfileById(state.profileId) ?? FORM_PROFILES[0];
}

/**
 * Раскладка с учётом шаблона: если колонки заданы шаблоном или поправлены вручную,
 * разбор идёт по ним, а не по профилю из кода.
 */
function currentProfile(): ImportProfile {
  const form = currentForm();
  let profile = state.columnOverrides
    ? applyTemplate(form.profile, state.columnOverrides, state.sheetName)
    : form.profile;
  // Если шапка в файле оказалась не там, где её ждёт профиль, разбор должен идти с той же
  // строки, что показана в сопоставлении колонок, — иначе колонки верные, а строк нет.
  if (state.headerRowUsed > 0 && state.headerRowUsed !== profile.headerRow) {
    profile = { ...profile, headerRow: state.headerRowUsed, headerRows: 1 };
  }
  return profile;
}

/**
 * Заголовки выбранного листа: нужны для сопоставления колонок и проверки шаблона.
 *
 * Если профиль ждёт шапку глубже, чем есть строк в файле (обычное дело для CSV из 1С —
 * там шапка в первой строке), берём первую непустую строку и **говорим об этом**: молчаливая
 * подстановка чужой строки как шапки — прямой путь к сопоставлению не туда.
 */
function refreshHeaderLabels(): void {
  const profile = currentProfile();
  const sheet = state.sheets.find((item) => item.name === state.sheetName) ?? state.sheets[0] ?? null;
  if (!sheet) {
    state.headerLabels = [];
    state.headerRowUsed = 0;
    state.headerNote = '';
    return;
  }

  const firstFilled = sheet.rows.findIndex((row) => row.some((cell) => cellText(cell).trim() !== '')) + 1;
  const csvDefault = state.fileKind === 'csv' && firstFilled > 0 ? firstFilled : profile.headerRow;
  state.headerRowUsed = csvDefault;
  state.headerNote = state.fileKind === 'csv' && csvDefault !== profile.headerRow
    ? `CSV: шапка взята из первой строки (профиль «${profile.name}» описывает Excel-форму со строкой ${profile.headerRow}).`
    : '';
  let labels = state.fileKind === 'csv'
    ? headerSignature(sheet.rows, csvDefault, 1)
    : headerSignature(sheet.rows, csvDefault, profile.headerRows);
  if (labels.every((label) => label === '')) {
    const first = sheet.rows.findIndex((row) => row.some((cell) => cellText(cell).trim() !== ''));
    labels = first >= 0 ? headerSignature(sheet.rows, first + 1, 1) : [];
    if (labels.length > 0) {
      state.headerRowUsed = first + 1;
      state.headerNote = `Профиль ждёт шапку на строке ${profile.headerRow}, в файле она на строке ${first + 1} — взял её.`;
    }
  }
  state.headerLabels = labels;
}

/** Шаблоны сопоставления для текущей раскладки. */
async function loadTemplates(): Promise<void> {
  try {
    state.templates = await listTemplates(state.profileId);
  } catch (_error) {
    state.templates = [];
  }
}

async function loadSaved(): Promise<void> {
  if (!state.objectId) {
    state.saved = [];
    state.savedRows = 0;
    state.savedByWork = [];
    return;
  }
  const [imports, rows] = await Promise.all([
    listImports(state.objectId),
    listWorRows(state.objectId)
  ]);

  state.savedRows = rows.length;
  const groups = new Map<string, { workTitle: string; unit: string; quantity: string }>();
  for (const row of rows) {
    const key = row.workId ?? `raw:${row.workRaw}`;
    const bucket = groups.get(key);
    if (bucket) bucket.quantity = addDecimal(bucket.quantity, row.quantity);
    else groups.set(key, { workTitle: row.workRaw, unit: row.unitRaw || row.unit || '', quantity: row.quantity });
  }
  state.savedByWork = [...groups.values()].sort((left, right) => left.workTitle.localeCompare(right.workTitle));

  state.saved = imports.map((record) => ({
    id: record.id,
    filename: record.filename,
    sheet: record.sheet,
    profileTitle: record.profileTitle,
    createdAt: String(record.createdAt).slice(0, 16).replace('T', ' '),
    items: record.stats?.items ?? 0,
    matched: record.stats?.matched ?? 0,
    matchedPercent: record.stats?.matchedPercent ?? 0
  }));
}

/** Смонтировать панель в контейнер экрана модуля. Смена объекта сбрасывает разбор и подтягивает его ВОР. */
export async function mountVorPanel(objectId: string): Promise<void> {
  const container = root();
  if (!container) return;
  // Право перечитываем при входе в раздел: иначе после выдачи права интерфейс остаётся
  // в режиме чтения до следующего разбора формы.
  state.canManageWorks = canManageWorks();
  void loadTemplates();
  if (state.objectId !== objectId) {
    state.objectId = objectId;
    state.analysis = null;
  }
  try {
    await loadSaved();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  render();
}

function statsHtml(): string {
  const analysis = state.analysis;
  if (!analysis) return '';
  const stats = analysis.stats;
  const cell = (label: string, value: string, tone = 'text-ink'): string => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml(value)}</div>
    </div>`;

  return `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${cell('Строк листа', String(stats.rows))}
      ${cell('Позиций ВОР', String(stats.items))}
      ${cell('Сопоставлено', `${stats.matched} · ${formatDecimal(String(stats.matchedPercent), 1)}%`)}
      ${cell('Требует решения', String(stats.needsDecision), stats.needsDecision > 0 ? 'text-danger' : 'text-ink')}
      ${cell('Материалов пропущено', String(stats.materialsSkipped))}
      ${cell('Не разобрано локаций', String(stats.unresolvedLocations), stats.unresolvedLocations > 0 ? 'text-danger' : 'text-ink')}
      ${cell('Лист', stats.sheet || '—')}
      ${cell('Всего сохранено в объект', String(state.savedRows))}
    </div>`;
}

function issuesHtml(): string {
  const analysis = state.analysis;
  if (!analysis || analysis.issues.length === 0) return '';
  const rows = analysis.issues
    .slice(0, 12)
    .map((issue) => `
      <li class="text-rbi-caption ${issue.severity === 'error' ? 'text-danger' : 'text-muted'}">
        строка ${issue.fragment.row}: ${escapeHtml(issue.message)}
      </li>`)
    .join('');
  const more = analysis.issues.length > 12
    ? `<li class="text-rbi-caption text-muted">…и ещё ${analysis.issues.length - 12}</li>`
    : '';
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Замечания разбора</div>
      <ul class="space-y-0.5">${rows}${more}</ul>
    </div>`;
}

const TOTAL_COLUMNS: { key: string; title: string; value: (row: { workTitle: string; unit: string; quantity: string }) => SortValue }[] = [
  { key: 'work', title: 'Вид работ', value: (row) => row.workTitle },
  { key: 'unit', title: 'ЕИ', value: (row) => row.unit },
  { key: 'quantity', title: 'Итого', value: (row) => row.quantity }
];

function totalsHtml(): string {
  const analysis = state.analysis;
  if (!analysis || analysis.rows.length === 0) return '';
  const sortedTotals = sortRows(totalsByWork(analysis.rows), state.totalsSort, (row, key) => {
    const column = TOTAL_COLUMNS.find((item) => item.key === key);
    return column ? column.value(row) : '';
  });
  const totals = sortedTotals.slice(0, 12);
  const head = TOTAL_COLUMNS.map((column) => {
    const active = state.totalsSort.key === column.key;
    const align = column.key === 'quantity' ? 'text-right' : '';
    return `<th data-sort-key="${escapeHtml(column.key)}"
      class="${sortableHeaderClass(active, `py-1 pr-2 font-normal ${align}`)}">${escapeHtml(column.title)}</th>`;
  }).join('');
  const rows = totals.map((total) => `
    <tr class="border-b border-surface">
      <td class="py-1 pr-2 text-rbi-body text-ink">${escapeHtml(total.workTitle)}</td>
      <td class="py-1 pr-2 text-rbi-caption text-muted">${escapeHtml(total.unit)}</td>
      <td class="py-1 text-rbi-body text-ink text-right">${escapeHtml(formatDecimal(total.quantity))}</td>
    </tr>`).join('');
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Итого по видам работ (точно, без float)</div>
      <table id="pf-totals-table" class="w-full">
        <thead><tr class="text-rbi-caption text-muted text-left">${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/** Колонки таблицы позиций ВОР. */
const POSITION_COLUMNS: { key: string; title: string; value: (row: WorRow) => SortValue }[] = [
  { key: 'section', title: 'Секция', value: (row) => row.section },
  { key: 'floor', title: 'Этаж', value: (row) => row.floor },
  { key: 'place', title: 'Помещение', value: (row) => row.place },
  { key: 'work', title: 'Работа', value: (row) => row.workRaw },
  { key: 'unit', title: 'ЕИ', value: (row) => row.unitRaw },
  { key: 'quantity', title: 'Объём', value: (row) => row.quantity },
  { key: 'status', title: 'Статус', value: (row) => (row.workId === null ? 'не сопоставлено' : 'сопоставлено') }
];

function positionsValue(row: WorRow, key: string): SortValue {
  const column = POSITION_COLUMNS.find((item) => item.key === key);
  return column ? column.value(row) : '';
}

/**
 * Ручное сопоставление (ТЗ VOR-013): ПТО связывает формулировку из формы с видом работ
 * один раз — и все строки с этим названием перестают быть проблемой, а следующие импорты
 * совпадают сами. Блок показывается только когда есть что связывать.
 */
function unresolvedHtml(): string {
  const analysis = state.analysis;
  if (!analysis) return '';
  const list = unresolvedWorks(analysis.rows);
  if (list.length === 0) return '';

  const totalRows = list.reduce((sum, entry) => sum + entry.count, 0);
  const options = state.workOptions.map((work) =>
    `<option value="${escapeHtml(work.id)}">${escapeHtml(`${work.groupName}: ${work.name}`)}</option>`).join('');

  const rows = list.slice(0, 20).map((entry) => {
    if (!state.canManageWorks) {
      return `<li class="text-rbi-caption text-muted">${escapeHtml(entry.raw)} — ${entry.count} стр.,
        ${escapeHtml(entry.units.join(', ') || 'без единицы')}</li>`;
    }
    return `
      <li class="py-1 border-b border-surface flex flex-wrap items-center gap-2">
        <span class="text-rbi-body text-ink">${escapeHtml(entry.raw)}</span>
        <span class="text-rbi-caption text-muted">${entry.count} стр. · ${escapeHtml(entry.units.join(', ') || 'без единицы')}</span>
        <select data-pf-link-raw="${escapeHtml(entry.raw)}"
          class="bg-surface border border-surface text-ink text-rbi-caption rounded-lg px-2 py-1 max-w-[280px]">
          <option value="">— выберите вид работ —</option>
          ${options}
        </select>
        <button type="button" data-pf-link-go="${escapeHtml(entry.raw)}"
          class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Связать</button>
      </li>`;
  }).join('');

  const more = list.length > 20
    ? `<li class="text-rbi-caption text-muted">…и ещё ${list.length - 20} формулировок</li>`
    : '';

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Не сопоставлено: ${list.length} формулировок,
        ${totalRows} строк</div>
      <div class="text-rbi-caption text-muted mb-2">
        ${state.canManageWorks
          ? 'Свяжите формулировку с видом работ — связка сохранится и применится к следующим импортам этой формы.'
          : 'Связки ведёт ПТО: у вашей роли права на правку нет, список — для сведения.'}
      </div>
      <ul class="list-none p-0 m-0">${rows}${more}</ul>
    </div>`;
}

/**
 * Подтверждение автоматических сопоставлений (VOR-013).
 *
 * Пока ПТО не подтвердил связку, совпадение остаётся предположением программы. Подтверждение —
 * это одно нажатие: связка сохраняется как решение ПТО и убирает формулировку из списка.
 */
function confirmHtml(): string {
  const list = state.autoMatched;
  if (list.length === 0) return '';
  const total = list.reduce((sum, item) => sum + item.count, 0);

  if (!state.canManageWorks) {
    return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Сопоставлено программой: ${list.length} формулировок,
        ${total} строк</div>
      <div class="text-rbi-caption text-muted">Подтверждает ПТО: у вашей роли права на правку нет.</div>
    </div>`;
  }

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Сопоставлено программой: ${list.length} формулировок,
        ${total} строк
        <span class="text-rbi-caption text-muted font-normal">· подтвердите, если совпадение верное</span></div>
      <ul class="list-none p-0 m-0">
        ${list.slice(0, 15).map((item) => `
          <li class="py-1 border-b border-surface flex flex-wrap items-center gap-2">
            <span class="text-rbi-body text-ink">${escapeHtml(item.raw)}</span>
            <span class="text-rbi-caption text-muted">${item.count} стр. · вид работ: ${escapeHtml(item.workTitle)}</span>
            <button type="button" data-pf-confirm="${escapeHtml(item.raw)}"
              data-pf-confirm-work="${escapeHtml(item.workId)}"
              class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Подтвердить</button>
          </li>`).join('')}
      </ul>
      ${list.length > 15 ? `<div class="text-rbi-caption text-muted mt-1">…и ещё ${list.length - 15} формулировок</div>` : ''}
      <div class="mt-2">
        <button type="button" id="pf-confirm-all"
          class="text-rbi-caption font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl">
          Подтвердить все (${list.length})</button>
      </div>
    </div>`;
}

function tableHtml(): string {
  const analysis = state.analysis;
  if (!analysis) return '';
  if (analysis.rows.length === 0) {
    return `
      <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
        <div class="text-rbi-body text-muted">Разбор не дал ни одной позиции: проверьте профиль формы и лист.
        Пустая ячейка объёма позицией не является — ноль и пустое различаются.</div>
      </div>`;
  }

  const ordered = sortRows(analysis.rows, state.positionsSort, positionsValue);
  const shown = ordered.slice(0, TABLE_LIMIT);
  const rows = shown.map((row) => {
    const unresolved = row.workId === null;
    return `
      <tr class="border-b border-surface ${unresolved ? 'bg-danger-soft' : ''}">
        <td class="py-1 pr-2 text-rbi-caption text-muted">${escapeHtml(row.section)}</td>
        <td class="py-1 pr-2 text-rbi-caption text-muted">${escapeHtml(row.floor)}</td>
        <td class="py-1 pr-2 text-rbi-body text-ink">${escapeHtml(row.place)}</td>
        <td class="py-1 pr-2 text-rbi-body text-ink">${escapeHtml(row.workRaw)}</td>
        <td class="py-1 pr-2 text-rbi-caption text-muted">${escapeHtml(row.unitRaw || row.unit || '')}</td>
        <td class="py-1 pr-2 text-rbi-body text-ink text-right">${escapeHtml(formatDecimal(row.quantity))}</td>
        <td class="py-1 text-rbi-caption ${unresolved ? 'text-danger' : 'text-muted'}">
          ${unresolved ? 'требует решения' : 'сопоставлено'}
        </td>
      </tr>`;
  }).join('');

  const tail = analysis.rows.length > shown.length
    ? `<div class="text-rbi-caption text-muted mt-2">Показано ${shown.length} из ${analysis.rows.length} позиций —
       остальные сохранены в объект целиком, ограничение только у таблицы.</div>`
    : '';

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-2">Позиции ВОР</div>
      <table id="pf-positions-table" class="w-full min-w-[640px]">
        <thead>
          <tr class="text-rbi-caption text-muted text-left border-b border-surface">
            ${POSITION_COLUMNS.map((column) => {
              const active = state.positionsSort.key === column.key;
              const align = column.key === 'quantity' ? 'text-right' : '';
              return `<th data-sort-key="${escapeHtml(column.key)}"
                class="${sortableHeaderClass(active, `py-1 pr-2 font-normal ${align}`)}">${escapeHtml(column.title)}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${tail}
    </div>`;
}

function savedHtml(): string {
  if (!state.objectId) {
    return `<div class="text-rbi-caption text-muted">Выберите объект — ВОР сохраняется в его рамках.</div>`;
  }
  if (state.saved.length === 0) {
    return `<div class="text-rbi-caption text-muted">В этом объекте пока нет сохранённой ВОР.</div>`;
  }
  const items = state.saved.map((record) => `
    <li class="flex items-start justify-between gap-2 py-1 border-b border-surface">
      <div class="min-w-0">
        <div class="text-rbi-body text-ink truncate">${escapeHtml(record.filename || 'файл')} · ${escapeHtml(record.sheet)}</div>
        <div class="text-rbi-caption text-muted">${escapeHtml(record.profileTitle)} · ${record.items} позиций ·
          сопоставлено ${record.matched} (${formatDecimal(String(record.matchedPercent), 1)}%) · ${escapeHtml(record.createdAt)}</div>
      </div>
      <button type="button" data-pf-delete="${escapeHtml(record.id)}"
        class="shrink-0 text-rbi-caption font-bold text-danger border border-danger-soft px-2 py-1 rounded-lg">Удалить</button>
    </li>`).join('');

  const totals = state.savedByWork.slice(0, 10).map((total) => `
    <tr class="border-b border-surface">
      <td class="py-1 pr-2 text-rbi-body text-ink">${escapeHtml(total.workTitle)}</td>
      <td class="py-1 pr-2 text-rbi-caption text-muted">${escapeHtml(total.unit)}</td>
      <td class="py-1 text-rbi-body text-ink text-right">${escapeHtml(formatDecimal(total.quantity))}</td>
    </tr>`).join('');

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Сохранено в объект: ${state.savedRows} позиций</div>
      <ul class="mb-2">${items}</ul>
      ${totals ? `<table class="w-full"><tbody>${totals}</tbody></table>` : ''}
    </div>`;
}

/** Человеческие названия колонок: ПТО должен видеть смысл, а не код поля. */
const FIELD_TITLES: Record<string, string> = {
  code: 'Код', name: 'Работа', unit: 'Единица', quantity: 'Объём',
  norm_consumption: 'Норма расхода', norm_output: 'Выработка', norm_output_unit: 'Единица выработки',
  man_days: 'Человеко-дни', crew: 'Состав звена',
  section_floor: 'Этаж', price: 'Цена', total: 'Сумма', marker: 'Признак (работа/материал)',
  location_label: 'Помещение'
};

/**
 * Поля, без которых раскладку не разобрать, даже если профиль их не объявил.
 *
 * Пример: плоский список от заказчика не содержит помещений, профиль их не описывает — и без
 * возможности сопоставить «Этаж» вручную файл разбирается в ноль позиций. Ручное сопоставление
 * должно уметь добавить такую колонку, а не только переопределить существующую.
 */
const LAYOUT_FIELDS: Record<string, ColumnMapping['field'][]> = {
  // Локации строками: без этажа и помещения позиции не собрать.
  outline_location_rows: ['section_floor', 'location_label', 'name', 'unit', 'quantity', 'marker'],
  // Локации помечены маркерами: важнее признак и место.
  outline_markers: ['marker', 'section_floor', 'location_label', 'name', 'unit', 'quantity'],
  // Обмерная матрица: место в колонках, работы — отдельными колонками.
  measurement_matrix: ['section_floor', 'location_label', 'marker'],
  // График и нормы: работа, выработка и звено.
  norms_schedule: ['name', 'unit', 'norm_output', 'norm_output_unit', 'crew', 'man_days'],
  unknown: ['section_floor', 'location_label', 'name', 'unit', 'quantity', 'marker']
};

/** Поля для сопоставления: объявленные профилем + необходимые раскладке. */
function mappingFields(): ColumnMapping['field'][] {
  const profile = currentProfile();
  const declared = profile.columns.map((column) => column.field);
  const needed = LAYOUT_FIELDS[profile.layout] ?? [];
  return [...declared, ...needed.filter((field) => !declared.includes(field))];
}

/** Текущее сопоставление: ручное/шаблонное, иначе из профиля. */
function effectiveColumns(): ColumnMapping[] {
  return state.columnOverrides ?? currentForm().profile.columns.map((column) => ({ ...column }));
}

/**
 * Сопоставление колонок и шаблоны (ТЗ VOR-002, VOR-004).
 *
 * Показывается после загрузки файла: видно, какая колонка листа взята для какого поля, можно
 * поправить вручную и сохранить как шаблон. Перед применением шаблона видно, что изменилось
 * в новом файле, — «съехало», «пропало» или «добавилось», а не молчаливое совпадение не туда.
 */
function columnsHtml(): string {
  if (state.sheets.length === 0) return '';
  const profile = currentProfile();
  const columns = effectiveColumns();
  const width = state.headerLabels.length;

  const columnOptions = (selected: number): string => {
    const options = [`<option value="0"${selected === 0 ? ' selected' : ''}>не использовать</option>`];
    for (let index = 0; index < width; index += 1) {
      const label = state.headerLabels[index] || '—';
      options.push(`<option value="${index + 1}"${selected === index + 1 ? ' selected' : ''}>${escapeHtml(`${index + 1}. ${label}`)}</option>`);
    }
    return options.join('');
  };

  const rows = mappingFields().map((field) => {
    const current = columns.find((column) => column.field === field)?.columnIndex ?? 0;
    const fromProfile = currentForm().profile.columns.find((column) => column.field === field);
    return `
    <li class="py-1 border-b border-surface flex flex-wrap items-center gap-2">
      <span class="text-rbi-caption text-muted w-40">${escapeHtml(FIELD_TITLES[field] ?? field)}</span>
      <select data-pf-column="${escapeHtml(field)}"
        class="bg-surface border border-surface text-ink text-rbi-caption rounded-lg px-2 py-1 max-w-[260px]">
        ${columnOptions(current)}
      </select>
      <span class="text-rbi-caption ${fromProfile ? 'text-muted' : 'text-brand'}">
        ${fromProfile ? `в профиле: «${escapeHtml(fromProfile.headerText)}»` : 'профиль эту колонку не описывает — задайте вручную'}
      </span>
    </li>`;
  }).join('');

  const templateOptions = state.templates.map((template) => `
    <option value="${escapeHtml(template.id)}"${template.id === state.templateId ? ' selected' : ''}>
      ${escapeHtml(`${template.name} · v${template.version}${template.usedCount ? ` · применений: ${template.usedCount}` : ''}`)}
    </option>`).join('');

  const warning = state.templateWarning;
  const warningHtml = warning && !warning.same
    ? `<div class="text-rbi-caption text-danger mt-2">
        Колонки в файле отличаются от шаблона:
        ${warning.moved.map((entry) => `«${escapeHtml(entry.headerText)}» переехала с ${entry.from} на ${entry.to}`).join('; ')}
        ${warning.missing.map((entry) => `«${escapeHtml(entry.headerText)}» не найдена`).join('; ')}
        ${warning.changed.map((entry) => `на месте «${escapeHtml(entry.headerText)}» теперь «${escapeHtml(entry.found)}»`).join('; ')}
        ${warning.added.length ? `· новых колонок: ${warning.added.length}` : ''}
      </div>`
    : '';

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Колонки и шаблон
        <span class="text-rbi-caption text-muted font-normal">
          · ${state.fileKind === 'csv' ? 'CSV' : 'XLSX'}${state.fileNote ? `, ${escapeHtml(state.fileNote)}` : ''}
        </span></div>
      <div class="flex flex-wrap items-end gap-2 mb-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Шапка: строка</span>
          <input id="pf-header-row" type="number" min="1" value="${state.headerRowUsed || currentProfile().headerRow}"
            class="w-24 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <span class="text-rbi-caption text-muted">Та же строка используется при разборе — колонки и строки не разъезжаются.</span>
      </div>
      ${state.headerNote ? `<div class="text-rbi-caption text-brand mb-2">${escapeHtml(state.headerNote)}</div>` : ''}
      <ul class="list-none p-0 m-0 mb-2">${rows}</ul>
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Шаблон</span>
          <select id="pf-template" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5 min-w-[220px]">
            <option value="">— не выбран —</option>${templateOptions}
          </select>
        </label>
        <button type="button" id="pf-template-apply" ${state.templateId ? '' : 'disabled'}
          class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl disabled:opacity-50">Применить</button>
        ${warning && (warning.moved.length || warning.missing.length || warning.changed.length)
          ? `<button type="button" id="pf-template-fix"
              class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl">Поправить по заголовкам</button>` : ''}
        <button type="button" id="pf-template-delete" ${state.templateId ? '' : 'disabled'}
          class="text-rbi-body font-bold text-muted border border-surface px-3 py-1.5 rounded-xl disabled:opacity-50">Удалить шаблон</button>
        <label class="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span class="text-rbi-label text-muted">Сохранить как шаблон</span>
          <input id="pf-template-name" type="text" value="${escapeHtml(state.templateName)}"
            placeholder="например: ФКП, плоский список"
            class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <button type="button" id="pf-template-save"
          class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl">Сохранить шаблон</button>
        ${state.columnOverrides ? `<button type="button" id="pf-columns-reset"
          class="text-rbi-caption font-bold text-muted border border-surface px-3 py-1.5 rounded-xl">Вернуть колонки профиля</button>` : ''}
      </div>
      ${warningHtml}
      <div class="text-rbi-caption text-muted mt-2">
        Шаблон запоминает, какая колонка листа берётся для какого поля, и версию. Повторное сохранение
        под тем же именем поднимает версию, а не создаёт второй шаблон.
      </div>
    </div>`;
}

function render(): void {
  const container = root();
  if (!container) return;

  const form = currentForm();
  const profileOptions = FORM_PROFILES.map((item) => `
    <option value="${escapeHtml(item.id)}"${item.id === form.id ? ' selected' : ''}>${escapeHtml(item.title)}</option>`).join('');
  const sheetOptions = state.sheets.map((sheet) => `
    <option value="${escapeHtml(sheet.name)}"${sheet.name === state.sheetName ? ' selected' : ''}>${escapeHtml(sheet.name)}</option>`).join('');

  const canParse = state.sheets.length > 0 && !state.busy;
  const canSave = !!state.analysis && state.analysis.rows.length > 0 && !!state.objectId && !state.busy;

  container.innerHTML = `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-2">Загрузка формы заказчика (XLSX)</div>
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Профиль формы</span>
          <select id="pf-profile" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5">${profileOptions}</select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Файл</span>
          <input id="pf-file" type="file" accept=".xlsx,.xls" class="text-rbi-body text-ink" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Лист</span>
          <select id="pf-sheet" class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5"
            ${state.sheets.length ? '' : 'disabled'}>${sheetOptions || '<option value="">—</option>'}</select>
        </label>
        <button type="button" id="pf-parse" ${canParse ? '' : 'disabled'}
          class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl disabled:opacity-50">Разобрать</button>
        <button type="button" id="pf-save" ${canSave ? '' : 'disabled'}
          class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl disabled:opacity-50">Сохранить в объект</button>
      </div>
      <div class="text-rbi-caption text-muted mt-2">
        ${state.filename ? `Файл: ${escapeHtml(state.filename)} · листов: ${state.sheets.length}` : 'Файл не выбран.'}
        ${state.busy ? ' · идёт разбор…' : ''}
        ${state.issuesTotal ? ` · строк в протоколе проблем: ${state.issuesTotal}` : ''}
      </div>
      ${state.progress ? `
        <div class="mt-2">
          <div class="w-full bg-surface border border-surface rounded-full h-2 overflow-hidden">
            <div class="bg-brand h-2" style="width:${Math.min(100, Math.round((state.progress.done / Math.max(1, state.progress.total)) * 100))}%"></div>
          </div>
          <div class="flex items-center justify-between gap-2 mt-1">
            <span class="text-rbi-caption text-muted">${escapeHtml(state.progress.message)}</span>
            <button type="button" id="pf-cancel"
              class="text-rbi-caption font-bold text-danger border border-surface px-2 py-1 rounded-lg">Отменить</button>
          </div>
        </div>` : ''}
      ${state.cancelled ? `<div class="text-rbi-caption text-danger mt-1">
        Разбор отменён — это неполные данные. Нажмите «Разобрать», чтобы пройти файл целиком.</div>` : ''}
      ${state.guardWarnings.length ? `<div class="text-rbi-caption text-muted mt-1">
        ${state.guardWarnings.map((warning) => escapeHtml(warning)).join('<br>')}</div>` : ''}
      ${state.note ? `<div class="text-rbi-caption text-brand mt-1">${escapeHtml(state.note)}</div>` : ''}
      ${state.error ? `<div class="text-rbi-body text-danger mt-1">${escapeHtml(state.error)}</div>` : ''}
    </div>
    ${columnsHtml()}
    ${statsHtml()}
    ${unresolvedHtml()}
    ${confirmHtml()}
    ${totalsHtml()}
    ${tableHtml()}
    ${issuesHtml()}
    ${savedHtml()}
  `;

  bind();
}

/**
 * Сопоставление колонок и шаблоны: правка колонки, применение шаблона, сохранение и удаление.
 * Проверка изменений показывается до применения — это и есть «предварительная проверка»
 * из ТЗ VOR-004.
 */
function bindColumns(container: HTMLElement): void {
  container.querySelectorAll<HTMLSelectElement>('[data-pf-column]').forEach((select) => {
    select.addEventListener('change', () => {
      const field = select.getAttribute('data-pf-column') ?? '';
      const base = effectiveColumns();
      const index = Number(select.value) || 0;
      const existing = base.find((column) => column.field === field);
      const headerText = index > 0 ? (state.headerLabels[index - 1] || `Колонка ${index}`) : '';
      const next = existing
        ? base.map((column) => (column.field === field ? { ...column, columnIndex: index, headerText } : column))
        : [...base, { field: field as ColumnMapping['field'], columnIndex: index, headerText }];
      // Колонка «не использовать» убирает сопоставление, а не подставляет нулевой индекс.
      state.columnOverrides = next.filter((column) => column.columnIndex > 0);
      state.analysis = null;
      state.note = `Колонка «${FIELD_TITLES[field] ?? field}» → ${index > 0 ? `«${headerText}»` : 'не используется'}.`;
      render();
    });
  });

  container.querySelector<HTMLInputElement>('#pf-header-row')?.addEventListener('change', (event) => {
    const value = Number((event.target as HTMLInputElement).value);
    state.headerRowUsed = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    state.analysis = null;
    state.note = `Шапка: строка ${state.headerRowUsed}.`;
    refreshHeaderLabels();
    render();
  });

  const templateSelect = container.querySelector<HTMLSelectElement>('#pf-template');
  templateSelect?.addEventListener('change', () => {
    state.templateId = templateSelect.value;
    const template = state.templates.find((item) => item.id === state.templateId) ?? null;
    state.templateWarning = template ? templateDiff(template, state.headerLabels) : null;
    state.templateName = template?.name ?? state.templateName;
    state.note = template ? `Шаблон «${template.name}» версии ${template.version} выбран.` : '';
    render();
  });

  container.querySelector<HTMLButtonElement>('#pf-template-apply')?.addEventListener('click', () => {
    void runApplyTemplate(false);
  });
  container.querySelector<HTMLButtonElement>('#pf-template-fix')?.addEventListener('click', () => {
    void runApplyTemplate(true);
  });
  container.querySelector<HTMLButtonElement>('#pf-template-save')?.addEventListener('click', () => {
    void runSaveTemplate();
  });
  container.querySelector<HTMLButtonElement>('#pf-template-delete')?.addEventListener('click', () => {
    void runDeleteTemplate();
  });
  container.querySelector<HTMLButtonElement>('#pf-columns-reset')?.addEventListener('click', () => {
    state.columnOverrides = null;
    state.templateWarning = null;
    state.analysis = null;
    refreshHeaderLabels();
    state.note = 'Колонки вернулись к профилю из кода.';
    render();
  });
}

async function runApplyTemplate(fixByHeaders: boolean): Promise<void> {
  const template = state.templates.find((item) => item.id === state.templateId);
  if (!template) return;
  const columns = fixByHeaders ? repointTemplate(template, state.headerLabels) : template.columns;
  if (columns.length === 0) {
    state.error = 'В шаблоне не осталось ни одной колонки — проверьте сопоставление вручную.';
    render();
    return;
  }
  state.columnOverrides = columns.map((column) => ({ ...column }));
  state.analysis = null;
  state.error = '';
  refreshHeaderLabels();
  await markTemplateUsed(template.id);
  await loadTemplates();
  const warning = templateDiff(template, state.headerLabels);
  state.templateWarning = warning;
  state.note = warning.same
    ? `Шаблон «${template.name}» применён: колонки совпали с файлом.`
    : `Шаблон «${template.name}» применён, но колонки отличаются — проверьте список ниже.`;
  render();
}

async function runSaveTemplate(): Promise<void> {
  const nameInput = root()?.querySelector<HTMLInputElement>('#pf-template-name');
  const name = nameInput?.value ?? state.templateName;
  const columns = effectiveColumns();
  const result = await saveTemplate({
    name,
    formId: state.profileId,
    profileId: currentProfile().id,
    sheetName: state.sheetName,
    columns,
    headerSignature: state.headerLabels
  });
  if (!result.ok) {
    state.error = result.error ?? 'Не удалось сохранить шаблон';
  } else {
    state.templateId = result.record?.id ?? '';
    state.templateName = result.record?.name ?? name;
    state.error = '';
    state.note = `Шаблон «${result.record?.name}» сохранён, версия ${result.record?.version}.`;
  }
  await loadTemplates();
  render();
}

async function runDeleteTemplate(): Promise<void> {
  const template = state.templates.find((item) => item.id === state.templateId);
  if (!template) return;
  const result = await removeTemplate(template.id);
  state.templateId = '';
  state.templateWarning = null;
  state.note = result.ok
    ? `Шаблон «${template.name}» удалён.`
    : (result.error ?? 'Не удалось удалить шаблон');
  await loadTemplates();
  render();
}

function bind(): void {
  const container = root();
  if (!container) return;

  bindColumns(container);

  // Подтверждение автоматических сопоставлений: связка становится решением ПТО.
  container.querySelectorAll<HTMLButtonElement>('[data-pf-confirm]').forEach((button) => {
    button.addEventListener('click', () => {
      void runConfirm([{
        raw: button.getAttribute('data-pf-confirm') ?? '',
        workId: button.getAttribute('data-pf-confirm-work') ?? ''
      }]);
    });
  });
  container.querySelector<HTMLButtonElement>('#pf-confirm-all')?.addEventListener('click', () => {
    void runConfirm(state.autoMatched.map((item) => ({ raw: item.raw, workId: item.workId })));
  });

  // Ручное сопоставление: выбираем вид работ и запоминаем связку.
  container.querySelectorAll<HTMLButtonElement>('[data-pf-link-go]').forEach((button) => {
    button.addEventListener('click', () => {
      void runLink(button.getAttribute('data-pf-link-go') ?? '');
    });
  });

  // Сортировка по нажатию на заголовок — и по позициям, и по итогам.
  bindSortableTable(container.querySelector<HTMLElement>('#pf-positions-table'), state.positionsSort, (next) => {
    state.positionsSort = next;
    render();
  });
  bindSortableTable(container.querySelector<HTMLElement>('#pf-totals-table'), state.totalsSort, (next) => {
    state.totalsSort = next;
    render();
  });

  const profileSelect = container.querySelector<HTMLSelectElement>('#pf-profile');
  profileSelect?.addEventListener('change', () => {
    state.profileId = profileSelect.value;
    state.analysis = null;
    state.columnOverrides = null;
    state.templateWarning = null;
    state.headerRowUsed = 0;
    state.note = '';
    state.error = '';
    pickDefaultSheet();
    render();
  });

  const fileInput = container.querySelector<HTMLInputElement>('#pf-file');
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void readFile(file);
  });

  const sheetSelect = container.querySelector<HTMLSelectElement>('#pf-sheet');
  sheetSelect?.addEventListener('change', () => {
    state.sheetName = sheetSelect.value;
    state.analysis = null;
    state.note = '';
    state.headerRowUsed = 0;
    refreshHeaderLabels();
    render();
  });

  container.querySelector<HTMLButtonElement>('#pf-parse')?.addEventListener('click', () => {
    void runParse();
  });

  container.querySelector<HTMLButtonElement>('#pf-cancel')?.addEventListener('click', () => {
    cancelRequested = true;
    state.note = 'Останавливаю разбор — дождусь конца текущей порции…';
    render();
  });

  container.querySelector<HTMLButtonElement>('#pf-save')?.addEventListener('click', () => {
    void runSave();
  });

  container.querySelectorAll<HTMLButtonElement>('[data-pf-delete]').forEach((button) => {
    button.addEventListener('click', () => {
      const importId = button.getAttribute('data-pf-delete');
      if (importId) void runDelete(importId);
    });
  });
}

function pickDefaultSheet(): void {
  const sheet = pickSheet(state.sheets, currentProfile());
  state.sheetName = sheet?.name ?? '';
  refreshHeaderLabels();
}

async function readFile(file: File): Promise<void> {
  state.busy = true;
  state.error = '';
  state.note = '';
  state.analysis = null;
  render();
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Защита файла (ТЗ §11): размер, архив-бомба, макросы, формат.
    const verdict = inspectFile(file.name, bytes);
    state.guardWarnings = [...verdict.warnings];
    if (!verdict.ok) {
      state.error = verdict.error ?? 'Файл не принят';
      state.sheets = [];
      state.sheetName = '';
      state.filename = '';
      state.analysis = null;
      state.busy = false;
      render();
      return;
    }
    // Формулы: значения берутся сохранённые, они могли устареть — об этом надо сказать.
    if (verdict.kind !== 'csv' && bytes.length < 8 * 1024 * 1024) {
      const formulas = countFormulaCells(bytes);
      if (formulas.formulas > 0) {
        state.guardWarnings.push(
          `В книге ${formulas.formulas} ячеек с формулами (листы: ${formulas.sheets.join(', ')}): `
          + 'берутся сохранённые значения — если файл давно не открывали, числа могли устареть.'
        );
      }
    }
    const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
    if (isCsv) {
      const csv = readCsvSheet(buffer, file.name);
      state.sheets = [csv.sheet];
      state.fileKind = 'csv';
      // О перекодировке и разделителе говорим прямо: иначе «съехавшие» колонки выглядят загадкой.
      state.fileNote = `CSV, разделитель «${csv.delimiter === '\t' ? 'табуляция' : csv.delimiter}»`
        + (csv.transcoded ? ', файл был в windows-1251 — перекодирован' : ', кодировка UTF-8');
    } else {
      state.sheets = readXlsxSheets(buffer);
      state.fileKind = 'xlsx';
      state.fileNote = '';
    }
    state.filename = file.name;
    state.columnOverrides = null;
    state.templateWarning = null;
    state.headerRowUsed = 0;
    state.cancelled = false;
    state.progress = null;
    state.issuesTotal = 0;
    pickDefaultSheet();
    state.note = (isCsv
      ? 'Лист CSV загружен.'
      : `Листов в файле: ${state.sheets.length}.`)
      + ` Профиль «${currentForm().title}» возьмёт лист «${state.sheetName}».`;
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.sheets = [];
    state.sheetName = '';
    state.filename = '';
  }
  state.busy = false;
  render();
}

/** Отмена разбора: кнопка ставит флаг, порция разбора его видит. */
let cancelRequested = false;

async function runParse(): Promise<void> {
  const form = currentForm();
  state.busy = true;
  state.error = '';
  state.note = '';
  state.cancelled = false;
  state.progress = null;
  cancelRequested = false;
  render();
  try {
    // Раскладка с учётом шаблона и ручного сопоставления: и строки, и смысл колонок берутся
    // из одного профиля. Иначе получается худший вид ошибки — колонки «сопоставлены», а разбор
    // читает по старым индексам и молча выдаёт мусор.
    const activeProfile = currentProfile();
    const rows = rawRowsFromSheets(state.sheets, activeProfile, state.sheetName);
    // Справочник и связки берём из данных, встроенные синонимы оставляем запасными:
    // так решение ПТО сильнее зашитого правила, но выверенные формулировки не теряются.
    const catalog = await buildCatalog();
    const fromCatalog = catalogToNormalizeContext(catalog, WORK_ALIASES);
    const context = {
      ...normalizeContextOf({ ...form, profile: activeProfile }),
      works: fromCatalog.works,
      aliases: fromCatalog.aliases
    };
    const run = await analyzeAsync(rows, form, context, {
      chunkSize: 1_000,
      isCancelled: () => cancelRequested,
      onProgress: (progress) => {
        // Перерисовываем не каждую порцию, иначе панель мигает: сообщение важнее частоты.
        state.progress = { done: progress.done, total: progress.total, message: progress.message };
        render();
      }
    });

    state.analysis = run.result;
    state.workOptions = catalog.works.map((work) => ({ id: work.id, name: work.name, groupName: work.groupName || '—' }));
    state.canManageWorks = canManageWorks();
    state.autoMatched = autoMatchedWorks(run.result.rows, await listAliases());
    state.cancelled = run.cancelled;
    state.issuesTotal = run.result.issues.length;
    state.progress = null;
    state.note = run.cancelled
      ? `Разбор отменён: разобрано ${run.processed} строк из ${run.total}. Данные неполные — сохранять их в объект нельзя.`
      : `Разобрано строк: ${state.analysis.stats.rows} за ${(run.elapsedMs / 1000).toFixed(1)} с.`
        + (fromCatalog.aliases.length > WORK_ALIASES.length
          ? ` Связок ПТО учтено: ${fromCatalog.aliases.length - WORK_ALIASES.length}.` : '');
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  state.busy = false;
  render();
}

/**
 * Связать формулировку из формы с видом работ справочника.
 *
 * После сохранения связки разбор повторяется тем же кодом, что и при импорте: это и есть
 * доказательство, что «следующие импорты совпадут сами» — а не отдельная логика для вида.
 */
async function runLink(raw: string): Promise<void> {
  const select = root()?.querySelector<HTMLSelectElement>(`select[data-pf-link-raw="${raw.replace(/"/g, '\\"')}"]`);
  const workId = select?.value ?? '';
  if (!workId) {
    state.error = 'Выберите вид работ из справочника';
    render();
    return;
  }

  state.busy = true;
  state.error = '';
  state.note = '';
  render();
  try {
    const saved = await saveAlias(raw, workId);
    if (!saved.ok) {
      state.error = saved.error ?? 'Не удалось сохранить связку';
    } else {
      const work = state.workOptions.find((item) => item.id === workId);
      state.busy = false;
      await runParse();
      // Разбор переписывает пояснение своим («разобрано строк»), поэтому подтверждение связки
      // ставим после него — иначе человек не видит, что связал формулировку.
      state.note = `Связка сохранена: «${raw}» → «${work?.name ?? workId}». ${state.note}`.trim();
      render();
      return;
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  state.busy = false;
  render();
}

/** Подтвердить одно или несколько автоматических сопоставлений. */
async function runConfirm(items: { raw: string; workId: string }[]): Promise<void> {
  const active = items.filter((item) => item.raw && item.workId);
  if (active.length === 0) return;
  state.error = '';
  state.note = '';
  for (const item of active) {
    const saved = await saveAlias(item.raw, item.workId, 'pto');
    if (!saved.ok) {
      state.error = saved.error ?? 'Не удалось подтвердить связку';
      render();
      return;
    }
  }
  state.busy = false;
  await runParse();
  state.note = `Подтверждено связок: ${active.length}. Теперь это решение ПТО, а не совпадение программы.`;
  render();
}

async function runSave(): Promise<void> {
  const analysis = state.analysis;
  if (!analysis || !state.objectId) return;
  state.busy = true;
  state.error = '';
  render();
  try {
    const result = await saveImport({
      objectId: state.objectId,
      filename: state.filename,
      profileId: currentForm().id,
      profileTitle: currentForm().title,
      rows: analysis.rows,
      stats: analysis.stats
    });
    state.note = `Сохранено позиций: ${result.saved}.`;
    await loadSaved();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  state.busy = false;
  render();
}

async function runDelete(importId: string): Promise<void> {
  state.busy = true;
  state.error = '';
  render();
  try {
    const result = await deleteImport(importId);
    state.note = `Импорт удалён вместе с позициями: ${result.removedRows}.`;
    await loadSaved();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  state.busy = false;
  render();
}
