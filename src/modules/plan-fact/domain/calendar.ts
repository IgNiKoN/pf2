/**
 * Рабочий календарь компании: рабочая неделя и нерабочие даты.
 *
 * Праздники и переносы — данные компании, а не константа кода: их выбирает тот, кто ведёт
 * график (ПТО), а расчёт сроков обязан их учитывать. Сезонные коэффициенты сюда не входят —
 * для них нужен подтверждённый норматив, которого пока нет.
 */

import type { Decimal } from './types.ts';

export const PLAN_FACT_CALENDAR_STORE = 'PLAN_FACT_CALENDAR';
/** Одна запись на компанию — календарь общий, а не на объект. */
export const CALENDAR_RECORD_ID = 'company';

export interface WorkCalendar {
  id: string;
  /** 5 или 6 рабочих дней в неделю; 7 — без выходных. */
  workWeek: number;
  /** Нерабочие даты в формате YYYY-MM-DD (праздники, переносы). */
  nonWorkingDays: string[];
  updatedAt: string;
  updatedBy: string;
  /** 'pending' — ждёт отправки в облако; 'synced' — уже там. */
  syncStatus?: 'pending' | 'synced';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface StorageService {
  stores?: () => Record<string, string>;
  get?: (store: string, key: string) => Promise<unknown>;
  put?: (store: string, data: unknown) => Promise<unknown>;
}

interface PermissionsService {
  getCurrentEngineerName?: () => string;
}

function services(): { storage?: StorageService; permissions?: PermissionsService } {
  const rbi = window.RBI as unknown as
    | { services?: { storage?: StorageService; permissions?: PermissionsService } }
    | undefined;
  return (rbi && rbi.services) || {};
}

function storeName(): string {
  const stores = services().storage?.stores?.() as Record<string, string> | undefined;
  const name = stores?.PLAN_FACT_CALENDAR;
  if (!name) throw new Error('Сторадж PLAN_FACT_CALENDAR не объявлен — обновите страницу, чтобы применилась миграция');
  return name;
}

/** Приводит список дат к порядку: только валидные ISO-даты, без повторов, по возрастанию. */
export function normalizeNonWorkingDays(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<string>();
  for (const value of input) {
    const text = String(value ?? '').trim();
    if (DATE_RE.test(text)) unique.add(text);
  }
  return [...unique].sort();
}

export function emptyCalendar(): WorkCalendar {
  return { id: CALENDAR_RECORD_ID, workWeek: 5, nonWorkingDays: [], updatedAt: '', updatedBy: '' };
}

/** Календарь компании: сохранённый или пустой по умолчанию. */
export async function loadCalendar(): Promise<WorkCalendar> {
  const storage = services().storage;
  if (!storage || typeof storage.get !== 'function') return emptyCalendar();
  try {
    const raw = (await storage.get(storeName(), CALENDAR_RECORD_ID)) as Partial<WorkCalendar> | null | undefined;
    if (!raw) return emptyCalendar();
    return {
      id: CALENDAR_RECORD_ID,
      workWeek: [5, 6, 7].includes(Number(raw.workWeek)) ? Number(raw.workWeek) : 5,
      nonWorkingDays: normalizeNonWorkingDays(raw.nonWorkingDays),
      updatedAt: String(raw.updatedAt ?? ''),
      updatedBy: String(raw.updatedBy ?? '')
    };
  } catch (_error) {
    return emptyCalendar();
  }
}

export async function saveCalendar(workWeek: number, nonWorkingDays: unknown): Promise<WorkCalendar> {
  const permissions = services().permissions;
  const actor = permissions && typeof permissions.getCurrentEngineerName === 'function'
    ? String(permissions.getCurrentEngineerName() || '')
    : '';
  const record: WorkCalendar = {
    id: CALENDAR_RECORD_ID,
    workWeek: [5, 6, 7].includes(Number(workWeek)) ? Number(workWeek) : 5,
    nonWorkingDays: normalizeNonWorkingDays(nonWorkingDays),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
    syncStatus: 'pending'
  };
  const storage = services().storage;
  if (storage && typeof storage.put === 'function') await storage.put(storeName(), record);
  return record;
}

/** Нерабочая ли дата (по ISO-строке дня). */
export function isNonWorkingDate(isoDate: string, nonWorkingDays: string[]): boolean {
  return nonWorkingDays.indexOf(isoDate) !== -1;
}

/** ISO-дата дня, сдвинутого на N календарных дней от старта. */
export function isoDay(start: Date, offsetDays: number): string {
  const date = new Date(start.getTime());
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Сколько рабочих дней в диапазоне — для подписи «сколько дней отдыхаем». */
export function countNonWorkingInRange(startDate: string, totalDays: Decimal, nonWorkingDays: string[]): number {
  const start = new Date(`${startDate}T00:00:00`);
  const horizon = Math.max(0, Math.ceil(Number(totalDays))) ;
  let count = 0;
  for (let offset = 0; offset <= horizon + nonWorkingDays.length; offset += 1) {
    if (nonWorkingDays.indexOf(isoDay(start, offset)) !== -1) count += 1;
  }
  return count;
}
