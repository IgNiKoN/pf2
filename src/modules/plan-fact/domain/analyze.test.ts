/**
 * Тесты разбора формы целиком: статистика, строки ВОР, точные суммы.
 * Домен проверяется без браузера: сюда приходит только результат reader'а.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyze, toWorRow, totalsByWork, unresolvedWorks, autoMatchedWorks } from './analyze.ts';
import { formProfileById } from './profiles.ts';
import type { CellValue, RawRow } from './types.ts';

const listForm = formProfileById('fkp-list');
assert.ok(listForm, 'профиль плоского списка должен быть объявлен');

/** Колонки ФКП: 1 № п/п · 2 наименование · 3 ЕИ · 4 норма расхода · 5 объём. */
function rawRow(
  cells: CellValue[],
  locationContext: string[] = ['Секция 1', 'Этаж 2'],
  rowNumber = 12,
  marker: string | null = null
): RawRow {
  return { sheet: 'ФКП, 142', rowNumber, cells, locationContext, marker };
}

test('analyze: позиция, доля сопоставления и адрес значения в файле', () => {
  const result = analyze(
    [rawRow([1, 'Установка порогов на стыках помещений:', 'м.п.', null, 12])],
    listForm!
  );

  assert.equal(result.stats.sheet, 'ФКП, 142');
  assert.equal(result.stats.items, 1);
  assert.equal(result.stats.matched, 1);
  assert.equal(result.stats.matchedPercent, 100);
  assert.equal(result.stats.needsDecision, 0);

  const wor = result.rows[0];
  assert.equal(wor.workId, 'porogi');
  assert.equal(wor.unit, 'lm');
  assert.equal(wor.quantity, '12');
  assert.equal(wor.section, '1');
  assert.equal(wor.floor, '2');
  assert.equal(wor.fragment.row, 12, 'адрес в файле сохраняется — происхождение проверяемо');
  assert.match(wor.matchReason, /синоним/);
});

test('analyze: несопоставленная работа становится «требует решения», а не пропадает', () => {
  const result = analyze([rawRow([1, 'Устройство неведомого', 'м2', null, '0,1'])], listForm!);

  assert.equal(result.stats.items, 1);
  assert.equal(result.stats.matched, 0);
  assert.equal(result.stats.needsDecision, 1);
  assert.equal(result.stats.matchedPercent, 0);
  assert.equal(result.rows[0].workId, null);
  assert.equal(result.rows[0].quantity, '0.1', 'запятая разобрана в десятичную строку');
  assert.match(result.rows[0].matchReason, /нет совпадения/);
  assert.ok(result.issues.some((issue) => issue.code === 'WORK_UNRESOLVED'));

  // Неразобранный уровень локации тоже виден: «Корпус 1» не описан правилами заказчика.
  const withUnknownLocation = analyze(
    [rawRow([1, 'Плинтус', 'м.п.', null, 3], ['Корпус 1', 'Секция 2'])],
    listForm!
  );
  assert.ok(withUnknownLocation.issues.some((issue) => issue.code === 'LOCATION_UNRESOLVED'));
});

test('toWorRow: пустая локация не выдумывается, а помечается «по договору»', () => {
  const row = toWorRow({
    rowNumber: 12,
    locationPath: [],
    workRaw: 'Плинтус',
    workId: 'plintus',
    workMatch: 'auto',
    unitRaw: 'м.п.',
    unit: 'lm',
    quantity: '0.1',
    fragment: { sheet: 'ФКП, 142', row: 12, column: 2, rawValue: 'Плинтус' }
  }, listForm!);

  assert.equal(row?.section, '—');
  assert.equal(row?.floor, '—');
  assert.equal(row?.place, 'по договору');
});

test('totalsByWork суммирует точно и группирует по виду работ', () => {
  const base = {
    section: '1', floor: '2', place: '15а', matchReason: '', unitRaw: 'м2', unit: 'm2' as const,
    fragment: { sheet: 'Л', row: 1, column: 1, rawValue: 'x' }
  };
  const totals = totalsByWork([
    { ...base, workRaw: 'Штукатурка стен', workId: 'shtukaturka', workMatch: 'auto', quantity: '0.1' },
    { ...base, workRaw: 'Штукатурка стен', workId: 'shtukaturka', workMatch: 'auto', quantity: '0.2' },
    { ...base, workRaw: 'Плинтус', workId: 'plintus', workMatch: 'auto', quantity: '3' }
  ]);

  const plaster = totals.find((entry) => entry.workKey === 'shtukaturka');
  assert.equal(plaster?.quantity, '0.3', '0,1 + 0,2 = 0,3 — без float');
  assert.equal(totals.length, 2);
});

test('несопоставленное собирается по формулировкам, а не по строкам', () => {
  const items = [
    { workId: null, workRaw: 'Монтаж вентиляции', unitRaw: 'м.п.' },
    { workId: null, workRaw: 'Монтаж вентиляции', unitRaw: 'м.п.' },
    { workId: null, workRaw: 'Плинтус потолочный', unitRaw: 'м.п.' },
    { workId: 'shtukaturka', workRaw: 'Штукатурка стен', unitRaw: 'м2' },
    { workId: null, workRaw: '   ', unitRaw: 'м2' }
  ] as unknown as Parameters<typeof unresolvedWorks>[0];

  const list = unresolvedWorks(items);
  assert.equal(list.length, 2, 'пустое название в список не попадает, сопоставленное тоже');
  assert.deepEqual(list[0], { raw: 'Монтаж вентиляции', count: 2, units: ['м.п.'] });
  assert.deepEqual(list[1], { raw: 'Плинтус потолочный', count: 1, units: ['м.п.'] });
});

test('автоматические сопоставления отделяются от подтверждённых ПТО', () => {
  const rows = [
    { workRaw: 'Штукатурка стен', workId: 'shtukaturka' },
    { workRaw: 'штукатурка  СТЕН', workId: 'shtukaturka' },
    { workRaw: 'Окраска стен', workId: 'okraska' },
    { workRaw: 'Монтаж вентиляции', workId: null }
  ] as unknown as Parameters<typeof autoMatchedWorks>[0];

  // ПТО подтвердил только окраску — она из списка уходит.
  const aliases = [
    { normalizedAlias: 'окраска стен', workId: 'okraska', source: 'pto' as const }
  ];
  const list = autoMatchedWorks(rows, aliases);

  assert.equal(list.length, 1, 'несопоставленное и подтверждённое в список не попадают');
  assert.deepEqual(list[0], {
    raw: 'Штукатурка стен', workId: 'shtukaturka', count: 2, workTitle: 'Штукатурка стен'
  }, 'одна формулировка считается один раз, регистр не создаёт второй');

  assert.deepEqual(autoMatchedWorks(rows, []).length, 2, 'без подтверждений в списке обе формулировки');
});
