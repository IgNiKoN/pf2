/**
 * Хранение импортов ВОР в рамках объекта.
 *
 * Используется штатный сервис платформы (`RBI.services.storage`), свои обращения к
 * IndexedDB модуль не делает. Стораджи `plan_fact_imports` / `plan_fact_wor` объявлены
 * в `js/services/storage/storage-db.core.js`.
 *
 * Синхронизации у этих стораджей пока нет (облако — блок ПФ-5), поэтому записи **не**
 * помечаются `syncStatus`: притворяться, что они уедут в облако, нельзя.
 */

import type { Decimal, ImportStats, WorRow } from './types.ts';

export const PLAN_FACT_IMPORTS_STORE = 'PLAN_FACT_IMPORTS';
export const PLAN_FACT_WOR_STORE = 'PLAN_FACT_WOR';

export interface PlanFactImportRecord {
  id: string;
  objectId: string;
  /** 'pending' — ждёт отправки в облако; 'synced' — уже там. */
  syncStatus?: 'pending' | 'synced';
  filename: string;
  sheet: string;
  profileId: string;
  profileTitle: string;
  stats: ImportStats;
  createdAt: string;
  updatedAt: string;
}

export interface PlanFactWorRecord {
  id: string;
  objectId: string;
  /** 'pending' — ждёт отправки в облако; 'synced' — уже там. */
  syncStatus?: 'pending' | 'synced';
  importId: string;
  section: string;
  floor: string;
  place: string;
  workRaw: string;
  workId: string | null;
  workMatch: string;
  matchReason: string;
  unitRaw: string;
  unit: string | null;
  quantity: Decimal;
  sheet: string;
  rowNumber: number;
  column: number | null;
  createdAt: string;
  updatedAt: string;
}

interface StorageService {
  stores?: () => Record<string, string>;
  put?: (store: string, data: unknown) => Promise<unknown>;
  putBatch?: (store: string, items: unknown[]) => Promise<unknown>;
  getAll?: (store: string) => Promise<unknown[]>;
  delete?: (store: string, key: string) => Promise<unknown>;
  generateId?: (entityType: string) => string;
}

function storage(): StorageService {
  const service = (window.RBI as unknown as { services?: { storage?: StorageService } } | undefined)?.services?.storage;
  if (!service) throw new Error('Сервис storage недоступен — сохранение ВОР невозможно');
  return service;
}

/** Имена стораджей берём из схемы БД, чтобы не дублировать строки в двух местах. */
function storeName(key: string): string {
  const stores = storage().stores?.() as Record<string, string> | undefined;
  const name = stores?.[key];
  if (!name) {
    throw new Error(`Сторадж ${key} не объявлен в схеме IndexedDB — обновите страницу, чтобы применилась миграция`);
  }
  return name;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  const generator = storage().generateId;
  if (typeof generator === 'function') return generator(prefix);
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Сохранить разобранный импорт: запись импорта + позиции ВОР (одним пакетом). */
export async function saveImport(params: {
  objectId: string;
  filename: string;
  profileId: string;
  profileTitle: string;
  rows: WorRow[];
  stats: ImportStats;
}): Promise<{ importId: string; saved: number }> {
  const service = storage();
  const importId = newId('pfimp');
  const createdAt = nowIso();

  const record: PlanFactImportRecord = {
    id: importId,
    objectId: params.objectId,
    filename: params.filename,
    sheet: params.stats.sheet,
    profileId: params.profileId,
    profileTitle: params.profileTitle,
    stats: params.stats,
    createdAt,
    syncStatus: 'pending',
    updatedAt: createdAt
  };

  await service.put?.(storeName(PLAN_FACT_IMPORTS_STORE), record);

  const items: PlanFactWorRecord[] = params.rows.map((row) => ({
    id: newId('pfwor'),
    objectId: params.objectId,
    importId,
    section: row.section,
    floor: row.floor,
    place: row.place,
    workRaw: row.workRaw,
    workId: row.workId,
    workMatch: row.workMatch,
    matchReason: row.matchReason,
    unitRaw: row.unitRaw,
    unit: row.unit,
    quantity: row.quantity,
    sheet: row.fragment.sheet,
    rowNumber: row.fragment.row,
    column: row.fragment.column,
    createdAt,
    syncStatus: 'pending',
    updatedAt: createdAt
  }));

  if (items.length > 0) {
    if (typeof service.putBatch === 'function') await service.putBatch(storeName(PLAN_FACT_WOR_STORE), items);
    else for (const item of items) await service.put?.(storeName(PLAN_FACT_WOR_STORE), item);
  }

  return { importId, saved: items.length };
}

/** Импорты объекта, новые сверху. */
export async function listImports(objectId: string): Promise<PlanFactImportRecord[]> {
  const all = (await storage().getAll?.(storeName(PLAN_FACT_IMPORTS_STORE))) ?? [];
  return (all as PlanFactImportRecord[])
    .filter((record) => record.objectId === objectId)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

/** Позиции ВОР объекта (можно ограничить одним импортом). */
export async function listWorRows(objectId: string, importId?: string): Promise<PlanFactWorRecord[]> {
  const all = (await storage().getAll?.(storeName(PLAN_FACT_WOR_STORE))) ?? [];
  return (all as PlanFactWorRecord[]).filter(
    (record) => record.objectId === objectId && (!importId || record.importId === importId)
  );
}

/** Удалить импорт вместе с его позициями. */
export async function deleteImport(importId: string): Promise<{ removedImport: boolean; removedRows: number }> {
  const service = storage();
  const rows = (await service.getAll?.(storeName(PLAN_FACT_WOR_STORE))) ?? [];
  const own = (rows as PlanFactWorRecord[]).filter((record) => record.importId === importId);
  for (const record of own) await service.delete?.(storeName(PLAN_FACT_WOR_STORE), record.id);
  await service.delete?.(storeName(PLAN_FACT_IMPORTS_STORE), importId);
  return { removedImport: true, removedRows: own.length };
}
