/**
 * Построение графика производства работ из ВОР.
 *
 * Перенесено из `platform-2-0/packages/planning/src/schedule.ts` без изменения правил:
 * объём ÷ норма выработки = человеко-дни; ÷ состав бригады = длительность; работы внутри
 * этажа идут в технологическом порядке (`rank`) с паузами (`lag`); этажи распределяются по
 * «дорожкам» жадно — следующий этаж берёт дорожка, которая освободится раньше.
 *
 * Отличие RBI: все объёмы, нормы, человеко-дни и сроки — десятичные строки, деление
 * выполняется с явным округлением (`decimal.ts`), поэтому каскад не накапливает float-погрешность.
 *
 * Ничего не выдумываем: позиции без сопоставленной работы, с чужой единицей или без нормы
 * в график не попадают, а возвращаются в `excluded` с причиной.
 */

import {
  addDecimal, ceilDecimal, compareDecimal, divideDecimal, floorDecimal, maxDecimal, sumDecimal
} from './decimal.ts';
import type { Decimal } from './types.ts';
import type { WorkNorm } from './reference.ts';

export interface ScheduleItem {
  section: string;
  floor: string;
  place?: string;
  workKey: string | null;
  rawWork?: string;
  unit: string;
  qty: Decimal;
}

export interface ScheduleInput {
  items: ScheduleItem[];
  norms: Record<string, WorkNorm>;
  /** Дата начала работ, YYYY-MM-DD. */
  startDate: string;
  /** Рабочая неделя: 5 или 6 дней. */
  workWeek: number;
  /** Сколько этажей ведём параллельно (дорожек). */
  parallelFloors: number;
  /** Нерабочие даты компании (праздники, переносы) — влияют только на календарную дату окончания. */
  nonWorkingDays?: string[];
}

export interface ScheduleRow {
  floor: string;
  key: string;
  name: string;
  unit: string;
  qty: Decimal;
  norm: Decimal;
  crew: number;
  lag: Decimal;
  confirmed: boolean;
  manDays: Decimal;
  duration: Decimal;
  /** Смещение от начала работ в днях. */
  start: Decimal;
  end: Decimal;
}

export type ExcludedReason = 'unresolved-work' | 'unit-mismatch' | 'no-norm';

export interface ExcludedItem {
  reason: ExcludedReason;
  rawWork: string;
  unit: string;
  qty: Decimal;
  workKey: string | null;
}

export interface ScheduleResult {
  rows: ScheduleRow[];
  floors: string[];
  totalManDays: Decimal;
  totalDays: Decimal;
  /** Загрузка людей по дням от начала работ (человек в день). */
  load: number[];
  excluded: ExcludedItem[];
  warnings: string[];
}

const DECIMAL_SCALE = 3;

/** Сортировка этажей: числовые подписи — по значению, прочие — по алфавиту. */
function compareFloors(left: string, right: string): number {
  const leftNumber = Number(left.replace(',', '.'));
  const rightNumber = Number(right.replace(',', '.'));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.localeCompare(right, 'ru');
}

export function buildSchedule(input: ScheduleInput): ScheduleResult {
  const { items, norms } = input;
  const excluded: ExcludedItem[] = [];
  const usable: ScheduleItem[] = [];

  for (const item of items) {
    const norm = item.workKey ? norms[item.workKey] : undefined;
    if (!item.workKey || !norm) {
      excluded.push({ reason: 'unresolved-work', rawWork: item.rawWork ?? '', unit: item.unit, qty: item.qty, workKey: item.workKey });
      continue;
    }
    if (norm.unit !== item.unit) {
      excluded.push({ reason: 'unit-mismatch', rawWork: item.rawWork ?? norm.name, unit: item.unit, qty: item.qty, workKey: item.workKey });
      continue;
    }
    if (compareDecimal(norm.norm, '0') <= 0) {
      excluded.push({ reason: 'no-norm', rawWork: item.rawWork ?? norm.name, unit: item.unit, qty: item.qty, workKey: item.workKey });
      continue;
    }
    usable.push(item);
  }

  // Агрегация «этаж + вид работ»: одна строка графика на пару, объёмы складываются точно.
  const byFloor = new Map<string, Map<string, Decimal>>();
  for (const item of usable) {
    const floor = String(item.floor);
    const floorMap = byFloor.get(floor) ?? new Map<string, Decimal>();
    const key = item.workKey as string;
    floorMap.set(key, addDecimal(floorMap.get(key) ?? '0', item.qty));
    byFloor.set(floor, floorMap);
  }

  const floors = [...byFloor.keys()].sort(compareFloors);
  const laneCount = Math.max(1, Math.floor(input.parallelFloors) || 1);
  const lanes: Decimal[] = new Array(laneCount).fill('0');
  const rows: ScheduleRow[] = [];

  for (const floor of floors) {
    let lane = 0;
    for (let index = 1; index < lanes.length; index += 1) {
      if (compareDecimal(lanes[index], lanes[lane]) < 0) lane = index;
    }
    let cursor = lanes[lane];

    const works = [...(byFloor.get(floor) as Map<string, Decimal>).entries()]
      .map(([key, qty]) => ({ ...(norms[key] as WorkNorm), qty }))
      .sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name, 'ru'));

    for (const work of works) {
      const manDays = divideDecimal(work.qty, work.norm, DECIMAL_SCALE);
      const duration = work.crew > 0 ? divideDecimal(manDays, String(work.crew), DECIMAL_SCALE) : manDays;
      const start = cursor;
      const end = addDecimal(start, duration);
      rows.push({
        floor,
        key: work.key,
        name: work.name,
        unit: work.unit,
        qty: work.qty,
        norm: work.norm,
        crew: work.crew,
        lag: work.lag,
        confirmed: work.confirmed,
        manDays,
        duration,
        start,
        end
      });
      cursor = addDecimal(end, work.lag);
    }
    lanes[lane] = cursor;
  }

  const totalManDays = sumDecimal(rows.map((row) => row.manDays));
  const totalDays = rows.length > 0 ? maxDecimal(rows.map((row) => row.end)) : '0';

  // Загрузка людей по дням: границы дня считаются точным floor/ceil, приведение к индексу —
  // это номер дня, а не измеряемая величина, поэтому здесь число допустимо.
  const loadDays = Math.floor(Number(ceilDecimal(totalDays))) + 1;
  const load = new Array(Math.max(1, loadDays)).fill(0);
  for (const row of rows) {
    const from = Math.floor(Number(floorDecimal(row.start)));
    const to = Math.floor(Number(ceilDecimal(row.end)));
    for (let day = from; day < to; day += 1) {
      if (day >= 0 && day < load.length) load[day] += row.crew;
    }
  }

  return {
    rows,
    floors,
    totalManDays,
    totalDays,
    load,
    excluded,
    warnings: buildWarnings(rows, excluded, usable)
  };
}

export function buildWarnings(rows: ScheduleRow[], excluded: ExcludedItem[], usable: ScheduleItem[]): string[] {
  const warnings: string[] = [];

  const unresolved = excluded.filter((entry) => entry.reason === 'unresolved-work');
  if (unresolved.length) {
    const kinds = [...new Set(unresolved.map((entry) => entry.rawWork))];
    warnings.push(
      `Не сопоставлено со справочником: ${unresolved.length} строк (${kinds.length} видов работ). `
      + `В график не попали: ${kinds.slice(0, 4).map((kind) => `«${kind}»`).join(', ')}${kinds.length > 4 ? ' и другие' : ''}.`
    );
  }

  const mismatch = excluded.filter((entry) => entry.reason === 'unit-mismatch');
  if (mismatch.length) {
    warnings.push(`Единица измерения в форме не совпадает со справочником: ${mismatch.length} строк. Из расчёта исключены.`);
  }

  const noNorm = excluded.filter((entry) => entry.reason === 'no-norm');
  if (noNorm.length) warnings.push(`Нет нормы выработки: ${noNorm.length} строк.`);

  const unconfirmed = [...new Set(rows.filter((row) => !row.confirmed).map((row) => row.name))];
  if (unconfirmed.length) {
    warnings.push(
      `Норма не подтверждена ПТО (агрегатная норма заказчика): ${unconfirmed.join(', ')}. `
      + 'Сроки по этим работам — ориентировочные.'
    );
  }

  if (!usable.length) warnings.push('Нет ни одной позиции, пригодной для расчёта графика.');

  return warnings;
}

/* ───────────────────────── календарь ───────────────────────── */

/**
 * Сдвиг на N рабочих дней с учётом выходных выбранного графика и нерабочих дат компании
 * (праздники, переносы). Нерабочие даты задаёт тот, кто ведёт график; по умолчанию их нет.
 */
export function addWorkDays(start: Date, days: number, workWeek: number, nonWorkingDays: string[] = []): Date {
  const date = new Date(start.getTime());
  let left = Math.max(0, Math.round(days));
  const holidays = new Set(nonWorkingDays);
  // Предохранитель от бесконечного цикла, если весь календарь объявлен нерабочим.
  let guard = 0;
  while (left > 0 && guard < 10000) {
    date.setDate(date.getDate() + 1);
    guard += 1;
    const day = date.getDay();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const isDayOff = day === 0 || (workWeek <= 5 && day === 6) || holidays.has(iso);
    if (!isDayOff) left -= 1;
  }
  return date;
}

/** Номер календарного дня от начала работ. */
export function dayIndex(start: Date, date: Date): number {
  return Math.round((date.getTime() - start.getTime()) / 86400000);
}

export function isWeekend(start: Date, index: number): boolean {
  const date = new Date(start.getTime());
  date.setDate(date.getDate() + index);
  return date.getDay() === 0 || date.getDay() === 6;
}

/** Календарная дата окончания работ: `totalDays` рабочих дней от старта. */
export function finishDate(startDate: string, totalDays: Decimal, workWeek: number, nonWorkingDays: string[] = []): Date {
  const start = new Date(`${startDate}T00:00:00`);
  return addWorkDays(start, Number(ceilDecimal(totalDays)), workWeek, nonWorkingDays);
}

/** Формат даты для интерфейса: ДД.ММ.ГГГГ. */
export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
}
