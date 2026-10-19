/**
 * Тесты расчёта графика: арифметика объём÷норма÷бригада, порядок и паузы, дорожки,
 * исключения, загрузка людей и календарь рабочих дней.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addWorkDays, buildSchedule, dayIndex, finishDate, formatDate, isWeekend
} from './schedule.ts';
import { WORK_NORMS, WORKS, type WorkNorm } from './reference.ts';
import type { ScheduleItem } from './schedule.ts';

/** Управляемые нормы для проверки арифметики: реальные числа справочника — в WORK_NORMS. */
const norms: Record<string, WorkNorm> = {
  a: { key: 'a', name: 'Работа А', unit: 'm2', norm: '60', crew: 4, lag: '3', rank: 10, confirmed: true },
  b: { key: 'b', name: 'Работа Б', unit: 'm2', norm: '25', crew: 2, lag: '1', rank: 20, confirmed: false },
  c: { key: 'c', name: 'Работа В', unit: 'lm', norm: '0', crew: 4, lag: '0', rank: 30, confirmed: true }
};

function item(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return { section: '1', floor: '2', place: '15а', workKey: 'a', rawWork: 'Работа А', unit: 'm2', qty: '829', ...overrides };
}

function input(items: ScheduleItem[], extra: Partial<Parameters<typeof buildSchedule>[0]> = {}) {
  return { items, norms, startDate: '2026-01-02', workWeek: 5, parallelFloors: 1, ...extra };
}

test('объём ÷ норма ÷ бригада считается точно и без float', () => {
  const result = buildSchedule(input([item()]));

  assert.equal(result.rows.length, 1);
  const row = result.rows[0];
  assert.equal(row.manDays, '13.817', '829 / 60 с округлением до 3 знаков');
  assert.equal(row.duration, '3.454', 'человеко-дни / бригада 4');
  assert.equal(row.start, '0');
  assert.equal(row.end, '3.454');
  assert.equal(result.totalManDays, '13.817');
  assert.equal(result.totalDays, '3.454');
});

test('работы этажа идут по технологическому порядку, пауза сдвигает следующую', () => {
  const result = buildSchedule(input([
    item({ workKey: 'b', rawWork: 'Работа Б', qty: '100' }),
    item({ workKey: 'a', rawWork: 'Работа А', qty: '829' })
  ]));

  // Порядок задан rank: А (10) раньше Б (20), хотя в ВОР Б пришла первой.
  assert.deepEqual(result.rows.map((row) => row.key), ['a', 'b']);
  const [first, second] = result.rows;
  assert.equal(first.end, '3.454');
  assert.equal(second.start, '6.454', 'пауза 3 суток после первой работы');
  assert.equal(second.manDays, '4');
  assert.equal(second.duration, '2');
});

test('этажи распределяются по дорожкам: параллельные начинаются с нуля', () => {
  const result = buildSchedule(input([
    item({ floor: '2', qty: '600' }),
    item({ floor: '3', qty: '600' })
  ], { parallelFloors: 2 }));

  const first = result.rows.find((row) => row.floor === '2');
  const second = result.rows.find((row) => row.floor === '3');
  assert.equal(first?.start, '0');
  assert.equal(second?.start, '0', 'вторая дорожка свободна — этаж начинается сразу');
  assert.deepEqual(result.floors, ['2', '3']);
});

test('непригодные позиции не попадают в график, а объясняются', () => {
  const result = buildSchedule(input([
    item({ workKey: null, rawWork: 'Неведомое' }),
    item({ unit: 'm3', rawWork: 'Работа А в кубах' }),
    item({ workKey: 'c', unit: 'lm', rawWork: 'Работа В без нормы' })
  ]));

  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.excluded.map((entry) => entry.reason), ['unresolved-work', 'unit-mismatch', 'no-norm']);
  assert.ok(result.warnings.some((warning) => /Нет ни одной позиции/.test(warning)));
});

test('загрузка людей по дням считается по составу бригад', () => {
  const result = buildSchedule(input([item({ qty: '600' })]));

  // 600 / 60 = 10 человеко-дней, /4 = 2,5 дня → дни 0,1,2 заняты бригадой из 4 человек.
  assert.deepEqual(result.load.slice(0, 4), [4, 4, 4, 0]);
});

test('неподтверждённая норма даёт предупреждение, а не молчаливый срок', () => {
  const result = buildSchedule(input([item({ workKey: 'b', rawWork: 'Работа Б', qty: '100' })]));

  assert.equal(result.rows.length, 1);
  assert.ok(result.warnings.some((warning) => /не подтверждена ПТО/.test(warning)), result.warnings.join(' | '));
});

test('календарь: рабочие дни, выходные и дата окончания', () => {
  const friday = new Date('2026-01-02T00:00:00');

  assert.equal(formatDate(addWorkDays(friday, 1, 5)), '05.01.2026', 'пятница + 1 рабочий день = понедельник');
  assert.equal(formatDate(addWorkDays(friday, 1, 6)), '03.01.2026', 'шестидневка использует субботу');
  assert.equal(isWeekend(friday, 1), true);
  assert.equal(isWeekend(friday, 3), false);
  assert.equal(dayIndex(friday, new Date('2026-01-05T00:00:00')), 3, 'календарных дня между датами');
  assert.equal(formatDate(finishDate('2026-01-02', '3', 5)), '07.01.2026', 'три рабочих дня — до среды');
});

test('справочник: норма есть у каждого вида работ и совпадает по единице', () => {
  assert.equal(Object.keys(WORK_NORMS).length, WORKS.length);
  for (const work of WORKS) {
    const norm = WORK_NORMS[work.id];
    assert.ok(norm, `нет нормы для ${work.id}`);
    assert.equal(norm.unit, work.unit, `единица нормы ${work.id} расходится со справочником`);
    assert.equal(norm.name, work.title);
  }
});
