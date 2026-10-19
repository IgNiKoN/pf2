/**
 * Тесты сортировки: точные десятичные строки, «не заполнено» в конце, устойчивость,
 * цикл клика «возрастание → убывание → исходный порядок».
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareDecimalText, compareValues, cycleSort, describeSort, isSortEmpty, NO_SORT, sortRows } from './sort.ts';

test('десятичные строки сравниваются точно, без float', () => {
  assert.ok(compareDecimalText('10', '9') > 0, '10 больше 9, а не меньше по алфавиту');
  assert.ok(compareDecimalText('100', '87.5') > 0);
  assert.ok(compareDecimalText('-5', '3') < 0);
  assert.ok(compareDecimalText('-10', '-5') < 0);
  assert.equal(compareDecimalText('0.10', '0.1'), 0, 'хвостовые нули не меняют значение');
  assert.ok(compareDecimalText('0.123456789012345678', '0.123456789012345677') > 0,
    'различие на 18-м знаке видно, хотя Number его теряет');
  assert.equal(compareDecimalText('007', '7'), 0);
});

test('текст сравнивается по-русски и с числами внутри', () => {
  assert.ok(compareValues('Этаж 2', 'Этаж 10') < 0, 'числа внутри текста идут по значению');
  assert.ok(compareValues('Окраска', 'Штукатурка') < 0);
  assert.equal(compareValues('М2', 'м2'), 0, 'регистр не влияет');
});

test('пустое значение — не ноль: оно всегда в конце', () => {
  assert.equal(isSortEmpty(''), true);
  assert.equal(isSortEmpty('   '), true);
  assert.equal(isSortEmpty(null), true);
  assert.equal(isSortEmpty('0'), false, 'ноль — это значение, а не пустота');

  const rows = [
    { name: 'a', qty: '' },
    { name: 'b', qty: '10' },
    { name: 'c', qty: null },
    { name: 'd', qty: '9' }
  ];
  const accessor = (row: { qty: string | null }, key: string) => (key === 'qty' ? row.qty : '');

  const ascending = sortRows(rows, { key: 'qty', dir: 'asc' }, accessor).map((row) => row.name);
  assert.deepEqual(ascending, ['d', 'b', 'a', 'c'], '9, 10, затем пустые');

  const descending = sortRows(rows, { key: 'qty', dir: 'desc' }, accessor).map((row) => row.name);
  assert.deepEqual(descending, ['b', 'd', 'a', 'c'], 'пустые остались в конце и при убывании');
});

test('сортировка устойчивая: равные значения сохраняют исходный порядок', () => {
  const rows = [
    { id: 'первый', group: 'Б' },
    { id: 'второй', group: 'А' },
    { id: 'третий', group: 'Б' },
    { id: 'четвёртый', group: 'А' }
  ];
  const sorted = sortRows(rows, { key: 'group', dir: 'asc' }, (row, key) => (key === 'group' ? row.group : row.id));
  assert.deepEqual(sorted.map((row) => row.id), ['второй', 'четвёртый', 'первый', 'третий']);
});

test('клик по колонке: возрастание → убывание → исходный порядок', () => {
  let state = NO_SORT;
  state = cycleSort(state, 'qty');
  assert.deepEqual(state, { key: 'qty', dir: 'asc' });
  state = cycleSort(state, 'qty');
  assert.deepEqual(state, { key: 'qty', dir: 'desc' });
  state = cycleSort(state, 'qty');
  assert.deepEqual(state, { key: null, dir: 'asc' }, 'третий клик возвращает исходный порядок');

  state = cycleSort(state, 'work');
  assert.deepEqual(state, { key: 'work', dir: 'asc' }, 'другая колонка начинает с возрастания');
});

test('без выбранной колонки порядок исходный, а массив не мутируется', () => {
  const rows = [{ id: '2' }, { id: '1' }];
  const result = sortRows(rows, NO_SORT, (row) => row.id);
  assert.deepEqual(result.map((row) => row.id), ['2', '1']);
  assert.notEqual(result, rows, 'возвращается копия, исходный массив не портится');
});

test('подпись сортировки говорит, что происходит', () => {
  const titles = { qty: 'Объём', work: 'Работа' };
  assert.equal(describeSort(NO_SORT, titles), 'исходный порядок');
  assert.equal(describeSort({ key: 'qty', dir: 'asc' }, titles), 'Объём: по возрастанию');
  assert.equal(describeSort({ key: 'work', dir: 'desc' }, titles), 'Работа: по убыванию');
  assert.equal(describeSort({ key: 'unknown', dir: 'asc' }, titles), 'unknown: по возрастанию');
});

test('числовые значения и строка с числом сортируются одинаково', () => {
  const rows = [{ v: 10 }, { v: 9 }, { v: 100 }];
  assert.deepEqual(sortRows(rows, { key: 'v', dir: 'asc' }, (row) => row.v).map((row) => row.v), [9, 10, 100]);
});
