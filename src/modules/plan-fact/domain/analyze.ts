/**
 * Разбор формы: сырые строки листа → позиции ВОР + статистика + протокол проблем.
 *
 * Перенесено из `analyze()` прототипа (`platform-2-0/apps/web/src/importForm.ts`).
 * Отличия RBI: объём остаётся десятичной строкой (в прототипе приводился к `Number`),
 * доля сопоставленных считается точно, а не через деление float.
 */

import { addDecimal } from './decimal.ts';
import { normalizeRows, type NormalizeContext } from './normalize.ts';
import { normalizeContextOf, type FormProfile } from './profiles.ts';
import { matchReason } from './reference.ts';
import { normalizeWorkName } from './works.ts';
import type { ImportStats, NormalizationIssue, NormalizedItem, RawRow, WorRow } from './types.ts';

/**
 * Что в разборе осталось без вида работ — по формулировкам, а не по строкам.
 *
 * ПТО связывает формулировку один раз, и она перестаёт быть проблемой для всех строк
 * с этим названием. Поэтому список — по названиям, с количеством строк и единицами.
 */
export function unresolvedWorks(rows: WorRow[]): { raw: string; count: number; units: string[] }[] {
  const byName = new Map<string, { raw: string; count: number; units: Set<string> }>();
  for (const row of rows) {
    if (row.workId !== null) continue;
    const raw = String(row.workRaw ?? '').trim();
    if (!raw) continue;
    const entry = byName.get(raw) ?? { raw, count: 0, units: new Set<string>() };
    entry.count += 1;
    if (row.unitRaw) entry.units.add(String(row.unitRaw));
    byName.set(raw, entry);
  }
  return [...byName.values()]
    .map((entry) => ({ raw: entry.raw, count: entry.count, units: [...entry.units].sort() }))
    .sort((left, right) => right.count - left.count || left.raw.localeCompare(right.raw, 'ru'));
}

export interface AnalyzeResult {
  rows: WorRow[];
  stats: ImportStats;
  issues: NormalizationIssue[];
}

/** Доля в десятых процента, посчитанная целыми: (value / total) * 100 с одним знаком. */
function percentTenths(value: number, total: number): number {
  if (total <= 0) return 0;
  const scaled = (BigInt(value) * 1000n + BigInt(Math.floor(total / 2))) / BigInt(total);
  return Number(scaled) / 10;
}

function pathPart(item: NormalizedItem, part: 'section' | 'floor'): string {
  const index = part === 'section' ? 0 : 1;
  return item.locationPath[index] ?? '';
}

/** Каноническая позиция → строка ВОР для интерфейса и хранения. */
/**
 * Сопоставления, которые сделала программа, а не человек (VOR-013).
 *
 * Строка сопоставлена «сама» — по встроенному синониму или точному названию. Пока ПТО не подтвердил
 * связку, это остаётся предположением: список нужен, чтобы решение принимал человек, а не совпадение.
 * Подтверждение сохраняет связку как решение ПТО и убирает формулировку из списка.
 */
export function autoMatchedWorks(
  rows: WorRow[],
  aliases: { normalizedAlias: string; workId: string; source?: string }[]
): { raw: string; workId: string; count: number; workTitle: string }[] {
  const confirmed = new Set(
    aliases.filter((alias) => alias.source === 'pto').map((alias) => alias.normalizedAlias)
  );
  const byName = new Map<string, { raw: string; workId: string; count: number; workTitle: string }>();
  for (const row of rows) {
    if (row.workId === null) continue;
    const key = normalizeWorkName(row.workRaw);
    if (!key || confirmed.has(key)) continue;
    const entry = byName.get(key) ?? { raw: row.workRaw, workId: row.workId, count: 0, workTitle: row.workRaw };
    entry.count += 1;
    byName.set(key, entry);
  }
  return [...byName.values()].sort((left, right) => right.count - left.count || left.raw.localeCompare(right.raw, 'ru'));
}

export function toWorRow(item: NormalizedItem, form: FormProfile): WorRow | null {
  if (item.quantity === null) return null;
  // Если адрес взят из колонок, его части имеют известные роли: позиционный разбор тут неверен
  // и выдал бы этаж за секцию. Чего в файле нет, того и не показываем.
  const section = item.locationRoles
    ? (item.locationRoles.section || '—')
    : (pathPart(item, 'section') || '—');
  const floor = item.locationRoles
    ? (item.locationRoles.floor || '—')
    : (pathPart(item, 'floor') || '—');
  const place = item.locationRoles?.place ?? (item.locationPath[item.locationPath.length - 1] ?? '');

  return {
    section,
    floor,
    // В плоском списке помещение не задано — работа идёт «по договору» (как в исходной форме).
    place: form.matrix ? place : place || 'по договору',
    workRaw: item.workRaw,
    workId: item.workId,
    workMatch: item.workMatch,
    matchReason: matchReason(item.workRaw, item.workId),
    unitRaw: item.unitRaw,
    unit: item.unit,
    quantity: item.quantity,
    fragment: item.fragment
  };
}

/** Один прогон reader + normalizeRows: позиции для ВОР и статистика разбора. */
/**
 * Разбор формы. `context` позволяет подставить справочник и связки из данных (ТЗ-4):
 * без него работает встроенный справочник, поэтому тесты и офлайн-режим не меняются.
 */
export interface NormalizeCounters {
  rowsTotal: number;
  materialsSkipped: number;
  unresolvedWorks: number;
  unresolvedLocations: number;
}

/**
 * Сборка результата из разобранных строк: одна точка правды для синхронного `analyze()`
 * и для асинхронного разбора порциями — иначе они разойдутся в цифрах.
 */
export function assembleResult(
  items: NormalizedItem[],
  issues: NormalizationIssue[],
  counters: NormalizeCounters,
  form: FormProfile,
  sheetName = ''
): AnalyzeResult {
  // Объём без числа в позицию не превращается: строка листа просто не даёт позиции.
  const usable = items.filter((item) => item.quantity !== null);
  const matched = usable.filter((item) => item.workId !== null);
  const worRows = usable
    .map((item) => toWorRow(item, form))
    .filter((row): row is WorRow => row !== null);

  const stats: ImportStats = {
    sheet: sheetName || form.profile.name,
    rows: counters.rowsTotal,
    items: usable.length,
    matched: matched.length,
    matchedPercent: percentTenths(matched.length, usable.length),
    materialsSkipped: counters.materialsSkipped,
    unresolvedWorks: counters.unresolvedWorks,
    unresolvedLocations: counters.unresolvedLocations,
    needsDecision: usable.length - matched.length,
    issues: issues.slice(0, 20).map((issue) => ({
      code: issue.code,
      message: issue.message,
      row: issue.fragment.row
    }))
  };

  return { rows: worRows, stats, issues };
}

export function analyze(rows: RawRow[], form: FormProfile, context?: NormalizeContext): AnalyzeResult {
  const result = normalizeRows(rows, context ?? normalizeContextOf(form));
  return assembleResult(result.items, result.issues, result.stats, form, rows[0]?.sheet ?? '');
}

/** Группировка позиций по видам работ: для сводки «сколько чего» в разделе ВОР. */
export function totalsByWork(rows: WorRow[]): { workKey: string; workTitle: string; unit: string; quantity: string }[] {
  const groups = new Map<string, WorRow[]>();
  for (const row of rows) {
    const key = row.workId ?? `raw:${row.workRaw}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()].map(([key, bucket]) => ({
    workKey: key,
    workTitle: bucket[0].workRaw,
    unit: bucket[0].unitRaw || bucket[0].unit || '',
    // Сумма — точно, на строках (см. decimal.ts); форматирование делает интерфейс.
    quantity: bucket.reduce((acc, row) => addDecimal(acc, row.quantity), '0')
  }));
}
