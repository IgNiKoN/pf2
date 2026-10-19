/**
 * Тесты утверждения объёмов (ТЗ-2б): предложение ПТО → решение РП → неизменяемый baseline →
 * запрос на изменение → аудит. Проверяем именно процесс: кто вправе, что фиксируется, что нельзя.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  baselineDiff, canApproveContours, currentBaseline, decideChangeRequest, decideProposal,
  listAudit, listBaselines, listChangeRequests, listProposalRows, listProposals, proposeContours,
  requestChange
} from './approval.ts';
import { listContours } from './contours.ts';

interface FakeOptions {
  propose?: boolean;
  approve?: boolean;
  actor?: string;
}

function installFakePlatform(options: FakeOptions = {}): Map<string, Map<string, unknown>> {
  const stores = new Map<string, Map<string, unknown>>();
  for (const name of ['plan_fact_proposals', 'plan_fact_proposal_rows', 'plan_fact_baselines',
    'plan_fact_change_requests', 'plan_fact_audit', 'plan_fact_quantities']) {
    stores.set(name, new Map());
  }
  let counter = 0;
  const fakeWindow = {
    RBI: {
      services: {
        storage: {
          stores: () => ({
            PLAN_FACT_PROPOSALS: 'plan_fact_proposals',
            PLAN_FACT_PROPOSAL_ROWS: 'plan_fact_proposal_rows',
            PLAN_FACT_BASELINES: 'plan_fact_baselines',
            PLAN_FACT_CHANGE_REQUESTS: 'plan_fact_change_requests',
            PLAN_FACT_AUDIT: 'plan_fact_audit',
            PLAN_FACT_QUANTITIES: 'plan_fact_quantities'
          }),
          getAll: async (store: string) => [...(stores.get(store)?.values() ?? [])],
          put: async (store: string, record: { id: string }) => {
            if (!stores.has(store)) stores.set(store, new Map());
            (stores.get(store) as Map<string, unknown>).set(record.id, record);
            return record;
          },
          delete: async (store: string, key: string) => {
            stores.get(store)?.delete(key);
          },
          generateId: (prefix: string) => {
            counter += 1;
            return `${prefix}_${counter}`;
          }
        },
        permissions: {
          canManageContours: () => options.propose !== false,
          canApproveContours: () => options.approve === true,
          getCurrentEngineerName: () => options.actor ?? 'ПТО'
        }
      }
    }
  };
  (globalThis as unknown as { window: unknown }).window = fakeWindow;
  return stores;
}

const ROWS = [
  { worItemId: 'wor-1', quantity: '120,5', workRaw: 'Штукатурка стен', place: 'кв. 1' },
  { worItemId: 'wor-2', quantity: '240', workRaw: 'Окраска стен', place: 'кв. 1' }
];

test('право утверждения не путается с правом правки объёмов', () => {
  installFakePlatform({ propose: true, approve: false });
  assert.equal(canApproveContours(), false, 'ПТО объёмы ведёт, но не утверждает');
  installFakePlatform({ propose: false, approve: true });
  assert.equal(canApproveContours(), true, 'РП утверждает, но объёмы не правит');
});

test('ПТО предлагает объёмы: снимок, строки и запись в аудите', async () => {
  installFakePlatform({ propose: true, actor: 'ПТО Иванова' });
  const result = await proposeContours({ objectId: 'obj-1', title: 'Секция 1', rows: ROWS });

  assert.equal(result.ok, true, result.error);
  assert.equal(result.record?.status, 'submitted');
  assert.equal(result.record?.submittedBy, 'ПТО Иванова');

  const proposals = await listProposals('obj-1');
  assert.equal(proposals.length, 1);
  const rows = await listProposalRows(result.record?.id as string);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.quantity), ['120,5', '240']);

  const audit = await listAudit();
  assert.equal(audit[0].action, 'propose');
  assert.equal(audit[0].actor, 'ПТО Иванова');
});

test('без права ПТО предложение не создаётся, пустое предлагать нельзя', async () => {
  installFakePlatform({ propose: false, approve: true });
  const denied = await proposeContours({ objectId: 'obj-1', rows: ROWS });
  assert.equal(denied.ok, false);
  assert.match(String(denied.error), /ПТО/);

  installFakePlatform({ propose: true });
  assert.equal((await proposeContours({ objectId: 'obj-1', rows: [] })).ok, false);
  assert.equal((await proposeContours({ objectId: 'obj-1', rows: [{ worItemId: 'w', quantity: '  ' }] })).ok, false);
  assert.equal((await proposeContours({ objectId: 'obj-1', rows: [{ worItemId: 'w', quantity: '-5' }] })).ok, false);
});

test('второе предложение при активном не создаётся: сначала решение по первому', async () => {
  installFakePlatform({ propose: true });
  await proposeContours({ objectId: 'obj-1', rows: ROWS });
  const second = await proposeContours({ objectId: 'obj-1', rows: ROWS });
  assert.equal(second.ok, false);
  assert.match(String(second.error), /на утверждении/);
});

test('РП утверждает: baseline неизменяем, утверждённый контур берётся из него', async () => {
  const stores = installFakePlatform({ propose: true, approve: true, actor: 'РП Петров' });
  const proposal = await proposeContours({ objectId: 'obj-1', title: 'Секция 1', rows: ROWS });
  const decision = await decideProposal({ proposalId: proposal.record?.id as string, decision: 'approved' });

  assert.equal(decision.ok, true, decision.error);
  const baseline = decision.baseline;
  assert.ok(baseline, 'baseline создан');
  assert.equal(baseline?.snapshot.rows.length, 2);
  assert.equal(baseline?.approvedBy, 'РП Петров');
  assert.equal(baseline?.snapshot.revision, 1);

  const proposals = await listProposals('obj-1');
  assert.equal(proposals[0].status, 'approved');
  assert.equal(proposals[0].decidedBy, 'РП Петров');

  // Утверждённый контур заполнен из baseline — то же число, а не независимое.
  const contours = await listContours('obj-1');
  const approved = contours.filter((row) => row.kind === 'APPROVED');
  assert.equal(approved.length, 2);
  assert.deepEqual(approved.map((row) => row.quantity).sort(), ['120.5', '240']);
  assert.equal(approved[0].source, 'baseline');

  // Записи аудита могут попасть в одну миллисекунду, поэтому проверяем состав, а не порядок.
  const actions = (await listAudit()).map((record) => record.action);
  assert.ok(actions.includes('approve') && actions.includes('create'),
    `в аудите должны быть решение и создание baseline, а есть: ${actions.join(', ')}`);

  // Baseline лежит в сторадже один и не переписывается при повторном решении.
  const stored = stores.get('plan_fact_baselines') as Map<string, unknown>;
  assert.equal(stored.size, 1);
  const again = await decideProposal({ proposalId: proposal.record?.id as string, decision: 'approved' });
  assert.equal(again.ok, false, 'решение принимается один раз');
});

test('без права РП утверждение невозможно, отказ требует причины', async () => {
  installFakePlatform({ propose: true, approve: false });
  const proposal = await proposeContours({ objectId: 'obj-1', rows: ROWS });
  const denied = await decideProposal({ proposalId: proposal.record?.id as string, decision: 'approved' });
  assert.equal(denied.ok, false);
  assert.match(String(denied.error), /РП/);

  installFakePlatform({ propose: true, approve: true });
  const fresh = await proposeContours({ objectId: 'obj-1', rows: ROWS });
  const noReason = await decideProposal({ proposalId: fresh.record?.id as string, decision: 'rejected' });
  assert.equal(noReason.ok, false);
  assert.match(String(noReason.error), /причина/);

  const rejected = await decideProposal({
    proposalId: fresh.record?.id as string, decision: 'rejected', reason: 'объёмы не сходятся с актом'
  });
  assert.equal(rejected.ok, true);
  assert.equal((await listProposals('obj-1'))[0].status, 'rejected');
  assert.equal((await listBaselines('obj-1')).length, 0, 'при отказе baseline не создаётся');
  assert.equal((await listContours('obj-1')).filter((row) => row.kind === 'APPROVED').length, 0);
});

test('изменение утверждённого объёма: причина обязательна, нужен baseline', async () => {
  installFakePlatform({ propose: true, approve: true });
  const change = await requestChange({
    objectId: 'obj-1', worItemId: 'wor-1', kind: 'APPROVED', qtyAfter: '130', reason: 'уточнение по обмеру'
  });
  assert.equal(change.ok, false, 'без baseline менять нечего');
  assert.match(String(change.error), /baseline/);

  const proposal = await proposeContours({ objectId: 'obj-1', rows: ROWS });
  await decideProposal({ proposalId: proposal.record?.id as string, decision: 'approved' });

  const noReason = await requestChange({
    objectId: 'obj-1', worItemId: 'wor-1', kind: 'APPROVED', qtyAfter: '130', reason: ''
  });
  assert.equal(noReason.ok, false);
  assert.match(String(noReason.error), /Причина/);

  const created = await requestChange({
    objectId: 'obj-1', worItemId: 'wor-1', kind: 'APPROVED', qtyAfter: '130', reason: 'уточнение по обмеру'
  });
  assert.equal(created.ok, true, created.error);
  assert.equal(created.record?.status, 'created');
  assert.equal(created.record?.qtyBefore, '120,5', 'видно, что было до изменения');
  assert.equal(created.record?.qtyAfter, '130');
});

test('утверждённое изменение создаёт НОВЫЙ baseline, старый остаётся неизменным', async () => {
  installFakePlatform({ propose: true, approve: true });
  const proposal = await proposeContours({ objectId: 'obj-1', rows: ROWS });
  const first = await decideProposal({ proposalId: proposal.record?.id as string, decision: 'approved' });
  const change = await requestChange({
    objectId: 'obj-1', worItemId: 'wor-1', kind: 'APPROVED', qtyAfter: '130', reason: 'уточнение по обмеру'
  });

  const decision = await decideChangeRequest({ id: change.record?.id as string, decision: 'approved' });
  assert.equal(decision.ok, true, decision.error);

  const baselines = await listBaselines('obj-1');
  assert.equal(baselines.length, 2, 'изменение — это новый baseline, а не правка прежнего');
  assert.equal(baselines[0].id, first.baseline?.id);
  assert.equal(baselines[0].snapshot.rows.find((row) => row.worItemId === 'wor-1')?.quantity, '120,5',
    'в прежнем baseline значение осталось прежним');
  assert.equal(baselines[1].snapshot.revision, 2);
  assert.equal(baselines[1].snapshot.rows.find((row) => row.worItemId === 'wor-1')?.quantity, '130');
  assert.equal(currentBaseline(baselines)?.id, baselines[1].id);

  const contours = await listContours('obj-1');
  const approved = contours.filter((row) => row.kind === 'APPROVED');
  assert.deepEqual(approved.map((row) => row.quantity).sort(), ['130', '240']);
  assert.equal(approved.find((row) => row.worItemId === 'wor-1')?.source, 'change_request');

  const requests = await listChangeRequests('obj-1');
  assert.equal(requests[0].status, 'effective');
  assert.equal(requests[0].effectiveAt !== null, true);

  const audit = await listAudit();
  assert.ok(audit.some((record) => record.action === 'create' && record.entity === 'change_request'));
  assert.ok(audit.some((record) => record.action === 'approve' && record.entity === 'change_request'));
});

test('отказ по изменению оставляет утверждённый объём прежним', async () => {
  installFakePlatform({ propose: true, approve: true });
  const proposal = await proposeContours({ objectId: 'obj-1', rows: ROWS });
  await decideProposal({ proposalId: proposal.record?.id as string, decision: 'approved' });
  const change = await requestChange({
    objectId: 'obj-1', worItemId: 'wor-1', kind: 'APPROVED', qtyAfter: '130', reason: 'спорный обмер'
  });

  const rejected = await decideChangeRequest({ id: change.record?.id as string, decision: 'rejected', reason: 'нет обоснования' });
  assert.equal(rejected.ok, true);
  assert.equal((await listBaselines('obj-1')).length, 1, 'нового baseline нет');
  assert.equal((await listChangeRequests('obj-1'))[0].status, 'rejected');
  const approved = (await listContours('obj-1')).filter((row) => row.kind === 'APPROVED');
  assert.equal(approved.find((row) => row.worItemId === 'wor-1')?.quantity, '120.5', 'объём не изменился');
});

test('расхождение с baseline видно, а без baseline расхождений нет', async () => {
  installFakePlatform({ propose: true, approve: true });
  const proposal = await proposeContours({ objectId: 'obj-1', rows: ROWS });
  const decision = await decideProposal({ proposalId: proposal.record?.id as string, decision: 'approved' });
  const baseline = decision.baseline ?? null;

  assert.deepEqual(baselineDiff(null, []), []);

  const diff = baselineDiff(baseline, [
    { worItemId: 'wor-1', values: { APPROVED: '999' } },
    { worItemId: 'wor-2', values: { APPROVED: '240' } }
  ]);
  assert.equal(diff.length, 1, 'совпавшая строка расхождением не считается');
  assert.deepEqual(diff[0], { worItemId: 'wor-1', kind: 'APPROVED', approved: '120,5', current: '999' });
});
