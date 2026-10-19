/**
 * Ядро нормализации форм заказчиков — часть, не зависящая от чтения XLSX.
 *
 * Перенесено из `platform-2-0/packages/normalizer/src/normalize.ts` без изменения логики.
 * Принципы те же: ничего не угадываем молча; непонятное попадает в issues; незаполненное — null, не 0.
 * Отличие RBI: объём разбирается в десятичную **строку** (`decimal.ts`), а не в `Number`.
 */

import { parseDecimalInput } from './decimal.ts';
import type {
  ColumnMapping, Decimal, LocationParserRule, NormalizationIssue, NormalizationResult,
  NormalizedItem, RawRow, SourceFragment, Unit, UnitCode, WorkAlias, WorkCatalogItem
} from './types.ts';

export interface NormalizeContext {
  units: Unit[];
  works: WorkCatalogItem[];
  aliases: WorkAlias[];
  columns: ColumnMapping[];
  locationRules: LocationParserRule[];
}

const EMPTY = '';

// ────────────────────────────── единицы измерения ────────────────────────────

/** Приводит 'м²', 'кв.м', 'м.п.', 'S, м2' к коду канонической единицы. */
export function normalizeUnit(raw: unknown, units: Unit[]): UnitCode | null {
  const text = String(raw ?? EMPTY).trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
  if (!text) return null;
  const squash = (value: string): string =>
    value.toLowerCase().replace(/\s+/g, '').replace(/\./g, '').replace(/²/g, '2').replace(/³/g, '3');
  const target = squash(text);
  for (const unit of units) {
    if (squash(unit.title) === target) return unit.code;
    if (unit.aliases?.some((alias) => squash(alias) === target)) return unit.code;
  }
  return null;
}

// ────────────────────────────────── локации ──────────────────────────────────

/** Нормализация подписи для сравнения: регистр, ё, кавычки, пробелы. */
export function normalizeLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ParsedLocationPart {
  type: 'section' | 'floor' | 'unit' | 'room' | 'zone';
  name: string;
}

/**
 * Разбирает накопленный контекст строк-локаций по правилам заказчика.
 * Правило, которое не сработало, локацию не выдумывает: часть остаётся нераспознанной.
 */
export function parseLocationContext(
  context: string[],
  rules: LocationParserRule[]
): { parts: ParsedLocationPart[]; unmatched: string[] } {
  const parts: ParsedLocationPart[] = [];
  const unmatched: string[] = [];
  for (const label of context) {
    let matched = false;
    for (const rule of rules) {
      const re = new RegExp(rule.pattern, 'i');
      const match = re.exec(label);
      if (match) {
        const value = rule.group !== undefined && match[rule.group] ? match[rule.group] : label.trim();
        parts.push({ type: rule.target, name: value });
        matched = true;
        break;
      }
    }
    if (!matched) unmatched.push(label);
  }
  return { parts, unmatched };
}

/** Материализованный путь локации: 'Корпус 1/Секция 1/Этаж 2/Кв. 45'. */
export function buildLocationPath(parts: ParsedLocationPart[]): string {
  return parts.map((part) => part.name).join('/');
}

// ─────────────────────────── сопоставление работ ─────────────────────────────

export interface WorkMatch {
  workId: string | null;
  match: 'auto' | 'unresolved';
  reason: string;
}

/**
 * Сопоставление названия работы из формы с каталогом.
 * Порядок: точное имя → алиас → код работы. Неоднозначность → unresolved.
 */
export function matchWork(raw: string, ctx: Pick<NormalizeContext, 'works' | 'aliases'>): WorkMatch {
  const key = normalizeLabel(raw);
  if (!key) return { workId: null, match: 'unresolved', reason: 'пустое наименование' };

  const exact = ctx.works.find((work) => normalizeLabel(work.title) === key);
  if (exact) return { workId: exact.id, match: 'auto', reason: 'точное совпадение' };

  const alias = ctx.aliases.find((entry) => entry.aliasNormalized === key || normalizeLabel(entry.alias) === key);
  if (alias) return { workId: alias.workId, match: 'auto', reason: 'алиас' };

  const byCode = ctx.works.find((work) => work.code.toLowerCase() === key);
  if (byCode) return { workId: byCode.id, match: 'auto', reason: 'код работы' };

  return { workId: null, match: 'unresolved', reason: 'нет совпадения в каталоге' };
}

// ──────────────────────────── нормализация строк ─────────────────────────────

export interface NormalizedRowResult {
  item: NormalizedItem | null;
  issues: NormalizationIssue[];
  /** Строка материала (маркер 'М') — сохраняется отдельно, в объём работ не идёт. */
  isMaterial: boolean;
}

function cellByField(
  row: RawRow,
  columns: ColumnMapping[],
  field: string
): { index: number; value: unknown } | null {
  const mapping = columns.find((column) => column.field === field);
  if (!mapping || mapping.columnIndex < 1 || mapping.columnIndex > row.cells.length) return null;
  return { index: mapping.columnIndex, value: row.cells[mapping.columnIndex - 1] };
}

/** Нормализует одну строку листа. Возвращает либо позицию, либо объяснение, почему её нет. */
export function normalizeRow(row: RawRow, ctx: NormalizeContext): NormalizedRowResult {
  const issues: NormalizationIssue[] = [];
  const fragment = (column: number | null, rawValue: unknown): SourceFragment => ({
    sheet: row.sheet,
    row: row.rowNumber,
    column,
    rawValue: rawValue === null || rawValue === undefined ? null : String(rawValue)
  });

  const nameCell = cellByField(row, ctx.columns, 'name');
  const name = nameCell ? String(nameCell.value ?? EMPTY).trim() : EMPTY;
  if (!name) {
    return { item: null, issues: [], isMaterial: false }; // пустая строка листа — не ошибка
  }

  // Материалы в раскладке outline-Г/Р/М идут отдельными строками под работой.
  if (row.marker === 'М') return { item: null, issues: [], isMaterial: true };

  const quantityCell = cellByField(row, ctx.columns, 'quantity');
  const quantity = quantityCell ? parseDecimalInput(quantityCell.value) : null;
  if (quantity === null) {
    issues.push({
      severity: 'error',
      code: 'NO_QUANTITY',
      message: `Объём не распознан: «${quantityCell ? String(quantityCell.value ?? '') : 'колонка не найдена'}»`,
      fragment: fragment(quantityCell?.index ?? null, quantityCell?.value ?? null)
    });
  } else if (quantity.startsWith('-')) {
    issues.push({
      severity: 'error',
      code: 'NEGATIVE_QUANTITY',
      message: 'Отрицательный объём допустим только как отдельная корректировка',
      fragment: fragment(quantityCell?.index ?? null, quantity)
    });
  }

  const unitCell = cellByField(row, ctx.columns, 'unit');
  const unitRaw = unitCell ? String(unitCell.value ?? EMPTY).trim() : EMPTY;
  const unit = normalizeUnit(unitRaw, ctx.units);
  if (!unit) {
    issues.push({
      severity: 'warning',
      code: 'UNKNOWN_UNIT',
      message: `Единица измерения не распознана: «${unitRaw || 'пусто'}»`,
      fragment: fragment(unitCell?.index ?? null, unitRaw)
    });
  }

  const work = matchWork(name, ctx);
  if (work.match === 'unresolved') {
    issues.push({
      severity: 'warning',
      code: 'WORK_UNRESOLVED',
      message: `Вид работ не сопоставлен (${work.reason}): «${name}»`,
      fragment: fragment(nameCell?.index ?? null, name)
    });
  }

  const location = parseLocationContext(row.locationContext, ctx.locationRules);
  let locationParts = location.parts.map((part) => part.name);
  let columnRoles: { section?: string; floor?: string; place?: string } | undefined;

  /**
   * Помещение прямо в колонке строки.
   *
   * Раскладки, где локации идут отдельными строками, помещение из колонок не видят — и тогда
   * весь файл честно превращается в «одна работа, одно помещение», а тысячи строк схлопываются
   * в дубли. Если человек **сопоставил** колонки «Этаж» и «Помещение» вручную, эти значения
   * и есть локация строки: берём их, а не молчим.
   */
  if (locationParts.length === 0) {
    const floorCell = cellByField(row, ctx.columns, 'section_floor');
    const placeCell = cellByField(row, ctx.columns, 'location_label');
    const floor = floorCell ? String(floorCell.value ?? EMPTY).trim() : EMPTY;
    const place = placeCell ? String(placeCell.value ?? EMPTY).trim() : EMPTY;
    const fromColumns = [floor, place].filter((value) => value !== EMPTY);
    if (fromColumns.length > 0) {
      locationParts = fromColumns;
      location.unmatched.length = 0;
      columnRoles = { floor: floor || undefined, place: place || undefined };
    }
  }

  if (location.unmatched.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'LOCATION_UNRESOLVED',
      message: `Не разобраны уровни локации: ${location.unmatched.map((item) => `«${item}»`).join(', ')}`,
      fragment: fragment(null, location.unmatched.join(' | '))
    });
  }

  return {
    item: {
      rowNumber: row.rowNumber,
      locationPath: locationParts,
      locationRoles: columnRoles,
      workRaw: name,
      workId: work.workId,
      workMatch: work.match,
      unitRaw,
      unit,
      quantity,
      fragment: fragment(nameCell?.index ?? null, name)
    },
    issues,
    isMaterial: false
  };
}

// ──────────────────────────── полный проход по листу ─────────────────────────

/** Дедупликация по бизнес-ключу: локация + работа + единица. */
export function dedupeItems(items: NormalizedItem[]): { items: NormalizedItem[]; duplicates: NormalizedItem[] } {
  const seen = new Map<string, NormalizedItem>();
  const duplicates: NormalizedItem[] = [];
  for (const item of items) {
    const key = `${item.locationPath.map(normalizeLabel).join('/')}|${normalizeLabel(item.workRaw)}|${item.unit ?? '?'}`;
    if (seen.has(key)) duplicates.push(item);
    else seen.set(key, item);
  }
  return { items: [...seen.values()], duplicates };
}

/** Полная нормализация набора строк: нормализация → дедупликация → протокол и статистика. */
export function normalizeRows(rows: RawRow[], ctx: NormalizeContext): NormalizationResult {
  const items: NormalizedItem[] = [];
  const issues: NormalizationIssue[] = [];
  let materialsSkipped = 0;
  let unresolvedWorks = 0;
  let unresolvedLocations = 0;

  for (const row of rows) {
    const result = normalizeRow(row, ctx);
    if (result.isMaterial) materialsSkipped += 1;
    issues.push(...result.issues);
    unresolvedWorks += result.issues.filter((issue) => issue.code === 'WORK_UNRESOLVED').length;
    unresolvedLocations += result.issues.filter((issue) => issue.code === 'LOCATION_UNRESOLVED').length;
    if (result.item) items.push(result.item);
  }

  const deduped = dedupeItems(items);
  for (const duplicate of deduped.duplicates) {
    issues.push({
      severity: 'warning',
      code: 'DUPLICATE_ROW',
      message: `Дубль позиции (${duplicate.locationPath.join('/')} · ${duplicate.workRaw}) — строка не создаёт новую позицию`,
      fragment: duplicate.fragment
    });
  }

  return {
    layout: 'unknown',
    items: deduped.items,
    issues,
    stats: {
      rowsTotal: rows.length,
      imported: deduped.items.length,
      unresolvedWorks,
      unresolvedLocations,
      materialsSkipped
    }
  };
}

/** Помощник для тестов и отчётов: объём позиции или null. */
export function itemQuantity(item: NormalizedItem): Decimal | null {
  return item.quantity;
}
