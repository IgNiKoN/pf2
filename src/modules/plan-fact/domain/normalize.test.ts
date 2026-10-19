/**
 * Тесты ядра нормализации: единицы, локации, сопоставление работ, протокол проблем.
 * Логика перенесена из платформы 2.0 — тесты проверяют её на реальных формулировках форм.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dedupeItems, matchWork, normalizeLabel, normalizeRows, normalizeUnit, parseLocationContext
} from './normalize.ts';
import { UNITS, WORK_ALIASES, WORKS, matchReason } from './reference.ts';
import type { NormalizeContext, NormalizedItem, RawRow } from './types.ts';

const LOCATION_RULES = [
  { id: 'loc-section', pattern: '^Секц\\S*\\s*([\\d.]+)', target: 'section' as const, group: 1 },
  { id: 'loc-floor', pattern: '^Этаж\\s*([\\d.]+)', target: 'floor' as const, group: 1 },
  { id: 'loc-room-number', pattern: '^\\d+\\s*[а-я]?$', target: 'room' as const }
];

function ctx(overrides: Partial<NormalizeContext> = {}): NormalizeContext {
  return {
    units: UNITS,
    works: WORKS,
    aliases: WORK_ALIASES,
    columns: [{ field: 'name', columnIndex: 1, headerText: 'Работа' },
      { field: 'unit', columnIndex: 2, headerText: 'ЕИ' },
      { field: 'quantity', columnIndex: 3, headerText: 'Объём' }],
    locationRules: LOCATION_RULES,
    ...overrides
  };
}

function row(cells: (string | number | boolean | null)[], locationContext: string[] = [], marker?: string): RawRow {
  return { sheet: 'Лист', rowNumber: 10, cells, locationContext, marker: marker ?? null };
}

test('normalizeUnit понимает написания из реальных форм', () => {
  assert.equal(normalizeUnit('S, м2', UNITS), 'm2');
  assert.equal(normalizeUnit('кв.м', UNITS), 'm2');
  assert.equal(normalizeUnit('м.пог.', UNITS), 'lm');
  assert.equal(normalizeUnit('шт.', UNITS), 'pcs');
  assert.equal(normalizeUnit('м³', UNITS), 'm3');
  assert.equal(normalizeUnit('компл.', UNITS), 'set');
  assert.equal(normalizeUnit('', UNITS), null);
  assert.equal(normalizeUnit('фунт', UNITS), null);
});

test('normalizeLabel снимает регистр, ё и кавычки', () => {
  assert.equal(normalizeLabel('  Шпатлёвка  «стен»  '), 'шпатлевка стен');
});

test('parseLocationContext разбирает уровни и не выдумывает нераспознанные', () => {
  const parsed = parseLocationContext(['Секция 1', 'Этаж 2', '15а'], LOCATION_RULES);
  assert.deepEqual(parsed.parts, [
    { type: 'section', name: '1' },
    { type: 'floor', name: '2' },
    { type: 'room', name: '15а' }
  ]);
  assert.deepEqual(parsed.unmatched, []);

  const partial = parseLocationContext(['Корпус 7'], LOCATION_RULES);
  assert.deepEqual(partial.parts, []);
  assert.deepEqual(partial.unmatched, ['Корпус 7']);
});

test('matchWork: точное имя, алиас, код, отсутствие совпадения', () => {
  assert.equal(matchWork('Штукатурка стен', ctx()).workId, 'shtukaturka');
  assert.equal(matchWork('Шпаклёвка', ctx()).reason, 'алиас');
  assert.equal(matchWork('shtukaturka', ctx()).reason, 'код работы');
  const unresolved = matchWork('Устройство чего-то неведомого', ctx());
  assert.equal(unresolved.workId, null);
  assert.equal(unresolved.match, 'unresolved');
});

test('matchReason объясняет знакомую формулировку без вида работ', () => {
  assert.match(matchReason('Монтаж ревизионных лючков в с/у', null), /нет в справочнике/);
  assert.match(matchReason('Установка плинтуса из ПВХ на клею, высотой 55 мм:', 'plintus'), /синоним/);
});

test('normalizeRow: пустая строка не ошибка, объём — decimal строкой', () => {
  const result = normalizeRows([row(['Штукатурка стен', 'м2', '0,1'], ['Секция 1', 'Этаж 2'])], ctx());
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].quantity, '0.1');
  assert.equal(result.items[0].workId, 'shtukaturka');
  assert.equal(result.items[0].unit, 'm2');
  assert.deepEqual(result.items[0].locationPath, ['1', '2']);

  const empty = normalizeRows([row([null, null, null])], ctx());
  assert.equal(empty.items.length, 0);
  assert.equal(empty.issues.length, 0);
});

test('normalizeRows: проблемы видны, а не проглатываются', () => {
  const result = normalizeRows([
    row(['Неведомая работа', 'фунт', '12'], ['Корпус 7']),
    row(['Штукатурка стен', 'м2', '—']),
    row(['Штукатурка стен', 'м2', '-5']),
    row(['Плинтус', 'м.п.', '1.05'], [], 'М')
  ], ctx());

  const codes = result.issues.map((issue) => issue.code);
  assert.ok(codes.includes('WORK_UNRESOLVED'), 'несопоставленная работа должна быть в протоколе');
  assert.ok(codes.includes('UNKNOWN_UNIT'), 'неизвестная единица должна быть в протоколе');
  assert.ok(codes.includes('LOCATION_UNRESOLVED'), 'нераспознанная локация должна быть в протоколе');
  assert.ok(codes.includes('NO_QUANTITY'), 'нечисловой объём должен быть ошибкой, а не нулём');
  assert.ok(codes.includes('NEGATIVE_QUANTITY'), 'отрицательный объём — отдельная корректировка');
  assert.equal(result.stats.materialsSkipped, 1, 'строка материала не становится позицией');
  assert.equal(result.items.length, 2, 'позиция без объёма не создаётся, отрицательная — создаётся');
});

test('dedupeItems схлопывает дубль по локации, работе и единице', () => {
  const items: NormalizedItem[] = [
    { rowNumber: 1, locationPath: ['1', '2'], workRaw: 'Штукатурка стен', workId: 'shtukaturka', workMatch: 'auto', unitRaw: 'м2', unit: 'm2', quantity: '10', fragment: { sheet: 'Л', row: 1, column: 1, rawValue: 'x' } },
    { rowNumber: 2, locationPath: ['1', '2'], workRaw: 'Штукатурка  стен', workId: 'shtukaturka', workMatch: 'auto', unitRaw: 'м2', unit: 'm2', quantity: '10', fragment: { sheet: 'Л', row: 2, column: 1, rawValue: 'x' } }
  ];
  const result = dedupeItems(items);
  assert.equal(result.items.length, 1);
  assert.equal(result.duplicates.length, 1);
});
