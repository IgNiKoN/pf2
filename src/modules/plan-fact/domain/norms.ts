/**
 * Реестр норм выработки: норму задаёт ПТО, а не код.
 *
 * Базовое наполнение — агрегатные нормы заказчика из формы «График.xlsx» (`WORK_NORMS`):
 * они помечены как `customer_form` и **не считаются подтверждёнными**. ПТО правит норму —
 * запись получает `source: 'pto'`, автора и дату, и только тогда расчёт графика считает
 * норму подтверждённой.
 *
 * Право на правку — `permissions.canManageNorms()` (роль ПТО или админ; компания может
 * переопределить в матрице ролей). Своей матрицы прав модуль не заводит.
 */

import { WORK_NORMS } from './reference.ts';
import { isDecimal, normalizeDecimal } from './decimal.ts';
import type { Decimal } from './types.ts';

export const PLAN_FACT_NORMS_STORE = 'PLAN_FACT_NORMS';

/** Источник нормы: форма заказчика (черновик) или ПТО (подтверждённая). */
export type NormSource = 'customer_form' | 'pto';

export interface NormRecord {
  /** Ключ записи = ключ вида работ. */
  id: string;
  workKey: string;
  name: string;
  unit: string;
  norm: Decimal;
  crew: number;
  lag: Decimal;
  rank: number;
  source: NormSource;
  confirmedBy: string | null;
  confirmedAt: string | null;
  updatedAt: string;
  /** 'pending' — ждёт отправки в облако; 'synced' — уже там. */
  syncStatus?: 'pending' | 'synced';
}

export interface NormPatch {
  workKey: string;
  norm: string;
  crew: number | string;
  lag: string;
}

interface StorageService {
  stores?: () => Record<string, string>;
  put?: (store: string, data: unknown) => Promise<unknown>;
  getAll?: (store: string) => Promise<unknown[]>;
  delete?: (store: string, key: string) => Promise<unknown>;
}

interface PermissionsService {
  canManageNorms?: () => boolean;
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
  const name = stores?.PLAN_FACT_NORMS;
  if (!name) throw new Error('Сторадж PLAN_FACT_NORMS не объявлен — обновите страницу, чтобы применилась миграция');
  return name;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Черновая норма из формы заказчика: база, которую правит ПТО. */
export function defaultNormRecord(workKey: string): NormRecord | null {
  const seed = WORK_NORMS[workKey];
  if (!seed) return null;
  return {
    id: workKey,
    workKey,
    name: seed.name,
    unit: seed.unit,
    norm: seed.norm,
    crew: seed.crew,
    lag: seed.lag,
    rank: seed.rank,
    source: 'customer_form',
    confirmedBy: null,
    confirmedAt: null,
    updatedAt: ''
  };
}

/** Все нормы: черновики формы заказчика, поверх них — то, что задал ПТО. */
export async function listNorms(): Promise<NormRecord[]> {
  const stored = (await services().storage?.getAll?.(storeName())) ?? [];
  const byKey = new Map<string, NormRecord>();
  for (const key of Object.keys(WORK_NORMS)) {
    const draft = defaultNormRecord(key);
    if (draft) byKey.set(key, draft);
  }
  for (const record of stored as NormRecord[]) {
    if (record && record.workKey && byKey.has(record.workKey)) byKey.set(record.workKey, record);
  }
  return [...byKey.values()].sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name, 'ru'));
}

/** Может ли текущая роль задавать нормы (роль ПТО или админ по умолчанию). */
export function canManageNorms(): boolean {
  const permissions = services().permissions;
  return !!(permissions && typeof permissions.canManageNorms === 'function' && permissions.canManageNorms());
}

/**
 * Сохранить норму. Проверяет право, разбирает числа как decimal и запрещает
 * бессмысленные значения: без этого график молча построится по мусору.
 */
export async function saveNorm(patch: NormPatch): Promise<{ ok: boolean; error?: string; record?: NormRecord }> {
  const draft = defaultNormRecord(patch.workKey);
  if (!draft) return { ok: false, error: `Неизвестный вид работ: ${patch.workKey}` };
  if (!canManageNorms()) return { ok: false, error: 'Нормы задаёт ПТО: у вашей роли нет этого права' };

  const norm = normalizeDecimal(String(patch.norm ?? '').replace(',', '.'));
  if (!isDecimal(norm)) return { ok: false, error: 'Норма выработки должна быть числом' };
  if (Number(norm) <= 0) return { ok: false, error: 'Норма выработки должна быть больше нуля' };

  const crew = Number(String(patch.crew ?? '').replace(',', '.'));
  if (!Number.isFinite(crew) || crew <= 0) return { ok: false, error: 'Состав бригады должен быть целым числом больше нуля' };

  const lag = normalizeDecimal(String(patch.lag ?? '0').replace(',', '.'));
  if (!isDecimal(lag)) return { ok: false, error: 'Пауза должна быть числом суток' };
  if (Number(lag) < 0) return { ok: false, error: 'Пауза не может быть отрицательной' };

  const permissions = services().permissions;
  const actor = permissions && typeof permissions.getCurrentEngineerName === 'function'
    ? String(permissions.getCurrentEngineerName() || 'ПТО')
    : 'ПТО';

  const record: NormRecord = {
    ...draft,
    norm,
    crew: Math.round(crew),
    lag,
    source: 'pto',
    confirmedBy: actor,
    confirmedAt: nowIso(),
    updatedAt: nowIso(),
    syncStatus: 'pending'
  };

  const storage = services().storage;
  if (!storage || typeof storage.put !== 'function') return { ok: false, error: 'Сервис storage недоступен' };
  await storage.put(storeName(), record);
  return { ok: true, record };
}

/** Вернуть норму к черновику из формы заказчика (запись ПТО удаляется). */
export async function resetNorm(workKey: string): Promise<{ ok: boolean; error?: string }> {
  if (!canManageNorms()) return { ok: false, error: 'Нормы задаёт ПТО: у вашей роли нет этого права' };
  const storage = services().storage;
  if (!storage || typeof storage.delete !== 'function') return { ok: false, error: 'Сервис storage недоступен' };
  await storage.delete(storeName(), workKey);
  return { ok: true };
}

/** Нормы в виде, который понимает расчёт графика: подтверждена только норма ПТО. */
export async function normsForSchedule(): Promise<Record<string, import('./reference.ts').WorkNorm>> {
  const records = await listNorms();
  const result: Record<string, import('./reference.ts').WorkNorm> = {};
  for (const record of records) {
    result[record.workKey] = {
      key: record.workKey,
      name: record.name,
      unit: (WORK_NORMS[record.workKey]?.unit ?? 'complex'),
      norm: record.norm,
      crew: record.crew,
      lag: record.lag,
      rank: record.rank,
      confirmed: record.source === 'pto'
    };
  }
  return result;
}
