/**
 * Сортировка таблиц: точная, устойчивая и с честным правилом для пустых значений.
 *
 * Три вещи, которые здесь важны и не делаются «как получится»:
 *   1. Объёмы — десятичные строки, и сравнивать их через Number нельзя: 0.123456789012345678
 *      и 0.123456789012345677 должны различаться, а 9 и 10 — стоять в правильном порядке.
 *   2. «Не заполнено» — это не ноль и не пустая строка среди чисел: такие значения всегда
 *      уходят в конец списка, в любом направлении сортировки.
 *   3. Сортировка устойчивая: записи с равным значением сохраняют исходный порядок.
 */

export type SortDir = 'asc' | 'desc';

export interface SortState {
  /** Колонка сортировки; null — исходный порядок. */
  key: string | null;
  dir: SortDir;
}

export const NO_SORT: SortState = { key: null, dir: 'asc' };
export type SortValue = string | number | null | undefined;

const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;

/** Пустое — это отсутствие значения, а не ноль. */
export function isSortEmpty(value: SortValue): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/**
 * Сравнение десятичных строк без float: знак, затем целая часть по длине и значению,
 * затем дробная часть по разрядам. 9 < 10, −5 < 3, 0.10 = 0.1.
 */
export function compareDecimalText(left: string, right: string): number {
  const parse = (value: string): { negative: boolean; int: string; frac: string } => {
    const negative = value.startsWith('-');
    const body = negative ? value.slice(1) : value;
    const [int, frac = ''] = body.split('.');
    return { negative, int: int.replace(/^0+(?=\d)/, ''), frac: frac.replace(/0+$/, '') };
  };

  const a = parse(left.trim());
  const b = parse(right.trim());
  if (a.negative !== b.negative) return a.negative ? -1 : 1;
  const sign = a.negative ? -1 : 1;

  if (a.int.length !== b.int.length) return sign * (a.int.length - b.int.length);
  if (a.int !== b.int) return sign * (a.int < b.int ? -1 : 1);

  const width = Math.max(a.frac.length, b.frac.length);
  const leftFrac = a.frac.padEnd(width, '0');
  const rightFrac = b.frac.padEnd(width, '0');
  if (leftFrac === rightFrac) return 0;
  return sign * (leftFrac < rightFrac ? -1 : 1);
}

/** Сравнение значений колонки. Пустое всегда «больше» — уходит в конец. */
export function compareValues(left: SortValue, right: SortValue): number {
  const leftEmpty = isSortEmpty(left);
  const rightEmpty = isSortEmpty(right);
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  if (typeof left === 'number' && typeof right === 'number') return left - right;

  const a = String(left).trim();
  const b = String(right).trim();
  if (DECIMAL_TEXT.test(a) && DECIMAL_TEXT.test(b)) return compareDecimalText(a, b);
  return a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' });
}

/** Один клик по колонке: по возрастанию → по убыванию → исходный порядок. */
export function cycleSort(state: SortState, key: string): SortState {
  if (state.key !== key) return { key, dir: 'asc' };
  if (state.dir === 'asc') return { key, dir: 'desc' };
  return { key: null, dir: 'asc' };
}

export function sortRows<T>(rows: T[], state: SortState, value: (row: T, key: string) => SortValue): T[] {
  if (!state.key) return rows.slice();
  const key = state.key;

  return rows
    .map((row, index) => ({ row, index, value: value(row, key) }))
    .sort((left, right) => {
      // Пустые не переворачиваем: «не заполнено» остаётся в конце при любом направлении.
      const leftEmpty = isSortEmpty(left.value);
      const rightEmpty = isSortEmpty(right.value);
      if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;

      const base = compareValues(left.value, right.value);
      const ordered = state.dir === 'desc' ? -base : base;
      return ordered !== 0 ? ordered : left.index - right.index;
    })
    .map((item) => item.row);
}

/** Подпись текущей сортировки — для интерфейса. */
export function describeSort(state: SortState, titles: Record<string, string>): string {
  if (!state.key) return 'исходный порядок';
  const title = titles[state.key] ?? state.key;
  return `${title}: ${state.dir === 'asc' ? 'по возрастанию' : 'по убыванию'}`;
}
