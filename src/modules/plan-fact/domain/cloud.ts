/**
 * Облако модуля plan-fact: очередь факта, ВОР, нормы и календарь уезжают в Supabase.
 *
 * Почему адаптер живёт в модуле, а не в `js/services/sync/sync-engine.core.js`:
 * движок — рабочий контур ядра на 4300 строк с фиксированным списком сущностей, и трогать
 * его ради нового модуля опасно. Модуль сам знает свои данные, сам их пушит и тянет, а к
 * жизненному циклу подключается штатными событиями (`sync:completed`, `online`,
 * `platform:ready`). Так же устроен `construction-v2`.
 *
 * Правила, которые соблюдает адаптер:
 *   1. Ничего не выдумывать: нет проекта/сессии/сети — синк молча откладывается, очередь
 *      остаётся очередью, интерфейс показывает её как есть.
 *   2. Ничего не перезаписывать у себя: локальная запись, ждущая отправки, победит облачную
 *      (облако применится только к уже синхронизированным записям).
 *   3. Числа — только десятичные строки: из облака они запрашиваются как `text`
 *      (`quantity::text`), чтобы `numeric` не превратился во float по дороге.
 *   4. `updated_at` клиент не присылает: время ставит база триггером (sql/018) —
 *      часы устройства не должны влиять на то, увидит ли правку инкрементальный приём.
 *   4. Пришедшее из облака помечается `syncStatus: 'synced'`, иначе запись уедет обратно
 *      (эхо) — так же делает движок ядра.
 */

import { normalizeDecimal } from './decimal.ts';
import { CALENDAR_RECORD_ID, normalizeNonWorkingDays, PLAN_FACT_CALENDAR_STORE } from './calendar.ts';
import { PLAN_FACT_QUANTITIES_STORE } from './contours.ts';
import {
  PLAN_FACT_AUDIT_STORE, PLAN_FACT_BASELINES_STORE, PLAN_FACT_CHANGE_REQUESTS_STORE,
  PLAN_FACT_PROPOSALS_STORE, PLAN_FACT_PROPOSAL_ROWS_STORE
} from './approval.ts';
import {
  archiveWork, buildCatalog, listAliases, listWorks, matchInCatalog, saveAlias, saveWork,
  PLAN_FACT_WORK_ALIASES_STORE, PLAN_FACT_WORKS_STORE
} from './works.ts';
import {
  decideChangeRequest, decideProposal, listAudit, listBaselines, listChangeRequests, listProposals,
  proposeContours, requestChange
} from './approval.ts';
import { PLAN_FACT_FACTS_STORE, type FactRecord } from './fact.ts';
import { PLAN_FACT_NORMS_STORE, type NormRecord } from './norms.ts';
import { PLAN_FACT_IMPORTS_STORE, PLAN_FACT_WOR_STORE } from './store.ts';

export interface CloudSyncResult {
  ok: boolean;
  /** Почему синк не пошёл: очередь осталась на устройстве. */
  skipped: 'offline' | 'no-session' | 'disabled' | null;
  pushed: number;
  pulled: number;
  failed: number;
  error: string | null;
  at: string;
  /** Таблицы, которых ещё нет в облаке (не применена миграция) — очередь ждёт, а не «сломалась». */
  pendingTables?: string[];
  /** Сущности, для которых нет локального стораджа: пропускаем их, не обрывая остальные. */
  localMissing?: string[];
}

interface SyncConfig {
  enabled?: boolean;
  projectCode?: string;
}

/** Построитель запроса postgrest: фильтры и сортировки возвращают его же, конец — range/limit. */
interface PageQuery {
  gt: (column: string, value: string) => PageQuery;
  order: (column: string, options?: { ascending?: boolean }) => PageQuery;
  range: (from: number, to: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  limit: (count: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
}

interface CloudClient {
  auth?: { getSession?: () => Promise<{ data?: { session?: unknown } | null }> };
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: string) => PageQuery;
      gt: (column: string, value: string) => PageQuery;
    };
    upsert: (rows: unknown[], options?: { onConflict?: string }) => Promise<{ error: { message: string } | null }>;
    /** Вставка без upsert: нужна журналу аудита, где `id` выдаёт база (bigserial). */
    insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>;
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
}

interface StorageService {
  stores?: () => Record<string, string>;
  getAll?: (store: string) => Promise<unknown[]>;
  put?: (store: string, record: unknown) => Promise<unknown>;
  putBatch?: (store: string, records: unknown[]) => Promise<unknown>;
  delete?: (store: string, key: string) => Promise<unknown>;
}

const PULL_STAMP_KEY = 'rbi_plan_fact_last_pull_at';
/** Перекрытие по времени: часы устройства и сервера расходятся, терять записи нельзя. */
const PULL_OVERLAP_MS = 5000;
const BATCH = 400;
/** Размер страницы при приёме: больше — меньше запросов, но тяжелее ответ. */
const PULL_PAGE = 1000;
/** Предохранитель от бесконечного цикла, если сервер отдаёт полные страницы. */
const PULL_MAX_PAGES = 50;

function platform(): { storage?: StorageService; config?: SyncConfig; client?: CloudClient } {
  const scope = window as unknown as {
    RBI?: { services?: { storage?: StorageService } };
    syncConfig?: SyncConfig;
    supabaseClient?: CloudClient;
  };
  return {
    storage: scope.RBI?.services?.storage,
    config: scope.syncConfig,
    client: scope.supabaseClient
  };
}

function storeName(key: string): string {
  const name = platform().storage?.stores?.()[key];
  if (!name) throw new Error(`Сторадж ${key} не объявлен — обновите страницу, чтобы применилась миграция`);
  return name;
}

/** Компания: RBI одтеночный — берём у сервиса компании, запасное значение 'rbi'. */
function companyId(): string {
  const company = (window.RBI as unknown as { services?: { company?: { getCompanyId?: () => string } } })
    ?.services?.company;
  const id = company && typeof company.getCompanyId === 'function' ? company.getCompanyId() : '';
  return String(id || 'rbi');
}

function nowIso(): string {
  return new Date().toISOString();
}

function asDecimal(value: unknown): string {
  const text = typeof value === 'number' ? String(value) : String(value ?? '');
  return normalizeDecimal(text.replace(',', '.')) ?? text;
}

type LocalRecord = Record<string, unknown> & { id: string; syncStatus?: string };

interface EntitySpec {
  key: string;
  table: string;
  storeKey: string;
  /**
   * Область данных: `project` — строки проекта (project_code), `company` — корпоративный
   * справочник работ (company_id), он общий для всех объектов компании.
   */
  scope?: 'project' | 'company';
  /**
   * Только вставка, без upsert: у журнала аудита `id` выдаёт база (bigserial), и переписывать
   * записи аудита нельзя в принципе.
   */
  insertOnly?: true;
  /**
   * По какой колонке идёт постраничный приём. У `plan_fact_baselines` (он неизменяем) и
   * `plan_fact_audit` колонки `updated_at` нет вообще — запрос по ней возвращал 400, и приём
   * объявлял таблицу неприменённой миграцией.
   */
  cursorColumn?: 'updated_at' | 'created_at';
  /** Что дописать в локальную запись после успешной отправки (например, статус «передан»). */
  markAfterPush?: (record: LocalRecord) => LocalRecord;
  /** Колонки для запроса: числа запрашиваем как text, чтобы не потерять decimal. */
  columns: string;
  toCloud: (record: LocalRecord, projectCode: string) => Record<string, unknown>;
  fromCloud: (row: Record<string, unknown>) => LocalRecord;
  /** Кого вообще отправлять: по умолчанию всё, что не помечено синхронизированным. */
  shouldPush?: (record: LocalRecord) => boolean;
}

const ENTITIES: EntitySpec[] = [
  {
    key: 'imports',
    table: 'plan_fact_imports',
    storeKey: PLAN_FACT_IMPORTS_STORE,
    columns: '*',
    toCloud: (r, p) => ({
      id: r.id, project_code: p, object_id: r.objectId, filename: r.filename, sheet: r.sheet,
      profile_id: r.profileId, profile_title: r.profileTitle, stats: r.stats ?? {},
      created_at: r.createdAt
    }),
    fromCloud: (row) => ({
      id: String(row.id), objectId: String(row.object_id), filename: String(row.filename ?? ''),
      sheet: String(row.sheet ?? ''), profileId: String(row.profile_id ?? ''),
      profileTitle: String(row.profile_title ?? ''), stats: row.stats ?? {},
      createdAt: String(row.created_at ?? ''), syncStatus: 'synced', origin: 'cloud'
    })
  },
  {
    key: 'wor',
    table: 'plan_fact_wor',
    storeKey: PLAN_FACT_WOR_STORE,
    columns: '*',
    toCloud: (r, p) => ({
      id: r.id, project_code: p, object_id: r.objectId, import_id: r.importId, section: r.section,
      floor: r.floor, place: r.place, work_raw: r.workRaw, work_id: r.workId ?? null,
      work_match: r.workMatch ?? '', match_reason: r.matchReason ?? '', unit_raw: r.unitRaw ?? '',
      unit: r.unit ?? null, quantity: asDecimal(r.quantity), sheet: r.sheet ?? '',
      row_number: r.rowNumber ?? null, column_number: r.column ?? null,
      created_at: r.createdAt
    }),
    fromCloud: (row) => ({
      id: String(row.id), objectId: String(row.object_id), importId: String(row.import_id ?? ''),
      section: String(row.section ?? ''), floor: String(row.floor ?? ''), place: String(row.place ?? ''),
      workRaw: String(row.work_raw ?? ''), workId: row.work_id ?? null,
      workMatch: String(row.work_match ?? ''), matchReason: String(row.match_reason ?? ''),
      unitRaw: String(row.unit_raw ?? ''), unit: row.unit ?? null,
      quantity: asDecimal(row.quantity), sheet: String(row.sheet ?? ''),
      rowNumber: Number(row.row_number ?? 0), column: row.column_number ?? null,
      createdAt: String(row.created_at ?? ''), syncStatus: 'synced', origin: 'cloud'
    })
  },
  {
    key: 'facts',
    table: 'plan_fact_facts',
    storeKey: PLAN_FACT_FACTS_STORE,
    columns: '*',
    toCloud: (r, p) => ({
      id: r.id, project_code: p, object_id: r.objectId, section: r.section, floor: r.floor,
      place: r.place, work_key: r.workKey ?? null, work_raw: r.workRaw, unit: r.unit,
      quantity: asDecimal(r.quantity), fact_date: r.factDate, comment: r.comment ?? '',
      author: r.author ?? '', status: r.status ?? 'pending', corrects_id: r.correctsId ?? null,
      superseded_by: r.supersededBy ?? null, revision: Number(r.revision ?? 1),
      created_at: r.createdAt
    }),
    fromCloud: (row) => ({
      id: String(row.id), objectId: String(row.object_id), section: String(row.section ?? ''),
      floor: String(row.floor ?? ''), place: String(row.place ?? ''), workKey: row.work_key ?? null,
      workRaw: String(row.work_raw ?? ''), unit: String(row.unit ?? ''),
      quantity: asDecimal(row.quantity), factDate: String(row.fact_date ?? ''),
      comment: String(row.comment ?? ''), author: String(row.author ?? ''),
      status: row.status === 'handed_over' ? 'handed_over' : 'pending',
      correctsId: row.corrects_id ?? null, supersededBy: row.superseded_by ?? null,
      revision: Number(row.revision ?? 1), createdAt: String(row.created_at ?? ''),
      syncStatus: 'synced', origin: 'cloud'
    }),
    // Факт, уехавший в облако, становится переданным: очередь и статус не должны расходиться.
    markAfterPush: (record) => ({ ...record, status: 'handed_over' })
  },
  {
    key: 'norms',
    table: 'plan_fact_norms',
    storeKey: PLAN_FACT_NORMS_STORE,
    columns: '*',
    toCloud: (r, p) => ({
      id: r.id, project_code: p, work_key: r.workKey, name: r.name, unit: r.unit,
      norm: asDecimal(r.norm), crew: Number(r.crew ?? 1), lag: asDecimal(r.lag ?? '0'),
      rank: Number(r.rank ?? 0), source: r.source ?? 'pto', confirmed_by: r.confirmedBy ?? null,
      confirmed_at: r.confirmedAt ?? null
    }),
    fromCloud: (row) => ({
      id: String(row.id), workKey: String(row.work_key ?? ''), name: String(row.name ?? ''),
      unit: String(row.unit ?? ''), norm: asDecimal(row.norm), crew: Number(row.crew ?? 1),
      lag: asDecimal(row.lag ?? '0'), rank: Number(row.rank ?? 0),
      source: row.source === 'pto' ? 'pto' : 'customer_form', confirmedBy: row.confirmed_by ?? null,
      confirmedAt: row.confirmed_at ?? null, updatedAt: String(row.updated_at ?? ''),
      syncStatus: 'synced', origin: 'cloud'
    }),
    // В реестре лежат только нормы ПТО: черновики заказчика приходят из кода, их не отправляем.
    shouldPush: (record) => record.syncStatus !== 'synced' && record.source === 'pto'
  },
  {
    key: 'contours',
    table: 'plan_fact_wor_quantities',
    storeKey: PLAN_FACT_QUANTITIES_STORE,
    columns: '*',
    toCloud: (r, p) => ({
      id: r.id, project_code: p, object_id: r.objectId ?? '', wor_item_id: r.worItemId,
      quantity_kind: r.kind, quantity: asDecimal(r.quantity), source: r.source ?? '',
      method: r.method ?? '', note: r.note ?? '', updated_by: r.updatedBy ?? '',
      is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id), objectId: String(row.object_id ?? ''), worItemId: String(row.wor_item_id ?? ''),
      kind: String(row.quantity_kind ?? ''), quantity: asDecimal(row.quantity),
      source: String(row.source ?? ''), method: String(row.method ?? ''), note: String(row.note ?? ''),
      updatedBy: String(row.updated_by ?? ''), updatedAt: String(row.updated_at ?? ''),
      isDeleted: !!row.is_deleted, syncStatus: 'synced', origin: 'cloud'
    })
  },
  {
    key: 'works',
    table: 'plan_fact_works',
    storeKey: PLAN_FACT_WORKS_STORE,
    scope: 'company',
    columns: '*',
    toCloud: (r) => ({
      id: r.id, company_id: companyId(), code: r.code ?? '', name: r.name, unit: r.unit,
      stage: r.stage ?? '', group_name: r.groupName ?? '', calc_rule: r.calcRule ?? '',
      revision: Number(r.revision ?? 1), is_active: r.isActive !== false, source: r.source ?? 'pto',
      created_by: r.createdBy ?? '', is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id), code: String(row.code ?? ''), name: String(row.name ?? ''),
      unit: String(row.unit ?? ''), stage: String(row.stage ?? ''), groupName: String(row.group_name ?? ''),
      calcRule: String(row.calc_rule ?? ''), revision: Number(row.revision ?? 1),
      isActive: row.is_active !== false, source: row.source === 'builtin' ? 'builtin' : 'pto',
      createdBy: String(row.created_by ?? ''), updatedAt: String(row.updated_at ?? ''),
      isDeleted: !!row.is_deleted, syncStatus: 'synced', origin: 'cloud'
    })
  },
  {
    key: 'aliases',
    table: 'plan_fact_work_aliases',
    storeKey: PLAN_FACT_WORK_ALIASES_STORE,
    scope: 'company',
    columns: '*',
    toCloud: (r) => ({
      id: r.id, company_id: companyId(), work_id: r.workId, alias: r.alias,
      normalized_alias: r.normalizedAlias, source: r.source ?? 'pto', created_by: r.createdBy ?? '',
      is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id), workId: String(row.work_id ?? ''), alias: String(row.alias ?? ''),
      normalizedAlias: String(row.normalized_alias ?? ''), source: row.source === 'form' ? 'form' : 'pto',
      createdBy: String(row.created_by ?? ''), updatedAt: String(row.updated_at ?? ''),
      isDeleted: !!row.is_deleted, syncStatus: 'synced', origin: 'cloud'
    })
  },
  {
    key: 'proposals',
    table: 'plan_fact_proposals',
    storeKey: PLAN_FACT_PROPOSALS_STORE,
    columns: '*',
    toCloud: (r, p) => ({
      id: r.id, project_code: p, object_id: r.objectId, title: r.title ?? '',
      status: r.status ?? 'draft', submitted_by: r.submittedBy ?? '',
      submitted_at: r.submittedAt ?? null, decided_by: r.decidedBy ?? '',
      decided_at: r.decidedAt ?? null, decision_reason: r.decisionReason ?? '',
      is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id), objectId: String(row.object_id ?? ''), title: String(row.title ?? ''),
      status: String(row.status ?? 'draft'), submittedBy: String(row.submitted_by ?? ''),
      submittedAt: row.submitted_at ? String(row.submitted_at) : null,
      decidedBy: String(row.decided_by ?? ''),
      decidedAt: row.decided_at ? String(row.decided_at) : null,
      decisionReason: String(row.decision_reason ?? ''),
      createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
      isDeleted: !!row.is_deleted, syncStatus: 'synced', origin: 'cloud'
    })
  },
  {
    key: 'proposalRows',
    table: 'plan_fact_proposal_rows',
    storeKey: PLAN_FACT_PROPOSAL_ROWS_STORE,
    columns: '*',
    toCloud: (r, p) => ({
      id: r.id, project_code: p, proposal_id: r.proposalId, wor_item_id: r.worItemId,
      quantity: asDecimal(r.quantity), note: r.note ?? '', is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id), proposalId: String(row.proposal_id ?? ''),
      worItemId: String(row.wor_item_id ?? ''), quantity: String(row.quantity ?? ''),
      note: String(row.note ?? ''), createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? ''), isDeleted: !!row.is_deleted,
      syncStatus: 'synced', origin: 'cloud'
    })
  },
  {
    key: 'baselines',
    table: 'plan_fact_baselines',
    storeKey: PLAN_FACT_BASELINES_STORE,
    columns: '*',
    cursorColumn: 'created_at',
    // Baseline неизменяем: ни updated_at, ни is_deleted у него нет — и не должно быть.
    toCloud: (r, p) => ({
      id: r.id, project_code: p, object_id: r.objectId, proposal_id: r.proposalId ?? null,
      approved_by: r.approvedBy ?? '', approved_at: r.approvedAt ?? null,
      snapshot: r.snapshot ?? { rows: [] }
    }),
    fromCloud: (row) => ({
      id: String(row.id), objectId: String(row.object_id ?? ''),
      proposalId: row.proposal_id ? String(row.proposal_id) : null,
      approvedBy: String(row.approved_by ?? ''),
      approvedAt: String(row.approved_at ?? row.created_at ?? ''),
      snapshot: (row.snapshot && typeof row.snapshot === 'object')
        ? (row.snapshot as { rows: never[] })
        : { rows: [] },
      createdAt: String(row.created_at ?? ''), syncStatus: 'synced', origin: 'cloud'
    })
  },
  {
    key: 'changeRequests',
    table: 'plan_fact_change_requests',
    storeKey: PLAN_FACT_CHANGE_REQUESTS_STORE,
    columns: '*',
    toCloud: (r, p) => ({
      id: r.id, project_code: p, baseline_id: r.baselineId ?? null, wor_item_id: r.worItemId,
      quantity_kind: r.quantityKind, qty_before: r.qtyBefore === null ? null : asDecimal(r.qtyBefore),
      qty_after: asDecimal(r.qtyAfter), reason: r.reason ?? '', status: r.status ?? 'created',
      created_by: r.createdBy ?? '', checked_by: r.checkedBy ?? '', decided_by: r.decidedBy ?? '',
      decided_at: r.decidedAt ?? null, effective_at: r.effectiveAt ?? null,
      is_deleted: !!r.isDeleted
    }),
    fromCloud: (row) => ({
      id: String(row.id), objectId: '', baselineId: row.baseline_id ? String(row.baseline_id) : null,
      worItemId: String(row.wor_item_id ?? ''), quantityKind: String(row.quantity_kind ?? 'APPROVED'),
      qtyBefore: row.qty_before === null || row.qty_before === undefined ? null : String(row.qty_before),
      qtyAfter: String(row.qty_after ?? ''), reason: String(row.reason ?? ''),
      status: String(row.status ?? 'created'), createdBy: String(row.created_by ?? ''),
      createdAt: String(row.created_at ?? ''), checkedBy: String(row.checked_by ?? ''),
      decidedBy: String(row.decided_by ?? ''),
      decidedAt: row.decided_at ? String(row.decided_at) : null,
      effectiveAt: row.effective_at ? String(row.effective_at) : null,
      updatedAt: String(row.updated_at ?? ''), workRaw: '', place: '',
      isDeleted: !!row.is_deleted, syncStatus: 'synced', origin: 'cloud'
    })
  },
  {
    key: 'audit',
    table: 'plan_fact_audit',
    storeKey: PLAN_FACT_AUDIT_STORE,
    columns: '*',
    insertOnly: true,
    cursorColumn: 'created_at',
    // id журнала выдаёт база: отправляем всё, кроме id, и никогда не переписываем записи.
    toCloud: (r, p) => ({
      project_code: p, entity: r.entity, entity_id: r.entityId, action: r.action,
      actor: r.actor ?? '', reason: r.reason ?? '',
      before_value: r.beforeValue ?? null, after_value: r.afterValue ?? null
    }),
    fromCloud: (row) => ({
      id: String(row.id ?? ''), entity: String(row.entity ?? ''), entityId: String(row.entity_id ?? ''),
      action: String(row.action ?? ''), actor: String(row.actor ?? ''), reason: String(row.reason ?? ''),
      beforeValue: row.before_value ?? null, afterValue: row.after_value ?? null,
      createdAt: String(row.created_at ?? ''), syncStatus: 'synced', origin: 'cloud'
    })
  },
  {
    key: 'calendar',
    table: 'plan_fact_calendar',
    storeKey: PLAN_FACT_CALENDAR_STORE,
    columns: '*',
    toCloud: (r, p) => ({
      id: r.id ?? CALENDAR_RECORD_ID, project_code: p, work_week: Number(r.workWeek ?? 5),
      non_working_days: Array.isArray(r.nonWorkingDays) ? r.nonWorkingDays : [],
      updated_by: r.updatedBy ?? ''
    }),
    fromCloud: (row) => ({
      id: String(row.id ?? CALENDAR_RECORD_ID),
      workWeek: [5, 6, 7].includes(Number(row.work_week)) ? Number(row.work_week) : 5,
      nonWorkingDays: normalizeNonWorkingDays(row.non_working_days),
      updatedAt: String(row.updated_at ?? ''), updatedBy: String(row.updated_by ?? ''),
      syncStatus: 'synced', origin: 'cloud'
    })
  }
];

/**
 * Миграция sql/017 может быть ещё не применена: это не сбой синхронизации, а «облако
 * для этой сущности не готово». Отличаем по коду PostgREST, чтобы очередь не выглядела
 * сломанной и чтобы записи не помечались синхронизированными.
 */
function isMissingTable(message: string): boolean {
  return /PGRST205|Could not find the table|does not exist/i.test(String(message || ''));
}

function emptyResult(skipped: CloudSyncResult['skipped'], error: string | null = null): CloudSyncResult {
  return {
    ok: skipped === null, skipped, pushed: 0, pulled: 0, failed: 0, error, at: nowIso(),
    pendingTables: [], localMissing: []
  };
}

/** Есть ли вообще смысл идти в облако: включённый синк, проект, сессия и сеть. */
async function readiness(): Promise<{ ok: true; client: CloudClient; projectCode: string } | { ok: false; reason: CloudSyncResult['skipped'] }> {
  const { config, client } = platform();
  if (!config || !config.enabled || !config.projectCode) return { ok: false, reason: 'disabled' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  if (!client) return { ok: false, reason: 'no-session' };
  try {
    const session = await client.auth?.getSession?.();
    if (!session?.data?.session) return { ok: false, reason: 'no-session' };
  } catch (_error) {
    return { ok: false, reason: 'no-session' };
  }
  return { ok: true, client, projectCode: String(config.projectCode) };
}

async function pushEntity(spec: EntitySpec, client: CloudClient, projectCode: string): Promise<{ pushed: number; failed: number; missing: boolean; localMissing: boolean }> {
  const storage = platform().storage;
  if (!storage?.getAll || !storage?.put) return { pushed: 0, failed: 0, missing: false, localMissing: false };
  let store: string;
  try {
    store = storeName(spec.storeKey);
  } catch (_error) {
    // Сторадж не объявлен (страница не обновилась после миграции) — пропускаем сущность,
    // а не срываем синхронизацию остальных.
    return { pushed: 0, failed: 0, missing: false, localMissing: true };
  }
  const all = (await storage.getAll(store)) as LocalRecord[];
  const pending = all.filter((record) => (spec.shouldPush ? spec.shouldPush(record) : record.syncStatus !== 'synced'));
  if (pending.length === 0) return { pushed: 0, failed: 0, missing: false, localMissing: false };

  let pushed = 0;
  let failed = 0;
  for (let offset = 0; offset < pending.length; offset += BATCH) {
    const slice = pending.slice(offset, offset + BATCH);
    const rows = slice.map((record) => spec.toCloud(record, projectCode));
    const { error } = spec.insertOnly
      ? await client.from(spec.table).insert(rows)
      : await client.from(spec.table).upsert(rows, { onConflict: 'id' });
    if (error) {
      // Таблицы ещё нет (миграция не применена): очередь остаётся, запись не помечается синхронизированной.
      if (isMissingTable(error.message)) return { pushed, failed, missing: true, localMissing: false };
      failed += slice.length;
      continue;
    }
    for (const record of slice) {
      // Факт, уехавший в облако, помечаем переданным: очередь и статус не должны расходиться.
      const stamped = spec.markAfterPush ? spec.markAfterPush(record) : record;
      await storage.put(store, { ...stamped, syncStatus: 'synced', syncedAt: nowIso() });
      pushed += 1;
    }
  }
  return { pushed, failed, missing: false, localMissing: false };
}

async function pullEntity(spec: EntitySpec, client: CloudClient, projectCode: string, since: string | null): Promise<{ pulled: number; failed: number; missing: boolean; localMissing: boolean }> {
  const storage = platform().storage;
  if (!storage?.getAll || !storage?.put) return { pulled: 0, failed: 0, missing: false, localMissing: false };
  let store: string;
  try {
    store = storeName(spec.storeKey);
  } catch (_error) {
    return { pulled: 0, failed: 0, missing: false, localMissing: true };
  }

  // Страницы по PULL_PAGE: раньше за цикл приходило максимум 4000 строк, и на большом
  // объекте часть данных просто не доезжала. Порядок по updated_at + id устойчив.
  const incoming: Record<string, unknown>[] = [];
  let missing = false;
  for (let page = 0; page < PULL_MAX_PAGES; page += 1) {
    const scopeColumn = spec.scope === 'company' ? 'company_id' : 'project_code';
    const scopeValue = spec.scope === 'company' ? companyId() : projectCode;
    const query = client.from(spec.table).select(spec.columns).eq(scopeColumn, scopeValue);
    const cursorColumn = spec.cursorColumn ?? 'updated_at';
    const filtered = since ? query.gt(cursorColumn, since) : query;
    const from = page * PULL_PAGE;
    const ordered = filtered.order(cursorColumn, { ascending: true }).order('id', { ascending: true });
    const { data, error } = await ordered.range(from, from + PULL_PAGE - 1);
    if (error) {
      if (isMissingTable(error.message)) missing = true;
      else if (incoming.length === 0) return { pulled: 0, failed: 1, missing: false, localMissing: false };
      break;
    }
    const batch = (data ?? []) as Record<string, unknown>[];
    incoming.push(...batch);
    if (batch.length < PULL_PAGE) break;
  }
  if (missing && incoming.length === 0) return { pulled: 0, failed: 0, missing: true, localMissing: false };
  if (incoming.length === 0) return { pulled: 0, failed: 0, missing: false, localMissing: false };

  const local = new Map<string, LocalRecord>();
  for (const record of (await storage.getAll(store)) as LocalRecord[]) local.set(String(record.id), record);

  let pulled = 0;
  const writes: LocalRecord[] = [];
  for (const row of incoming) {
    const record = spec.fromCloud(row);
    const existing = local.get(String(record.id));
    // Локальная запись, ждущая отправки, главнее: её правку нельзя потерять.
    if (existing && existing.syncStatus !== 'synced') continue;
    if (existing) record.syncStatus = 'synced';
    writes.push(record);
    pulled += 1;
  }
  if (writes.length > 0) {
    if (typeof storage.putBatch === 'function') await storage.putBatch(store, writes);
    else for (const record of writes) await storage.put(store, record);
  }
  return { pulled, failed: 0, missing: false, localMissing: false };
}

let _lastResult: CloudSyncResult | null = null;
let _running: Promise<CloudSyncResult> | null = null;

/** Полный цикл: сначала отправка очереди, потом приём изменений. Повторы склеиваются. */
export async function syncPlanFact(): Promise<CloudSyncResult> {
  if (_running) return _running;
  _running = (async (): Promise<CloudSyncResult> => {
    const ready = await readiness();
    if (!ready.ok) {
      const skipped = emptyResult(ready.reason);
      _lastResult = skipped;
      return skipped;
    }

    const sinceKey = PULL_STAMP_KEY;
    const rawSince = Number(localStorage.getItem(sinceKey) || 0);
    const since = rawSince > 0 ? new Date(rawSince - PULL_OVERLAP_MS).toISOString() : null;

    const result = emptyResult(null);
    const startedAt = Date.now();
    try {
      for (const spec of ENTITIES) {
        const pushed = await pushEntity(spec, ready.client, ready.projectCode);
        result.pushed += pushed.pushed;
        result.failed += pushed.failed;
        if (pushed.missing) result.pendingTables?.push(spec.table);
        if (pushed.localMissing) result.localMissing?.push(spec.table);
        const pulled = await pullEntity(spec, ready.client, ready.projectCode, since);
        result.pulled += pulled.pulled;
        result.failed += pulled.failed;
        if (pulled.missing && !result.pendingTables?.includes(spec.table)) result.pendingTables?.push(spec.table);
        if (pulled.localMissing && !result.localMissing?.includes(spec.table)) result.localMissing?.push(spec.table);
      }
      result.ok = result.failed === 0;
      localStorage.setItem(sinceKey, String(startedAt));
    } catch (error) {
      result.ok = false;
      result.error = error instanceof Error ? error.message : String(error);
    }
    result.at = nowIso();
    _lastResult = result;
    window.RBI?.events?.emit?.('plan-fact:synced', result);
    return result;
  })();
  try {
    return await _running;
  } finally {
    _running = null;
  }
}

export interface CloudQueueState {
  pending: number;
  byEntity: Record<string, number>;
  lastResult: CloudSyncResult | null;
  projectCode: string | null;
  enabled: boolean;
}

/** Сколько записей ждёт отправки — показываем в интерфейсе как есть, без округлений в «всё хорошо». */
export async function planFactQueue(): Promise<CloudQueueState> {
  const { storage, config } = platform();
  const byEntity: Record<string, number> = {};
  let pending = 0;
  if (storage?.getAll) {
    for (const spec of ENTITIES) {
      try {
        const all = (await storage.getAll(storeName(spec.storeKey))) as LocalRecord[];
        const count = all.filter((record) => (spec.shouldPush ? spec.shouldPush(record) : record.syncStatus !== 'synced')).length;
        byEntity[spec.key] = count;
        pending += count;
      } catch (_error) {
        byEntity[spec.key] = 0;
      }
    }
  }
  return {
    pending,
    byEntity,
    lastResult: _lastResult,
    projectCode: config?.projectCode ?? null,
    enabled: !!(config?.enabled && config?.projectCode)
  };
}

let _wired = false;

/**
 * Подключение к жизненному циклу: после цикла синхронизации ядра, при появлении сети и
 * при старте платформы. Автозапуск ничего не делает без проекта и сессии.
 */
export function initPlanFactCloud(): void {
  if (_wired) return;
  _wired = true;

  const run = (): void => {
    void syncPlanFact().catch(() => { /* очередь останется на устройстве */ });
  };

  // Слушатели ставим только там, где они есть: модуль может быть загружен и вне DOM (тесты, инструменты).
  if (typeof window.addEventListener === 'function') window.addEventListener('online', run);
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('sync:completed', () => setTimeout(run, 1500));
  }
  window.RBI?.events?.on?.('sync:completed', () => setTimeout(run, 1500));
  window.RBI?.events?.on?.('platform:ready', () => setTimeout(run, 3000));

  (window as unknown as { PlanFactCloud?: unknown }).PlanFactCloud = {
    sync: syncPlanFact,
    queue: planFactQueue,
    entities: ENTITIES.map((spec) => ({ key: spec.key, table: spec.table, scope: spec.scope ?? 'project' })),
    // Справочник и сопоставление — для смоука и отладки: проверить, что данные из облака
    // действительно участвуют в сопоставлении, а не лежат мёртвым грузом.
    catalog: buildCatalog,
    match: matchInCatalog,
    works: { list: listWorks, save: saveWork, archive: archiveWork },
    aliases: { list: listAliases, save: saveAlias },
    // Утверждение объёмов — для смоука и автоматизации: тот же путь, что и в интерфейсе.
    approval: {
      propose: proposeContours,
      decide: decideProposal,
      requestChange,
      decideChange: decideChangeRequest,
      listProposals,
      listBaselines,
      listChanges: listChangeRequests,
      audit: listAudit
    }
  };
}

/** Только для смоука и отладки: снять перекрытие по времени, чтобы тянуть всё заново. */
export function resetPlanFactPullStamp(): void {
  localStorage.removeItem(PULL_STAMP_KEY);
}

export type PlanFactFactRecord = FactRecord;
export type PlanFactNormRecord = NormRecord;
