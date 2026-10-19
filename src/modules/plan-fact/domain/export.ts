/**
 * Выгрузка XLSX по ТЗ VOR-034: полная ВОР, свод по этажам и видам работ, замечания.
 *
 * Сборка листов — чистая функция (тестируется без Excel и без браузера), запись файла —
 * тонкая обёртка над SheetJS, который уже загружен приложением для чтения форм.
 *
 * Честность важнее красоты файла: в листе «О выгрузке» прямо сказано, какие контуры объёмов
 * в выгрузке есть, а каких ещё нет (ТЗ VOR-016 — пять контуров: RD, договор, предложено,
 * утверждено, факт). Иначе файл выглядит как полная выгрузка по ТЗ, которой он не является.
 */

import { buildPlanFactSummary, type FactRecord } from './fact.ts';
import type { PlanFactWorRecord } from './store.ts';

export interface ExportSheet {
  name: string;
  rows: (string | number)[][];
}

export interface ExportInput {
  objectName: string;
  worRows: PlanFactWorRecord[];
  factRows: FactRecord[];
  generatedAt?: string;
}

export interface ExportResult {
  filename: string;
  sheets: ExportSheet[];
  stats: { worRows: number; factRows: number; issues: number; floors: number; works: number };
}

const UNRESOLVED_MARK: Record<string, string> = {
  auto: 'сопоставлено автоматически',
  manual: 'сопоставлено вручную',
  unresolved: 'не сопоставлено'
};

/**
 * Ячейка для Excel: точное число остаётся числом (чтобы в Excel работали суммы),
 * а значение, которое нельзя представить точно, едет текстом — округлять объёмы нельзя.
 */
export function exportCell(value: string): string | number {
  const text = String(value ?? '');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  const asNumber = Number(text);
  if (!Number.isFinite(asNumber)) return text;
  return String(asNumber) === text ? asNumber : text;
}

function sanitizeFileName(name: string): string {
  return String(name || 'объект').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Лист «ВОР»: каждая позиция с местом, объёмом, фактом, отклонением и происхождением. */
function worSheet(input: ExportInput, summary: ReturnType<typeof buildPlanFactSummary>): ExportSheet {
  const header = [
    'Объект', 'Секция', 'Этаж', 'Помещение', 'Работа (как в форме)', 'Работа (справочник)',
    'Код работы', 'ЕИ', 'План (форма заказчика)', 'Факт', 'Отклонение', 'Выполнено, %',
    'Сопоставление', 'Лист', 'Строка', 'Колонка'
  ];

  const factsByKey = new Map<string, { fact: string; deviation: string; percent: string | null; workRaw: string }>();
  for (const row of summary.rows) {
    factsByKey.set(`${row.floor}|${row.workKey}`, {
      fact: row.fact, deviation: row.deviation, percent: row.percent, workRaw: row.workRaw
    });
  }

  const rows: (string | number)[][] = [header];
  for (const record of input.worRows) {
    const key = `${record.floor}|${record.workId ?? `raw:${record.workRaw}`}`;
    const aggregate = factsByKey.get(key);
    // Факт по позиции не размазываем: в своде он на пару «этаж + работа», здесь показываем
    // именно сводное значение и помечаем это в листе «О выгрузке».
    rows.push([
      input.objectName,
      record.section,
      record.floor,
      record.place,
      record.workRaw,
      aggregate ? aggregate.workRaw : record.workRaw,
      record.workId ?? '',
      record.unit || record.unitRaw || '',
      exportCell(record.quantity),
      aggregate ? exportCell(aggregate.fact) : '',
      aggregate ? exportCell(aggregate.deviation) : '',
      aggregate && aggregate.percent !== null ? aggregate.percent : '',
      UNRESOLVED_MARK[record.workMatch] ?? record.workMatch ?? '',
      record.sheet ?? '',
      Number(record.rowNumber ?? 0),
      record.column ?? ''
    ]);
  }
  return { name: 'ВОР', rows };
}

/** Лист «Свод по этажам»: план, факт, отклонение и процент по паре «этаж + работа». */
function summarySheet(summary: ReturnType<typeof buildPlanFactSummary>): ExportSheet {
  const rows: (string | number)[][] = [
    ['Этаж', 'Работа', 'ЕИ', 'План', 'Факт', 'Отклонение', 'Выполнено, %']
  ];
  for (const row of summary.rows) {
    rows.push([
      row.floor, row.workRaw, row.unit, exportCell(row.plan), exportCell(row.fact), exportCell(row.deviation),
      row.percent === null ? '' : row.percent
    ]);
  }
  rows.push([
    'ИТОГО', '', '', exportCell(summary.totalPlan), exportCell(summary.totalFact), exportCell(summary.totalDeviation),
    summary.totalPercent === null ? '' : summary.totalPercent
  ]);
  return { name: 'Свод по этажам', rows };
}

/**
 * Лист «Замечания»: то, что мешает считать ВОР проверенной.
 * Сейчас это не разрешённые виды работ, неизвестные единицы и отрицательные объёмы.
 */
function issuesSheet(input: ExportInput): { sheet: ExportSheet; count: number } {
  const rows: (string | number)[][] = [
    ['Тип', 'Работа (как в форме)', 'ЕИ', 'Объём', 'Этаж', 'Помещение', 'Лист', 'Строка', 'Что сделать']
  ];
  let count = 0;

  for (const record of input.worRows) {
    const problems: [string, string][] = [];
    if (!record.workId || record.workMatch === 'unresolved') {
      problems.push(['Вид работ не сопоставлен', 'Подтвердить связку с справочником работ (синоним или новый вид)']);
    }
    if (!record.unit) {
      problems.push(['Единица не распознана', `Указать единицу для «${record.unitRaw || '—'}»`]);
    }
    if (String(record.quantity).startsWith('-')) {
      problems.push(['Отрицательный объём', 'Оформить отдельной корректировкой, а не минусом в ВОР']);
    }
    for (const [type, action] of problems) {
      count += 1;
      rows.push([
        type, record.workRaw, record.unit || record.unitRaw || '', exportCell(record.quantity),
        record.floor, record.place, record.sheet ?? '', Number(record.rowNumber ?? 0), action
      ]);
    }
  }
  return { sheet: { name: 'Замечания', rows }, count };
}

/** Лист «О выгрузке»: что в файле есть и чего в нём ещё нет (контуры ТЗ VOR-016). */
function aboutSheet(input: ExportInput, stats: ExportResult['stats']): ExportSheet {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const rows: (string | number)[][] = [
    ['Выгрузка ВОР', ''],
    ['Объект', input.objectName],
    ['Сформирована', generatedAt],
    ['Позиций ВОР', stats.worRows],
    ['Записей факта', stats.factRows],
    ['Замечаний', stats.issues],
    ['Этажей', stats.floors],
    ['Видов работ', stats.works],
    ['', ''],
    ['Контуры объёмов (ТЗ VOR-016)', 'Состояние в этой выгрузке'],
    ['План (форма заказчика)', 'есть'],
    ['Факт', 'есть'],
    ['RD', 'нет — контуры появятся блоком ТЗ-2'],
    ['Договор', 'нет — контуры появятся блоком ТЗ-2'],
    ['Предложено ПТО', 'нет — контуры появятся блоком ТЗ-2'],
    ['Утверждено РП', 'нет — контуры появятся блоком ТЗ-2'],
    ['Принято заказчиком', 'нет — вне рамки модуля (ADR-016)'],
    ['', ''],
    ['Правило округления', 'Проценты выполнения показаны двумя знаками без округления — выполнение никогда не завышается.'],
    ['', 'Объёмы и отклонения выгружаются точно, без округления.'],
    ['Важно', 'Факт в листе «ВОР» показан сводно по паре «этаж + работа» (как в своде план-факт),'],
    ['', 'а не разнесён по позициям: разнесение появится вместе с привязкой факта к позиции.']
  ];
  return { name: 'О выгрузке', rows };
}

export function buildWorExport(input: ExportInput): ExportResult {
  const summary = buildPlanFactSummary(input.worRows, input.factRows);
  const issues = issuesSheet(input);
  const works = new Set(input.worRows.map((row) => row.workId ?? `raw:${row.workRaw}`));
  const floors = new Set(input.worRows.map((row) => row.floor));

  const stats: ExportResult['stats'] = {
    worRows: input.worRows.length,
    factRows: input.factRows.length,
    issues: issues.count,
    floors: floors.size,
    works: works.size
  };

  const date = (input.generatedAt ?? new Date().toISOString()).slice(0, 10);
  return {
    filename: `ВОР ${sanitizeFileName(input.objectName)} ${date}.xlsx`,
    sheets: [worSheet(input, summary), summarySheet(summary), issues.sheet, aboutSheet(input, stats)],
    stats
  };
}

interface SheetJs {
  utils: {
    book_new: () => unknown;
    aoa_to_sheet: (rows: (string | number)[][]) => Record<string, unknown>;
    book_append_sheet: (workbook: unknown, sheet: unknown, name: string) => void;
  };
  writeFile: (workbook: unknown, filename: string) => void;
}

function sheetJs(): SheetJs | null {
  const lib = (window as unknown as { XLSX?: SheetJs }).XLSX;
  return lib && lib.utils && typeof lib.writeFile === 'function' ? lib : null;
}

/** Записать книгу файлом. Без SheetJS честно сообщаем об ошибке, а не делаем вид, что выгрузили. */
export function writeWorWorkbook(result: ExportResult): { ok: boolean; error?: string } {
  const lib = sheetJs();
  if (!lib) return { ok: false, error: 'Модуль выгрузки Excel не загружен — обновите страницу' };

  try {
    const workbook = lib.utils.book_new();
    for (const sheet of result.sheets) {
      const worksheet = lib.utils.aoa_to_sheet(sheet.rows);
      const widths = (sheet.rows[0] ?? []).map((_cell, index) => ({
        wch: Math.min(48, Math.max(10, ...sheet.rows.slice(0, 200).map((row) => String(row[index] ?? '').length + 2)))
      }));
      (worksheet as { '!cols'?: unknown })['!cols'] = widths;
      lib.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
    }
    lib.writeFile(workbook, result.filename);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function formatExportSummary(result: ExportResult): string {
  return `Выгружено: позиций ${result.stats.worRows}, замечаний ${result.stats.issues}, `
    + `этажей ${result.stats.floors}, видов работ ${result.stats.works}. Файл: ${result.filename}`;
}
