/**
 * Тесты справочника работ как данных (ТЗ VOR-012, VOR-013): начальное наполнение, права ПТО,
 * версии, архив, связки названий и сопоставление без угадывания.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  archiveWork, buildCatalog, canManageWorks, listAliases, listWorks, matchInCatalog,
  normalizeWorkName, removeAlias, saveAlias, saveWork, seedWorks
} from './works.ts';

function installFakePlatform(options: { canManage: boolean; actor?: string } = { canManage: true }): Map<string, unknown> {
  // У каждого стораджа свой набор записей: иначе связки попадали бы в справочник.
  const stores = new Map<string, Map<string, unknown>>();
  const records = stores.get('plan_fact_works') || new Map<string, unknown>();
  stores.set('plan_fact_works', records);
  stores.set('plan_fact_work_aliases', new Map<string, unknown>());
  let counter = 0;
  const fakeWindow = {
    RBI: {
      services: {
        storage: {
          stores: () => ({ PLAN_FACT_WORKS: 'plan_fact_works', PLAN_FACT_WORK_ALIASES: 'plan_fact_work_aliases' }),
          getAll: async (store: string) => [...(stores.get(store)?.values() ?? [])],
          put: async (store: string, record: { id: string }) => {
            if (!stores.has(store)) stores.set(store, new Map());
            (stores.get(store) as Map<string, unknown>).set(record.id, record);
            return record;
          },
          generateId: (prefix: string) => {
            counter += 1;
            return `${prefix}_${counter}`;
          }
        },
        permissions: {
          canManageWorks: () => options.canManage,
          getCurrentEngineerName: () => options.actor ?? 'ПТО Иванова'
        }
      }
    }
  };
  (globalThis as unknown as { window: unknown }).window = fakeWindow;
  return records;
}

test('начальное наполнение: 15 видов работ из кода помечены как builtin', () => {
  const seed = seedWorks();
  assert.equal(seed.length, 15);
  assert.ok(seed.every((work) => work.source === 'builtin'));
  assert.ok(seed.every((work) => work.revision === 1 && work.isActive));
  assert.equal(seed.find((work) => work.id === 'shtukaturka')?.name, 'Штукатурка стен');
  assert.equal(seed.find((work) => work.id === 'shtukaturka')?.unit, 'm2', 'единица хранится каноническим кодом');
});

test('нормализация названия: регистр, ё, пунктуация и пробелы не мешают', () => {
  assert.equal(normalizeWorkName('  Штукатурка   СТЕН '), 'штукатурка стен');
  assert.equal(normalizeWorkName('Шпаклёвка стен'), normalizeWorkName('шпаклевка  стен'));
  assert.equal(normalizeWorkName('Плитка (балкон), м2'), 'плитка балкон м2');
  assert.equal(normalizeWorkName(''), '');
});

test('без права ПТО справочник не правится', async () => {
  installFakePlatform({ canManage: false });
  assert.equal(canManageWorks(), false);

  const saved = await saveWork({ name: 'Новый вид', unit: 'm2' });
  assert.equal(saved.ok, false);
  assert.match(String(saved.error), /ПТО/);

  const alias = await saveAlias('что-то из формы', 'shtukaturka');
  assert.equal(alias.ok, false);
});

test('сохранённая запись ПТО перекрывает встроенную и увеличивает версию', async () => {
  installFakePlatform({ canManage: true });

  const initial = await listWorks();
  assert.equal(initial.length, 15, 'пока ничего не сохраняли — работает начальное наполнение');

  const renamed = await saveWork({ id: 'shtukaturka', name: 'Штукатурка стен (улучшенная)', unit: 'm2' });
  assert.equal(renamed.ok, true, renamed.error);
  assert.equal(renamed.record?.revision, 2, 'правка поднимает версию');
  assert.equal(renamed.record?.source, 'pto');
  assert.equal(renamed.record?.createdBy, 'ПТО Иванова');

  const works = await listWorks();
  assert.equal(works.length, 15, 'запись не удвоилась');
  assert.equal(works.find((work) => work.id === 'shtukaturka')?.name, 'Штукатурка стен (улучшенная)');
});

test('новый вид работ заводится ПТО, дубли по названию не создаются', async () => {
  installFakePlatform({ canManage: true });

  const created = await saveWork({ name: 'Монтаж вентиляции', unit: 'м.п.', groupName: 'Инженерия' });
  assert.equal(created.ok, true, created.error);
  assert.equal(created.record?.source, 'pto');
  assert.equal((await listWorks()).length, 16);

  const duplicate = await saveWork({ name: 'монтаж  ВЕНТИЛЯЦИИ', unit: 'м.п.' });
  assert.equal(duplicate.ok, false, 'дубль в другом регистре — тот же вид работ');
  assert.match(String(duplicate.error), /уже есть/);

  assert.equal((await saveWork({ name: '', unit: 'm2' })).ok, false);
  assert.equal((await saveWork({ name: 'Без единицы', unit: '' })).ok, false);
});

test('архив скрывает вид работ, но не удаляет историю', async () => {
  const records = installFakePlatform({ canManage: true });
  await saveWork({ id: 'oboi', name: 'Оклейка стен обоями', unit: 'm2' });

  const archived = await archiveWork('oboi');
  assert.equal(archived.ok, true, archived.error);
  assert.equal((await listWorks()).some((work) => work.id === 'oboi'), false, 'в списке его больше нет');

  const stored = records.get('oboi') as { isDeleted?: boolean };
  assert.equal(stored.isDeleted, true, 'запись помечена удалённой, а не выброшена');
});

test('связка названия запоминается и переводится на другой вид работ одной записью', async () => {
  const records = installFakePlatform({ canManage: true });

  const first = await saveAlias('Штукатурка стен по проекту', 'shtukaturka');
  assert.equal(first.ok, true, first.error);
  assert.equal(first.record?.normalizedAlias, 'штукатурка стен по проекту');
  assert.equal(first.record?.source, 'pto');

  const rePointed = await saveAlias('штукатурка  СТЕН по проекту', 'shpaklevka');
  assert.equal(rePointed.ok, true);
  assert.equal(rePointed.record?.id, first.record?.id, 'та же связка, а не вторая');
  assert.equal((await listAliases()).length, 1);
  assert.equal((await listAliases())[0].workId, 'shpaklevka');

  assert.equal((await saveAlias('', 'shtukaturka')).ok, false);
  assert.equal((await saveAlias('работа', 'нет-такого')).ok, false, 'нельзя связать с несуществующим видом');
});

test('снятие связки помечает её удалённой', async () => {
  installFakePlatform({ canManage: true });
  const alias = await saveAlias('Название из формы', 'okraska');
  assert.equal((await listAliases()).length, 1);

  const removed = await removeAlias(alias.record?.id as string);
  assert.equal(removed.ok, true);
  assert.equal((await listAliases()).length, 0);
});

test('сопоставление: связка важнее названия, незнакомое не угадывается', async () => {
  installFakePlatform({ canManage: true });
  await saveAlias('Штукатурка стен по проекту', 'shpaklevka');

  const catalog = await buildCatalog();
  assert.equal(catalog.works.length, 15);
  assert.equal(catalog.aliases.length, 1);

  const byAlias = matchInCatalog('штукатурка стен по проекту', catalog);
  assert.deepEqual(byAlias, { workId: 'shpaklevka', matchedBy: 'alias' }, 'связка ПТО сильнее совпадения названия');

  const byName = matchInCatalog('Штукатурка  СТЕН', catalog);
  assert.deepEqual(byName, { workId: 'shtukaturka', matchedBy: 'name' });

  const unknown = matchInCatalog('Монтаж вентиляции', catalog);
  assert.deepEqual(unknown, { workId: null, matchedBy: 'none' }, 'незнакомую работу не приписываем к похожей');
  assert.deepEqual(matchInCatalog('', catalog), { workId: null, matchedBy: 'none' });
});

test('после правки справочника сопоставление идёт по данным, а не по коду', async () => {
  installFakePlatform({ canManage: true });
  await saveWork({ name: 'Монтаж вентиляции', unit: 'м.п.' });

  const catalog = await buildCatalog();
  const match = matchInCatalog('монтаж вентиляции', catalog);
  assert.equal(match.matchedBy, 'name');
  assert.ok(match.workId, 'новый вид работ участвует в сопоставлении сразу после сохранения');
  assert.equal(catalog.byId.get(String(match.workId))?.source, 'pto');
});
