/**
 * Утверждение объёмов: ПТО предлагает → РП утверждает → baseline неизменяем (ТЗ-2б).
 *
 * Зачем процесс, а не поле «Утверждено»:
 *   * предложение фиксирует **снимок** объёмов и автора — видно, что именно утверждали;
 *   * после утверждения создаётся **baseline**, который нельзя править: изменение возможно только
 *     новым запросом на изменение с причиной, и каждое решение оставляет след в аудите;
 *   * «утверждённый» контур заполняется **из baseline**, а не руками: если объём утверждён, он
 *     не может отличаться от утверждённого.
 *
 * Права: предлагает ПТО (`canManageContours`), утверждает РП (`canApproveContours`).
 */

import { setContour, type ContourKind } from './contours.ts';

export const PLAN_FACT_PROPOSALS_STORE = 'PLAN_FACT_PROPOSALS';
export const PLAN_FACT_PROPOSAL_ROWS_STORE = 'PLAN_FACT_PROPOSAL_ROWS';
export const PLAN_FACT_BASELINES_STORE = 'PLAN_FACT_BASELINES';
export const PLAN_FACT_CHANGE_REQUESTS_STORE = 'PLAN_FACT_CHANGE_REQUESTS';
export const PLAN_FACT_AUDIT_STORE = 'PLAN_FACT_AUDIT';

export type ProposalStatus = 'draft' | 'submitted' | 'returned' | 'rejected' | 'approved';
export type ChangeStatus = 'created' | 'checked' | 'approved' | 'rejected' | 'effective';

export interface ProposalRecord {
  id: string;
  objectId: string;
  title: string;
  status: ProposalStatus;
  submittedBy: string;
  submittedAt: string | null;
  decidedBy: string;
  decidedAt: string | null;
  decisionReason: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  syncStatus?: 'pending' | 'synced';
}

export interface ProposalRow {
  id: string;
  proposalId: string;
  worItemId: string;
  quantity: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  syncStatus?: 'pending' | 'synced';
}

/** Строка снимка внутри baseline: объём, который утвердили, и его адрес для чтения человеком. */
export interface BaselineRowSnapshot {
  worItemId: string;
  quantity: string;
  contour: ContourKind;
  workRaw: string;
  place: string;
  unit: string;
}

export interface BaselineRecord {
  id: string;
  objectId: string;
  proposalId: string | null;
  approvedBy: string;
  approvedAt: string;
  snapshot: { rows: BaselineRowSnapshot[]; note?: string; revision?: number };
  createdAt: string;
  syncStatus?: 'pending' | 'synced';
}

export interface ChangeRequestRecord {
  id: string;
  objectId: string;
  baselineId: string | null;
  worItemId: string;
  quantityKind: ContourKind;
  qtyBefore: string | null;
  qtyAfter: string;
  reason: string;
  status: ChangeStatus;
  createdBy: string;
  createdAt: string;
  checkedBy: string;
  decidedBy: string;
  decidedAt: string | null;
  effectiveAt: string | null;
  updatedAt: string;
  workRaw: string;
  place: string;
  isDeleted?: boolean;
  syncStatus?: 'pending' | 'synced';
}

export interface AuditRecord {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  actor: string;
  reason: string;
  beforeValue: unknown;
  afterValue: unknown;
  createdAt: string;
  syncStatus?: 'pending' | 'synced';
}

export interface ProposalRowInput {
  worItemId: string;
  quantity: string;
  note?: string;
  workRaw?: string;
  place?: string;
  unit?: string;
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
  canApproveContours?: () => boolean;
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

function newId(prefix: string): string {
  const generator = services().storage?.generateId;
  return typeof generator === 'function' ? generator(prefix) : `${prefix}_${Date.now().toString(36)}`;
}

function author(): string {
  const permissions = services().permissions;
  return permissions && typeof permissions.getCurrentEngineerName === 'function'
    ? String(permissions.getCurrentEngineerName() || '')
    : '';
}

/** Может ли текущая роль утверждать объёмы (РП, зам., директор, админ по умолчанию). */
export function canApproveContours(): boolean {
  const permissions = services().permissions;
  return !!(permissions && typeof permissions.canApproveContours === 'function' && permissions.canApproveContours());
}

function canPropose(): boolean {
  const permissions = services().permissions;
  return !!(permissions && typeof permissions.canManageContours === 'function' && permissions.canManageContours());
}

async function all<T>(key: string): Promise<T[]> {
  return ((await services().storage?.getAll?.(storeName(key))) ?? []) as T[];
}

/** Запись процесса: кто, что, когда и почему. Аудит ведётся локально и не переписывается. */
export async function writeAudit(entry: {
  entity: string;
  entityId: string;
  action: string;
  reason?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  actor?: string;
}): Promise<AuditRecord | null> {
  const storage = services().storage;
  if (!storage?.put) return null;
  const record: AuditRecord = {
    id: newId('pfaudit'),
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    actor: entry.actor ?? author(),
    reason: entry.reason ?? '',
    beforeValue: entry.beforeValue ?? null,
    afterValue: entry.afterValue ?? null,
    createdAt: new Date().toISOString(),
    syncStatus: 'pending'
  };
  await storage.put(storeName(PLAN_FACT_AUDIT_STORE), record);
  return record;
}

export async function listAudit(limit = 30): Promise<AuditRecord[]> {
  const records = await all<AuditRecord>(PLAN_FACT_AUDIT_STORE);
  return records
    .filter((record) => record && !(record as unknown as { isDeleted?: boolean }).isDeleted)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, limit);
}

export async function listProposals(objectId?: string): Promise<ProposalRecord[]> {
  const records = await all<ProposalRecord>(PLAN_FACT_PROPOSALS_STORE);
  return records
    .filter((record) => record && !record.isDeleted && (!objectId || record.objectId === objectId))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

export async function listProposalRows(proposalId: string): Promise<ProposalRow[]> {
  const records = await all<ProposalRow>(PLAN_FACT_PROPOSAL_ROWS_STORE);
  return records.filter((record) => record && !record.isDeleted && record.proposalId === proposalId);
}

export async function listBaselines(objectId: string): Promise<BaselineRecord[]> {
  const records = await all<BaselineRecord>(PLAN_FACT_BASELINES_STORE);
  return records
    .filter((record) => record && record.objectId === objectId)
    .sort((left, right) => String(left.approvedAt).localeCompare(String(right.approvedAt)));
}

/** Действующий baseline — последний утверждённый: их может быть несколько (изменения добавляют новый). */
export function currentBaseline(baselines: BaselineRecord[]): BaselineRecord | null {
  return baselines.length > 0 ? baselines[baselines.length - 1] : null;
}

export async function listChangeRequests(objectId?: string): Promise<ChangeRequestRecord[]> {
  const records = await all<ChangeRequestRecord>(PLAN_FACT_CHANGE_REQUESTS_STORE);
  return records
    .filter((record) => record && !record.isDeleted && (!objectId || record.objectId === objectId))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

/**
 * ПТО предлагает объёмы к утверждению.
 * Предложение — снимок: то, что в нём, уже не изменится, даже если контуры потом поправят.
 */
export async function proposeContours(input: {
  objectId: string;
  title?: string;
  rows: ProposalRowInput[];
  note?: string;
}): Promise<{ ok: boolean; error?: string; record?: ProposalRecord }> {
  if (!canPropose()) return { ok: false, error: 'Предложение готовит ПТО: у вашей роли нет права на правку объёмов' };
  const storage = services().storage;
  if (!storage?.put) return { ok: false, error: 'Сервис storage недоступен' };

  const rows = input.rows.filter((row) => String(row.quantity ?? '').trim() !== '');
  if (rows.length === 0) {
    return { ok: false, error: 'Нечего предлагать: сначала заполните контур «Предложено ПТО»' };
  }
  const negative = rows.find((row) => String(row.quantity).trim().startsWith('-'));
  if (negative) return { ok: false, error: 'Отрицательный объём в предложение не попадает' };

  const pending = (await listProposals(input.objectId)).find((proposal) => proposal.status === 'submitted');
  if (pending) {
    return { ok: false, error: `Уже есть предложение на утверждении (${pending.title || pending.id}): дождитесь решения РП` };
  }

  const now = new Date().toISOString();
  const record: ProposalRecord = {
    id: newId('pfprop'),
    objectId: input.objectId,
    title: String(input.title ?? '').trim() || `Предложение от ${now.slice(0, 10)}`,
    status: 'submitted',
    submittedBy: author(),
    submittedAt: now,
    decidedBy: '',
    decidedAt: null,
    decisionReason: String(input.note ?? ''),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending'
  };
  await storage.put(storeName(PLAN_FACT_PROPOSALS_STORE), record);

  for (const row of rows) {
    const rowRecord: ProposalRow = {
      id: newId('pfprow'),
      proposalId: record.id,
      worItemId: row.worItemId,
      quantity: String(row.quantity).trim(),
      note: String(row.note ?? '').trim(),
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending'
    };
    await storage.put(storeName(PLAN_FACT_PROPOSAL_ROWS_STORE), rowRecord);
  }

  await writeAudit({
    entity: 'proposal', entityId: record.id, action: 'propose',
    afterValue: { title: record.title, rows: rows.length, note: record.decisionReason }
  });
  return { ok: true, record };
}

/**
 * Решение РП. При утверждении фиксируется **неизменяемый** baseline, и утверждённый контур
 * заполняется из него: расхождения между «утверждено» и baseline быть не может.
 */
export async function decideProposal(input: {
  proposalId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}): Promise<{ ok: boolean; error?: string; baseline?: BaselineRecord }> {
  if (!canApproveContours()) return { ok: false, error: 'Утверждает объёмы РП: у вашей роли нет этого права' };
  const storage = services().storage;
  if (!storage?.put) return { ok: false, error: 'Сервис storage недоступен' };

  const proposal = (await listProposals()).find((record) => record.id === input.proposalId);
  if (!proposal) return { ok: false, error: 'Предложение не найдено' };
  if (proposal.status !== 'submitted') {
    return { ok: false, error: `Решение уже принято: статус «${proposal.status}»` };
  }

  const rows = await listProposalRows(proposal.id);
  if (rows.length === 0) return { ok: false, error: 'В предложении нет строк' };

  const now = new Date().toISOString();
  const reason = String(input.reason ?? '').trim();
  if (input.decision === 'rejected' && reason === '') {
    return { ok: false, error: 'Для отказа нужна причина — иначе ПТО не поймёт, что менять' };
  }

  await storage.put(storeName(PLAN_FACT_PROPOSALS_STORE), {
    ...proposal,
    status: input.decision,
    decidedBy: author(),
    decidedAt: now,
    decisionReason: reason || proposal.decisionReason,
    updatedAt: now,
    syncStatus: 'pending'
  });

  await writeAudit({
    entity: 'proposal', entityId: proposal.id,
    action: input.decision === 'approved' ? 'approve' : 'reject',
    reason, beforeValue: { status: 'submitted' }, afterValue: { status: input.decision, rows: rows.length }
  });

  if (input.decision === 'rejected') return { ok: true };

  // Неизменяемый baseline: снимок предложения. Дальше меняется только новым baseline.
  // В снимке — именно утверждённые объёмы: baseline отвечает на вопрос «сколько утвердили»,
  // и с ним же сравниваются запросы на изменение.
  const snapshotRows: BaselineRowSnapshot[] = rows.map((row) => ({
    worItemId: row.worItemId,
    quantity: row.quantity,
    contour: 'APPROVED' as ContourKind,
    workRaw: '',
    place: '',
    unit: ''
  }));
  const baseline: BaselineRecord = {
    id: newId('pfbase'),
    objectId: proposal.objectId,
    proposalId: proposal.id,
    approvedBy: author(),
    approvedAt: now,
    snapshot: { rows: snapshotRows, note: reason, revision: 1 },
    createdAt: now,
    syncStatus: 'pending'
  };
  await storage.put(storeName(PLAN_FACT_BASELINES_STORE), baseline);

  // Утверждённый контур — из baseline: одно и то же число, а не два независимых.
  for (const row of snapshotRows) {
    await setContour({
      worItemId: row.worItemId,
      objectId: proposal.objectId,
      kind: 'APPROVED',
      quantity: row.quantity,
      source: 'baseline',
      method: 'утверждение РП',
      note: `baseline ${baseline.id}`
    });
  }

  await writeAudit({
    entity: 'baseline', entityId: baseline.id, action: 'create',
    afterValue: { proposalId: proposal.id, rows: snapshotRows.length }
  });
  return { ok: true, baseline };
}

/** ПТО просит изменить утверждённый объём: причина обязательна, изменение не «просто правка». */
export async function requestChange(input: {
  objectId: string;
  worItemId: string;
  kind: ContourKind;
  qtyAfter: string;
  reason: string;
  workRaw?: string;
  place?: string;
}): Promise<{ ok: boolean; error?: string; record?: ChangeRequestRecord }> {
  if (!canPropose()) return { ok: false, error: 'Изменение запрашивает ПТО: у вашей роли нет права на правку объёмов' };
  const storage = services().storage;
  if (!storage?.put) return { ok: false, error: 'Сервис storage недоступен' };

  const reason = String(input.reason ?? '').trim();
  if (reason === '') return { ok: false, error: 'Причина изменения обязательна' };
  const qtyAfter = String(input.qtyAfter ?? '').trim();
  if (qtyAfter === '') return { ok: false, error: 'Укажите новый объём (пустое значение — это не изменение)' };

  const baselines = await listBaselines(input.objectId);
  const baseline = currentBaseline(baselines);
  if (!baseline) {
    return { ok: false, error: 'Утверждённого baseline нет: сначала утвердите предложение' };
  }
  const before = baseline.snapshot.rows.find((row) =>
    row.worItemId === input.worItemId && row.contour === input.kind)?.quantity ?? null;

  const now = new Date().toISOString();
  const record: ChangeRequestRecord = {
    id: newId('pfchange'),
    objectId: input.objectId,
    baselineId: baseline.id,
    worItemId: input.worItemId,
    quantityKind: input.kind,
    qtyBefore: before,
    qtyAfter,
    reason,
    status: 'created',
    createdBy: author(),
    createdAt: now,
    checkedBy: '',
    decidedBy: '',
    decidedAt: null,
    effectiveAt: null,
    updatedAt: now,
    workRaw: String(input.workRaw ?? ''),
    place: String(input.place ?? ''),
    syncStatus: 'pending'
  };
  await storage.put(storeName(PLAN_FACT_CHANGE_REQUESTS_STORE), record);
  await writeAudit({
    entity: 'change_request', entityId: record.id, action: 'create', reason,
    beforeValue: { quantity: before }, afterValue: { quantity: qtyAfter }
  });
  return { ok: true, record };
}

/**
 * Решение РП по запросу на изменение.
 *
 * Утверждённый baseline не переписывается: изменение оформляется **новым** baseline с поднятой
 * ревизией, а утверждённый контур получает новый объём. Так история утверждений сохраняется.
 */
export async function decideChangeRequest(input: {
  id: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}): Promise<{ ok: boolean; error?: string; baseline?: BaselineRecord }> {
  if (!canApproveContours()) return { ok: false, error: 'Утверждает изменения РП: у вашей роли нет этого права' };
  const storage = services().storage;
  if (!storage?.put) return { ok: false, error: 'Сервис storage недоступен' };

  const record = (await listChangeRequests()).find((item) => item.id === input.id);
  if (!record) return { ok: false, error: 'Запрос на изменение не найден' };
  if (record.status !== 'created' && record.status !== 'checked') {
    return { ok: false, error: `Решение уже принято: статус «${record.status}»` };
  }

  const now = new Date().toISOString();
  const reason = String(input.reason ?? '').trim();
  if (input.decision === 'rejected' && reason === '') {
    return { ok: false, error: 'Для отказа нужна причина' };
  }

  if (input.decision === 'rejected') {
    await storage.put(storeName(PLAN_FACT_CHANGE_REQUESTS_STORE), {
      ...record, status: 'rejected', decidedBy: author(), decidedAt: now,
      decisionReason: reason, updatedAt: now, syncStatus: 'pending'
    } as unknown as ChangeRequestRecord);
    await writeAudit({
      entity: 'change_request', entityId: record.id, action: 'reject', reason,
      beforeValue: { status: record.status }, afterValue: { status: 'rejected' }
    });
    return { ok: true };
  }

  const baselines = await listBaselines(record.objectId);
  const previous = currentBaseline(baselines);
  if (!previous) return { ok: false, error: 'Действующий baseline не найден' };

  const rows: BaselineRowSnapshot[] = previous.snapshot.rows.map((row) =>
    row.worItemId === record.worItemId && row.contour === record.quantityKind
      ? { ...row, quantity: record.qtyAfter }
      : row);
  const known = rows.some((row) => row.worItemId === record.worItemId && row.contour === record.quantityKind);
  if (!known) {
    rows.push({
      worItemId: record.worItemId, quantity: record.qtyAfter, contour: record.quantityKind,
      workRaw: record.workRaw, place: record.place, unit: ''
    });
  }

  const baseline: BaselineRecord = {
    id: newId('pfbase'),
    objectId: record.objectId,
    proposalId: previous.proposalId,
    approvedBy: author(),
    approvedAt: now,
    snapshot: {
      rows,
      note: `Изменение: ${record.reason}`,
      revision: (previous.snapshot.revision ?? 1) + 1
    },
    createdAt: now,
    syncStatus: 'pending'
  };
  await storage.put(storeName(PLAN_FACT_BASELINES_STORE), baseline);

  await setContour({
    worItemId: record.worItemId,
    objectId: record.objectId,
    kind: 'APPROVED',
    quantity: record.qtyAfter,
    source: 'change_request',
    method: 'изменение утверждено РП',
    note: record.reason
  });

  await storage.put(storeName(PLAN_FACT_CHANGE_REQUESTS_STORE), {
    ...record, status: 'effective', decidedBy: author(), decidedAt: now,
    effectiveAt: now, updatedAt: now, syncStatus: 'pending'
  });
  await writeAudit({
    entity: 'change_request', entityId: record.id, action: 'approve', reason: record.reason,
    beforeValue: { quantity: record.qtyBefore, revision: previous.snapshot.revision ?? 1 },
    afterValue: { quantity: record.qtyAfter, revision: baseline.snapshot.revision, baselineId: baseline.id }
  });
  return { ok: true, baseline };
}

/** Что в текущих контурах разошлось с утверждённым baseline. */
export function baselineDiff(
  baseline: BaselineRecord | null,
  rows: { worItemId: string; values: Record<string, string | null> }[]
): { worItemId: string; kind: ContourKind; approved: string; current: string | null }[] {
  if (!baseline) return [];
  const result: { worItemId: string; kind: ContourKind; approved: string; current: string | null }[] = [];
  for (const row of rows) {
    for (const snapshot of baseline.snapshot.rows) {
      if (snapshot.worItemId !== row.worItemId) continue;
      const current = row.values[snapshot.contour] ?? null;
      if (current !== snapshot.quantity) {
        result.push({
          worItemId: row.worItemId, kind: snapshot.contour,
          approved: snapshot.quantity, current
        });
      }
    }
  }
  return result;
}
