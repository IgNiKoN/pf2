/**
 * Тесты облачного адаптера: маппинг десятичных строк, отметки очереди, отсутствие эха
 * и правило «локальная правка главнее облака».
 *
 * Сеть не нужна: подменяем клиент Supabase, сторадж и localStorage. Реальная проверка
 * синхронизации с живым Supabase — отдельной фазой браузерного смоука.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { initPlanFactCloud, planFactQueue, resetPlanFactPullStamp, syncPlanFact } from './cloud.ts';

interface FakePlatform {
  records: Map<string, Record<string, unknown>>;
  upserts: { table: string; rows: Record<string, unknown>[] }[];
  pullRows: Record<string, Record<string, unknown>[]>;
  upsertError: string | null;
  /** Запрошенные страницы — проверяем, что приём идёт страницами, а не одним запросом. */
  pages: { table: string; from: number; to: number }[];
  /** Фильтры области: по чему именно ограничивались строки. */
  filters: { table: string; column: string; value: string }[];
  /** Вставки без upsert: журнал аудита пишется только так. */
  inserts: { table: string; rows: Record<string, unknown>[] }[];
}

function installFakePlatform(options: {
  enabled?: boolean;
  projectCode?: string | null;
  session?: boolean;
  online?: boolean;
} = {}): FakePlatform {
  const state: FakePlatform = {
    records: new Map(), upserts: [], inserts: [], pullRows: {}, upsertError: null, pages: [], filters: []
  };

  const stores: Record<string, string> = {
    PLAN_FACT_IMPORTS: 'plan_fact_imports',
    PLAN_FACT_WOR: 'plan_fact_wor',
    PLAN_FACT_FACTS: 'plan_fact_facts',
    PLAN_FACT_NORMS: 'plan_fact_norms',
    PLAN_FACT_CALENDAR: 'plan_fact_calendar',
    PLAN_FACT_QUANTITIES: 'plan_fact_quantities',
    PLAN_FACT_WORKS: 'plan_fact_works',
    PLAN_FACT_WORK_ALIASES: 'plan_fact_work_aliases',
    PLAN_FACT_PROPOSALS: 'plan_fact_proposals',
    PLAN_FACT_PROPOSAL_ROWS: 'plan_fact_proposal_rows',
    PLAN_FACT_BASELINES: 'plan_fact_baselines',
    PLAN_FACT_CHANGE_REQUESTS: 'plan_fact_change_requests',
    PLAN_FACT_AUDIT: 'plan_fact_audit'
  };

  const chain = (table: string): unknown => {
    const rows = (): Record<string, unknown>[] => (state.pullRows[table] ? [...state.pullRows[table]] : []);
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (column: string, value: string) => {
        state.filters.push({ table, column, value });
        return api;
      },
      gt: () => api,
      order: () => api,
      limit: () => Promise.resolve({ data: rows(), error: null }),
      // Как postgrest: страница по диапазону, конец диапазона включается.
      range: (from: number, to: number) => {
        state.pages.push({ table, from, to });
        return Promise.resolve({ data: rows().slice(from, to + 1), error: null });
      }
    };
    return api;
  };

  const fakeWindow = {
    RBI: {
      services: {
        storage: {
          stores: () => stores,
          getAll: async (store: string) => [...state.records.values()].filter((record) => record.__store === store)
            .map(({ __store, ...rest }) => rest),
          put: async (store: string, record: Record<string, unknown>) => {
            state.records.set(`${store}|${record.id}`, { ...record, __store: store });
            return record;
          },
          putBatch: async (store: string, list: Record<string, unknown>[]) => {
            for (const record of list) state.records.set(`${store}|${record.id}`, { ...record, __store: store });
            return list;
          }
        }
      },
      events: { emit: () => {}, on: () => {} }
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    syncConfig: {
      enabled: options.enabled !== false,
      projectCode: options.projectCode === undefined ? 'rbi-test' : options.projectCode
    },
    supabaseClient: {
      auth: { getSession: async () => ({ data: { session: options.session === false ? null : { user: {} } } }) },
      from: (table: string) => ({
        select: () => chain(table),
        upsert: async (rows: Record<string, unknown>[]) => {
          if (state.upsertError) return { error: { message: state.upsertError } };
          state.upserts.push({ table, rows });
          return { error: null };
        },
        insert: async (rows: Record<string, unknown>[]) => {
          if (state.upsertError) return { error: { message: state.upsertError } };
          state.inserts.push({ table, rows });
          return { error: null };
        },
        delete: () => ({ eq: async () => ({ error: null }) })
      })
    }
  };

  const define = (name: string, value: unknown): void => {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  define('window', fakeWindow);
  define('navigator', { onLine: options.online !== false });
  const storage = new Map<string, string>();
  define('localStorage', {
    getItem: (key: string) => (storage.has(key) ? String(storage.get(key)) : null),
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key)
  });
  resetPlanFactPullStamp();
  return state;
}

function seedFact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'fact-1',
    objectId: 'obj-1',
    section: 'Секция 1',
    floor: '2',
    place: 'кв. 15а',
    workKey: 'shtukaturka',
    workRaw: 'Штукатурка стен',
    unit: 'm2',
    quantity: '12.5',
    factDate: '2026-10-15',
    comment: 'Замер',
    author: 'Прораб',
    createdAt: '2026-10-15T10:00:00.000Z',
    status: 'pending',
    correctsId: null,
    supersededBy: null,
    revision: 1,
    __store: 'plan_fact_facts',
    ...overrides
  };
}

test('без включённого облака синк откладывается и ничего не отправляет', async () => {
  const state = installFakePlatform({ enabled: false });
  state.records.set('plan_fact_facts|fact-1', seedFact());

  const result = await syncPlanFact();
  assert.equal(result.skipped, 'disabled');
  assert.equal(result.pushed, 0);
  assert.equal(state.upserts.length, 0, 'при выключенном облаке запросов нет');

  const queue = await planFactQueue();
  assert.equal(queue.pending, 1, 'очередь остаётся на устройстве');
  assert.equal(queue.enabled, false);
});

test('без сети синк откладывается, очередь сохраняется', async () => {
  const state = installFakePlatform({ online: false });
  state.records.set('plan_fact_facts|fact-1', seedFact());

  const result = await syncPlanFact();
  assert.equal(result.skipped, 'offline');
  assert.equal(state.upserts.length, 0);
  assert.equal((await planFactQueue()).pending, 1);
});

test('без сессии синк откладывается', async () => {
  const state = installFakePlatform({ session: false });
  state.records.set('plan_fact_facts|fact-1', seedFact());

  const result = await syncPlanFact();
  assert.equal(result.skipped, 'no-session');
  assert.equal(state.upserts.length, 0);
});

test('отправка: маппинг в облачные колонки, затем отметки «синхронизирован» и «передан»', async () => {
  const state = installFakePlatform();
  state.records.set('plan_fact_facts|fact-1', seedFact());

  const result = await syncPlanFact();
  assert.equal(result.skipped, null);
  assert.equal(result.pushed, 1, result.error ?? '');
  assert.equal(result.failed, 0);

  const factsPush = state.upserts.find((entry) => entry.table === 'plan_fact_facts');
  assert.ok(factsPush, 'факт ушёл в plan_fact_facts');
  const row = factsPush.rows[0];
  assert.equal(row.project_code, 'rbi-test', 'строка привязана к проекту');
  assert.equal(row.quantity, '12.5', 'объём уходит десятичной строкой');
  assert.equal(row.fact_date, '2026-10-15');
  assert.equal(row.work_key, 'shtukaturka');
  assert.equal(row.superseded_by, null);
  // Время записи клиент не диктует: его ставит база триггером (sql/018), иначе часы
  // устройства решали бы, увидит ли правку инкрементальный приём.
  assert.equal(row.updated_at, undefined, 'клиент не присылает updated_at');

  const local = state.records.get('plan_fact_facts|fact-1');
  assert.equal(local?.syncStatus, 'synced');
  assert.equal(local?.status, 'handed_over', 'уехавший факт больше не «в очереди»');
  assert.equal((await planFactQueue()).pending, 0);
});

test('эха нет: синхронизированная запись повторно не отправляется', async () => {
  const state = installFakePlatform();
  state.records.set('plan_fact_facts|fact-1', seedFact());

  await syncPlanFact();
  const first = state.upserts.length;
  const second = await syncPlanFact();

  assert.equal(second.pushed, 0);
  assert.equal(state.upserts.length, first, 'повторных upsert нет');
});

test('приём: облачная запись ложится локально, но не затирает ожидающую отправки', async () => {
  const state = installFakePlatform();
  // Локальная правка, ещё не уехавшая: её терять нельзя.
  state.records.set('plan_fact_facts|fact-pending', seedFact({ id: 'fact-pending', quantity: '99' }));
  state.pullRows.plan_fact_facts = [
    {
      id: 'fact-pending', object_id: 'obj-1', section: '', floor: '2', place: '', work_key: 'shtukaturka',
      work_raw: 'Штукатурка стен', unit: 'm2', quantity: '1', fact_date: '2026-10-15', comment: '',
      author: 'ПТО', status: 'pending', corrects_id: null, superseded_by: null, revision: 1,
      created_at: '2026-10-15T09:00:00.000Z'
    },
    {
      id: 'fact-cloud', object_id: 'obj-1', section: '', floor: '3', place: '', work_key: 'okraska',
      work_raw: 'Окраска стен', unit: 'm2', quantity: '7.25', fact_date: '2026-10-14', comment: 'из облака',
      author: 'Прораб', status: 'handed_over', corrects_id: null, superseded_by: null, revision: 1,
      created_at: '2026-10-14T09:00:00.000Z'
    }
  ];
  state.upsertError = 'нет прав на запись';

  const result = await syncPlanFact();
  // Ожидающая отправки локальная запись пропускается и в счёт принятых не попадает.
  assert.equal(result.pulled, 1);

  const kept = state.records.get('plan_fact_facts|fact-pending');
  assert.equal(kept?.quantity, '99', 'локальная правка не затёрта облаком');

  const incoming = state.records.get('plan_fact_facts|fact-cloud');
  assert.equal(incoming?.quantity, '7.25', 'число из облака осталось десятичной строкой');
  assert.equal(incoming?.syncStatus, 'synced');
  assert.equal(incoming?.origin, 'cloud');
  assert.equal(result.failed > 0, true, 'ошибка отправки видна в результате, а не проглочена');
});

test('приём идёт страницами: 2500 строк доезжают целиком', async () => {
  const state = installFakePlatform();
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < 2500; index += 1) {
    rows.push({
      id: `fact-cloud-${index}`, object_id: 'obj-1', section: '', floor: '2', place: '',
      work_key: 'shtukaturka', work_raw: 'Штукатурка стен', unit: 'm2', quantity: '1',
      fact_date: '2026-10-15', comment: '', author: 'ПТО', status: 'handed_over',
      corrects_id: null, superseded_by: null, revision: 1,
      created_at: '2026-10-15T09:00:00.000Z'
    });
  }
  state.pullRows.plan_fact_facts = rows;

  const result = await syncPlanFact();
  assert.equal(result.failed, 0, result.error ?? '');
  assert.ok(result.pulled >= 2500, `получено ${result.pulled}, ожидалось не меньше 2500`);

  const factPages = state.pages.filter((page) => page.table === 'plan_fact_facts');
  assert.ok(factPages.length >= 3, `страниц по факту запрошено ${factPages.length}, ожидалось не меньше 3`);
  assert.deepEqual(factPages.slice(0, 3).map((page) => [page.from, page.to]),
    [[0, 999], [1000, 1999], [2000, 2999]], 'страницы идут подряд по 1000 строк');
  assert.ok(state.records.has('plan_fact_facts|fact-cloud-2499'), 'последняя строка тоже записана локально');
});

test('справочник синхронизируется в корпоративной области, а не по объекту', async () => {
  const state = installFakePlatform();
  state.records.set('plan_fact_works|work-1', {
    id: 'work-1', code: 'smoke', name: 'Правка ПТО', unit: 'm2', stage: '', groupName: 'Стены',
    calcRule: '', revision: 2, isActive: true, source: 'pto', createdBy: 'ПТО', updatedAt: '',
    syncStatus: 'pending', __store: 'plan_fact_works'
  });
  state.records.set('plan_fact_work_aliases|alias-1', {
    id: 'alias-1', workId: 'work-1', alias: 'Проба из формы', normalizedAlias: 'проба из формы',
    source: 'pto', createdBy: 'ПТО', updatedAt: '', syncStatus: 'pending', __store: 'plan_fact_work_aliases'
  });

  const result = await syncPlanFact();
  assert.equal(result.failed, 0, result.error ?? '');

  const worksPush = state.upserts.find((entry) => entry.table === 'plan_fact_works');
  const row = worksPush?.rows[0];
  assert.equal(row?.company_id, 'rbi', 'справочник уходит в корпоративную область');
  assert.equal(row?.project_code, undefined, 'project_code в справочнике не используется');
  assert.equal(row?.revision, 2, 'версия правки уезжает вместе с записью');

  const aliasPush = state.upserts.find((entry) => entry.table === 'plan_fact_work_aliases');
  assert.equal(aliasPush?.rows[0]?.company_id, 'rbi');
  assert.equal(aliasPush?.rows[0]?.normalized_alias, 'проба из формы');

  // Приём: справочник ограничивается компанией, объектные сущности — проектом.
  const workFilter = state.filters.find((entry) => entry.table === 'plan_fact_works');
  const factFilter = state.filters.find((entry) => entry.table === 'plan_fact_facts');
  assert.equal(workFilter?.column, 'company_id');
  assert.equal(workFilter?.value, 'rbi');
  assert.equal(factFilter?.column, 'project_code', 'факты по-прежнему читаются по проекту');
});

test('подключение к жизненному циклу не падает без платформы', async () => {
  installFakePlatform();
  initPlanFactCloud();
  const queue = await planFactQueue();
  assert.equal(queue.projectCode, 'rbi-test');
});

test('утверждение уходит по проекту, а журнал аудита пишется вставкой, без id', async () => {
  const state = installFakePlatform();
  state.records.set('plan_fact_proposals|prop-1', {
    id: 'prop-1', objectId: 'obj-1', title: 'Секция 1', status: 'submitted', submittedBy: 'ПТО',
    submittedAt: '2026-10-15T10:00:00.000Z', decidedBy: '', decidedAt: null, decisionReason: '',
    createdAt: '2026-10-15T10:00:00.000Z', updatedAt: '2026-10-15T10:00:00.000Z',
    syncStatus: 'pending', __store: 'plan_fact_proposals'
  });
  state.records.set('plan_fact_baselines|base-1', {
    id: 'base-1', objectId: 'obj-1', proposalId: 'prop-1', approvedBy: 'РП',
    approvedAt: '2026-10-15T11:00:00.000Z',
    snapshot: { rows: [{ worItemId: 'wor-1', quantity: '120.5', contour: 'APPROVED' }], revision: 1 },
    createdAt: '2026-10-15T11:00:00.000Z', syncStatus: 'pending', __store: 'plan_fact_baselines'
  });
  state.records.set('plan_fact_change_requests|chg-1', {
    id: 'chg-1', objectId: 'obj-1', baselineId: 'base-1', worItemId: 'wor-1', quantityKind: 'APPROVED',
    qtyBefore: '120.5', qtyAfter: '130', reason: 'уточнение', status: 'created', createdBy: 'ПТО',
    createdAt: '2026-10-15T12:00:00.000Z', checkedBy: '', decidedBy: '', decidedAt: null,
    effectiveAt: null, updatedAt: '2026-10-15T12:00:00.000Z', workRaw: '', place: '',
    syncStatus: 'pending', __store: 'plan_fact_change_requests'
  });
  state.records.set('plan_fact_audit|audit-1', {
    id: 'audit-1', entity: 'proposal', entityId: 'prop-1', action: 'propose', actor: 'ПТО',
    reason: '', beforeValue: null, afterValue: { rows: 1 },
    createdAt: '2026-10-15T10:00:00.000Z', syncStatus: 'pending', __store: 'plan_fact_audit'
  });

  const result = await syncPlanFact();
  assert.equal(result.failed, 0, result.error ?? '');

  const proposal = state.upserts.find((entry) => entry.table === 'plan_fact_proposals')?.rows[0];
  assert.equal(proposal?.project_code, 'rbi-test', 'утверждение живёт по проекту');
  assert.equal(proposal?.status, 'submitted');

  const baseline = state.upserts.find((entry) => entry.table === 'plan_fact_baselines')?.rows[0];
  assert.equal(baseline?.project_code, 'rbi-test');
  assert.equal(baseline?.is_deleted, undefined, 'у baseline нет мягкого удаления — он неизменяем');
  assert.equal(baseline?.updated_at, undefined, 'и нет времени правки: править его нельзя');

  const change = state.upserts.find((entry) => entry.table === 'plan_fact_change_requests')?.rows[0];
  assert.equal(change?.qty_before, '120.5', 'объёмы уходят десятичными строками, а не float');
  assert.equal(change?.qty_after, '130');

  const audit = state.inserts.find((entry) => entry.table === 'plan_fact_audit')?.rows[0];
  assert.ok(audit, 'журнал аудита пишется вставкой');
  assert.equal(audit?.id, undefined, 'id журнала выдаёт база (bigserial)');
  assert.equal(audit?.entity_id, 'prop-1');
});
