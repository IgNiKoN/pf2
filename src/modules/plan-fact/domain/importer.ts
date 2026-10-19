/**
 * Асинхронный импорт (ТЗ VOR-009): до 50 000 строк с прогрессом, отменой и **частичным принятием**.
 *
 * Тяжёлая часть импорта — не чтение файла, а разбор каждой строки (помещение, вид работ, единица,
 * объём, сопоставление со справочником). Именно её делаем порциями: между порциями отдаём поток
 * браузеру, чтобы интерфейс успевал показать прогресс, а человек — нажать «Отменить».
 *
 * Частичное принятие — не «всё или ничего»: разобранные строки остаются, а строки с проблемами
 * попадают в протокол. Отмена возвращает то, что успели разобрать, и честно помечает результат
 * как неполный: молча отдавать половину файла как целое нельзя.
 */

import { assembleResult, type AnalyzeResult } from './analyze.ts';
import { dedupeItems, normalizeRow, type NormalizeContext } from './normalize.ts';
import type { FormProfile } from './profiles.ts';
import type { NormalizationIssue, NormalizedItem, RawRow } from './types.ts';

export interface ImportProgress {
  phase: 'rows' | 'normalize' | 'finish' | 'done';
  done: number;
  total: number;
  /** Текст для интерфейса: без него полоска прогресса ничего не объясняет. */
  message: string;
}

export interface ImportRunOptions {
  /** Порция строк за один шаг: больше — быстрее, но реже обновляется прогресс. */
  chunkSize?: number;
  onProgress?: (progress: ImportProgress) => void;
  /** Проверка отмены: вызывается между порциями. */
  isCancelled?: () => boolean;
  /** Отдать управление браузеру между порциями (в тестах можно не ждать). */
  yieldToUi?: () => Promise<void>;
}

export interface ImportRunResult {
  result: AnalyzeResult;
  /** Разбор прерван: результат неполный, и об этом обязаны сказать. */
  cancelled: boolean;
  processed: number;
  total: number;
  elapsedMs: number;
}

const DEFAULT_CHUNK = 500;

function defaultYield(): Promise<void> {
  return new Promise((resolve) => {
    // setTimeout, а не requestAnimationFrame: разбор идёт и в скрытой вкладке.
    setTimeout(resolve, 0);
  });
}

/**
 * Разбор строк порциями. Совместим по результату с `analyze()`: те же позиции, та же статистика,
 * тот же протокол — отличается только тем, что не блокирует интерфейс и умеет останавливаться.
 */
export async function analyzeAsync(
  rows: RawRow[],
  form: FormProfile,
  context: NormalizeContext,
  options: ImportRunOptions = {}
): Promise<ImportRunResult> {
  const chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_CHUNK);
  const yieldToUi = options.yieldToUi ?? defaultYield;
  const started = Date.now();
  const total = rows.length;

  const items: NormalizedItem[] = [];
  const issues: NormalizationIssue[] = [];
  let materialsSkipped = 0;
  let unresolvedWorks = 0;
  let unresolvedLocations = 0;
  let processed = 0;
  let cancelled = false;

  options.onProgress?.({ phase: 'normalize', done: 0, total, message: `Строк к разбору: ${total}` });

  while (processed < total) {
    if (options.isCancelled?.()) {
      cancelled = true;
      break;
    }

    const slice = rows.slice(processed, processed + chunkSize);
    for (const row of slice) {
      const result = normalizeRow(row, context);
      if (result.isMaterial) materialsSkipped += 1;
      issues.push(...result.issues);
      unresolvedWorks += result.issues.filter((issue) => issue.code === 'WORK_UNRESOLVED').length;
      unresolvedLocations += result.issues.filter((issue) => issue.code === 'LOCATION_UNRESOLVED').length;
      if (result.item) items.push(result.item);
    }

    processed += slice.length;
    options.onProgress?.({
      phase: 'normalize',
      done: processed,
      total,
      message: `Разобрано строк: ${processed} из ${total}`
    });
    await yieldToUi();
  }

  if (cancelled) {
    options.onProgress?.({
      phase: 'done', done: processed, total,
      message: `Разбор отменён: разобрано ${processed} строк из ${total}`
    });
    return {
      result: assembleResult(items, issues, { rowsTotal: processed, materialsSkipped, unresolvedWorks, unresolvedLocations }, form),
      cancelled: true,
      processed,
      total,
      elapsedMs: Date.now() - started
    };
  }

  // Дубли ищем одним проходом после разбора: это дешёвая операция по сравнению с разбором строк.
  options.onProgress?.({ phase: 'finish', done: total, total, message: 'Ищем дубли и собираем итоги' });
  const deduped = dedupeItems(items);
  for (const duplicate of deduped.duplicates) {
    issues.push({
      severity: 'warning',
      code: 'DUPLICATE_ROW',
      message: `Дубль позиции (${duplicate.locationPath.join('/')} · ${duplicate.workRaw}) — строка не создаёт новую позицию`,
      fragment: duplicate.fragment
    });
  }

  const result = assembleResult(
    deduped.items,
    issues,
    { rowsTotal: total, materialsSkipped, unresolvedWorks, unresolvedLocations },
    form
  );
  options.onProgress?.({ phase: 'done', done: total, total, message: `Готово: позиций ${result.rows.length}` });

  return { result, cancelled: false, processed, total, elapsedMs: Date.now() - started };
}
