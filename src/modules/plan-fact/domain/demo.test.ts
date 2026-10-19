/**
 * Тесты демо-данных: лист и разбор идут тем же путём, что настоящий импорт,
 * поэтому демо не может «показать то, чего не бывает на реальной форме».
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { demoAnalysis, demoSheet } from './demo.ts';

test('демо-лист: шапка первой строкой и 24 строки работ', () => {
  const sheet = demoSheet();
  assert.equal(sheet.rows.length, 25, 'шапка + 2 этажа × 4 квартиры × 3 работы');
  assert.deepEqual(sheet.rows[0], ['Этаж', 'Помещение', 'Наименование работ', 'Ед. изм.', 'Объём', 'Примечание']);
  const floors = new Set(sheet.rows.slice(1).map((row) => String(row[0])));
  assert.deepEqual([...floors].sort(), ['2', '3'], 'два этажа');
  const flats = new Set(sheet.rows.slice(1).map((row) => String(row[1])));
  assert.equal(flats.size, 4, 'четыре квартиры');
});

test('демо-разбор даёт позиции без «не сопоставлено»', () => {
  const { analysis } = demoAnalysis();

  assert.equal(analysis.rows.length, 24, 'каждая строка стала позицией');
  assert.equal(analysis.stats.needsDecision, 0, 'все работы и единицы распознаны — демо не пугает красным');
  assert.equal(analysis.stats.unresolvedWorks, 0);
  assert.equal(analysis.stats.unresolvedLocations, 0);
  assert.equal(analysis.stats.materialsSkipped, 0);

  // Адрес взят из колонок и разложен по ролям: этаж — этаж, помещение — помещение.
  assert.deepEqual(
    analysis.rows.slice(0, 3).map((row) => `${row.floor}/${row.place}`),
    ['2/кв. 1', '2/кв. 1', '2/кв. 1']
  );
  const units = new Set(analysis.rows.map((row) => row.unit));
  assert.ok(units.size >= 2, 'есть и м², и м.п. — сводка покажет разные единицы');
  assert.ok(analysis.rows.every((row) => Number(row.quantity) > 0), 'объёмы положительные');
});
