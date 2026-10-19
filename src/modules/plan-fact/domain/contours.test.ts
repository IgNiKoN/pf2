/**
 * Тесты контуров объёмов (ТЗ VOR-016): пять контуров, «незаполнено ≠ 0», право ПТО,
 * очистка контура и расхождения между контурами.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildContourRows, canManageContours, clearContour, contourCompletion, CONTOURS, listContours, setContour
} from './contours.ts';

function installFakePlatform(options: { canManage: boolean; actor?: string }): Map<string, unknown> {
  const records = new Map<string, unknown>();
  let counter = 0;
  const fakeWindow = {
    RBI: {
      services: {
        storage: {
          stores: () => ({ PLAN_FACT_QUANTITIES: 'plan_fact_quantities' }),
          getAll: async () => [...records.values()],
          put: async (store: string, record: { id: string }) => {
            assert.equal(store, 'plan_fact_quantities');
            records.set(record.id, record);
            return record;
          },
          delete: async (_store: string, key: string) => {
            records.delete(key);
            return true;
          },
          generateId: (prefix: string) => {
            counter += 1;
            return `${prefix}_${counter}`;
          }
        },
        permissions: {
          canManageContours: () => options.canManage,
          getCurrentEngineerName: () => options.actor ?? 'ПТО Иванова'
        }
      }
    }
  };
  (globalThis as unknown as { window: unknown }).window = fakeWindow;
  return records;
}

function worRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wor-1',
    floor: '2',
    place: 'кв. 15а',
    workRaw: 'Штукатурка стен',
    unitRaw: 'S, м2',
    unit: 'm2',
    quantity: '100',
    ...overrides
  } as Parameters<typeof buildContourRows>[0][number];
}

test('контуров ровно пять на правку, факт в них не входит', () => {
  assert.deepEqual(CONTOURS.map((contour) => contour.kind),
    ['RD', 'CONTRACT', 'PROPOSED', 'APPROVED', 'CUSTOMER_ACCEPTED']);
});

test('без права ПТО контур записать нельзя', async () => {
  const records = installFakePlatform({ canManage: false });

  assert.equal(canManageContours(), false);
  const result = await setContour({ worItemId: 'wor-1', objectId: 'obj-1', kind: 'RD', quantity: '100' });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /ПТО/);
  assert.equal(records.size, 0);
});

test('контур пишется десятичной строкой с автором, повторная запись обновляет ту же', async () => {
  const records = installFakePlatform({ canManage: true });

  const first = await setContour({ worItemId: 'wor-1', objectId: 'obj-1', kind: 'RD', quantity: '99,5', source: 'РД-12' });
  assert.equal(first.ok, true, first.error);
  assert.equal(first.record?.quantity, '99.5');
  assert.equal(first.record?.updatedBy, 'ПТО Иванова');
  assert.equal(first.record?.syncStatus, 'pending');

  const second = await setContour({ worItemId: 'wor-1', objectId: 'obj-1', kind: 'RD', quantity: '101' });
  assert.equal(second.ok, true);
  assert.equal(second.record?.id, first.record?.id, 'обновляется та же запись, а не плодится вторая');
  assert.equal(records.size, 1);

  const stored = await listContours('obj-1');
  assert.equal(stored.length, 1);
  assert.equal(stored[0].quantity, '101');
});

test('пустое значение и отрицательный объём: очистка вместо нуля, минус — отказ', async () => {
  const records = installFakePlatform({ canManage: true });
  await setContour({ worItemId: 'wor-1', objectId: 'obj-1', kind: 'CONTRACT', quantity: '50' });

  const negative = await setContour({ worItemId: 'wor-1', objectId: 'obj-1', kind: 'RD', quantity: '-5' });
  assert.equal(negative.ok, false);
  assert.match(String(negative.error), /корректировк/);

  const empty = await setContour({ worItemId: 'wor-1', objectId: 'obj-1', kind: 'CONTRACT', quantity: '   ' });
  assert.equal(empty.ok, true);
  assert.equal(empty.record, null, 'пустая строка означает «не заполнено», а не ноль');
  assert.equal((await listContours('obj-1')).length, 0, 'контур снова не заполнен');
  const stored = [...records.values()][0] as { isDeleted?: boolean; syncStatus?: string };
  assert.equal(stored.isDeleted, true, 'запись помечена удалённой, а не выброшена: иначе приём вернул бы её');
  assert.equal(stored.syncStatus, 'pending', 'удаление тоже уезжает в облако');

  const rubbish = await setContour({ worItemId: 'wor-1', objectId: 'obj-1', kind: 'RD', quantity: 'abc' });
  assert.equal(rubbish.ok, false);
  assert.match(String(rubbish.error), /числом/);
});

test('очистка снимает контур, чужой объект не трогает', async () => {
  installFakePlatform({ canManage: true });
  await setContour({ worItemId: 'wor-1', objectId: 'obj-1', kind: 'PROPOSED', quantity: '80' });
  await setContour({ worItemId: 'wor-2', objectId: 'obj-2', kind: 'PROPOSED', quantity: '20' });

  const cleared = await clearContour('wor-1', 'PROPOSED');
  assert.equal(cleared.ok, true);
  assert.equal((await listContours('obj-1')).length, 0);
  assert.equal((await listContours('obj-2')).length, 1, 'другой объект не затронут');
});

test('незаполненный контур — это пусто, а не ноль; расхождение не считается', () => {
  const rows = buildContourRows([worRow()], []);
  const row = rows[0];

  assert.equal(row.values.RD, null, 'нет записи — значит не заполнено');
  assert.notEqual(row.values.RD, '0', 'пустое не подменяется нулём');
  assert.equal(row.proposedMinusContract, null, 'разность с незаполненным контуром не считается');
  assert.equal(row.filled, 0);
  assert.equal(row.incomplete, true);
  assert.equal(row.plan, '100', 'план из формы заказчика остаётся видимым');
});

test('заполненные контуры дают точное расхождение и признак полноты', () => {
  const contours = [
    { id: 'q1', worItemId: 'wor-1', objectId: 'obj-1', kind: 'RD' as const, quantity: '100', source: '', method: '', note: '', updatedBy: '', updatedAt: '' },
    { id: 'q2', worItemId: 'wor-1', objectId: 'obj-1', kind: 'CONTRACT' as const, quantity: '90', source: '', method: '', note: '', updatedBy: '', updatedAt: '' },
    { id: 'q3', worItemId: 'wor-1', objectId: 'obj-1', kind: 'PROPOSED' as const, quantity: '87.5', source: '', method: '', note: '', updatedBy: '', updatedAt: '' },
    { id: 'q4', worItemId: 'wor-1', objectId: 'obj-1', kind: 'APPROVED' as const, quantity: '87.5', source: '', method: '', note: '', updatedBy: '', updatedAt: '' },
    { id: 'q5', worItemId: 'wor-1', objectId: 'obj-1', kind: 'CUSTOMER_ACCEPTED' as const, quantity: '80.25', source: '', method: '', note: '', updatedBy: '', updatedAt: '' }
  ];

  const rows = buildContourRows([worRow()], contours);
  const row = rows[0];

  assert.equal(row.values.RD, '100');
  assert.equal(row.values.CUSTOMER_ACCEPTED, '80.25');
  assert.equal(row.proposedMinusContract, '-2.5', 'предлагаем на 2,5 меньше договора');
  assert.equal(row.filled, 5);
  assert.equal(row.incomplete, false);

  const completion = contourCompletion(rows);
  assert.deepEqual(completion, { total: 1, complete: 1, partial: 0, empty: 0, incomplete: 0 });
});

test('позиция без контуров попадает в незаполненные', () => {
  const rows = buildContourRows(
    [worRow(), worRow({ id: 'wor-2', floor: '3', place: 'кв. 20' })],
    [{ id: 'q1', worItemId: 'wor-1', objectId: 'obj-1', kind: 'RD', quantity: '100', source: '', method: '', note: '', updatedBy: '', updatedAt: '' }]
  );

  const completion = contourCompletion(rows);
  assert.equal(completion.total, 2);
  assert.equal(completion.complete, 0);
  assert.equal(completion.incomplete, 2);
  assert.equal(rows[1].place, '3 · кв. 20');
});
