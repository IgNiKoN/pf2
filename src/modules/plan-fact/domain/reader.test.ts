/**
 * Тесты раскладок reader'а — на синтетических листах, без файла и без SheetJS.
 * Проверяем именно то, что легко сломать: где начинаются данные, как адресуются
 * колонки-работы, что попадает в контекст локации и что считается материалом.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildRawRows, pickSheet, text } from './reader.ts';
import { formProfileById } from './profiles.ts';
import type { CellValue } from './types.ts';

/** Лист фиксированной ширины: разреженные ячейки раскладываются по индексам. */
function grid(rows: CellValue[][], width = 120): CellValue[][] {
  return rows.map((row) => {
    const line: CellValue[] = new Array(width).fill(null);
    row.forEach((cell, index) => { line[index] = cell; });
    return line;
  });
}

const matrixForm = formProfileById('sputnik-matrix');
const fkpForm = formProfileById('fkp-list');
assert.ok(matrixForm && fkpForm, 'профили реальных форм должны быть объявлены');

test('text схлопывает пробелы и не превращает null/boolean в текст', () => {
  assert.equal(text('  Штукатурка   стен '), 'Штукатурка стен');
  assert.equal(text(null), '');
  assert.equal(text(true), '');
  assert.equal(text(0), '0');
});

test('обмерная матрица: строка помещения разворачивается в позиции по колонкам-работам', () => {
  // Шапка: 1-я строка — заголовки, 2-я — единицы; данные начинаются с 3-й строки листа.
  const dataRow: CellValue[] = new Array(111).fill(null);
  dataRow[0] = 'Секция 1';
  dataRow[1] = 2;
  dataRow[2] = '15а';
  dataRow[99] = 12.5; // колонка-работа «Шпаклёвка» — 100-я колонка листа (1-based)
  const sheet = grid([[], [], dataRow]);

  const rows = buildRawRows(sheet, matrixForm!.profile, 'Расчёт 1 секции Квартиры');

  assert.equal(rows.length, 1, 'заполнена одна колонка-работа — одна позиция');
  assert.equal(rows[0].rowNumber, 3, 'первая строка данных = headerRow + headerRows');
  assert.deepEqual(rows[0].locationContext, ['Секция 1', '2', '15а']);
  assert.equal(rows[0].cells[99], 'Шпаклёвка', 'имя работы — заголовок колонки');
  assert.equal(rows[0].cells[100], 12.5, 'объём — значение из строки помещения');
  assert.equal(rows[0].cells[101], 'S, м2', 'единица — из второй строки шапки');
});

test('обмерная матрица: пустая ячейка позицию не создаёт, ноль — создаёт', () => {
  const empty = buildRawRows(grid([[], [], new Array(111).fill(null)]), matrixForm!.profile);
  assert.equal(empty.length, 0, 'пустая ячейка — это не ноль');

  const zeroRow: CellValue[] = new Array(111).fill(null);
  zeroRow[99] = 0;
  const zero = buildRawRows(grid([[], [], zeroRow]), matrixForm!.profile);
  assert.equal(zero.length, 1, 'нулевой объём — значение, его нельзя терять');
  assert.equal(zero[0].cells[100], 0);
});

test('плоский список: локации накапливаются, материалы отделяются маркером', () => {
  const rows = buildRawRows(grid([
    ['ФКП, 142'], [], [], [], [], [], [],
    [], [], // до первой строки данных
    [null, 'Корпус 1'],                        // строка 10 — локация (входит в works профиля)
    [null, 'Секция 2'],                        // строка 11 — локация по правилу
    [1, 'Установка порогов на стыках помещений:', 'м.п.', null, 12],   // строка 12 — работа
    [2, 'Плинтус', 'м.п.', 1.05, 300]          // строка 13 — материал («Норма расхода»)
  ]), fkpForm!.profile, 'ФКП, 142');

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].locationContext, ['Корпус 1', 'Секция 2']);
  assert.equal(rows[0].rowNumber, 12);
  assert.equal(rows[0].marker, null);
  assert.equal(rows[1].marker, 'М', 'строка с нормой расхода — материал, не объём работ');
});

test('плоский список: строки без единицы и объёма позициями не становятся', () => {
  const rows = buildRawRows(grid([
    [], [], [], [], [], [], [],
    [], [],
    [null, 'Корпус 1'],
    [1, 'Пояснение без единицы и объёма'],
    [2, 'Работа без единицы', null, null, 10],
    [3, 'Работа без объёма', 'м2', null, null]
  ]), fkpForm!.profile, 'ФКП, 142');

  assert.equal(rows.length, 0);
});

test('pickSheet: имя профиля, затем шаблон, затем первый лист', () => {
  const sheets = [
    { name: 'ГПР', rows: [] },
    { name: 'ФКП, 142', rows: [] }
  ];
  assert.equal(pickSheet(sheets, fkpForm!.profile)?.name, 'ФКП, 142');
  assert.equal(pickSheet(sheets, matrixForm!.profile)?.name, 'ГПР', 'имя не совпало — берём первый');
  assert.equal(pickSheet([], fkpForm!.profile), null);
});
