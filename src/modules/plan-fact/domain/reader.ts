/**
 * Reader форм заказчиков: лист XLSX → RawRow[].
 *
 * Перенесено из `platform-2-0/packages/normalizer/src/reader.ts` с одной заменой:
 * вместо зависимости `read-excel-file/universal` используется уже подключённый в RBI
 * `libs/xlsx.full.min.js` (SheetJS, глобальный `XLSX`). Логика раскладок не менялась:
 * чистый `buildRawRows` тестируется без файла, чтение файла — тонкая обёртка.
 *
 * Принцип: reader ничего не угадывает. Незнакомая раскладка не превращается в позиции —
 * читаются только те колонки, которые явно описаны в профиле формы.
 */

import type { CellValue, ImportProfile, RawRow, XlsxSheet } from './types.ts';

const EMPTY = '';

// ─────────────────────────── доступ к SheetJS ────────────────────────────────

interface SheetJsUtils {
  sheet_to_json: (
    sheet: unknown,
    options: { header: 1; raw: boolean; defval: null; blankrows: boolean }
  ) => unknown[][];
}

interface SheetJs {
  read: (data: ArrayBuffer, options: { type: 'array' }) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: SheetJsUtils;
}

function sheetJs(): SheetJs {
  const lib = (window as unknown as { XLSX?: SheetJs }).XLSX;
  if (!lib || typeof lib.read !== 'function') {
    throw new Error('SheetJS (libs/xlsx.full.min.js) не загружен — чтение XLSX невозможно');
  }
  return lib;
}

/** Ячейка SheetJS → каноническая ячейка модуля: даты строкой, всё непонятное — null. */
function toCell(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
}

/** Все листы файла: имя + строки. Пустой лист даёт пустой массив строк. */
export function readXlsxSheets(input: ArrayBuffer | Uint8Array): XlsxSheet[] {
  const lib = sheetJs();
  const buffer: ArrayBuffer = input instanceof Uint8Array
    ? (input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer)
    : input;
  const workbook = lib.read(buffer, { type: 'array' });
  return workbook.SheetNames.map((name) => {
    const raw = lib.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1, raw: true, defval: null, blankrows: true
    });
    return { name, rows: raw.map((row) => row.map(toCell)) };
  });
}

/**
 * Сколько в книге ячеек с формулами.
 *
 * Значения берутся **сохранённые**, а не пересчитанные: если файл давно не открывали в Excel,
 * число в ячейке может быть устаревшим. Поэтому о формулах надо сказать человеку, а не молчать.
 */
export function countFormulaCells(input: ArrayBuffer | Uint8Array): { formulas: number; sheets: string[] } {
  const lib = sheetJs();
  const buffer: ArrayBuffer = input instanceof Uint8Array
    ? (input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer)
    : input;
  // Типы SheetJS объявляют только `type`, хотя параметров разбора больше; формулы читаются
  // по умолчанию, поэтому здесь достаточно обычного вызова.
  const workbook = lib.read(buffer, { type: 'array' });
  let formulas = 0;
  const sheets: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name] as Record<string, { f?: string }> | undefined;
    if (!sheet) continue;
    let inSheet = 0;
    for (const key of Object.keys(sheet)) {
      if (key.startsWith('!')) continue;
      if (sheet[key] && typeof sheet[key].f === 'string') inSheet += 1;
    }
    if (inSheet > 0) sheets.push(name);
    formulas += inSheet;
  }
  return { formulas, sheets };
}

// ────────────────────────────── раскладки ────────────────────────────────────

/** Текст ячейки: пробелы схлопываются; пустое и булево остаются пустыми. */
export function text(value: unknown): string {
  if (value === null || value === undefined) return EMPTY;
  if (typeof value === 'boolean') return EMPTY;
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Индекс колонки канонического поля (1-based), иначе null. */
function columnIndex(profile: ImportProfile, field: string): number | null {
  const mapping = profile.columns.find((column) => column.field === field);
  return mapping && mapping.columnIndex >= 1 ? mapping.columnIndex : null;
}

/** Значение ячейки строки по индексу колонки (1-based). */
function cellAt(row: CellValue[], index: number | null): unknown {
  if (index === null) return null;
  return row[index - 1] ?? null;
}

/** Ячейка заполнена: пустая строка, null и ноль — не значение. */
function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return typeof value === 'number' ? value !== 0 : text(value) !== EMPTY;
}

/** Первая строка листа, с которой начинаются данные. */
function dataStartRow(profile: ImportProfile): number {
  return profile.headerRow + Math.max(1, profile.headerRows);
}

/** Строка (помещение) × колонка-работа разворачиваются в отдельную сырую строку. */
function matrixRows(sheet: string, profile: ImportProfile, records: CellValue[][]): RawRow[] {
  const sectionIndex = columnIndex(profile, 'section_floor');
  const rows: RawRow[] = [];

  for (const [offset, record] of records.entries()) {
    const rowNumber = dataStartRow(profile) + offset;
    const section = text(cellAt(record, sectionIndex));
    const floor = text(cellAt(record, columnIndex(profile, 'code')));
    const place = text(cellAt(record, columnIndex(profile, 'location_label')));

    for (const work of profile.works ?? []) {
      // Значение лежит в колонке-работе; колонка quantity — адрес значения в сырой строке.
      const quantityIndex = columnIndex(profile, 'quantity') ?? work.columnIndex;
      const quantity = (record[work.columnIndex - 1] ?? null) as CellValue;
      // Работа, которой в помещении нет, позицию не создаёт: пустая ячейка — это не ноль.
      if (quantity === null || quantity === '') continue;

      const cells: CellValue[] = [];
      const nameIndex = columnIndex(profile, 'name');
      if (nameIndex !== null) cells[nameIndex - 1] = work.headerText;
      const unitIndex = columnIndex(profile, 'unit');
      if (unitIndex !== null && work.unitRaw) cells[unitIndex - 1] = work.unitRaw;
      cells[quantityIndex - 1] = quantity;

      rows.push({
        sheet,
        rowNumber,
        cells,
        locationContext: [section, floor, place].filter((part) => part !== EMPTY),
        marker: null
      });
    }
  }
  return rows;
}

/**
 * Строки листа как есть. Строка-локация («Секция 1», «Этаж 3», «Корпус 7») накапливается
 * в контексте, строка материала (заполнена «Норма расхода») позицией не становится.
 */
function outlineRows(sheet: string, profile: ImportProfile, records: CellValue[][]): RawRow[] {
  const nameIndex = columnIndex(profile, 'name');
  const consumptionIndex = columnIndex(profile, 'norm_consumption');
  const rules = profile.locationRules.map((rule) => new RegExp(rule.pattern, 'i'));
  const context: string[] = [];
  const rows: RawRow[] = [];

  for (const [offset, record] of records.entries()) {
    const rowNumber = dataStartRow(profile) + offset;
    const name = text(cellAt(record, nameIndex));
    if (!name) continue;

    const isZone = (profile.works ?? []).some((work) => name.includes(work.headerText));
    if (rules.some((rule) => rule.test(name)) || isZone) {
      context.push(name);
      continue;
    }

    // Строка без единицы измерения и объёма позицией не является: в форме это заголовок
    // или пояснение, а не работа (в том числе строка-локация с неразобранным названием).
    if (!isFilled(cellAt(record, columnIndex(profile, 'unit'))) || !isFilled(cellAt(record, columnIndex(profile, 'quantity')))) {
      continue;
    }

    const normConsumption = text(cellAt(record, consumptionIndex));
    const material = normConsumption !== EMPTY && Number.isFinite(Number(normConsumption.replace(',', '.')));

    rows.push({
      sheet,
      rowNumber,
      cells: [...record],
      locationContext: [...context],
      marker: material ? 'М' : null
    });
  }
  return rows;
}

/**
 * Чистая функция раскладки: строки листа (как их отдаёт SheetJS) → RawRow[].
 * Тестируется без реального файла.
 */
export function buildRawRows(sheetCells: CellValue[][], profile: ImportProfile, sheetName?: string): RawRow[] {
  const sheet = sheetName ?? profile.name;
  const records = sheetCells.slice(dataStartRow(profile) - 1);
  if (profile.layout === 'measurement_matrix') return matrixRows(sheet, profile, records);
  return outlineRows(sheet, profile, records);
}

/** Выбирает лист по имени профиля, иначе первый подходящий по шаблону, иначе первый. */
export function pickSheet(sheets: XlsxSheet[], profile: ImportProfile): XlsxSheet | null {
  if (sheets.length === 0) return null;
  const byName = sheets.find((sheet) => sheet.name === profile.name);
  if (byName) return byName;
  if (profile.sheetPattern) {
    const re = new RegExp(profile.sheetPattern, 'i');
    const byPattern = sheets.find((sheet) => re.test(sheet.name));
    if (byPattern) return byPattern;
  }
  return sheets[0];
}

/** Файл (уже прочитанные листы) → сырые строки выбранного листа. */
export function rawRowsFromSheets(sheets: XlsxSheet[], profile: ImportProfile, sheetName?: string): RawRow[] {
  const sheet = sheetName
    ? sheets.find((item) => item.name === sheetName) ?? pickSheet(sheets, profile)
    : pickSheet(sheets, profile);
  if (!sheet) return [];
  return buildRawRows(sheet.rows, profile, sheet.name);
}
