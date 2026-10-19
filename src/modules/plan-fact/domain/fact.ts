/**
 * Факт выполнения работ: ввод прорабом, сторно вместо перезаписи, свод план-факт.
 *
 * Правило проекта «факт не перезаписывается» реализовано так: объём и дата существующей
 * записи не меняются никогда. Исправление — **новая** запись со ссылкой `correctsId` на
 * исходную; исходная получает обратный указатель `supersededBy` и остаётся в истории
 * с прежним объёмом. Поэтому «исправить факт» и «удалить факт» в интерфейсе нет — есть
 * «внести корректировку».
 *
 * Офлайн-очередь: факт пишется локально со статусом `pending`. Отправка в облако —
 * отдельный блок (синхронизации у стораджей plan-fact пока нет), и притворяться, что запись
 * уже уехала, нельзя: показываем очередь как есть.
 */

import { addDecimal, divideDecimal, formatDecimal, normalizeDecimal, scaleByPowerOfTen } from './decimal.ts';
import type { Decimal } from './types.ts';
import type { WorRow } from './types.ts';

export const PLAN_FACT_FACTS_STORE = 'PLAN_FACT_FACTS';

/** Статус записи факта: локальная (в очереди) или переданная. */
export type FactStatus = 'pending' | 'handed_over';

export interface FactRecord {
  id: string;
  objectId: string;
  section: string;
  floor: string;
  place: string;
  workKey: string | null;
  workRaw: string;
  unit: string;
  quantity: Decimal;
  /** Дата выполнения, YYYY-MM-DD. */
  factDate: string;
  comment: string;
  author: string;
  createdAt: string;
  status: FactStatus;
  /** Ссылка на запись, которую эта корректирует. */
  correctsId: string | null;
  /** Обратный указатель: эта запись исправлена другой. */
  supersededBy: string | null;
  /** Версия записи: 1 — первичный факт, дальше +1 на каждую корректировку. */
  revision: number;
  /** 'pending' — ждёт отправки в облако; 'synced' — уже там. */
  syncStatus?: 'pending' | 'synced';
}

export interface FactInput {
  objectId: string;
  section: string;
  floor: string;
  place: string;
  workKey: string | null;
  workRaw: string;
  unit: string;
  quantity: string;
  factDate: string;
  comment?: string;
}

interface StorageService {
  stores?: () => Record<string, string>;
  put?: (store: string, data: unknown) => Promise<unknown>;
  getAll?: (store: string) => Promise<unknown[]>;
  generateId?: (prefix: string) => string;
}

interface PermissionsService {
  canRecordFact?: () => boolean;
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
  const name = stores?.PLAN_FACT_FACTS;
  if (!name) throw new Error('Сторадж PLAN_FACT_FACTS не объявлен — обновите страницу, чтобы применилась миграция');
  return name;
}

/** Может ли текущая роль вносить факт (прораб, инженер, админ по умолчанию). */
export function canRecordFact(): boolean {
  const permissions = services().permissions;
  return !!(permissions && typeof permissions.canRecordFact === 'function' && permissions.canRecordFact());
}

function currentAuthor(): string {
  const permissions = services().permissions;
  if (permissions && typeof permissions.getCurrentEngineerName === 'function') {
    return String(permissions.getCurrentEngineerName() || 'Прораб');
  }
  return 'Прораб';
}

function newId(): string {
  const generator = services().storage?.generateId;
  if (typeof generator === 'function') return generator('pffact');
  return `pffact_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Проверка ввода факта: без неё в отчётность уйдёт мусор, который потом не исправить (только сторно). */
function validate(input: FactInput): { ok: true; quantity: Decimal } | { ok: false; error: string } {
  const quantity = normalizeDecimal(String(input.quantity ?? '').replace(',', '.'));
  if (!quantity) return { ok: false, error: 'Объём факта должен быть числом' };
  if (quantity.startsWith('-') || quantity === '0') {
    return { ok: false, error: 'Объём факта должен быть больше нуля (уменьшение оформляется корректировкой)' };
  }
  if (!DATE_RE.test(String(input.factDate ?? ''))) return { ok: false, error: 'Укажите дату выполнения' };
  if (!input.workRaw || !String(input.workRaw).trim()) return { ok: false, error: 'Не выбрана работа' };
  return { ok: true, quantity };
}

/** Внести факт: новая запись, статус локальной очереди. */
export async function recordFact(input: FactInput): Promise<{ ok: boolean; error?: string; record?: FactRecord }> {
  if (!canRecordFact()) return { ok: false, error: 'Факт вносит прораб: у вашей роли нет этого права' };
  const checked = validate(input);
  if (!checked.ok) return checked;

  const storage = services().storage;
  if (!storage || typeof storage.put !== 'function') return { ok: false, error: 'Сервис storage недоступен' };

  const record: FactRecord = {
    id: newId(),
    objectId: input.objectId,
    section: input.section,
    floor: input.floor,
    place: input.place,
    workKey: input.workKey,
    workRaw: input.workRaw,
    unit: input.unit,
    quantity: checked.quantity,
    factDate: input.factDate,
    comment: String(input.comment ?? '').trim(),
    author: currentAuthor(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    correctsId: null,
    supersededBy: null,
    revision: 1,
    syncStatus: 'pending'
  };

  await storage.put(storeName(), record);
  return { ok: true, record };
}

/**
 * Исправление факта: новая версия со ссылкой на исходную. Исходная запись **не меняет объём** —
 * ей только проставляется указатель на исправляющую, поэтому история читается однозначно.
 */
export async function correctFact(
  originalId: string,
  patch: { quantity: string; comment?: string; factDate?: string }
): Promise<{ ok: boolean; error?: string; record?: FactRecord; replaced?: FactRecord }> {
  if (!canRecordFact()) return { ok: false, error: 'Факт вносит прораб: у вашей роли нет этого права' };
  const storage = services().storage;
  if (!storage || typeof storage.put !== 'function' || typeof storage.getAll !== 'function') {
    return { ok: false, error: 'Сервис storage недоступен' };
  }

  const all = (await storage.getAll(storeName())) as FactRecord[];
  const original = all.find((record) => record.id === originalId);
  if (!original) return { ok: false, error: 'Исходная запись факта не найдена' };
  if (original.supersededBy) return { ok: false, error: 'Эта запись уже исправлена более поздней корректировкой' };

  const checked = validate({ ...original, quantity: patch.quantity, factDate: patch.factDate ?? original.factDate });
  if (!checked.ok) return checked;

  const corrected: FactRecord = {
    ...original,
    id: newId(),
    quantity: checked.quantity,
    factDate: patch.factDate ?? original.factDate,
    comment: String(patch.comment ?? '').trim() || original.comment,
    author: currentAuthor(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    correctsId: original.id,
    supersededBy: null,
    revision: original.revision + 1,
    syncStatus: 'pending'
  };

  await storage.put(storeName(), corrected);
  const replaced: FactRecord = { ...original, supersededBy: corrected.id, syncStatus: 'pending' };
  await storage.put(storeName(), replaced);

  return { ok: true, record: corrected, replaced };
}

/** Все записи факта объекта — включая исправленные (они остаются в истории). */
export async function listFacts(objectId: string): Promise<FactRecord[]> {
  const all = (await services().storage?.getAll?.(storeName())) ?? [];
  return (all as FactRecord[])
    .filter((record) => record.objectId === objectId)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

/** Действующий факт: записи, которые не были исправлены (и не являются их предшественниками). */
export function activeFacts(records: FactRecord[]): FactRecord[] {
  return records.filter((record) => !record.supersededBy);
}

/**
 * Процент выполнения: факт ÷ план × 100, **два знака, без округления** (решение владельца
 * 2026-10-15): усечение до двух знаков — выполнение никогда не завышается. Плана нет —
 * процента нет: делить на ноль и показывать «бесконечность» нельзя.
 */
function percentOf(fact: Decimal, plan: Decimal): string | null {
  if (plan === '0' || plan.startsWith('-')) return null;
  const share = divideDecimal(fact, plan, 8);
  return formatDecimal(scaleByPowerOfTen(share, 2), 2);
}

export interface PlanFactRow {
  floor: string;
  workKey: string;
  workRaw: string;
  unit: string;
  plan: Decimal;
  fact: Decimal;
  /** План − факт: положительное значение — отставание. */
  deviation: Decimal;
  /** Процент выполнения; null, если плана нет. */
  percent: string | null;
}

export interface PlanFactSummary {
  rows: PlanFactRow[];
  totalPlan: Decimal;
  totalFact: Decimal;
  totalDeviation: Decimal;
  totalPercent: string | null;
  factsInQueue: number;
  corrected: number;
}

/**
 * Свод план-факт по этажам и видам работ: план из ВОР, факт из действующих записей.
 * Всё считается десятичными строками, поэтому отклонение не «плывёт» на копейках.
 */
export interface WorLikeRow {
  floor: string;
  workId: string | null;
  workRaw: string;
  quantity: Decimal;
  unitRaw?: string;
  unit?: string | null;
}

export function buildPlanFactSummary(
  worRows: WorLikeRow[],
  factRows: FactRecord[],
  options: { floorOrder?: string[] } = {}
): PlanFactSummary {
  const active = activeFacts(factRows);
  const groups = new Map<string, PlanFactRow>();

  const keyOf = (floor: string, workKey: string): string => `${floor}|${workKey}`;

  for (const row of worRows) {
    const workKey = row.workId ?? `raw:${row.workRaw}`;
    const key = keyOf(row.floor, workKey);
    const existing = groups.get(key);
    if (existing) existing.plan = addDecimal(existing.plan, row.quantity);
    else {
      groups.set(key, {
        floor: row.floor,
        workKey,
        workRaw: row.workRaw,
        unit: row.unitRaw || row.unit || '',
        plan: row.quantity,
        fact: '0',
        deviation: row.quantity,
        percent: null
      });
    }
  }

  for (const record of active) {
    const workKey = record.workKey ?? `raw:${record.workRaw}`;
    const key = keyOf(record.floor, workKey);
    const existing = groups.get(key);
    if (existing) {
      existing.fact = addDecimal(existing.fact, record.quantity);
      if (!existing.unit) existing.unit = record.unit;
    } else {
      // Факт без плана — тоже факт: показываем его, а не прячем.
      groups.set(key, {
        floor: record.floor,
        workKey,
        workRaw: record.workRaw,
        unit: record.unit,
        plan: '0',
        fact: record.quantity,
        deviation: addDecimal('0', `-${normalizeDecimal(record.quantity) ?? record.quantity}`),
        percent: null
      });
    }
  }

  const rows = [...groups.values()].map((row) => {
    const deviation = addDecimal(row.plan, `-${normalizeDecimal(row.fact) ?? row.fact}`);
    return { ...row, deviation, percent: percentOf(row.fact, row.plan) };
  });

  const order = options.floorOrder ?? [];
  rows.sort((left, right) => {
    const leftIndex = order.indexOf(left.floor);
    const rightIndex = order.indexOf(right.floor);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? 9999 : leftIndex) - (rightIndex === -1 ? 9999 : rightIndex);
    }
    return left.floor.localeCompare(right.floor, 'ru') || left.workRaw.localeCompare(right.workRaw, 'ru');
  });

  const totalPlan = rows.reduce((acc, row) => addDecimal(acc, row.plan), '0');
  const totalFact = rows.reduce((acc, row) => addDecimal(acc, row.fact), '0');
  const totalDeviation = addDecimal(totalPlan, `-${normalizeDecimal(totalFact) ?? totalFact}`);
  const totalPercent = percentOf(totalFact, totalPlan);

  return {
    rows,
    totalPlan,
    totalFact,
    totalDeviation,
    totalPercent,
    factsInQueue: factRows.filter((record) => record.status === 'pending').length,
    corrected: factRows.filter((record) => record.supersededBy !== null).length
  };
}
