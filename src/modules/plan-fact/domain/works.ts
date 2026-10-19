/**
 * Справочник видов работ и связки названий — **данные**, а не код (ТЗ VOR-012, VOR-013).
 *
 * Раньше 15 видов работ лежали в `reference.ts`, и всё, что не совпало на реальной форме,
 * навсегда оставалось «не сопоставлено»: ПТО не мог ничего исправить без релиза. Теперь:
 *   * встроенный список — это **начальное наполнение** (после первого сохранения он живёт в данных);
 *   * ПТО заводит и правит виды работ сам, у каждой записи есть версия (`revision`);
 *   * связка «название в форме → вид работ» запоминается и применяется в следующих импортах;
 *   * ничего не выдумывается: если связки нет, работа остаётся нерешённой, а не «похожей».
 *
 * Право на правку — `permissions.canManageWorks()` (роль ПТО и админ по умолчанию).
 */

import { WORKS } from './reference.ts';
import type { WorkAlias as NormalizeWorkAlias, WorkCatalogItem } from './types.ts';
import type { UnitCode } from './types.ts';

export const PLAN_FACT_WORKS_STORE = 'PLAN_FACT_WORKS';
export const PLAN_FACT_WORK_ALIASES_STORE = 'PLAN_FACT_WORK_ALIASES';

export interface WorkItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  stage: string;
  groupName: string;
  calcRule: string;
  revision: number;
  isActive: boolean;
  /** builtin — начальное наполнение из кода, pto — заведено или изменено ПТО. */
  source: 'builtin' | 'pto';
  createdBy: string;
  updatedAt: string;
  isDeleted?: boolean;
  syncStatus?: 'pending' | 'synced';
}

export interface WorkAliasRecord {
  id: string;
  workId: string;
  alias: string;
  normalizedAlias: string;
  source: 'pto' | 'form';
  createdBy: string;
  updatedAt: string;
  isDeleted?: boolean;
  syncStatus?: 'pending' | 'synced';
}

export interface WorkCatalog {
  works: WorkItem[];
  aliases: WorkAliasRecord[];
  byId: Map<string, WorkItem>;
  byNormalizedAlias: Map<string, string>;
}

export interface WorkSaveInput {
  id?: string;
  name: string;
  unit: string;
  code?: string;
  stage?: string;
  groupName?: string;
  calcRule?: string;
}

interface StorageService {
  stores?: () => Record<string, string>;
  getAll?: (store: string) => Promise<unknown[]>;
  put?: (store: string, record: unknown) => Promise<unknown>;
  generateId?: (prefix: string) => string;
}

interface PermissionsService {
  canManageWorks?: () => boolean;
  getCurrentEngineerName?: () => string;
}

function services(): { storage?: StorageService; permissions?: PermissionsService } {
  const rbi = window.RBI as unknown as
    | { services?: { storage?: StorageService; permissions?: PermissionsService } }
    | undefined;
  return (rbi && rbi.services) || {};
}

function storeName(key: string): string {
  const name = services().storage?.stores?.()[key];
  if (!name) throw new Error(`Сторадж ${key} не объявлен — обновите страницу, чтобы применилась миграция`);
  return name;
}

/** Может ли текущая роль править справочник (ПТО и админ по умолчанию). */
export function canManageWorks(): boolean {
  const permissions = services().permissions;
  return !!(permissions && typeof permissions.canManageWorks === 'function' && permissions.canManageWorks());
}

/**
 * Нормализация названия для сравнения: регистр, ё/е, пунктуация и лишние пробелы.
 * «Штукатурка  стен», «штукатурка стен» и «ШТУКАТУРКА СТЕН» — одно и то же название.
 */
export function normalizeWorkName(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function newId(prefix: string): string {
  const generator = services().storage?.generateId;
  return typeof generator === 'function' ? generator(prefix) : `${prefix}_${Date.now().toString(36)}`;
}

/** Начальное наполнение: те же 15 видов работ, что были в коде, но уже как данные. */
export function seedWorks(): WorkItem[] {
  return WORKS.map((work) => ({
    id: work.id,
    code: work.code,
    name: work.title,
    unit: String(work.unit as UnitCode),
    stage: work.stage ?? '',
    groupName: work.group ?? '',
    calcRule: '',
    revision: 1,
    isActive: true,
    source: 'builtin' as const,
    createdBy: '',
    updatedAt: ''
  }));
}

/** Справочник: сохранённые записи ПТО поверх начального наполнения; архивные не показываем. */
export async function listWorks(): Promise<WorkItem[]> {
  const stored = ((await services().storage?.getAll?.(storeName(PLAN_FACT_WORKS_STORE))) ?? []) as WorkItem[];
  const byId = new Map<string, WorkItem>();
  for (const work of seedWorks()) byId.set(work.id, work);

  for (const record of stored) {
    if (!record || !record.id) continue;
    if (record.isDeleted) {
      byId.delete(record.id);
      continue;
    }
    byId.set(record.id, record);
  }

  return [...byId.values()]
    .filter((work) => work.isActive !== false)
    .sort((left, right) => String(left.groupName ?? '').localeCompare(String(right.groupName ?? ''), 'ru')
      || String(left.name ?? '').localeCompare(String(right.name ?? ''), 'ru'));
}

/** Связки названий (архивные не показываем). */
export async function listAliases(): Promise<WorkAliasRecord[]> {
  const stored = ((await services().storage?.getAll?.(storeName(PLAN_FACT_WORK_ALIASES_STORE))) ?? []) as WorkAliasRecord[];
  return stored.filter((alias) => alias && !alias.isDeleted);
}

function author(): string {
  const permissions = services().permissions;
  return permissions && typeof permissions.getCurrentEngineerName === 'function'
    ? String(permissions.getCurrentEngineerName() || '')
    : '';
}

/** Завести или изменить вид работ. Правка увеличивает версию: видно, что методика менялась. */
export async function saveWork(input: WorkSaveInput): Promise<{ ok: boolean; error?: string; record?: WorkItem }> {
  if (!canManageWorks()) return { ok: false, error: 'Справочник работ ведёт ПТО: у вашей роли нет этого права' };
  const storage = services().storage;
  if (!storage?.getAll || !storage?.put) return { ok: false, error: 'Сервис storage недоступен' };

  const name = String(input.name ?? '').trim();
  if (!name) return { ok: false, error: 'Название вида работ обязательно' };
  if (!String(input.unit ?? '').trim()) return { ok: false, error: 'Укажите единицу измерения' };

  const works = await listWorks();
  const normalized = normalizeWorkName(name);
  const duplicate = works.find((work) => work.id !== input.id && normalizeWorkName(work.name) === normalized);
  if (duplicate) return { ok: false, error: `Такой вид работ уже есть: «${duplicate.name}»` };

  const current = input.id ? works.find((work) => work.id === input.id) : null;
  const record: WorkItem = {
    id: current?.id ?? input.id ?? newId('pfwork'),
    code: String(input.code ?? current?.code ?? '').trim(),
    name,
    unit: String(input.unit),
    stage: String(input.stage ?? current?.stage ?? '').trim(),
    groupName: String(input.groupName ?? current?.groupName ?? '').trim(),
    calcRule: String(input.calcRule ?? current?.calcRule ?? '').trim(),
    revision: (current?.revision ?? 0) + 1,
    isActive: true,
    source: 'pto',
    createdBy: current?.createdBy || author(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending'
  };

  await storage.put(storeName(PLAN_FACT_WORKS_STORE), record);
  return { ok: true, record };
}

/** Убрать вид работ из справочника: мягкое удаление, чтобы приём из облака не вернул запись. */
export async function archiveWork(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!canManageWorks()) return { ok: false, error: 'Справочник работ ведёт ПТО: у вашей роли нет этого права' };
  const storage = services().storage;
  if (!storage?.getAll || !storage?.put) return { ok: false, error: 'Сервис storage недоступен' };
  const works = await listWorks();
  const current = works.find((work) => work.id === id);
  if (!current) return { ok: false, error: 'Вид работ не найден' };
  await storage.put(storeName(PLAN_FACT_WORKS_STORE), {
    ...current,
    isDeleted: true,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending'
  });
  return { ok: true };
}

/**
 * Запомнить связку «название в форме → вид работ» (ручное сопоставление ПТО).
 * Одно название — одна связка: повторное сохранение переводит её на другой вид работ.
 */
export async function saveAlias(
  aliasRaw: string,
  workId: string,
  source: 'pto' | 'form' = 'pto'
): Promise<{ ok: boolean; error?: string; record?: WorkAliasRecord }> {
  if (!canManageWorks()) return { ok: false, error: 'Связки работ ведёт ПТО: у вашей роли нет этого права' };
  const storage = services().storage;
  if (!storage?.getAll || !storage?.put) return { ok: false, error: 'Сервис storage недоступен' };

  const alias = String(aliasRaw ?? '').trim();
  const normalizedAlias = normalizeWorkName(alias);
  if (!alias || !normalizedAlias) return { ok: false, error: 'Пустое название связать нельзя' };

  const works = await listWorks();
  if (!works.some((work) => work.id === workId)) {
    return { ok: false, error: 'Вид работ не найден в справочнике' };
  }

  const existing = (await listAliases()).find((record) => record.normalizedAlias === normalizedAlias);
  const record: WorkAliasRecord = {
    id: existing?.id ?? newId('pfalias'),
    workId,
    alias,
    normalizedAlias,
    source,
    createdBy: author(),
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending'
  };
  await storage.put(storeName(PLAN_FACT_WORK_ALIASES_STORE), record);
  return { ok: true, record };
}

export async function removeAlias(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!canManageWorks()) return { ok: false, error: 'Связки работ ведёт ПТО: у вашей роли нет этого права' };
  const storage = services().storage;
  if (!storage?.getAll || !storage?.put) return { ok: false, error: 'Сервис storage недоступен' };
  const current = (await listAliases()).find((record) => record.id === id);
  if (!current) return { ok: true };
  await storage.put(storeName(PLAN_FACT_WORK_ALIASES_STORE), {
    ...current,
    isDeleted: true,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending'
  });
  return { ok: true };
}

/** Справочник в виде, удобном для сопоставления. */
export async function buildCatalog(): Promise<WorkCatalog> {
  const works = await listWorks();
  const aliases = await listAliases();
  const byId = new Map(works.map((work) => [work.id, work]));
  const byNormalizedAlias = new Map<string, string>();
  for (const alias of aliases) {
    if (byId.has(alias.workId)) byNormalizedAlias.set(alias.normalizedAlias, alias.workId);
  }
  return { works, aliases, byId, byNormalizedAlias };
}

/**
 * Справочник в виде, который понимает разбор формы (`NormalizeContext`).
 *
 * Встроенные синонимы из кода **остаются** как запасные: они выверены на реальных формах
 * («Спутник» — 100 %, «ФКП» — 93,4 %), и терять их нельзя. Но связки ПТО идут первыми:
 * решение человека сильнее зашитого правила. Так же и виды работ: данные (включая начальное
 * наполнение) заменяют список из кода целиком.
 */
export function catalogToNormalizeContext(
  catalog: WorkCatalog,
  builtinAliases: NormalizeWorkAlias[]
): { works: WorkCatalogItem[]; aliases: NormalizeWorkAlias[] } {
  return {
    works: catalog.works.map((work) => ({
      id: work.id,
      code: work.code || work.id,
      title: work.name,
      // Единица в справочнике выбирается из справочника единиц (в интерфейсе ПТО), поэтому
      // приведение к каноническому коду безопасно; пустая единица останется пустой строкой.
      unit: work.unit as UnitCode,
      group: work.groupName || null,
      stage: work.stage || null
    })),
    aliases: [
      ...catalog.aliases.map((alias) => ({
        alias: alias.alias,
        aliasNormalized: alias.normalizedAlias,
        workId: alias.workId
      })),
      ...builtinAliases
    ]
  };
}

export interface CatalogMatch {
  workId: string | null;
  matchedBy: 'alias' | 'name' | 'none';
}

/**
 * Сопоставление названия со справочником: сначала связка, потом точное название.
 * «Похожего» не угадываем: не найдено — значит не найдено, строка останется нерешённой.
 */
export function matchInCatalog(rawName: string, catalog: WorkCatalog): CatalogMatch {
  const normalized = normalizeWorkName(rawName);
  if (!normalized) return { workId: null, matchedBy: 'none' };

  const byAlias = catalog.byNormalizedAlias.get(normalized);
  if (byAlias && catalog.byId.has(byAlias)) return { workId: byAlias, matchedBy: 'alias' };

  for (const work of catalog.works) {
    if (normalizeWorkName(work.name) === normalized) return { workId: work.id, matchedBy: 'name' };
  }
  return { workId: null, matchedBy: 'none' };
}
