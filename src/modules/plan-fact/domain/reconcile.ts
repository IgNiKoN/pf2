/**
 * Сверка контуров (ТЗ VOR-024): `РД ↔ договор ↔ предложено` по позиции и по агрегатам.
 *
 * Правила, которые здесь соблюдаются жёстко:
 *   * разница считается **точно** (десятичная арифметика), процент — с запасом знаков и усечением,
 *     потому что от него зависит решение «в пределах порога или нет»;
 *   * **пустой контур — это не ноль**: сравнивать нечего, и позиция честно помечается
 *     «не с чем сравнивать», а не проходит проверку;
 *   * порог задаётся по виду работ (и может — по единице измерения); если правила нет, работает общий.
 */

import { addDecimal, compareDecimal, divideDecimal, scaleByPowerOfTen, sumDecimal } from './decimal.ts';
import type { ContourKind, ContourRow } from './contours.ts';

export interface ContrastPair {
  left: ContourKind;
  right: ContourKind;
  title: string;
}

/** Пары для сверки: именно те, что названы в ТЗ — РД, договор, предложение. */
export const CONTRAST_PAIRS: ContrastPair[] = [
  { left: 'RD', right: 'CONTRACT', title: 'РД ↔ договор' },
  { left: 'CONTRACT', right: 'PROPOSED', title: 'Договор ↔ предложено' },
  { left: 'RD', right: 'PROPOSED', title: 'РД ↔ предложено' }
];

export interface ThresholdRule {
  /** Конкретный вид работ; null — правило по умолчанию. */
  workId: string | null;
  /** Единица измерения (уточнение правила); null — любая. */
  unit: string | null;
  /** Порог в процентах (строка-десятичное). */
  percent: string;
  /** Порог в единицах измерения (строка-десятичное). */
  absolute: string;
}

export const DEFAULT_THRESHOLD: ThresholdRule = { workId: null, unit: null, percent: '5', absolute: '0' };

/** Какое правило применить: точное по виду работ, затем по единице, иначе общее. */
export function thresholdFor(
  workId: string | null,
  unit: string | null,
  rules: ThresholdRule[]
): ThresholdRule {
  const byWork = rules.find((rule) => rule.workId !== null && rule.workId === workId
    && (rule.unit === null || rule.unit === unit));
  if (byWork) return byWork;
  const byUnit = rules.find((rule) => rule.workId === null && rule.unit !== null && rule.unit === unit);
  if (byUnit) return byUnit;
  return rules.find((rule) => rule.workId === null && rule.unit === null) ?? DEFAULT_THRESHOLD;
}

/**
 * Разница двух объёмов: абсолютная и процентная.
 *
 * Процент считается от **левого** значения (РД, если сравниваем РД ↔ договор) — это то, что
 * показывает, насколько договор ушёл от проекта. Считаем с запасом в шесть знаков и усекаем:
 * округление могло бы перевести значение через порог в обе стороны.
 */
export function contrastOf(
  left: string,
  right: string,
  digits = 1
): { absolute: string; percent: string } {
  // Разница = правое минус левое: левое — база сравнения (РД, когда сравниваем РД ↔ договор),
  // поэтому «−10» читается как «договор на 10 меньше РД». Вычитание — сложение с обратным знаком.
  const absolute = addDecimal(right, left.startsWith('-') ? left.slice(1) : `-${left}`);
  if (compareDecimal(left, '0') === 0) {
    return { absolute, percent: '0' };
  }
  const raw = divideDecimal(scaleByPowerOfTen(absolute, 2), left, 6);
  return { absolute, percent: truncate(raw, digits) };
}

/** Усечение десятичной строки до нужного числа знаков (без округления). */
export function truncate(value: string, digits: number): string {
  const text = String(value);
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [integer, fraction = ''] = body.split('.');
  if (digits <= 0) return `${negative ? '-' : ''}${integer === '' ? '0' : integer}`;
  const cut = fraction.slice(0, digits).padEnd(digits, '0');
  return `${negative ? '-' : ''}${integer === '' ? '0' : integer}.${cut}`;
}

/**
 * Превышен ли порог. Порог «0» считается **не заданным**, а не «нулевой терпимостью»: иначе
 * абсолютный порог по умолчанию делал бы проблемой любую разницу, а процентный порог вообще
 * не влиял бы на решение.
 */
function exceeds(value: string, threshold: string): boolean {
  if (compareDecimal(threshold, '0') <= 0) return false;
  const magnitude = value.startsWith('-') ? value.slice(1) : value;
  return compareDecimal(magnitude, threshold) > 0;
}

export type ReconciliationStatus = 'ok' | 'warning' | 'incomplete';

export interface ReconciliationRow {
  worItemId: string;
  pair: string;
  place: string;
  workRaw: string;
  workId: string | null;
  unit: string;
  left: string | null;
  right: string | null;
  absolute: string | null;
  percent: string | null;
  threshold: ThresholdRule;
  status: ReconciliationStatus;
  /** Короткое объяснение для человека: почему строка попала в список. */
  reason: string;
}

export interface WorkAggregate {
  workKey: string;
  workRaw: string;
  unit: string;
  pair: string;
  leftSum: string;
  rightSum: string;
  absolute: string;
  percent: string;
  threshold: ThresholdRule;
  status: ReconciliationStatus;
}

/** Сверка по строкам: каждое расхождение выше порога — отдельная строка отчёта. */
export function reconcileRows(rows: ContourRow[], rules: ThresholdRule[] = []): ReconciliationRow[] {
  const result: ReconciliationRow[] = [];
  for (const row of rows) {
    for (const pair of CONTRAST_PAIRS) {
      const left = row.values[pair.left];
      const right = row.values[pair.right];
      const threshold = thresholdFor(row.workId, row.unit, rules);
      const title = pair.title;

      if (left === null || right === null) {
        result.push({
          worItemId: row.worItemId, pair: title, place: row.place, workRaw: row.workRaw,
          workId: row.workId, unit: row.unit, left, right, absolute: null, percent: null,
          threshold, status: 'incomplete',
          reason: left === null && right === null
            ? 'оба контура пусты — сравнивать нечего'
            : `не заполнено: ${left === null ? pair.left : pair.right}`
        });
        continue;
      }

      const { absolute, percent } = contrastOf(left, right);
      const overAbsolute = exceeds(absolute, threshold.absolute);
      const overPercent = exceeds(percent, threshold.percent);

      result.push({
        worItemId: row.worItemId, pair: title, place: row.place, workRaw: row.workRaw,
        workId: row.workId, unit: row.unit, left, right, absolute, percent, threshold,
        status: overAbsolute || overPercent ? 'warning' : 'ok',
        reason: overAbsolute || overPercent
          ? `расхождение ${absolute} (${percent}%) выше порога ${threshold.absolute} / ${threshold.percent}%`
          : `в пределах порога ${threshold.absolute} / ${threshold.percent}%`
      });
    }
  }
  return result;
}

/** Агрегаты по видам работ: суммы по каждому контуру и их расхождение. */
export function aggregateReconciliation(
  rows: ContourRow[],
  rules: ThresholdRule[] = []
): WorkAggregate[] {
  const groups = new Map<string, ContourRow[]>();
  for (const row of rows) {
    const key = row.workId ?? `raw:${row.workRaw}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const result: WorkAggregate[] = [];
  for (const [key, bucket] of groups) {
    for (const pair of CONTRAST_PAIRS) {
      const leftValues = bucket.map((row) => row.values[pair.left]).filter((value): value is string => value !== null);
      const rightValues = bucket.map((row) => row.values[pair.right]).filter((value): value is string => value !== null);
      if (leftValues.length === 0 || rightValues.length === 0) continue;

      const leftSum = sumDecimal(leftValues);
      const rightSum = sumDecimal(rightValues);
      const { absolute, percent } = contrastOf(leftSum, rightSum);
      const threshold = thresholdFor(bucket[0].workId, bucket[0].unit, rules);
      const over = exceeds(absolute, threshold.absolute) || exceeds(percent, threshold.percent);

      result.push({
        workKey: key, workRaw: bucket[0].workRaw, unit: bucket[0].unit, pair: pair.title,
        leftSum, rightSum, absolute, percent, threshold,
        status: over ? 'warning' : 'ok'
      });
    }
  }
  return result.sort((left, right) => Math.abs(Number(right.percent)) - Math.abs(Number(left.percent)));
}

/** Сводка: сколько расхождений выше порога и сколько позиций не с чем сравнивать. */
export function reconciliationSummary(rows: ReconciliationRow[]): {
  total: number;
  warnings: number;
  incomplete: number;
  ok: number;
} {
  return {
    total: rows.length,
    warnings: rows.filter((row) => row.status === 'warning').length,
    incomplete: rows.filter((row) => row.status === 'incomplete').length,
    ok: rows.filter((row) => row.status === 'ok').length
  };
}
