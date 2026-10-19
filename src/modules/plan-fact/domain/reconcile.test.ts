/**
 * Тесты сверки контуров (ТЗ VOR-024): абсолютная и процентная разница, пороги по видам работ,
 * пустой контур как «не с чем сравнивать», агрегаты без двойного счёта.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  aggregateReconciliation, contrastOf, reconcileRows, reconciliationSummary, thresholdFor, truncate,
  DEFAULT_THRESHOLD, type ThresholdRule
} from './reconcile.ts';
import type { ContourKind, ContourRow } from './contours.ts';

function row(
  worItemId: string,
  values: Partial<Record<ContourKind, string>>,
  overrides: { workId?: string | null; workRaw?: string; unit?: string; place?: string } = {}
): ContourRow {
  const filled: Record<ContourKind, string | null> = {
    RD: null, CONTRACT: null, PROPOSED: null, APPROVED: null, CUSTOMER_ACCEPTED: null
  };
  for (const [kind, value] of Object.entries(values)) filled[kind as ContourKind] = value ?? null;
  const count = Object.values(filled).filter((value) => value !== null).length;
  return {
    worItemId,
    place: overrides.place ?? 'Этаж 2 · кв. 1',
    workRaw: overrides.workRaw ?? 'Штукатурка стен',
    workId: overrides.workId === undefined ? 'shtukaturka' : overrides.workId,
    unit: overrides.unit ?? 'm2',
    plan: null,
    values: filled,
    filled: count,
    proposedMinusContract: null,
    incomplete: count < 5
  };
}

test('процент считается от левого значения и усекается, а не округляется', () => {
  // 90 против 100: разница −10, процент −10,0
  assert.deepEqual(contrastOf('100', '90'), { absolute: '-10', percent: '-10.0' });
  assert.deepEqual(contrastOf('100', '105'), { absolute: '5', percent: '5.0' });
  // 2 из 3 — это 66,666…%: усечение даёт 66.6, округление дало бы 66.7
  assert.deepEqual(contrastOf('3', '5'), { absolute: '2', percent: '66.6' });
  assert.equal(contrastOf('0', '5').percent, '0', 'от нуля процент не считается');
  assert.equal(truncate('5.0999', 1), '5.0', 'усечение, а не округление');
  assert.equal(truncate('5.9999', 2), '5.99');
  assert.equal(truncate('7.5', 0), '7');
  assert.equal(truncate('-2.789', 1), '-2.7', 'знак сохраняется');
});

test('порог выбирается по виду работ, затем по единице, затем общий', () => {
  const rules: ThresholdRule[] = [
    { workId: null, unit: null, percent: '5', absolute: '0' },
    { workId: null, unit: 'lm', percent: '2', absolute: '0.5' },
    { workId: 'shtukaturka', unit: null, percent: '1', absolute: '0' }
  ];
  assert.equal(thresholdFor('shtukaturka', 'm2', rules).percent, '1', 'точное правило по виду работ');
  assert.equal(thresholdFor('okraska', 'lm', rules).percent, '2', 'правило по единице');
  assert.equal(thresholdFor('okraska', 'm2', rules).percent, '5', 'общее правило');
  assert.equal(thresholdFor('x', 'y', []).percent, DEFAULT_THRESHOLD.percent, 'без правил — общий порог');
});

test('расхождение выше порога помечается, в пределах порога — нет', () => {
  const rows = [
    row('w1', { RD: '100', CONTRACT: '90' }),   // −10% при пороге 5% → предупреждение
    row('w2', { RD: '100', CONTRACT: '98' }),   // −2% → в пределах
    row('w3', { RD: '100' })                     // договор пуст → не с чем сравнивать
  ];
  const result = reconcileRows(rows, [{ workId: null, unit: null, percent: '5', absolute: '0' }]);
  const byItem = (id: string, left: string, right: string) =>
    result.find((item) => item.worItemId === id && item.left === left && item.right === right
      && item.pair.includes(left === '100' && right === '90' ? 'РД ↔ договор' : 'РД ↔ договор'))!;

  assert.equal(byItem('w1', '100', '90').status, 'warning');
  assert.equal(byItem('w1', '100', '90').absolute, '-10');
  assert.equal(byItem('w1', '100', '90').percent, '-10.0');
  assert.match(byItem('w1', '100', '90').reason, /выше порога/);

  const w2 = result.find((item) => item.worItemId === 'w2' && item.left === '100' && item.right === '98')!;
  assert.equal(w2.status, 'ok', 'в пределах порога — не тревога');
  assert.match(w2.reason, /в пределах порога/);

  const incomplete = result.filter((item) => item.worItemId === 'w3');
  assert.ok(incomplete.length >= 1);
  assert.ok(incomplete.every((item) => item.status === 'incomplete'), 'пустое не считается нулём');
  assert.ok(incomplete.some((item) => /не заполнено/.test(item.reason)));
});

test('абсолютный порог тоже работает', () => {
  const rows = [row('w1', { RD: '10', CONTRACT: '13' })];
  const strict = reconcileRows(rows, [{ workId: null, unit: null, percent: '100', absolute: '1' }]);
  assert.ok(strict.some((item) => item.status === 'warning'), '3 единицы больше порога 1');
  const loose = reconcileRows(rows, [{ workId: null, unit: null, percent: '100', absolute: '5' }]);
  assert.ok(loose.filter((item) => item.left === '10' && item.right === '13')
    .every((item) => item.status === 'ok'), '3 единицы в пределах порога 5');
});

test('пар для сверки три: РД, договор и предложение', () => {
  const result = reconcileRows([row('w1', { RD: '100', CONTRACT: '100', PROPOSED: '100' })]);
  const pairs = new Set(result.map((item) => item.pair));
  assert.deepEqual([...pairs].sort(), ['Договор ↔ предложено', 'РД ↔ договор', 'РД ↔ предложено']);
  assert.equal(result.length, 3, 'на каждую пару — своя строка отчёта');
});

test('агрегаты складывают объёмы точно и не дублируют позиции', () => {
  // Домен работает с каноническими десятичными строками (точка): запятая — это ввод человека,
  // её приводит `setContour`. Поэтому здесь именно '10.5', а не '10,5'.
  const rows = [
    row('w1', { RD: '10.5', CONTRACT: '10' }),
    row('w2', { RD: '20.25', CONTRACT: '20' }),
    row('w3', { RD: '0.25', CONTRACT: '0' })
  ];
  const aggregates = aggregateReconciliation(rows, [{ workId: null, unit: null, percent: '5', absolute: '0' }]);
  const pair = aggregates.find((item) => item.pair === 'РД ↔ договор')!;

  assert.equal(pair.leftSum, '31', '10.5 + 20.25 + 0.25 = 31 — точно, без float');
  assert.equal(pair.rightSum, '30');
  assert.equal(pair.absolute, '-1');
  assert.equal(pair.percent, '-3.2', '1 из 31 — 3,225…%, усечение даёт 3.2');
  assert.equal(pair.status, 'ok');
});

test('сводка считает предупреждения, пустые и в пределах порога', () => {
  const rows = [
    row('w1', { RD: '100', CONTRACT: '90' }),
    row('w2', { RD: '100', CONTRACT: '100' }),
    row('w3', { RD: '100' })
  ];
  const summary = reconciliationSummary(reconcileRows(rows, []));
  assert.equal(summary.total, 9, 'три позиции по три пары');
  // Три позиции по три пары — девять строк отчёта.
  assert.equal(summary.total, 9);
  assert.equal(summary.warnings, 1, 'w1: РД 100 против договора 90 — выше порога 5%');
  assert.equal(summary.ok, 1, 'w2: 100 против 100 — в пределах порога');
  assert.equal(summary.incomplete, 7, 'предложения нет ни у одной позиции, у w3 ещё и договора нет');
});
