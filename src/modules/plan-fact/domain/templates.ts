/**
 * Шаблоны сопоставления колонок (ТЗ VOR-004): повторяющийся формат Excel/CSV не нужно
 * разбирать заново — достаточно применить сохранённый шаблон.
 *
 * Что важно и сделано честно:
 *   * у шаблона есть **версия**: сохранение под тем же именем поднимает версию, а не плодит копии;
 *   * вместе с колонками сохраняется **подпись заголовков** — поэтому перед применением видно,
 *     что в новом файле колонки сдвинулись, пропали или появились, а не «сопоставилось молча не туда»;
 *   * «сдвинулось» отличается от «пропало»: если заголовок нашёлся в другом месте, шаблон можно
 *     поправить одной кнопкой, а не разбирать файл заново.
 */

import type { CanonicalField, CellValue, ColumnMapping, ImportProfile } from './types';
import { text } from './reader.ts';

export const PLAN_FACT_TEMPLATES_STORE = 'PLAN_FACT_TEMPLATES';

export interface MappingTemplate {
  id: string;
  name: string;
  /** Профиль раскладки, для которого сохранён шаблон. */
  formId: string;
  profileId: string;
  sheetName: string;
  columns: ColumnMapping[];
  /** Нормализованные заголовки колонок на момент сохранения. */
  headerSignature: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  usedCount: number;
  createdBy: string;
  note: string;
  syncStatus?: 'pending' | 'synced';
  isDeleted?: boolean;
}

export interface TemplateSaveInput {
  id?: string;
  name: string;
  formId: string;
  profileId: string;
  sheetName: string;
  columns: ColumnMapping[];
  headerSignature: string[];
}

export interface TemplateDiff {
  /** Колонка из шаблона пропала: заголовка нет ни на прежнем месте, ни в другом. */
  missing: { field: CanonicalField; headerText: string; columnIndex: number }[];
  /** Колонка сдвинулась: заголовок нашёлся в другом месте. */
  moved: { field: CanonicalField; headerText: string; from: number; to: number }[];
  /** Заголовок на прежнем месте, но текст другой — похоже, формат поменялся. */
  changed: { field: CanonicalField; headerText: string; columnIndex: number; found: string }[];
  /** В файле есть колонки, которых шаблон не знает. */
  added: { columnIndex: number; found: string }[];
  same: boolean;
}

interface StorageService {
  stores?: () => Record<string, string>;
  getAll?: (store: string) => Promise<unknown[]>;
  put?: (store: string, record: unknown) => Promise<unknown>;
  delete?: (store: string, key: string) => Promise<unknown>;
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

function storeName(): string {
  const name = services().storage?.stores?.()[PLAN_FACT_TEMPLATES_STORE];
  if (!name) throw new Error('Сторадж шаблонов не объявлен — обновите страницу, чтобы применилась миграция');
  return name;
}

/** Нормализация заголовка: регистр, пробелы, переводы строк и лишние знаки не должны мешать. */
export function normalizeHeader(value: unknown): string {
  return text(value)
    .replace(/\s+/g, ' ')
    .replace(/[«»"'`]/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Подпись заголовков листа: по одной записи на колонку.
 * Многострочные шапки склеиваются в одну строку — иначе «Работы» и «Объём» из разных строк
 * шапки выглядели бы как разные колонки.
 */
export function headerSignature(rows: CellValue[][], headerRow: number, headerRows = 1): string[] {
  const first = Math.max(0, headerRow - 1);
  const last = Math.min(rows.length, first + Math.max(1, headerRows));
  const slice = rows.slice(first, last);
  const width = slice.reduce((max, row) => Math.max(max, row.length), 0);
  const signature: string[] = [];
  for (let column = 0; column < width; column += 1) {
    const parts = slice
      .map((row) => normalizeHeader(row[column]))
      .filter((part) => part !== '');
    signature.push(parts.join(' '));
  }
  return signature;
}

/** Сравнение шаблона с текущим файлом — то, что показывается до применения. */
export function templateDiff(template: MappingTemplate, current: string[]): TemplateDiff {
  const missing: TemplateDiff['missing'] = [];
  const moved: TemplateDiff['moved'] = [];
  const changed: TemplateDiff['changed'] = [];
  const used = new Set<number>();

  for (const column of template.columns) {
    const normalized = normalizeHeader(column.headerText);
    const atSavedIndex = current[column.columnIndex - 1] ?? '';
    if (atSavedIndex === normalized) {
      used.add(column.columnIndex - 1);
      continue;
    }
    const foundAt = normalized === '' ? -1 : current.findIndex((label, index) => label === normalized && !used.has(index));
    if (foundAt >= 0) {
      used.add(foundAt);
      moved.push({ field: column.field, headerText: column.headerText, from: column.columnIndex, to: foundAt + 1 });
    } else if (atSavedIndex !== '') {
      changed.push({
        field: column.field, headerText: column.headerText,
        columnIndex: column.columnIndex, found: atSavedIndex
      });
    } else {
      missing.push({ field: column.field, headerText: column.headerText, columnIndex: column.columnIndex });
    }
  }

  const added = current
    .map((label, index) => ({ columnIndex: index + 1, found: label }))
    .filter((entry) => entry.found !== '' && !used.has(entry.columnIndex - 1));

  return {
    missing, moved, changed, added,
    same: missing.length === 0 && moved.length === 0 && changed.length === 0
  };
}

/** Поправить шаблон по текущим заголовкам: сдвинувшиеся колонки встают на новые места. */
export function repointTemplate(template: MappingTemplate, current: string[]): ColumnMapping[] {
  const diff = templateDiff(template, current);
  const fixes = new Map<CanonicalField, number>();
  for (const entry of diff.moved) fixes.set(entry.field, entry.to);
  for (const entry of diff.missing) {
    const atSaved = template.columns.find((column) => column.field === entry.field);
    if (atSaved && entry.headerText === '') fixes.set(entry.field, 0);
  }
  return template.columns
    .map((column) => (fixes.has(column.field)
      ? { ...column, columnIndex: fixes.get(column.field) as number }
      : column))
    .filter((column) => column.columnIndex > 0);
}

/** Профиль с колонками из шаблона: остальное (правила помещений, работы матрицы) не трогаем. */
export function applyTemplate(profile: ImportProfile, columns: ColumnMapping[], sheetName?: string): ImportProfile {
  return {
    ...profile,
    columns: columns.map((column) => ({ ...column })),
    sheetPattern: sheetName && sheetName !== '' ? sheetName : profile.sheetPattern
  };
}

export async function listTemplates(formId?: string): Promise<MappingTemplate[]> {
  const stored = ((await services().storage?.getAll?.(storeName())) ?? []) as MappingTemplate[];
  return stored
    .filter((template) => template && !template.isDeleted && (!formId || template.formId === formId))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
}

/**
 * Сохранить шаблон. Одно имя у одной раскладки — один шаблон с растущей версией:
 * иначе после пары правок колонок ПТО не поймёт, какой из пяти «Спутник v2» настоящий.
 */
export async function saveTemplate(input: TemplateSaveInput): Promise<{ ok: boolean; error?: string; record?: MappingTemplate }> {
  const storage = services().storage;
  if (!storage?.getAll || !storage?.put) return { ok: false, error: 'Сервис storage недоступен' };

  const name = String(input.name ?? '').trim();
  if (!name) return { ok: false, error: 'Название шаблона обязательно' };
  if (!input.columns.length) return { ok: false, error: 'В шаблоне нет ни одной колонки' };

  const existing = (await listTemplates(input.formId)).find((template) =>
    template.id === input.id || template.name.toLowerCase() === name.toLowerCase());
  const now = new Date().toISOString();
  const generator = storage.generateId;
  const record: MappingTemplate = {
    id: existing?.id ?? (typeof generator === 'function' ? generator('pftpl') : `pftpl_${Date.now().toString(36)}`),
    name,
    formId: input.formId,
    profileId: input.profileId,
    sheetName: input.sheetName,
    columns: input.columns.map((column) => ({ ...column })),
    headerSignature: [...input.headerSignature],
    version: (existing?.version ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    usedCount: existing?.usedCount ?? 0,
    createdBy: (existing?.createdBy || currentAuthor()),
    note: '',
    syncStatus: 'pending'
  };

  await storage.put(storeName(), record);
  return { ok: true, record };
}

export async function removeTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const storage = services().storage;
  if (!storage?.getAll || !storage?.put) return { ok: false, error: 'Сервис storage недоступен' };
  const current = (await listTemplates()).find((template) => template.id === id);
  if (!current) return { ok: true };
  await storage.put(storeName(), { ...current, isDeleted: true, updatedAt: new Date().toISOString(), syncStatus: 'pending' });
  return { ok: true };
}

/** Отметить, что шаблон применили: видно, какие шаблоны реально работают, а какие забыты. */
export async function markTemplateUsed(id: string): Promise<void> {
  const storage = services().storage;
  if (!storage?.getAll || !storage?.put) return;
  const current = (await listTemplates()).find((template) => template.id === id);
  if (!current) return;
  await storage.put(storeName(), {
    ...current,
    usedCount: (current.usedCount ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    syncStatus: current.syncStatus === 'synced' ? 'synced' : 'pending'
  });
}

function currentAuthor(): string {
  const permissions = services().permissions;
  return permissions && typeof permissions.getCurrentEngineerName === 'function'
    ? String(permissions.getCurrentEngineerName() || '')
    : '';
}

export type { ColumnMapping };
