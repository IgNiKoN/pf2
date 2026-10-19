/**
 * Тесты шаблонов сопоставления (ТЗ VOR-004): версии, подпись заголовков и честная
 * предварительная проверка изменений колонок — «сдвинулось» отдельно от «пропало».
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyTemplate, headerSignature, listTemplates, markTemplateUsed, removeTemplate, repointTemplate,
  saveTemplate, templateDiff, type MappingTemplate
} from './templates.ts';
import type { ColumnMapping, ImportProfile } from './types.ts';

function installFakePlatform(): Map<string, unknown> {
  const stores = new Map<string, Map<string, unknown>>();
  stores.set('plan_fact_templates', new Map());
  let counter = 0;
  const fakeWindow = {
    RBI: {
      services: {
        storage: {
          stores: () => ({ PLAN_FACT_TEMPLATES: 'plan_fact_templates' }),
          getAll: async (store: string) => [...(stores.get(store)?.values() ?? [])],
          put: async (store: string, record: { id: string }) => {
            (stores.get(store) as Map<string, unknown>).set(record.id, record);
            return record;
          },
          generateId: (prefix: string) => {
            counter += 1;
            return `${prefix}_${counter}`;
          }
        },
        permissions: { getCurrentEngineerName: () => 'ПТО Петрова' }
      }
    }
  };
  (globalThis as unknown as { window: unknown }).window = fakeWindow;
  return stores.get('plan_fact_templates') as Map<string, unknown>;
}

const COLUMNS: ColumnMapping[] = [
  { field: 'section_floor', columnIndex: 1, headerText: 'Этаж' },
  { field: 'location_label', columnIndex: 2, headerText: 'Помещение' },
  { field: 'name', columnIndex: 3, headerText: 'Наименование работ' },
  { field: 'unit', columnIndex: 4, headerText: 'Ед. изм.' },
  { field: 'quantity', columnIndex: 5, headerText: 'Объём' }
];

const HEADERS = ['этаж', 'помещение', 'наименование работ', 'ед. изм.', 'объём'];

function templateOf(overrides: Partial<MappingTemplate> = {}): MappingTemplate {
  return {
    id: 'tpl-1', name: 'ФКП', formId: 'fkp-list', profileId: 'p-fkp', sheetName: 'Лист1',
    columns: COLUMNS, headerSignature: HEADERS, version: 1,
    createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z',
    usedCount: 0, createdBy: 'ПТО', note: '', ...overrides
  };
}

test('подпись заголовков склеивает многострочную шапку и не зависит от регистра', () => {
  const rows = [
    ['Этаж', 'Помещение', 'Наименование', 'Ед.', 'Объём'],
    ['', '', 'работ', 'изм.', 'м2']
  ];
  assert.deepEqual(headerSignature(rows, 1, 2), ['этаж', 'помещение', 'наименование работ', 'ед. изм.', 'объём м2']);
});

test('шаблон сохраняется с версией, повторное сохранение поднимает версию, а не плодит копии', async () => {
  const records = installFakePlatform();

  const first = await saveTemplate({
    name: 'ФКП', formId: 'fkp-list', profileId: 'p-fkp', sheetName: 'Лист1',
    columns: COLUMNS, headerSignature: HEADERS
  });
  assert.equal(first.ok, true, first.error);
  assert.equal(first.record?.version, 1);
  assert.equal(first.record?.createdBy, 'ПТО Петрова');

  const second = await saveTemplate({
    name: 'фкп', formId: 'fkp-list', profileId: 'p-fkp', sheetName: 'Лист1',
    columns: COLUMNS, headerSignature: HEADERS
  });
  assert.equal(second.record?.id, first.record?.id, 'то же имя — тот же шаблон');
  assert.equal(second.record?.version, 2);
  assert.equal(records.size, 1);

  assert.equal((await saveTemplate({ name: '', formId: 'x', profileId: 'y', sheetName: '', columns: COLUMNS, headerSignature: [] })).ok, false);
  assert.equal((await saveTemplate({ name: 'Пусто', formId: 'x', profileId: 'y', sheetName: '', columns: [], headerSignature: [] })).ok, false);
});

test('шаблоны разделены по раскладкам, снятый шаблон не показывается', async () => {
  installFakePlatform();
  await saveTemplate({ name: 'ФКП', formId: 'fkp-list', profileId: 'p1', sheetName: '', columns: COLUMNS, headerSignature: HEADERS });
  await saveTemplate({ name: 'Спутник', formId: 'sputnik-matrix', profileId: 'p2', sheetName: '', columns: COLUMNS, headerSignature: HEADERS });

  assert.equal((await listTemplates()).length, 2);
  assert.equal((await listTemplates('fkp-list')).length, 1);

  const target = (await listTemplates('fkp-list'))[0];
  await removeTemplate(target.id);
  assert.equal((await listTemplates('fkp-list')).length, 0);
});

test('применение отмечается: видно, какие шаблоны реально работают', async () => {
  installFakePlatform();
  const saved = await saveTemplate({ name: 'ФКП', formId: 'fkp-list', profileId: 'p1', sheetName: '', columns: COLUMNS, headerSignature: HEADERS });
  await markTemplateUsed(saved.record?.id as string);
  await markTemplateUsed(saved.record?.id as string);
  assert.equal((await listTemplates())[0].usedCount, 2);
});

test('колонки на месте — изменений нет', () => {
  const diff = templateDiff(templateOf(), HEADERS);
  assert.equal(diff.same, true);
  assert.deepEqual(diff.missing, []);
  assert.deepEqual(diff.moved, []);
  assert.deepEqual(diff.changed, []);
});

test('сдвинувшаяся колонка отличается от пропавшей', () => {
  // «Объём» уехал в шестую колонку, а на его прежнем месте теперь «Цена».
  const current = ['этаж', 'помещение', 'наименование работ', 'ед. изм.', 'цена', 'объём'];
  const diff = templateDiff(templateOf(), current);

  assert.equal(diff.same, false);
  assert.deepEqual(diff.moved, [{ field: 'quantity', headerText: 'Объём', from: 5, to: 6 }]);
  assert.deepEqual(diff.missing, []);
  // Сдвиг важнее «на месте другая колонка»: новое содержимое видно в добавленных, а не дублируется.
  assert.deepEqual(diff.changed, []);
  assert.deepEqual(diff.added, [{ columnIndex: 5, found: 'цена' }]);
});

test('переименованная колонка показывается как изменённая, если старого заголовка нет вовсе', () => {
  // Заказчик переименовал «Объём» в «Количество» — искать прежний заголовок негде.
  const current = ['этаж', 'помещение', 'наименование работ', 'ед. изм.', 'количество'];
  const diff = templateDiff(templateOf(), current);

  assert.deepEqual(diff.changed, [
    { field: 'quantity', headerText: 'Объём', columnIndex: 5, found: 'количество' }
  ]);
  assert.deepEqual(diff.missing, []);
  assert.equal(diff.same, false);
});

test('пропавшая колонка видна как пропавшая, а не как совпадение', () => {
  const current = ['этаж', 'помещение', 'наименование работ', 'ед. изм.'];
  const diff = templateDiff(templateOf(), current);
  assert.deepEqual(diff.missing, [{ field: 'quantity', headerText: 'Объём', columnIndex: 5 }]);
  assert.equal(diff.same, false);
});

test('новая колонка в файле показывается как добавленная', () => {
  const current = [...HEADERS, 'примечание'];
  const diff = templateDiff(templateOf(), current);
  assert.equal(diff.same, true, 'сдвигов и пропаж нет');
  assert.deepEqual(diff.added, [{ columnIndex: 6, found: 'примечание' }]);
});

test('шаблон можно поправить по текущим заголовкам одной операцией', () => {
  const current = ['этаж', 'помещение', 'наименование работ', 'ед. изм.', 'цена', 'объём'];
  const fixed = repointTemplate(templateOf(), current);
  assert.equal(fixed.find((column) => column.field === 'quantity')?.columnIndex, 6, 'колонка встала на новое место');
  assert.equal(fixed.length, COLUMNS.length);
});

test('применение шаблона даёт профиль с колонками шаблона и не портит исходный', () => {
  const profile: ImportProfile = {
    id: 'p-fkp', name: 'ФКП', layout: 'flat_list', headerRow: 1, headerRows: 1,
    columns: [{ field: 'quantity', columnIndex: 1, headerText: 'Старое' }],
    locationRules: []
  };
  const next = applyTemplate(profile, COLUMNS, 'Лист1');
  assert.equal(next.columns.length, 5);
  assert.equal(next.columns[4].headerText, 'Объём');
  assert.equal(next.sheetPattern, 'Лист1');
  assert.equal(profile.columns.length, 1, 'исходный профиль не изменён');
});
