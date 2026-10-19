/**
 * Точная десятичная арифметика на строках.
 *
 * Правило проекта: объёмы и деньги считаются только decimal, float в домене запрещён.
 * Прототип Platform 2.0 приводил объём к `Number` — в RBI это не переносится: здесь
 * значение живёт строкой от разбора формы до сохранения и суммируется точно (BigInt
 * по масштабу), а в число превращается только там, где иначе нельзя (сортировка, Chart).
 */

import type { Decimal } from './types.ts';

const DECIMAL_RE = /^(-?)(\d+)(?:\.(\d+))?$/;

interface Scaled {
  sign: bigint;
  digits: bigint;
  scale: number;
}

function toScaled(value: Decimal): Scaled {
  const match = DECIMAL_RE.exec(String(value).trim());
  if (!match) throw new Error(`[decimal] не десятичная строка: «${value}»`);
  const fraction = match[3] ?? '';
  return {
    sign: match[1] === '-' ? -1n : 1n,
    digits: BigInt(match[2] + fraction),
    scale: fraction.length
  };
}

function scaledToString(sign: bigint, digits: bigint, scale: number): Decimal {
  let text = digits.toString();
  if (scale > 0) {
    text = text.padStart(scale + 1, '0');
    const cut = text.length - scale;
    text = `${text.slice(0, cut)}.${text.slice(cut)}`;
    text = text.replace(/\.?0+$/, '');
    if (text.endsWith('.')) text = text.slice(0, -1);
    if (!text) text = '0';
  }
  return sign < 0n && text !== '0' ? `-${text}` : text;
}

/** Разбор значения ячейки: '0,1', '1 234,5', '1.234,5', '12,5%' → каноническая строка; мусор → null. */
export function parseDecimalInput(raw: unknown): Decimal | null {
  if (raw === null || raw === undefined || typeof raw === 'boolean') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? normalizeDecimal(String(raw)) : null;

  let text = String(raw).replace(/\u00a0/g, ' ').trim();
  if (!text || /^[-–—]+$/.test(text)) return null;
  text = text.replace(/\s/g, '').replace(/%$/, '');
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    // '1.234,5' → разделитель последний; '1,234.5' → наоборот
    text = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (hasComma) {
    text = text.replace(',', '.');
  }
  return normalizeDecimal(text);
}

/** Канонизация уже числовой строки: убирает ведущие нули и хвостовые нули дробной части. */
export function normalizeDecimal(value: Decimal): Decimal | null {
  const match = DECIMAL_RE.exec(String(value).trim());
  if (!match) return null;
  const scaled = toScaled(String(value).trim());
  return scaledToString(scaled.sign, scaled.digits, scaled.scale);
}

export function isDecimal(value: string | null | undefined): value is Decimal {
  return typeof value === 'string' && DECIMAL_RE.test(value.trim());
}

/** Сложение с выравниванием масштаба — без потери точности. */
export function addDecimal(left: Decimal, right: Decimal): Decimal {
  const a = toScaled(left);
  const b = toScaled(right);
  const scale = Math.max(a.scale, b.scale);
  const aDigits = a.sign * a.digits * 10n ** BigInt(scale - a.scale);
  const bDigits = b.sign * b.digits * 10n ** BigInt(scale - b.scale);
  const sum = aDigits + bDigits;
  return scaledToString(sum < 0n ? -1n : 1n, sum < 0n ? -sum : sum, scale);
}

export function sumDecimal(values: Decimal[]): Decimal {
  return values.reduce((acc, value) => addDecimal(acc, value), '0');
}

/** Сравнение: -1 | 0 | 1. */
export function compareDecimal(left: Decimal, right: Decimal): number {
  const diff = addDecimal(left, `-${normalizeDecimal(right) ?? right}`);
  const scaled = toScaled(diff);
  const value = scaled.sign * scaled.digits;
  return value === 0n ? 0 : value > 0n ? 1 : -1;
}

/**
 * Формат для интерфейса: разделитель разрядов — неразрывный пробел, дробный — запятая.
 * `fractionDigits` фиксирует число знаков (для одинаковых колонок), иначе хвостовые нули уходят.
 */
/**
 * Формат десятичной строки для показа.
 *
 * Правило округления (важно для отчётности):
 *   - `fractionDigits` не задан — дробная часть выводится как есть, без хвостовых нулей;
 *   - `fractionDigits > 0` — **усечение** до указанного числа знаков. Так проценты выполнения
 *     и длительности никогда не завышаются: показать 12,7 % вместо 12,75 % честнее, чем 12,8 %;
 *   - `fractionDigits <= 0` — округление «половина вверх».
 * Если для отчёта нужна точность с округлением (например, деньги), нужна отдельная функция:
 * молча менять это правило нельзя, оно влияет на цифры в выгрузках.
 */
export function formatDecimal(value: Decimal, fractionDigits?: number): string {
  const scaled = toScaled(value);
  const negative = scaled.sign < 0n;
  let digits = scaled.digits.toString();

  let intPart: string;
  let fracPart: string;
  if (scaled.scale === 0) {
    intPart = digits;
    fracPart = '';
  } else {
    digits = digits.padStart(scaled.scale + 1, '0');
    const cut = digits.length - scaled.scale;
    intPart = digits.slice(0, cut);
    fracPart = digits.slice(cut);
  }

  if (fractionDigits !== undefined) {
    if (fractionDigits <= 0) {
      // Округление «половина вверх» по модулю — на строке, без float.
      const next = fracPart[fractionDigits] ?? '0';
      if (Number(next) >= 5) intPart = addDecimal(intPart, '1');
      fracPart = '';
    } else {
      fracPart = (fracPart + '0'.repeat(fractionDigits)).slice(0, fractionDigits);
    }
  } else {
    fracPart = fracPart.replace(/0+$/, '');
  }

  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  const sign = negative && (intPart !== '0' || /[1-9]/.test(fracPart)) ? '−' : '';
  return fracPart ? `${sign}${grouped},${fracPart}` : `${sign}${grouped}`;
}

/**
 * Деление с явным округлением (половина вверх) до `scale` знаков.
 * Нужно расчёту графика: объём ÷ норма выработки. Результат — снова decimal строка,
 * поэтому дальнейшие шаги (÷ бригада, паузы, каскад) не накапливают float-погрешность.
 */
export function divideDecimal(left: Decimal, right: Decimal, scale = 3): Decimal {
  const a = toScaled(left);
  const b = toScaled(right);
  if (b.digits === 0n) throw new Error('[decimal] деление на ноль');
  const numerator = a.digits * 10n ** BigInt(b.scale + scale);
  const denominator = b.digits * 10n ** BigInt(a.scale);
  // Округление половины вверх целыми: (2n + d) / 2d.
  const quotient = (numerator * 2n + denominator) / (denominator * 2n);
  return scaledToString(a.sign * b.sign, quotient, scale);
}

/** Наибольшее целое, не большее значения (округление вниз, для отрицательных — к минус бесконечности). */
export function floorDecimal(value: Decimal): Decimal {
  const scaled = toScaled(value);
  const integer = scaled.digits / 10n ** BigInt(scaled.scale);
  const hasFraction = scaled.digits % 10n ** BigInt(scaled.scale) !== 0n;
  const floored = scaled.sign < 0n && hasFraction ? integer + 1n : integer;
  return scaledToString(scaled.sign < 0n && floored !== 0n ? -1n : 1n, floored, 0);
}

/** Наименьшее целое, не меньшее значения. */
export function ceilDecimal(value: Decimal): Decimal {
  const scaled = toScaled(value);
  const integer = scaled.digits / 10n ** BigInt(scaled.scale);
  const hasFraction = scaled.digits % 10n ** BigInt(scaled.scale) !== 0n;
  const ceiled = scaled.sign > 0n && hasFraction ? integer + 1n : integer;
  return scaledToString(scaled.sign < 0n && ceiled !== 0n ? -1n : 1n, ceiled, 0);
}

/** Умножение на степень десяти сдвигом разрядов — точно, без float (нужно для процентов). */
export function scaleByPowerOfTen(value: Decimal, power: number): Decimal {
  if (!Number.isInteger(power)) throw new Error(`[decimal] степень должна быть целой: ${power}`);
  const scaled = toScaled(value);
  const scale = scaled.scale - power;
  if (scale >= 0) return scaledToString(scaled.sign, scaled.digits, scale);
  return scaledToString(scaled.sign, scaled.digits * 10n ** BigInt(-scale), 0);
}

export function maxDecimal(values: Decimal[]): Decimal {
  return values.reduce((acc, value) => (compareDecimal(value, acc) > 0 ? value : acc), values[0] ?? '0');
}

export function minDecimal(values: Decimal[]): Decimal {
  return values.reduce((acc, value) => (compareDecimal(value, acc) < 0 ? value : acc), values[0] ?? '0');
}

/** Число — только для сортировки и графиков; в расчётах и хранении не используется. */
export function decimalToNumber(value: Decimal): number {
  return Number(value);
}
