/**
 * Платформенный справочный контент модуля (ЕИ, виды работ, синонимы форм заказчика).
 *
 * Перенесено из `platform-2-0`:
 *   - `db/reference/techmaps.seed.json` — единицы измерения с написаниями из реальных форм;
 *   - `apps/web/src/importForm.ts` — справочник работ приложения (15 видов), таблица синонимов
 *     (заголовки колонок обмерной матрицы и полные формулировки формы «ФКП, 142») и правила
 *     формулировок для объяснения «почему не сопоставлено».
 *
 * Нормы выработки (см. `WORK_NORMS` в конце файла) — агрегатные нормы заказчика из формы
 * «График.xlsx»; они **не подтверждены ПТО** и переносятся только для расчёта графика,
 * с явным предупреждением в результате.
 */

import { normalizeLabel } from './normalize.ts';
import type { Decimal, Unit, UnitCode, WorkAlias, WorkCatalogItem } from './types.ts';

// ──────────────────────────────── единицы ────────────────────────────────────

/** Единицы: заголовок канонический, алиасы — как пишут заказчики в формах. */
export const UNITS: Unit[] = [
  { code: 'm2', title: 'м²', aliases: ['м2', 'м²', 'кв.м', 'кв. м', 'M2', 'S, м2'] },
  { code: 'm3', title: 'м³', aliases: ['м3', 'м³', 'куб.м', 'S, м3'] },
  { code: 'pcs', title: 'шт', aliases: ['шт', 'шт.', 'штук', 'Штук.'] },
  { code: 'kg', title: 'кг', aliases: ['кг', 'кг.', 'kg'] },
  { code: 't', title: 'т', aliases: ['т', 'тонн'] },
  { code: 'l', title: 'л', aliases: ['л', 'л.', 'литр'] },
  { code: 'lm', title: 'пог. м', aliases: ['пог.м', 'пог. м', 'м.п', 'м.п.', 'мп', 'п.м', 'п. м.', 'п.м.', 'м.пог.', 'м.пог'] },
  { code: 'set', title: 'компл.', aliases: ['компл.', 'компл', 'комплект'] },
  { code: 'complex', title: 'комплекс', aliases: ['комплекс', 'комп.', 'комплекс работ'] }
];

function unitCodeOf(title: string): UnitCode {
  const found = UNITS.find((unit) => unit.title === title || unit.aliases?.includes(title));
  return found?.code ?? 'complex';
}

// ───────────────────────────── виды работ ────────────────────────────────────

interface CatalogSeed {
  key: string;
  name: string;
  unit: string;
  group?: string | null;
  stage?: string | null;
}

/** Справочник работ: 15 видов, которые реально встречаются в формах заказчиков. */
const CATALOG_SEED: CatalogSeed[] = [
  { key: 'styazhka', name: 'Устройство фиброцементной стяжки', unit: 'м2', group: 'Полы', stage: 'черновые' },
  { key: 'shtukaturka', name: 'Штукатурка стен', unit: 'м2', group: 'Стены', stage: 'черновые' },
  { key: 'otkosy', name: 'Откосы', unit: 'м.п.', group: 'Проёмы', stage: 'чистовые' },
  { key: 'potolok_gkl', name: 'Подшивной потолок (ГКЛ)', unit: 'м2', group: 'Потолки', stage: 'черновые' },
  { key: 'shpaklevka', name: 'Шпаклёвка стен', unit: 'м2', group: 'Стены', stage: 'черновые' },
  { key: 'plitka_sten', name: 'Облицовка стен керамогранитом (с/у)', unit: 'м2', group: 'Стены', stage: 'чистовые' },
  { key: 'dekor', name: 'Декоративная штукатурка', unit: 'м2', group: 'Стены', stage: 'чистовые' },
  { key: 'okraska', name: 'Окраска стен', unit: 'м2', group: 'Стены', stage: 'чистовые' },
  { key: 'oboi', name: 'Оклейка стен обоями', unit: 'м2', group: 'Стены', stage: 'чистовые' },
  { key: 'plitka_pola', name: 'Укладка керамогранитных плит (с/у)', unit: 'м2', group: 'Полы', stage: 'чистовые' },
  { key: 'natyazhnoy', name: 'Устройство натяжных ПВХ потолков', unit: 'м2', group: 'Потолки', stage: 'чистовые' },
  { key: 'laminat', name: 'Устройство покрытия пола из ламината', unit: 'м2', group: 'Полы', stage: 'чистовые' },
  { key: 'plintus', name: 'Плинтус', unit: 'м.п.', group: 'Отделка', stage: 'чистовые' },
  { key: 'porogi', name: 'Пороги (в с/у)', unit: 'м.п.', group: 'Проёмы', stage: 'чистовые' },
  { key: 'plitka_balkon', name: 'Плитка балкон', unit: 'м2', group: 'Полы', stage: 'чистовые' }
];

export const WORKS: WorkCatalogItem[] = CATALOG_SEED.map((seed) => ({
  id: seed.key,
  code: seed.key,
  title: seed.name,
  unit: unitCodeOf(seed.unit),
  group: seed.group ?? null,
  stage: seed.stage ?? null
}));

// ─────────────────── синонимы форм заказчика → виды работ ─────────────────────

/**
 * Точные формулировки из форм заказчиков → виды работ справочника.
 * `null` — «формулировка знакома, но такого вида работ в справочнике нет»: строка остаётся
 * «требует решения» и видна в панели импорта, а не растворяется молча.
 */
const SYNONYM_ALIASES: [alias: string, workKey: string | null][] = [
  // заголовки колонок обмерной матрицы
  ['штукатурка гипсовая 10-20мм', 'shtukaturka'],
  ['штукатурка гипсовая 10-20 мм', 'shtukaturka'],
  ['штукатурка гипсовая', 'shtukaturka'],
  ['штукатурка цеметная', 'shtukaturka'],
  ['штукатурка цементно', 'shtukaturka'],
  ['шпаклёвка', 'shpaklevka'],
  ['шпаклевка', 'shpaklevka'],
  ['обои', 'oboi'],
  ['окраска обои', 'okraska'],
  ['окраска декоративной', 'okraska'],
  ['плинтус', 'plintus'],
  ['ламинат', 'laminat'],
  ['натяжной потолок', 'natyazhnoy'],
  ['подшивной потолок', 'potolok_gkl'],
  ['плитка стен су', 'plitka_sten'],
  ['плитка стен', 'plitka_sten'],
  ['плитка пола су', 'plitka_pola'],
  ['плитка пола', 'plitka_pola'],
  ['пороги', 'porogi'],
  ['плитка балкон', 'plitka_balkon'],
  ['откосы s', 'otkosy'],
  ['декоративная', 'dekor'],
  // полные формулировки формы «ФКП, 142»
  ['окраска потолков в 2 слоя, с подготовкой основания:', 'okraska'],
  ['окраска стен в 2 слоя, с подготовкой основания', 'okraska'],
  ['окраска оконных откосов в 2 слоя, с подготовкой основания', 'okraska'],
  ['окраска порогов балконов в 2 слоя, с подготовкой основания', 'okraska'],
  ['оклейка стен обоями по подготовленной поверхности:', 'oboi'],
  ['оклейка дверных откосов обоями по подготовленной поверхности:', 'oboi'],
  ['установка плинтуса из пвх на клею, высотой 55 мм:', 'plintus'],
  ['установка порогов на стыках помещений:', 'porogi'],
  ['монтаж подоконных досок из пвх:', 'otkosy'],
  ['устройство натяжных потолков:', 'natyazhnoy'],
  ['устройство финишной отделки пола линолеумом:', 'laminat'],
  ['устройство финишной отделки пола керамогранитными плитами по подготовленной поверхности с заполнением швов затиркой:', 'plitka_pola'],
  ['устройство выравнивающего наливного пола толщ. до 5 мм под линолеум, с подготовкой основания', 'styazhka'],
  ['оштукатуривание поверхности порогов балконов смесями на цементной основе (ср. толщ.слоя 15 мм), с подготовкой основания', 'shpaklevka'],
  ['шпатлевка поверхности порогов балконов (ср. толщ.слоя 2 мм), с подготовкой основания', 'shpaklevka'],
  ['монтаж ревизионных лючков в с/у', null]
];

/** Алиасы для ядра нормализации: записи с известным видом работ. */
export const WORK_ALIASES: WorkAlias[] = SYNONYM_ALIASES
  .filter((entry): entry is [string, string] => entry[1] !== null)
  .map(([alias, workId]) => ({ alias, aliasNormalized: normalizeLabel(alias), workId }));

/**
 * Правила формулировок: нужны только для объяснения пользователю, почему строка
 * не сопоставлена. Порядок важен — первое сработавшее правило выигрывает.
 */
const WORK_RULES: [id: string, workKey: string | null, pattern: RegExp, note: string][] = [
  ['r-plaster', 'shtukaturka', /штукатур|оштукатур/i, 'штукатурные работы'],
  ['r-putty', 'shpaklevka', /шпатл|шпакл|финишн\w*\s+шпаклевк/i, 'шпаклёвочные работы'],
  ['r-tile-floor', 'plitka_pola', /керамогранит\w*\s*плит|плитк\w*\s+пол|пол\w*\s+керамогранит/i, 'облицовка пола керамогранитом'],
  ['r-laminate-floor', 'laminat', /ламинат|линолеум/i, 'покрытие пола из ламината'],
  ['r-skirting', 'plintus', /плинтус/i, 'установка плинтуса'],
  ['r-threshold', 'porogi', /порог/i, 'пороги'],
  ['r-slope', 'otkosy', /откос|подоконн/i, 'откосы и подоконники'],
  ['r-paint', 'okraska', /окраск|окрас/i, 'окрасочные работы'],
  ['r-wallpaper', 'oboi', /обои|обоя|обоев|обой/i, 'оклейка обоями'],
  ['r-ceiling-hanging', 'natyazhnoy', /натяжн\w*\s+потолок/i, 'натяжные потолки'],
  ['r-ceiling-gkl', 'potolok_gkl', /подшивн\w*\s+потолок/i, 'подшивные потолки'],
  ['r-no-screed', null, /наливн/i, 'наливной пол'],
  ['r-no-hatch', null, /лючк/i, 'ревизионные лючки']
];

/** Причина сопоставления для интерфейса: точный синоним, правило формы или «нет совпадения». */
export function matchReason(rawWork: string, workId: string | null): string {
  const key = normalizeLabel(rawWork);
  const exact = SYNONYM_ALIASES.find(([alias]) => normalizeLabel(alias) === key);
  if (exact) {
    return exact[1] === null
      ? 'формулировка формы знакома, но такого вида работ нет в справочнике'
      : `точный синоним «${exact[0].slice(0, 40)}»`;
  }

  const rule = WORK_RULES.find(([, , pattern]) => pattern.test(rawWork));
  if (!rule) return 'нет совпадения в справочнике';
  const [, workKey, , note] = rule;
  if (workKey === null) return `похоже на «${note}», но такого вида работ нет в справочнике`;
  if (workId === null) return `по правилу «${note}» — вид работ не сопоставлен`;
  return `по правилу «${note}»`;
}

// ─────────────────────── нормы выработки для графика ─────────────────────────

/**
 * Норма выработки вида работ: объём на человека в день, состав бригады, пауза, порядок.
 * `confirmed` — норма подтверждена заказчиком; **не ПТО**. Это агрегатные нормы из формы
 * заказчика «График.xlsx», а не нормативная база платформы: расчёт графика обязан
 * предупреждать о неподтверждённых нормах, а не выдавать их за утверждённые.
 */
export interface WorkNorm {
  key: string;
  name: string;
  unit: UnitCode;
  /** выработка на человека в день */
  norm: Decimal;
  crew: number;
  /** технологическая пауза после работы, суток */
  lag: Decimal;
  /** технологический порядок внутри этажа */
  rank: number;
  /** подтверждена ли норма заказчиком */
  confirmed: boolean;
}

/** [ключ вида работ, выработка, бригада, пауза, порядок, подтверждена заказчиком] */
const NORM_SEED: [string, Decimal, number, Decimal, number, boolean][] = [
  ['styazhka', '40', 6, '7', 5, true],
  ['shtukaturka', '60', 4, '3', 10, true],
  ['otkosy', '10', 4, '0', 15, true],
  ['potolok_gkl', '25', 2, '1', 20, false],
  ['shpaklevka', '50', 6, '1', 25, true],
  ['plitka_sten', '6', 9, '0', 30, true],
  ['dekor', '25', 4, '1', 35, false],
  ['okraska', '50', 6, '0', 40, true],
  ['oboi', '80', 6, '0', 40, true],
  ['plitka_pola', '5', 6, '0', 45, true],
  ['natyazhnoy', '40', 4, '0', 50, true],
  ['laminat', '40', 6, '0', 55, true],
  ['plintus', '60', 4, '0', 60, false],
  ['porogi', '30', 4, '0', 65, false],
  ['plitka_balkon', '5', 4, '0', 70, false]
];

/**
 * Нормы по ключу вида работ. Название и единица берутся из справочника работ, чтобы
 * формулировки не разъезжались; норма без вида работ в справочнике не появляется
 * (тест проверяет, что норма есть у каждого вида работ).
 */
export const WORK_NORMS: Record<string, WorkNorm> = NORM_SEED.reduce<Record<string, WorkNorm>>((acc, seed) => {
  const [key, norm, crew, lag, rank, confirmed] = seed;
  const work = WORKS.find((item) => item.id === key);
  if (!work) return acc;
  acc[key] = { key, name: work.title, unit: work.unit, norm, crew, lag, rank, confirmed };
  return acc;
}, {});
