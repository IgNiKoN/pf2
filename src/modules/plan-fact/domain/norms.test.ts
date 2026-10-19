/**
 * Тесты реестра норм: базовое наполнение из формы заказчика, правка ПТО, право на правку,
 * возврат к черновику и валидация значений.
 *
 * Платформа подменяется минимальной заглушкой (в Node нет window): проверяем логику модуля,
 * а не сервис хранения.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canManageNorms, listNorms, normsForSchedule, resetNorm, saveNorm } from './norms.ts';
import { WORKS } from './reference.ts';

function installFakePlatform(options: { canManage: boolean; actor?: string }): Map<string, unknown> {
  const records = new Map<string, unknown>();
  const fakeWindow = {
    RBI: {
      services: {
        storage: {
          stores: () => ({ PLAN_FACT_NORMS: 'plan_fact_norms' }),
          getAll: async () => [...records.values()],
          get: async (_store: string, key: string) => records.get(key) ?? null,
          put: async (store: string, data: { id: string }) => {
            assert.equal(store, 'plan_fact_norms');
            records.set(data.id, data);
            return data;
          },
          delete: async (_store: string, key: string) => {
            records.delete(key);
            return true;
          }
        },
        permissions: {
          canManageNorms: () => options.canManage,
          getCurrentEngineerName: () => options.actor ?? 'Иванов И.И.'
        }
      }
    }
  };
  (globalThis as unknown as { window: unknown }).window = fakeWindow;
  return records;
}

test('исходное наполнение: все нормы — черновик формы заказчика, ничего не подтверждено', async () => {
  installFakePlatform({ canManage: false });

  const norms = await listNorms();
  assert.equal(norms.length, WORKS.length, 'норма есть у каждого вида работ');
  assert.ok(norms.every((norm) => norm.source === 'customer_form'));
  assert.ok(norms.every((norm) => norm.confirmedBy === null));

  const forSchedule = await normsForSchedule();
  assert.equal(Object.keys(forSchedule).length, WORKS.length);
  assert.ok(Object.values(forSchedule).every((norm) => norm.confirmed === false), 'без ПТО норма не подтверждена');
});

test('без права ПТО норму сохранить нельзя — и запись не появляется', async () => {
  const records = installFakePlatform({ canManage: false });

  assert.equal(canManageNorms(), false);
  const result = await saveNorm({ workKey: 'shtukaturka', norm: '100', crew: 5, lag: '2' });

  assert.equal(result.ok, false);
  assert.match(String(result.error), /ПТО/);
  assert.equal(records.size, 0, 'безуспешная попытка не создаёт запись');
  assert.equal((await listNorms()).find((norm) => norm.workKey === 'shtukaturka')?.norm, '60');
});

test('ПТО правит норму: источник, автор и подтверждение сохраняются', async () => {
  installFakePlatform({ canManage: true, actor: 'Петров П.П.' });

  assert.equal(canManageNorms(), true);
  const result = await saveNorm({ workKey: 'shtukaturka', norm: '75,5', crew: '3', lag: '2' });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.record?.norm, '75.5', 'запятая разобрана в десятичную строку');
  assert.equal(result.record?.crew, 3);
  assert.equal(result.record?.lag, '2');
  assert.equal(result.record?.source, 'pto');
  assert.equal(result.record?.confirmedBy, 'Петров П.П.');
  assert.match(String(result.record?.confirmedAt), /^\d{4}-\d{2}-\d{2}/);

  const edited = (await listNorms()).find((norm) => norm.workKey === 'shtukaturka');
  assert.equal(edited?.norm, '75.5');
  assert.equal(edited?.source, 'pto');

  const forSchedule = await normsForSchedule();
  assert.equal(forSchedule.shtukaturka.confirmed, true);
  assert.equal(forSchedule.shtukaturka.norm, '75.5');
  assert.equal(forSchedule.shtukaturka.crew, 3);
});

test('мусор в норме отклоняется: норма, бригада и пауза проверяются', async () => {
  installFakePlatform({ canManage: true });

  const cases: { patch: { workKey: string; norm: string; crew: number | string; lag: string }; expected: RegExp }[] = [
    { patch: { workKey: 'oboi', norm: 'abc', crew: 5, lag: '0' }, expected: /числом/ },
    { patch: { workKey: 'oboi', norm: '0', crew: 5, lag: '0' }, expected: /больше нуля/ },
    { patch: { workKey: 'oboi', norm: '80', crew: 0, lag: '0' }, expected: /бригад/ },
    { patch: { workKey: 'oboi', norm: '80', crew: 5, lag: '-1' }, expected: /Пауза/ },
    { patch: { workKey: 'неведомое', norm: '80', crew: 5, lag: '0' }, expected: /Неизвестный/ }
  ];

  for (const item of cases) {
    const result = await saveNorm(item.patch);
    assert.equal(result.ok, false, `должно быть отклонено: ${JSON.stringify(item.patch)}`);
    assert.match(String(result.error), item.expected);
  }
});

test('сброс возвращает черновик формы заказчика', async () => {
  installFakePlatform({ canManage: true });

  await saveNorm({ workKey: 'okraska', norm: '99', crew: 7, lag: '1' });
  assert.equal((await listNorms()).find((norm) => norm.workKey === 'okraska')?.source, 'pto');

  const reset = await resetNorm('okraska');
  assert.equal(reset.ok, true, reset.error);

  const back = (await listNorms()).find((norm) => norm.workKey === 'okraska');
  assert.equal(back?.source, 'customer_form');
  assert.equal(back?.norm, '50', 'вернулась норма из формы заказчика');
  assert.equal((await normsForSchedule()).okraska.confirmed, false);
});
