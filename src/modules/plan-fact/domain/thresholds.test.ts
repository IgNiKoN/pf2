/**
 * Тесты порогов сверки (ТЗ VOR-024): правила по умолчанию, разбор ввода, сохранение с правами,
 * обязательное общее правило.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultRules, loadThresholds, parseThresholdInput, ruleTitle, saveThresholds } from './thresholds.ts';
import { thresholdFor } from './reconcile.ts';

function installFakePlatform(options: { canManage?: boolean } = {}): Map<string, unknown> {
  const record = new Map<string, unknown>();
  const fakeWindow = {
    RBI: {
      services: {
        storage: {
          stores: () => ({ PLAN_FACT_THRESHOLDS: 'plan_fact_thresholds' }),
          getAll: async () => [...record.values()],
          put: async (_store: string, value: { id: string }) => {
            record.set(value.id, value);
            return value;
          }
        },
        permissions: {
          canManageContours: () => options.canManage !== false,
          getCurrentEngineerName: () => 'ПТО'
        }
      }
    }
  };
  (globalThis as unknown as { window: unknown }).window = fakeWindow;
  return record;
}

test('без своих правил работает общее: 5 % и без порога по единицам', async () => {
  installFakePlatform();
  const rules = await loadThresholds('obj-1');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].percent, '5');
  assert.equal(rules[0].absolute, '0');
  assert.equal(thresholdFor('shtukaturka', 'm2', rules).percent, '5');
});

test('ввод порога принимает запятую и процент, но не молчит про мусор', () => {
  assert.deepEqual(parseThresholdInput('5', 'percent'), { ok: true, value: '5' });
  assert.deepEqual(parseThresholdInput('2,5', 'percent'), { ok: true, value: '2.5' });
  assert.deepEqual(parseThresholdInput('3 %', 'percent'), { ok: true, value: '3' });
  assert.deepEqual(parseThresholdInput('', 'percent'), { ok: true, value: '0' }, 'пусто — это «порог не задан»');

  assert.equal(parseThresholdInput('пять', 'percent').ok, false);
  assert.match(String(parseThresholdInput('пять', 'percent').error), /число/);
  assert.equal(parseThresholdInput('-1', 'absolute').ok, false);
  assert.equal(parseThresholdInput('150', 'percent').ok, false);
  assert.equal(parseThresholdInput('100', 'percent').ok, true);
});

test('пороги сохраняются по объекту и читаются обратно', async () => {
  const record = installFakePlatform();
  const rules = [
    { workId: null, unit: null, percent: '5', absolute: '0' },
    { workId: 'shtukaturka', unit: null, percent: '1', absolute: '0.5' }
  ];
  const saved = await saveThresholds('obj-1', rules);
  assert.equal(saved.ok, true, saved.error);
  assert.equal(record.size, 1, 'на объект одна запись');

  const loaded = await loadThresholds('obj-1');
  assert.equal(loaded.length, 2);
  assert.equal(thresholdFor('shtukaturka', 'm2', loaded).percent, '1');
  assert.equal(thresholdFor('okraska', 'm2', loaded).percent, '5');

  const other = await loadThresholds('obj-2');
  assert.equal(other.length, 1, 'у другого объекта свои правила — общие');
});

test('без общего правила сохранение отклоняется: иначе нечего применить к остальным работам', async () => {
  installFakePlatform();
  const result = await saveThresholds('obj-1', [{ workId: 'shtukaturka', unit: null, percent: '1', absolute: '0' }]);
  assert.equal(result.ok, false);
  assert.match(String(result.error), /Общее правило/);
});

test('правило без общего восстанавливается при чтении: работа без порога не остаётся без правила', async () => {
  const record = installFakePlatform();
  record.set('obj-1', {
    id: 'obj-1', objectId: 'obj-1',
    rules: [{ workId: 'shtukaturka', unit: null, percent: '1', absolute: '0' }],
    updatedBy: 'ПТО', updatedAt: '2026-10-16T00:00:00.000Z'
  });
  const loaded = await loadThresholds('obj-1');
  assert.equal(loaded.length, 2, 'общее правило добавлено');
  assert.equal(thresholdFor('okraska', 'm2', loaded).percent, '5');
});

test('без права ПТО пороги не сохраняются', async () => {
  installFakePlatform({ canManage: false });
  const result = await saveThresholds('obj-1', defaultRules());
  assert.equal(result.ok, false);
  assert.match(String(result.error), /ПТО/);
});

test('название правила читается человеком', () => {
  const workName = (id: string) => (id === 'shtukaturka' ? 'Штукатурка стен' : id);
  assert.match(ruleTitle({ workId: null, unit: null, percent: '5', absolute: '0' }, workName), /Общее правило/);
  assert.match(ruleTitle({ workId: null, unit: 'lm', percent: '2', absolute: '0' }, workName), /Единица измерения: lm/);
  assert.match(ruleTitle({ workId: 'shtukaturka', unit: null, percent: '1', absolute: '0' }, workName), /Штукатурка стен/);
});
