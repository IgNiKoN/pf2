/**
 * Тесты сводки: пустое не превращается в ноль, неполные суммы честно помечаются,
 * процент считается из сумм и только при плане.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  barWidth, buildDashboard, completionPercent, planFactGap, reconcileSegments, showDecimal, showPercent,
  sumWithGaps, type ObjectDigest
} from './dashboard.ts';

function digest(overrides: Partial<ObjectDigest> = {}): ObjectDigest {
  return {
    objectId: 'obj-1', objectName: 'Объект 1', positions: 10,
    plan: '100', contract: '90', proposed: '95', approved: '90', accepted: null,
    fact: '40', factPercent: '40.0', needsDecision: 2, contoursIncomplete: 3,
    aboveThreshold: 1, incomparable: 5, unconfirmedNorms: 4,
    lastImportAt: '2026-10-16T10:00:00.000Z', proposalPending: false, baselines: 1,
    openChanges: 0, filledPositions: 10,
    units: [{ unit: 'm2', plan: '100', fact: '40', positions: 8 }, { unit: 'lm', plan: '20', fact: null, positions: 2 }],
    works: [{ workId: 'shtukaturka', workRaw: 'Штукатурка стен', unit: 'm2', plan: '100', fact: '40' }],
    ...overrides
  };
}

test('сумма с пробелами: все пустые — это не ноль', () => {
  assert.deepEqual(sumWithGaps([null, null]), { value: null, filled: 0, missing: 2, partial: true });
  assert.deepEqual(sumWithGaps([]), { value: null, filled: 0, missing: 0, partial: false });
  // Часть заполнена: сумма известного плюс честная отметка, что она неполная.
  const partial = sumWithGaps(['10.5', null, '2']);
  assert.equal(partial.value, '12.5');
  assert.equal(partial.filled, 2);
  assert.equal(partial.missing, 1);
  assert.equal(partial.partial, true);
  // Всё заполнено — сумма полная.
  const full = sumWithGaps(['1', '2']);
  assert.equal(full.value, '3');
  assert.equal(full.partial, false);
});

test('процент выполнения: без плана процента нет, и он усекается', () => {
  assert.equal(completionPercent(null, '100'), null, 'без факта — нет процента');
  assert.equal(completionPercent('10', null), null, 'без плана процента не бывает');
  assert.equal(completionPercent('10', '0'), null, 'план ноль — считать нечего');
  assert.equal(completionPercent('40', '100'), '40.0');
  assert.equal(completionPercent('1', '3'), '33.3', 'усечение, а не округление');
  assert.equal(completionPercent('0', '100'), '0.0', 'явный ноль факта — это ноль, а не «пусто»');
  assert.equal(completionPercent('-5', '100'), '-5.0');
});

test('пустое показывается прочерком, а не нулём', () => {
  assert.equal(showDecimal(null), '—');
  assert.equal(showDecimal(''), '—');
  assert.equal(showDecimal('12.5'), '12,50');
  assert.equal(showPercent(null), '—');
  assert.equal(showPercent('40.0'), '40,0 %');
});

test('сводка считает суммы и процент из сумм, а не среднее процентов', () => {
  const dashboard = buildDashboard([
    digest({ objectId: 'a', plan: '100', fact: '100' }),
    digest({ objectId: 'b', plan: '300', fact: '0' })
  ]);

  assert.equal(dashboard.totals.objects, 2);
  assert.equal(dashboard.totals.positions, 20);
  assert.equal(dashboard.totals.plan.value, '400');
  assert.equal(dashboard.totals.fact.value, '100');
  // Среднее процентов дало бы 50 % — это вводило бы в заблуждение.
  assert.equal(dashboard.totals.factPercent, '25.0');
  assert.equal(dashboard.totals.aboveThreshold, 2);
  assert.equal(dashboard.totals.needsDecision, 4);
  assert.equal(dashboard.totals.openChanges, 0);
});

test('неполные данные отмечаются словами, а не выглядят полными', () => {
  const dashboard = buildDashboard([
    digest({ objectId: 'a', plan: '100', fact: null }),
    digest({ objectId: 'b', plan: null, fact: null })
  ]);

  assert.equal(dashboard.totals.plan.value, '100');
  assert.equal(dashboard.totals.plan.partial, true);
  assert.equal(dashboard.totals.plan.missing, 1);
  assert.equal(dashboard.totals.fact.value, null, 'факта нет вовсе — это не 0');
  assert.equal(dashboard.totals.factPercent, null, 'без факта процента нет');
  assert.ok(dashboard.notes.some((note) => /План неполный/.test(note)));
  assert.ok(dashboard.notes.some((note) => /Факт не внесён/.test(note)));
});

test('пустой список объектов объясняется правами, а не отсутствием работ', () => {
  const dashboard = buildDashboard([]);
  assert.equal(dashboard.totals.objects, 0);
  assert.equal(dashboard.totals.plan.value, null);
  assert.ok(dashboard.notes.some((note) => /доступы роли/.test(note)));
});

test('сводка говорит про несравнимые пары и неподтверждённые нормы', () => {
  const dashboard = buildDashboard([digest({ incomparable: 2486, unconfirmedNorms: 11 })], 8);
  assert.ok(dashboard.notes.some((note) => /2486/.test(note) && /не с чем сравнивать/.test(note)));
  assert.ok(dashboard.notes.some((note) => /11/.test(note) && /Норм без подтверждения/.test(note)));
});

test('ожидание решений РП видно в сводке', () => {
  const dashboard = buildDashboard([
    digest({ objectId: 'a', proposalPending: true, openChanges: 2 }),
    digest({ objectId: 'b', proposalPending: false, openChanges: 1 })
  ]);
  assert.equal(dashboard.totals.pendingProposals, 1);
  assert.equal(dashboard.totals.openChanges, 3);
  assert.ok(dashboard.notes.some((note) => /Ждут решения РП/.test(note)));
});

test('расхождение плана и факта: положительное — отставание', () => {
  assert.equal(planFactGap('100', '40'), '60');
  assert.equal(planFactGap('100', '120'), '-20', 'перевыполнение — отрицательное расхождение');
  assert.equal(planFactGap('100', null), null);
  assert.equal(planFactGap(null, '40'), null);
});

test('объёмы разных единиц не складываются в одно число', () => {
  const dashboard = buildDashboard([
    digest({ objectId: 'a', units: [
      { unit: 'm2', plan: '100', fact: '40', positions: 8 },
      { unit: 'lm', plan: '20', fact: '5', positions: 2 }
    ] }),
    digest({ objectId: 'b', units: [
      { unit: 'm2', plan: '50', fact: null, positions: 3 }
    ] })
  ]);

  const m2 = dashboard.byUnit.find((entry) => entry.unit === 'm2')!;
  const lm = dashboard.byUnit.find((entry) => entry.unit === 'lm')!;
  assert.equal(m2.plan.value, '150', 'одна единица складывается');
  assert.equal(m2.fact.value, '40');
  assert.equal(m2.positions, 11);
  assert.equal(lm.plan.value, '20');
  assert.equal(lm.fact.value, '5');
  assert.ok(dashboard.notes.some((note) => /раздельно по единицам/.test(note)),
    'о раздельности единиц сказано словами');
});

test('работы по проекту складываются внутри единицы, крупные — первыми', () => {
  const dashboard = buildDashboard([
    digest({ objectId: 'a', works: [
      { workId: 'shtukaturka', workRaw: 'Штукатурка стен', unit: 'm2', plan: '100', fact: '40' }
    ] }),
    digest({ objectId: 'b', works: [
      { workId: 'shtukaturka', workRaw: 'Штукатурка стен', unit: 'm2', plan: '50', fact: '10' },
      { workId: 'plitka_pola', workRaw: 'Укладка плитки', unit: 'm2', plan: '200', fact: null }
    ] })
  ]);

  assert.equal(dashboard.topWorks.length, 2);
  assert.equal(dashboard.topWorks[0].workRaw, 'Укладка плитки', 'самый большой объём — первым');
  const shtukaturka = dashboard.topWorks.find((work) => work.workId === 'shtukaturka')!;
  assert.equal(shtukaturka.plan, '150', 'одноимённая работа сложена из двух объектов');
  assert.equal(shtukaturka.fact, '50');
  assert.equal(dashboard.topWorks[0].fact, null, 'без факта — null, а не ноль');
});

test('ширина полосы: без данных полосы нет, больше 100 не бывает', () => {
  assert.equal(barWidth('40', '100'), 40);
  assert.equal(barWidth('150', '100'), 100, 'перевыполнение не вылезает за полосу');
  assert.equal(barWidth(null, '100'), null, 'нет факта — нет полосы');
  assert.equal(barWidth('40', null), null, 'нет плана — нет полосы');
  assert.equal(barWidth('40', '0'), null, 'план ноль — делить не на что');
  assert.equal(barWidth('-10', '100'), 0, 'отрицательное не рисуем влево');
});

test('отрезки диаграммы сверки: доли считаются от общего числа сравнений', () => {
  const segments = reconcileSegments({ warnings: 2, ok: 6, incomplete: 12 });
  assert.deepEqual(segments.map((segment) => segment.label), ['Выше порога', 'В пределах порога', 'Не с чем сравнивать']);
  assert.deepEqual(segments.map((segment) => segment.value), [2, 6, 12]);
  assert.equal(segments[0].share, 10);
  assert.equal(segments[1].share, 30);
  assert.equal(segments[2].share, 60);
  assert.equal(segments[0].tone, 'danger');
  // Пустая сводка не рисует «полную» диаграмму.
  assert.deepEqual(reconcileSegments({ warnings: 0, ok: 0, incomplete: 0 }).map((segment) => segment.share), [0, 0, 0]);
});
