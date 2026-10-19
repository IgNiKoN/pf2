/**
 * Пороги сверки контуров (ТЗ VOR-024): «пороги по видам работ настраиваются».
 *
 * Пороги живут **по объекту**: у разных объектов свои допуски, и общий корпоративный порог
 * здесь был бы вреден — он бы либо прятал расхождения на одном объекте, либо поднимал шум на другом.
 *
 * Правило с нулём считается незаданным (см. `reconcile.ts`): так «0 / 5%» означает «5% и всё»,
 * а не «нулевая терпимость по единицам».
 */

import { DEFAULT_THRESHOLD, type ThresholdRule } from './reconcile.ts';

export const PLAN_FACT_THRESHOLDS_STORE = 'PLAN_FACT_THRESHOLDS';

export interface ThresholdRecord {
  /** Идентификатор записи — идентификатор объекта: правила у объекта одни. */
  id: string;
  objectId: string;
  rules: ThresholdRule[];
  updatedBy: string;
  updatedAt: string;
  syncStatus?: 'pending' | 'synced';
}

interface StorageService {
  stores?: () => Record<string, string>;
  getAll?: (store: string) => Promise<unknown[]>;
  put?: (store: string, record: unknown) => Promise<unknown>;
}

interface PermissionsService {
  canManageContours?: () => boolean;
  getCurrentEngineerName?: () => string;
}

function services(): { storage?: StorageService; permissions?: PermissionsService } {
  const rbi = window.RBI as unknown as
    | { services?: { storage?: StorageService; permissions?: PermissionsService } }
    | undefined;
  return (rbi && rbi.services) || {};
}

function storeName(): string {
  const name = services().storage?.stores?.()[PLAN_FACT_THRESHOLDS_STORE];
  if (!name) throw new Error('Сторадж порогов не объявлен — обновите страницу, чтобы применилась миграция');
  return name;
}

/** Правила по умолчанию: 5 % и без порога по единицам. */
export function defaultRules(): ThresholdRule[] {
  return [{ ...DEFAULT_THRESHOLD }];
}

/**
 * Разбор того, что ввёл человек: строка «5» или «5,5» → десятичная строка, пустое → 0.
 * Возвращает ошибку понятным текстом, а не молча подставляет ноль.
 */
export function parseThresholdInput(raw: unknown, field: 'percent' | 'absolute'): { ok: boolean; value?: string; error?: string } {
  const text = String(raw ?? '').trim().replace(',', '.').replace(/%$/, '').trim();
  if (text === '') return { ok: true, value: '0' };
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return { ok: false, error: `Порог «${field === 'percent' ? 'процент' : 'единицы'}» — это число, например 5 или 2,5` };
  }
  const value = Number(text);
  if (value < 0) return { ok: false, error: 'Порог не может быть отрицательным' };
  if (field === 'percent' && value > 100) return { ok: false, error: 'Процентный порог больше 100 не имеет смысла' };
  return { ok: true, value: text };
}

/** Правила объекта; если своих нет — общие. */
export async function loadThresholds(objectId: string): Promise<ThresholdRule[]> {
  if (!objectId) return defaultRules();
  const stored = ((await services().storage?.getAll?.(storeName())) ?? []) as ThresholdRecord[];
  const record = stored.find((item) => item && item.objectId === objectId && Array.isArray(item.rules));
  if (!record || record.rules.length === 0) return defaultRules();
  // Общее правило должно быть всегда: без него нечего применить к виду работ без своего порога.
  const hasDefault = record.rules.some((rule) => rule.workId === null && rule.unit === null);
  return hasDefault ? record.rules : [...record.rules, { ...DEFAULT_THRESHOLD }];
}

export async function saveThresholds(
  objectId: string,
  rules: ThresholdRule[]
): Promise<{ ok: boolean; error?: string }> {
  const permissions = services().permissions;
  if (!(permissions && typeof permissions.canManageContours === 'function' && permissions.canManageContours())) {
    return { ok: false, error: 'Пороги сверки настраивает ПТО: у вашей роли нет права на правку объёмов' };
  }
  const storage = services().storage;
  if (!storage?.put) return { ok: false, error: 'Сервис storage недоступен' };
  if (!objectId) return { ok: false, error: 'Не выбран объект' };

  const hasDefault = rules.some((rule) => rule.workId === null && rule.unit === null);
  if (!hasDefault) return { ok: false, error: 'Общее правило обязательно: иначе нечего применить к остальным видам работ' };

  const author = permissions && typeof permissions.getCurrentEngineerName === 'function'
    ? String(permissions.getCurrentEngineerName() || '')
    : '';

  await storage.put(storeName(), {
    id: objectId,
    objectId,
    rules: rules.map((rule) => ({ ...rule })),
    updatedBy: author,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending'
  } satisfies ThresholdRecord);
  return { ok: true };
}

/** Описание правила для интерфейса: по какому виду работ и какие пороги. */
export function ruleTitle(rule: ThresholdRule, workName: (workId: string) => string): string {
  if (rule.workId === null && rule.unit === null) return 'Общее правило (для всех видов работ)';
  if (rule.workId === null) return `Единица измерения: ${rule.unit}`;
  return `${workName(rule.workId)}${rule.unit ? ` · ${rule.unit}` : ''}`;
}
