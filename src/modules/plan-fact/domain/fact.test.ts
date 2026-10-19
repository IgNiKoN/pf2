/**
 * Тесты факта выполнения: право на ввод, проверки, сторно вместо перезаписи и свод план-факт.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  activeFacts, buildPlanFactSummary, canRecordFact, correctFact, listFacts, recordFact
} from './fact.ts';
import type { FactRecord } from './fact.ts';
import type { WorRow } from './types.ts';

function installFakePlatform(options: { canRecord: boolean; author?: string }): Map<string, unknown> {
  const records = new Map<string, unknown>();
  let counter = 0;
  const fakeWindow = {
    RBI: {
      services: {
        storage: {
          stores: () => ({ PLAN_FACT_FACTS: 'plan_fact_facts' }),
          getAll: async () => [...records.values()],
          put: async (store: string, data: { id: string }) => {
            assert.equal(store, 'plan_fact_facts');
            records.set(data.id, data);
            return data;
          },
          generateId: (prefix: string) => {
            counter += 1;
            return `${prefix}_${counter}`;
          }
        },
        permissions: {
          canRecordFact: () => options.canRecord,
          getCurrentEngineerName: () => options.author ?? 'Прораб Петров'
        }
      }
    }
  };
  (globalThis as unknown as { window: unknown }).window = fakeWindow;
  return records;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    objectId: 'obj-1',
    section: 'Секция 1',
    floor: '2',
    place: '15а',
    workKey: 'shtukaturka',
    workRaw: 'Штукатурка стен',
    unit: 'm2',
    quantity: '12,5',
    factDate: '2026-10-15',
    comment: '',
    ...overrides
  } as Parameters<typeof recordFact>[0];
}

test('без права факт внести нельзя (роль без canRecordFact)', async () => {
  const records = installFakePlatform({ canRecord: false });

  assert.equal(canRecordFact(), false);
  const result = await recordFact(input());
  assert.equal(result.ok, false);
  assert.match(String(result.error), /прораб/i);
  assert.equal(records.size, 0);
});

test('факт вносится как локальная запись: decimal строкой, автор, версия 1', async () => {
  installFakePlatform({ canRecord: true });

  const result = await recordFact(input());
  assert.equal(result.ok, true, result.error);
  assert.equal(result.record?.quantity, '12.5', 'запятая разобрана в десятичную строку');
  assert.equal(result.record?.status, 'pending', 'облако не подключено — запись ждёт отправки');
  assert.equal(result.record?.revision, 1);
  assert.equal(result.record?.author, 'Прораб Петров');
  assert.equal(result.record?.correctsId, null);
  assert.equal(result.record?.supersededBy, null);
});

test('мусор в факте отклоняется', async () => {
  installFakePlatform({ canRecord: true });

  const cases: [Record<string, unknown>, RegExp][] = [
    [{ quantity: '0' }, /больше нуля/],
    [{ quantity: '-5' }, /больше нуля/],
    [{ quantity: 'abc' }, /числом/],
    [{ factDate: '15.10.2026' }, /дату/],
    [{ workRaw: '' }, /работа/]
  ];

  for (const [patch, expected] of cases) {
    const result = await recordFact(input(patch));
    assert.equal(result.ok, false, `должно быть отклонено: ${JSON.stringify(patch)}`);
    assert.match(String(result.error), expected);
  }
});

test('исправление — сторно: исходная запись сохраняет объём и историю', async () => {
  installFakePlatform({ canRecord: true });

  const first = await recordFact(input({ quantity: '100' }));
  const originalId = first.record?.id as string;

  const correction = await correctFact(originalId, { quantity: '80', comment: 'Замер уточнён' });
  assert.equal(correction.ok, true, correction.error);
  assert.equal(correction.record?.quantity, '80');
  assert.equal(correction.record?.correctsId, originalId, 'корректировка ссылается на исходную запись');
  assert.equal(correction.record?.revision, 2);
  assert.equal(correction.replaced?.quantity, '100', 'исходный объём не перезаписан');
  assert.equal(correction.replaced?.supersededBy, correction.record?.id);

  const all = await listFacts('obj-1');
  assert.equal(all.length, 2, 'история: исходная и корректирующая записи');
  const active = activeFacts(all);
  assert.equal(active.length, 1);
  assert.equal(active[0].quantity, '80');

  // Повторная корректировка уже исправленной записи запрещена.
  const again = await correctFact(originalId, { quantity: '70' });
  assert.equal(again.ok, false);
  assert.match(String(again.error), /уже исправлена/);
});

test('свод план-факт: план из ВОР, факт из действующих записей, отклонение и процент', async () => {
  installFakePlatform({ canRecord: true });

  const wor: WorRow[] = [
    { section: 'Секция 1', floor: '2', place: '15а', workRaw: 'Штукатурка стен', workId: 'shtukaturka', workMatch: 'auto',
      matchReason: '', unitRaw: 'S, м2', unit: 'm2', quantity: '100', fragment: { sheet: 'Л', row: 1, column: 1, rawValue: 'x' } },
    { section: 'Секция 1', floor: '3', place: '20', workRaw: 'Окраска стен', workId: 'okraska', workMatch: 'auto',
      matchReason: '', unitRaw: 'S, м2', unit: 'm2', quantity: '50', fragment: { sheet: 'Л', row: 2, column: 1, rawValue: 'x' } }
  ];

  const first = await recordFact(input({ quantity: '0,1' }));
  await recordFact(input({ quantity: '0,2' }));
  const summary = buildPlanFactSummary(wor, await listFacts('obj-1'));

  const plaster = summary.rows.find((row) => row.workKey === 'shtukaturka');
  assert.equal(plaster?.plan, '100');
  assert.equal(plaster?.fact, '0.3', '0,1 + 0,2 = 0,3 — без float');
  assert.equal(plaster?.deviation, '99.7');
  assert.equal(plaster?.percent, '0,30', 'два знака без округления');

  const paint = summary.rows.find((row) => row.workKey === 'okraska');
  assert.equal(paint?.fact, '0');
  assert.equal(paint?.deviation, '50');
  assert.equal(paint?.percent, '0,00');

  assert.equal(summary.totalPlan, '150');
  assert.equal(summary.totalFact, '0.3');
  assert.equal(summary.totalDeviation, '149.7');
  assert.equal(summary.factsInQueue, 2);
  assert.equal(summary.corrected, 0);

  // Исправление первой записи: в свод идёт только действующий факт.
  const correction = await correctFact(first.record?.id as string, { quantity: '0.5' });
  assert.equal(correction.ok, true, correction.error);
  const afterCorrection = buildPlanFactSummary(wor, await listFacts('obj-1'));
  const plasterAfter = afterCorrection.rows.find((row) => row.workKey === 'shtukaturka');
  assert.equal(plasterAfter?.fact, '0.7', 'исправленная запись заменена корректировкой, а не добавлена к ней');
  assert.equal(afterCorrection.corrected, 1);
});

test('факт без плана не прячется, а показывается с нулевым планом', async () => {
  installFakePlatform({ canRecord: true });

  await recordFact(input({ workKey: 'dekor', workRaw: 'Декоративная штукатурка', quantity: '5' }));
  const summary = buildPlanFactSummary([], await listFacts('obj-1'));

  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].plan, '0');
  assert.equal(summary.rows[0].fact, '5');
  assert.equal(summary.rows[0].percent, null, 'процента без плана не считаем');
  assert.equal(summary.totalPercent, null);
});

test('свод заказывает порядок этажей', async () => {
  installFakePlatform({ canRecord: true });

  const wor: WorRow[] = ['3', '2'].map((floor, index) => ({
    section: '1', floor, place: 'x', workRaw: 'Штукатурка стен', workId: 'shtukaturka', workMatch: 'auto',
    matchReason: '', unitRaw: 'м2', unit: 'm2', quantity: '10',
    fragment: { sheet: 'Л', row: index + 1, column: 1, rawValue: 'x' }
  }) as WorRow);

  const summary = buildPlanFactSummary(wor, [], { floorOrder: ['2', '3'] });
  assert.deepEqual(summary.rows.map((row) => row.floor), ['2', '3']);

  const records = await listFacts('obj-1');
  assert.deepEqual(records, []);
});

test('очередь и сторно считаются по объекту', async () => {
  installFakePlatform({ canRecord: true });

  const a = await recordFact(input({ quantity: '1' }));
  await recordFact(input({ objectId: 'obj-2', quantity: '2' }));
  await correctFact(a.record?.id as string, { quantity: '1.5' });

  const firstObject = await listFacts('obj-1');
  const summary = buildPlanFactSummary([], firstObject);
  assert.equal(summary.factsInQueue, 2, 'исходная и корректирующая записи обе ждут отправки');
  assert.equal(summary.corrected, 1);

  const typed: FactRecord[] = firstObject;
  assert.ok(typed.every((record) => record.objectId === 'obj-1'));
});
