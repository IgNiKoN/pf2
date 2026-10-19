/**
 * Канонические типы модуля plan-fact (ПФ-2).
 *
 * Подмножество контрактов Platform 2.0, перенесённое в RBI без изменений смысла:
 * единицы, виды работ, раскладки форм, нормализованные позиции и протокол проблем.
 * То, что касается лицензий, тенантов и конвейера команд ядра Platform 2.0, сюда
 * не переносится (ADR-015): права и доступ берутся из ядра RBI.
 */

export type Uuid = string;
export type IsoDate = string;
/** Число как десятичная строка. float в домене не используется. */
export type Decimal = string;

// ──────────────────────────────── единицы ────────────────────────────────────

export type UnitCode = 'm2' | 'm3' | 'pcs' | 'kg' | 't' | 'l' | 'lm' | 'set' | 'complex';

export interface Unit {
  code: UnitCode;
  title: string;
  /** Варианты написания в формах заказчиков: 'кв.м', 'S, м2', 'м.пог.'. */
  aliases?: string[];
}

// ───────────────────────────── виды работ ────────────────────────────────────

export interface WorkCatalogItem {
  id: string;
  code: string;
  title: string;
  unit: UnitCode;
  group: string | null;
  stage: string | null;
}

export interface WorkAlias {
  alias: string;
  aliasNormalized: string;
  workId: string;
}

// ───────────────────────────── импорт форм ───────────────────────────────────

/** Раскладки, реально встречающиеся в формах заказчиков. */
export type LayoutKind =
  | 'outline_markers'
  | 'measurement_matrix'
  | 'outline_location_rows'
  | 'norms_schedule'
  | 'unknown';

export type CanonicalField =
  | 'code' | 'name' | 'unit' | 'quantity' | 'norm_consumption'
  | 'norm_output' | 'norm_output_unit' | 'man_days' | 'crew'
  | 'section_floor' | 'price' | 'total' | 'marker' | 'location_label';

export interface ColumnMapping {
  field: CanonicalField;
  /** 1-based индекс колонки в листе. */
  columnIndex: number;
  headerText: string;
}

/** Колонка-работа обмерной матрицы: заголовок и единица из шапки, значение — из строки. */
export interface WorkColumn {
  columnIndex: number;
  headerText: string;
  unitRaw?: string;
}

export interface LocationParserRule {
  id: string;
  pattern: string;
  target: 'section' | 'floor' | 'unit' | 'room' | 'zone';
  group?: number;
}

export interface ImportProfile {
  id: string;
  name: string;
  layout: LayoutKind;
  headerRow: number;
  headerRows: number;
  columns: ColumnMapping[];
  locationRules: LocationParserRule[];
  works?: WorkColumn[];
  sheetPattern?: string;
}

/** Ячейка листа как её отдаёт читатель (SheetJS). */
export type CellValue = string | number | boolean | null;

/** Сырая строка листа: адрес в файле + накопленный контекст локации. */
export interface RawRow {
  sheet: string;
  rowNumber: number;
  cells: CellValue[];
  /** Тексты строк-локаций выше по листу: ['Корпус 1','Секция 1','Этаж 2']. */
  locationContext: string[];
  /** Маркер строки материала раскладки outline-Г/Р/М. */
  marker?: string | null;
}

export interface NormalizeContext {
  units: Unit[];
  works: WorkCatalogItem[];
  aliases: WorkAlias[];
  columns: ColumnMapping[];
  locationRules: LocationParserRule[];
}

/** Адрес значения в исходном файле — доказательство происхождения (правило проекта). */
export interface SourceFragment {
  sheet: string;
  row: number;
  column: number | null;
  rawValue: string | null;
}

export interface NormalizedItem {
  rowNumber: number;
  /** Разобранный путь локации: ['Корпус 1','Секция 1','Этаж 2','Кв. 45']. */
  locationPath: string[];
  workRaw: string;
  workId: string | null;
  workMatch: 'auto' | 'manual' | 'unresolved';
  unitRaw: string;
  unit: UnitCode | null;
  quantity: Decimal | null;
  fragment: SourceFragment;
  /**
   * Роли частей адреса, когда они взяты из сопоставленных колонок: позиционный разбор
   * («первая часть — секция, вторая — этаж») тут не работает и выдал бы этаж за помещение.
   */
  locationRoles?: { section?: string; floor?: string; place?: string };
}

export interface NormalizationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  fragment: SourceFragment;
}

export interface NormalizationResult {
  layout: LayoutKind;
  items: NormalizedItem[];
  issues: NormalizationIssue[];
  stats: {
    rowsTotal: number;
    imported: number;
    unresolvedWorks: number;
    unresolvedLocations: number;
    materialsSkipped: number;
  };
}

/** Лист файла: имя + строки. */
export interface XlsxSheet {
  name: string;
  rows: CellValue[][];
}

// ─────────────────────── результат разбора для интерфейса ────────────────────

/** Позиция ВОР: то, что показывается в таблице и сохраняется в объект. */
export interface WorRow {
  section: string;
  floor: string;
  place: string;
  workRaw: string;
  workId: string | null;
  workMatch: 'auto' | 'manual' | 'unresolved';
  matchReason: string;
  unitRaw: string;
  unit: UnitCode | null;
  quantity: Decimal;
  fragment: SourceFragment;
}

export interface ImportStats {
  sheet: string;
  rows: number;
  items: number;
  matched: number;
  matchedPercent: number;
  materialsSkipped: number;
  unresolvedWorks: number;
  unresolvedLocations: number;
  /** Позиции, которые человек должен посмотреть: вид работ не найден в справочнике. */
  needsDecision: number;
  issues: { code: string; message: string; row: number }[];
}
