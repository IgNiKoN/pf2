/**
 * Тесты асинхронного импорта (ТЗ VOR-009): порционность, прогресс, отмена с честной пометкой,
 * частичное принятие и совпадение результата с синхронным разбором.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyze } from './analyze.ts';
import { analyzeAsync } from './importer.ts';
import { formProfileById, normalizeContextOf } from './profiles.ts';
import type { FormProfile } from './profiles.ts';
import type { RawRow } from './types.ts';

/**
 * Строки плоского списка ФКП: 1 № п/п · 2 наименование · 3 ЕИ · 4 норма расхода · 5 объём.
 * Адрес помещения задаётся контекстом строки-локации, как в настоящем листе.
 */
function makeRows(count: number): RawRow[] {
  const works = ['Штукатурка стен', 'Окраска стен', 'Плинтус', 'Монтаж вентиляции'];
  const rows: RawRow[] = [];
  for (let index = 0; index < count; index += 1) {
    rows.push({
      sheet: 'Лист1',
      rowNumber: index + 12,
      cells: [index + 1, works[index % works.length], index % 2 === 0 ? 'м2' : 'м.п.', null, String(10 + (index % 7))],
      locationContext: ['Секция 1', `Этаж ${2 + (index % 3)}`, `кв. ${1 + (index % 40)}`],
      marker: null
    });
  }
  return rows;
}

const FORM = formProfileById('fkp-list') as FormProfile;

test('асинхронный разбор даёт тот же результат, что синхронный', async () => {
  const rows = makeRows(600);
  const context = normalizeContextOf(FORM);

  const sync = analyze(rows, FORM, context);
  const async = await analyzeAsync(rows, FORM, context, { chunkSize: 128, yieldToUi: async () => {} });

  assert.equal(async.cancelled, false);
  assert.equal(async.processed, rows.length);
  assert.equal(async.result.rows.length, sync.rows.length, 'позиций столько же');
  assert.equal(async.result.stats.items, sync.stats.items);
  assert.equal(async.result.stats.matched, sync.stats.matched);
  assert.equal(async.result.stats.materialsSkipped, sync.stats.materialsSkipped);
  assert.equal(async.result.stats.unresolvedWorks, sync.stats.unresolvedWorks);
});

test('прогресс идёт порциями и заканчивается полным числом строк', async () => {
  const rows = makeRows(2_500);
  const steps: { done: number; total: number; message: string }[] = [];

  await analyzeAsync(rows, FORM, normalizeContextOf(FORM), {
    chunkSize: 500,
    onProgress: (progress) => steps.push({ done: progress.done, total: progress.total, message: progress.message }),
    yieldToUi: async () => {}
  });

  const normalizing = steps.filter((step) => step.total === rows.length && step.done > 0 && step.done < rows.length);
  assert.ok(normalizing.length >= 4, `порций должно быть несколько, а их ${normalizing.length}`);
  assert.equal(steps[steps.length - 1].done, rows.length, 'последний шаг — все строки');
  assert.match(steps[steps.length - 1].message, /Готово|позиций/);
});

test('отмена возвращает разобранное и честно помечает результат неполным', async () => {
  const rows = makeRows(3_000);
  let processedChunks = 0;

  const run = await analyzeAsync(rows, FORM, normalizeContextOf(FORM), {
    chunkSize: 500,
    isCancelled: () => processedChunks >= 2,
    onProgress: () => {
      processedChunks += 1;
    },
    yieldToUi: async () => {}
  });

  assert.equal(run.cancelled, true, 'отмена обязана быть видна в результате');
  assert.ok(run.processed > 0, 'разобранное не выбрасываем');
  assert.ok(run.processed < rows.length, 'и не выдаём за весь файл');
  assert.ok(run.result.rows.length > 0, 'частичное принятие: валидные строки остаются');
  assert.match(String(run.result.stats.rows), new RegExp(`^${run.processed}$`), 'в статистике — только разобранное');
});

test('строки с ошибками попадают в протокол, а валидные принимаются', async () => {
  const rows: RawRow[] = [
    ...makeRows(10),
    { sheet: 'Лист1', rowNumber: 900, cells: [900, 'Штукатурка стен', 'м2', null, 'не число'], locationContext: ['Секция 1', 'Этаж 2', 'кв. 9'], marker: null },
    { sheet: 'Лист1', rowNumber: 901, cells: [901, 'Неизвестная работа', 'м2', null, '5'], locationContext: ['Секция 1', 'Этаж 2', 'кв. 9'], marker: null }
  ];

  const run = await analyzeAsync(rows, FORM, normalizeContextOf(FORM), { chunkSize: 4, yieldToUi: async () => {} });

  assert.equal(run.cancelled, false);
  assert.equal(run.result.stats.rows, rows.length, 'все строки листа учтены');
  assert.ok(run.result.stats.items >= 10, 'валидные строки приняты');
  assert.ok(run.result.issues.length > 0, 'протокол ошибок не пуст');
  assert.ok(run.result.issues.some((issue) => issue.code === 'WORK_UNRESOLVED' || issue.code === 'UNKNOWN_UNIT'));
  assert.ok(run.result.stats.needsDecision >= 0);
});

test('двадцать тысяч строк разбираются укладываясь в целевое время', async () => {
  // Целевой тест ТЗ: 20 000 строк ≤ 2 минут. В тесте меряем сам разбор (без чтения файла),
  // поэтому порог жёстче: если разбор вдруг станет медленным, тест это покажет.
  const rows = makeRows(20_000);
  const started = Date.now();
  const run = await analyzeAsync(rows, FORM, normalizeContextOf(FORM), {
    chunkSize: 1_000,
    yieldToUi: async () => {}
  });
  const elapsed = Date.now() - started;

  assert.equal(run.processed, 20_000);
  assert.ok(run.result.rows.length > 0);
  assert.ok(elapsed < 60_000, `разбор 20 000 строк занял ${elapsed} мс — это больше минуты`);
});
