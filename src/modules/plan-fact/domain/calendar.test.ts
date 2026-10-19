/**
 * Тесты рабочего календаря: нормализация нерабочих дат, влияние на сроки и хранение.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptyCalendar, loadCalendar, normalizeNonWorkingDays, saveCalendar } from './calendar.ts';
import { addWorkDays, finishDate, formatDate } from './schedule.ts';

function installFakePlatform(): Map<string, unknown> {
  const records = new Map<string, unknown>();
  const fakeWindow = {
    RBI: {
      services: {
        storage: {
          stores: () => ({ PLAN_FACT_CALENDAR: 'plan_fact_calendar' }),
          get: async (_store: string, key: string) => records.get(key) ?? null,
          put: async (store: string, data: { id: string }) => {
            assert.equal(store, 'plan_fact_calendar');
            records.set(data.id, data);
            return data;
          }
        },
        permissions: { getCurrentEngineerName: () => 'Петров П.П.' }
      }
    }
  };
  (globalThis as unknown as { window: unknown }).window = fakeWindow;
  return records;
}

test('нерабочие даты: мусор отбрасывается, повторы убираются, порядок стабильный', () => {
  assert.deepEqual(
    normalizeNonWorkingDays(['2026-01-07', '2026-01-05', '2026-01-05', 'вторник', '', null, '05.01.2026']),
    ['2026-01-05', '2026-01-07']
  );
  assert.deepEqual(normalizeNonWorkingDays('2026-01-05'), []);
  assert.deepEqual(normalizeNonWorkingDays(null), []);
});

test('нерабочий день сдвигает сроки, а не «съедается»', () => {
  const friday = new Date('2026-01-02T00:00:00');

  // Без праздников: пятница + 1 рабочий день = понедельник 05.01.
  assert.equal(formatDate(addWorkDays(friday, 1, 5)), '05.01.2026');
  // Понедельник объявлен нерабочим (перенос) → следующий рабочий день — вторник.
  assert.equal(formatDate(addWorkDays(friday, 1, 5, ['2026-01-05'])), '06.01.2026');
  assert.equal(formatDate(finishDate('2026-01-02', '3', 5, ['2026-01-05'])), '08.01.2026');
});

test('календарь хранится и читается обратно', async () => {
  const records = installFakePlatform();

  assert.deepEqual(await loadCalendar(), emptyCalendar());

  const saved = await saveCalendar(6, ['2026-05-01', '2026-05-09', 'не дата']);
  assert.equal(saved.workWeek, 6);
  assert.deepEqual(saved.nonWorkingDays, ['2026-05-01', '2026-05-09']);
  assert.equal(saved.updatedBy, 'Петров П.П.');
  assert.equal(records.size, 1);

  const loaded = await loadCalendar();
  assert.equal(loaded.workWeek, 6);
  assert.deepEqual(loaded.nonWorkingDays, ['2026-05-01', '2026-05-09']);

  // Некорректная неделя не ломает календарь — падает к пятидневке.
  const fallback = await saveCalendar(11, []);
  assert.equal(fallback.workWeek, 5);
});
