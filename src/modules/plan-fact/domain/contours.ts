/**
 * Контуры объёмов (ТЗ VOR-016): RD, договор, предложение, утверждено, принято заказчиком.
 *
 * Главное правило: **незаполненный контур — это отсутствие записи, а не ноль**. Поэтому
 * чтение возвращает `null`, а не `'0'`, и UI показывает «не заполнено». Свести пустое
 * к нулю — значит соврать в отчёте: «объёма по РД нет» и «по РД ноль» — разные вещи.
 *
 * Контур FACT здесь не редактируется: факт вносит прораб (`domain/fact.ts`), и второй
 * источник истины для факта заводить нельзя. Контуры правки — только пять.
 *
 * Право на правку — `permissions.canManageContours()` (роль ПТО и админ по умолчанию).
 */

import { addDecimal, isDecimal, normalizeDecimal } from './decimal.ts';
import type { Decimal } from './types.ts';

export const PLAN_FACT_QUANTITIES_STORE = 'PLAN_FACT_QUANTITIES';

export type ContourKind = 'RD' | 'CONTRACT' | 'PROPOSED' | 'APPROVED' | 'CUSTOMER_ACCEPTED';

export interface ContourMeta {
  kind: ContourKind;
  label: string;
  short: string;
  hint: string;
}

/** Порядок как в ТЗ: от исходных данных к принятому заказчиком. */
export const CONTOURS: ContourMeta[] = [
  { kind: 'RD', label: 'По рабочей документации', short: 'РД', hint: 'Объём по РД — исходные данные проектирования' },
  { kind: 'CONTRACT', label: 'По договору', short: 'Договор', hint: 'Договорный объём: основание оплаты, менять его нельзя' },
  { kind: 'PROPOSED', label: 'Предложено ПТО', short: 'Предложено', hint: 'Производственный объём, который ПТО предлагает РП' },
  { kind: 'APPROVED', label: 'Утверждено РП', short: 'Утверждено', hint: 'Утверждённый производственный объём (после baseline неизменяем)' },
  { kind: 'CUSTOMER_ACCEPTED', label: 'Принято заказчиком', short: 'Принято', hint: 'Объём из подписанного акта; вводится вручную по документу' }
];

export interface ContourRecord {
  id: string;
  worItemId: string;
  objectId: string;
  kind: ContourKind;
  quantity: Decimal;
  source: string;
  method: string;
  note: string;
  updatedBy: string;
  updatedAt: string;
  /** Мягкое удаление: запись остаётся для облака, но контур считается незаполненным. */
  isDeleted?: boolean;
  syncStatus?: 'pending' | 'synced';
}

export interface ContourInput {
  worItemId: string;
  objectId: string;
  kind: ContourKind;
  quantity: string;
  source?: string;
  method?: string;
  note?: string;
}

interface StorageService {
  stores?: () => Record<string, string>;
  getAll?: (store: string) => Promise<unknown[]>;
  put?: (store: string, record: unknown) => Promise<unknown>;
  delete?: (store: string, key: string) => Promise<unknown>;
  generateId?: (prefix: string) => string;
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
  const name = services().storage?.stores?.()?.PLAN_FACT_QUANTITIES;
  if (!name) throw new Error('Сторадж PLAN_FACT_QUANTITIES не объявлен — обновите страницу, чтобы применилась миграция');
  return name;
}

function newId(): string {
  const generator = services().storage?.generateId;
  return typeof generator === 'function' ? generator('pfqty') : `pfqty_${Date.now().toString(36)}`;
}

/** Может ли текущая роль вести контуры (ПТО и админ по умолчанию). */
export function canManageContours(): boolean {
  const permissions = services().permissions;
  return !!(permissions && typeof permissions.canManageContours === 'function' && permissions.canManageContours());
}

export function contourMeta(kind: ContourKind): ContourMeta {
  return CONTOURS.find((item) => item.kind === kind) ?? CONTOURS[0];
}

/** Контуры объекта. Пустой контур в результате просто отсутствует — это и есть «не заполнено». */
export async function listContours(objectId: string): Promise<ContourRecord[]> {
  const all = (await services().storage?.getAll?.(storeName())) ?? [];
  return (all as ContourRecord[])
    .filter((record) => record.objectId === objectId && !record.isDeleted);
}

/**
 * Записать контур. Пустая строка — это «очистить», а не «ноль»: запись удаляется.
 * Отрицательный объём отклоняем: по ТЗ он допустим только как отдельная корректировка.
 */
export async function setContour(input: ContourInput): Promise<{ ok: boolean; error?: string; record?: ContourRecord | null }> {
  if (!canManageContours()) {
    return { ok: false, error: 'Объёмы по контурам ведёт ПТО: у вашей роли нет этого права' };
  }
  const storage = services().storage;
  if (!storage?.getAll || !storage?.put) return { ok: false, error: 'Сервис storage недоступен' };

  const raw = String(input.quantity ?? '').trim();
  if (raw === '') {
    const cleared = await clearContour(input.worItemId, input.kind);
    return cleared.ok ? { ok: true, record: null } : cleared;
  }

  const quantity = normalizeDecimal(raw.replace(',', '.'));
  if (!isDecimal(quantity)) return { ok: false, error: 'Объём должен быть числом' };
  if (quantity.startsWith('-')) {
    return { ok: false, error: 'Отрицательный объём допустим только как отдельная корректировка, а не запись в контур' };
  }

  const permissions = services().permissions;
  const actor = permissions && typeof permissions.getCurrentEngineerName === 'function'
    ? String(permissions.getCurrentEngineerName() || '')
    : '';

  const existing = (await storage.getAll(storeName())) as ContourRecord[];
  const current = existing.find((record) => record.worItemId === input.worItemId
    && record.kind === input.kind && !record.isDeleted) ?? null;

  const record: ContourRecord = {
    id: current?.id ?? newId(),
    worItemId: input.worItemId,
    objectId: input.objectId,
    kind: input.kind,
    quantity,
    source: String(input.source ?? current?.source ?? '').trim(),
    method: String(input.method ?? current?.method ?? '').trim(),
    note: String(input.note ?? '').trim(),
    updatedBy: actor,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending'
  };

  await storage.put(storeName(), record);
  return { ok: true, record };
}

/**
 * Снять контур: контур снова «не заполнен».
 *
 * Запись не удаляем физически, а помечаем `isDeleted` и отправляем в облако: иначе
 * ближайший приём вернул бы её обратно, и «пусто» стало бы невозможно.
 */
export async function clearContour(worItemId: string, kind: ContourKind): Promise<{ ok: boolean; error?: string }> {
  if (!canManageContours()) {
    return { ok: false, error: 'Объёмы по контурам ведёт ПТО: у вашей роли нет этого права' };
  }
  const storage = services().storage;
  if (!storage?.getAll || !storage?.put) return { ok: false, error: 'Сервис storage недоступен' };
  const all = (await storage.getAll(storeName())) as ContourRecord[];
  const current = all.find((record) => record.worItemId === worItemId && record.kind === kind && !record.isDeleted);
  if (!current) return { ok: true };
  await storage.put(storeName(), {
    ...current,
    isDeleted: true,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending'
  });
  return { ok: true };
}

export interface ContourRow {
  worItemId: string;
  place: string;
  workRaw: string;
  /** Вид работ из справочника: по нему выбирается порог сверки. */
  workId: string | null;
  unit: string;
  /** План из формы заказчика (то, что уже есть в ВОР). */
  plan: Decimal | null;
  values: Record<ContourKind, Decimal | null>;
  /** Сколько контуров из пяти заполнено. */
  filled: number;
  /** Расхождение «предложено − договор»: положительное — предлагаем больше договора. */
  proposedMinusContract: Decimal | null;
  /** Истина, если заполнены не все контуры: считать такую позицию проверенной нельзя. */
  incomplete: boolean;
}

/** Разность контуров; если хоть один не заполнен — разности нет (пустое не считается нулём). */
function subtract(left: Decimal | null, right: Decimal | null): Decimal | null {
  if (left === null || right === null) return null;
  return addDecimal(left, right.startsWith('-') ? right.slice(1) : `-${right}`);
}

/** Свод по позициям ВОР: значения контуров, расхождения и признак незаполненности. */
export function buildContourRows(
  worRows: { id: string; floor: string; place: string; workRaw: string; workId?: string | null; unitRaw: string; unit: string | null; quantity: Decimal }[],
  contours: ContourRecord[]
): ContourRow[] {
  const byItem = new Map<string, ContourRecord[]>();
  for (const record of contours) {
    const list = byItem.get(record.worItemId) ?? [];
    list.push(record);
    byItem.set(record.worItemId, list);
  }

  return worRows.map((row) => {
    const values: Record<ContourKind, Decimal | null> = {
      RD: null, CONTRACT: null, PROPOSED: null, APPROVED: null, CUSTOMER_ACCEPTED: null
    };
    for (const record of byItem.get(row.id) ?? []) {
      if (record.kind in values) values[record.kind] = record.quantity;
    }
    const filled = CONTOURS.filter((contour) => values[contour.kind] !== null).length;
    return {
      worItemId: row.id,
      place: [row.floor, row.place].filter(Boolean).join(' · '),
      workRaw: row.workRaw,
      workId: row.workId ?? null,
      unit: row.unit || row.unitRaw || '',
      plan: row.quantity,
      values,
      filled,
      proposedMinusContract: subtract(values.PROPOSED, values.CONTRACT),
      incomplete: filled < CONTOURS.length
    };
  });
}

/** Сколько позиций заполнено полностью — для состояния ВОР (ТЗ §7, экран «Состояние ВОР»). */
export function contourCompletion(rows: ContourRow[]): { complete: number; incomplete: number; total: number } {
  const complete = rows.filter((row) => !row.incomplete).length;
  return { complete, incomplete: rows.length - complete, total: rows.length };
}
