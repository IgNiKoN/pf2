/**
 * Тесты выгрузки XLSX (ТЗ VOR-034): состав листов, сохранение десятых долей,
 * свод по этажам, замечания и честный лист «О выгрузке».
 *
 * Проверяется сборка книги, а не файл Excel: запись файла — тонкая обёртка над SheetJS.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildWorExport, exportCell, formatExportSummary } from './export.ts';
import type { FactRecord } from './fact.ts';
import type { PlanFactWorRecord } from './store.ts';

function worRow(overrides: Partial<PlanFactWorRecord> = {}): PlanFactWorRecord {
  return {
    id: 'wor-1',
    objectId: 'obj-1',
    importId: 'imp-1',
    section: 'Секция 1',
    floor: '2',
    place: 'кв. 15а',
    workRaw: 'Штукатурка стен',
    workId: 'shtukaturka',
    workMatch: 'auto',
    matchReason: '',
    unitRaw: 'S, м2',
    unit: 'm2',
    quantity: '100',
    sheet: 'Л',
    rowNumber: 12,
    column: 4,
    createdAt: '2026-10-15T10:00:00.000Z',
    syncStatus: 'synced',
    ...overrides
  };
}

function factRow(overrides: Partial<FactRecord> = {}): FactRecord {
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
    comment: '',
    author: 'Прораб',
    createdAt: '2026-10-15T11:00:00.000Z',
    status: 'handed_over',
    correctsId: null,
    supersededBy: null,
    revision: 1,
    syncStatus: 'synced',
    ...overrides
  };
}

test('ячейка остаётся числом только если значение представимо точно', () => {
  assert.equal(exportCell('100'), 100);
  assert.equal(exportCell('12.5'), 12.5);
  assert.equal(exportCell('0.123456789012345678'), '0.123456789012345678', 'длинная дробь едет текстом, а не округляется');
  assert.equal(exportCell('1e-7'), '1e-7');
  assert.equal(exportCell('м2'), 'м2');
  assert.equal(exportCell(''), '');
});

test('книга содержит листы ВОР, свод, замечания и «О выгрузке»', () => {
  const result = buildWorExport({
    objectName: 'ЖК Спутник, корпус 3',
    worRows: [worRow()],
    factRows: [factRow()],
    generatedAt: '2026-10-15T12:00:00.000Z'
  });

  assert.deepEqual(result.sheets.map((sheet) => sheet.name), ['ВОР', 'Свод по этажам', 'Замечания', 'О выгрузке']);
  assert.equal(result.filename, 'ВОР ЖК Спутник, корпус 3 2026-10-15.xlsx');
  assert.deepEqual(result.stats, { worRows: 1, factRows: 1, issues: 0, floors: 1, works: 1 });
});

test('лист ВОР хранит место, происхождение и сводный факт', () => {
  const result = buildWorExport({
    objectName: 'Объект',
    worRows: [worRow()],
    factRows: [factRow()],
    generatedAt: '2026-10-15T12:00:00.000Z'
  });
  const rows = result.sheets[0].rows;
  const header = rows[0] as string[];
  const row = rows[1];

  assert.equal(header[0], 'Объект');
  assert.equal(row[header.indexOf('Секция')], 'Секция 1');
  assert.equal(row[header.indexOf('Этаж')], '2');
  assert.equal(row[header.indexOf('Помещение')], 'кв. 15а');
  assert.equal(row[header.indexOf('ЕИ')], 'm2');
  assert.equal(row[header.indexOf('План (форма заказчика)')], 100);
  assert.equal(row[header.indexOf('Факт')], 12.5);
  assert.equal(row[header.indexOf('Отклонение')], 87.5);
  assert.equal(row[header.indexOf('Сопоставление')], 'сопоставлено автоматически');
  assert.equal(row[header.indexOf('Лист')], 'Л');
  assert.equal(row[header.indexOf('Строка')], 12);
  assert.equal(row[header.indexOf('Колонка')], 4);
});

test('свод по этажам считает план, факт, отклонение и итог', () => {
  const result = buildWorExport({
    objectName: 'Объект',
    worRows: [
      worRow({ id: 'w1', floor: '2', quantity: '100' }),
      worRow({ id: 'w2', floor: '3', quantity: '50', workRaw: 'Окраска стен', workId: 'okraska' })
    ],
    factRows: [factRow({ quantity: '12.5' }), factRow({ id: 'f2', quantity: '0.25' })],
    generatedAt: '2026-10-15T12:00:00.000Z'
  });

  const rows = result.sheets[1].rows;
  assert.deepEqual(rows[0], ['Этаж', 'Работа', 'ЕИ', 'План', 'Факт', 'Отклонение', 'Выполнено, %']);
  const plaster = rows.find((row) => row[1] === 'Штукатурка стен');
  assert.equal(plaster?.[3], 100);
  assert.equal(plaster?.[4], 12.75, '0,25 + 12,5 = 12,75 без float-погрешности');
  assert.equal(plaster?.[5], 87.25);
  // Правило отчётности (решение владельца): два знака без округления, выполнение не завышается.
  assert.equal(plaster?.[6], '12,75');

  const total = rows[rows.length - 1];
  assert.equal(total[0], 'ИТОГО');
  assert.equal(total[3], 150);
  assert.equal(total[4], 12.75);
  assert.equal(total[5], 137.25);
});

test('замечания собираются с действием, а не просто списком', () => {
  const result = buildWorExport({
    objectName: 'Объект',
    worRows: [
      worRow({ id: 'w1' }),
      worRow({ id: 'w2', workId: null, workMatch: 'unresolved', workRaw: 'Работа из формы без пары' }),
      worRow({ id: 'w3', unit: null, unitRaw: 'S, м3' }),
      worRow({ id: 'w4', quantity: '-5' })
    ],
    factRows: [],
    generatedAt: '2026-10-15T12:00:00.000Z'
  });

  const issues = result.sheets[2];
  assert.equal(issues.name, 'Замечания');
  assert.equal(result.stats.issues, 3, 'несопоставленная работа, неизвестная ЕИ и минус');
  const types = issues.rows.slice(1).map((row) => String(row[0]));
  assert.ok(types.some((type) => type.includes('не сопоставлен')));
  assert.ok(types.some((type) => type.includes('Единица не распознана')));
  assert.ok(types.some((type) => type.includes('Отрицательный объём')));
  assert.ok(String(issues.rows[1][8]).length > 10, 'у замечания есть что делать');
});

test('лист «О выгрузке» честно перечисляет, каких контуров в файле нет', () => {
  const result = buildWorExport({
    objectName: 'Объект',
    worRows: [worRow()],
    factRows: [factRow()],
    generatedAt: '2026-10-15T12:00:00.000Z'
  });
  const about = result.sheets[3];
  const flat = about.rows.map((row) => row.join(' | ')).join('\n');

  assert.match(flat, /План \(форма заказчика\) \| есть/);
  assert.match(flat, /Факт \| есть/);
  assert.match(flat, /RD \| нет/);
  assert.match(flat, /Утверждено РП \| нет/);
  assert.match(flat, /Принято заказчиком \| нет/);
  assert.match(flat, /сводно по паре «этаж \+ работа»/);
  assert.match(flat, /Проценты выполнения показаны двумя знаками без округления/);
  assert.match(flat, /Объёмы и отклонения выгружаются точно/);
});

test('имя файла безопасно и сводка выгрузки читаемая', () => {
  const result = buildWorExport({
    objectName: 'Объект/Корпус: 3 <тест>',
    worRows: [],
    factRows: [],
    generatedAt: '2026-10-15T12:00:00.000Z'
  });
  assert.ok(!result.filename.includes('/'), 'слэши в имени файла недопустимы');
  assert.ok(!result.filename.includes(':'));
  assert.match(formatExportSummary(result), /позиций 0/);
  assert.equal(result.sheets[0].rows.length, 1, 'при пустой ВОР остаётся только шапка');
});
