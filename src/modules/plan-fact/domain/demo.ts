/**
 * Демо-данные для показа модуля (например, заказчику по публичной ссылке).
 *
 * Зачем: опубликованная страница работает в локальном режиме, а объекты и ВОР в неё никто не завёл —
 * новый человек видит пустые разделы и не понимает, что делать. Кнопка «Загрузить демо-данные»
 * создаёт **один объект и одну пробную ВОР** тем же путём, каким их создаёт настоящий импорт:
 * разбор формы → позиции → контуры → факт.
 *
 * Честные ограничения, которые нельзя прятать:
 *   * демо живёт **только в этом браузере** (IndexedDB), ничего не уходит в облако;
 *   * данные **синтетические**: выдуманные квартиры и объёмы, никаких данных заказчика;
 *   * объект создаётся сервисом локаций, то есть в обход «права на управление объектами» —
 *     это осознанно только для демо и подписано в интерфейсе.
 */

import { analyze } from './analyze.ts';
import { formProfileById, normalizeContextOf, type FormProfile } from './profiles.ts';
import { rawRowsFromSheets } from './reader.ts';
import { saveImport } from './store.ts';
import type { CellValue, ColumnMapping, ImportProfile, XlsxSheet } from './types.ts';

export interface DemoSeedResult {
  objectId: string;
  objectName: string;
  importId: string;
  positions: number;
}

/** Работы, которые точно есть в справочнике: демо не должно выглядеть «не сопоставлено». */
const DEMO_WORKS: { name: string; unit: string }[] = [
  { name: 'Штукатурка стен', unit: 'м2' },
  { name: 'Окраска стен', unit: 'м2' },
  { name: 'Плинтус', unit: 'м.п.' },
  { name: 'Устройство покрытия пола из ламината', unit: 'м2' },
  { name: 'Облицовка стен керамогранитом (с/у)', unit: 'м2' },
  { name: 'Устройство натяжных ПВХ потолков', unit: 'м2' }
];

/**
 * Синтетическая форма заказчика: 2 этажа × 4 квартиры × 3 работы.
 * Заголовок в первой строке — как у выгрузки CSV, поэтому профиль подменяется ниже.
 */
export function demoSheet(): XlsxSheet {
  const rows: CellValue[][] = [['Этаж', 'Помещение', 'Наименование работ', 'Ед. изм.', 'Объём', 'Примечание']];
  // На каждом этаже свой набор работ: так в демо попадают и м², и м.п., и разные виды работ.
  const byFloor: Record<string, typeof DEMO_WORKS> = {
    '2': [DEMO_WORKS[0], DEMO_WORKS[1], DEMO_WORKS[2]],
    '3': [DEMO_WORKS[3], DEMO_WORKS[4], DEMO_WORKS[5]]
  };
  let index = 0;
  for (const floor of ['2', '3']) {
    for (let flat = 1; flat <= 4; flat += 1) {
      for (let work = 0; work < 3; work += 1) {
        const item = byFloor[floor][work];
        const quantity = 12 + ((index * 7 + flat * 3) % 40);
        rows.push([floor, `кв. ${flat}`, item.name, item.unit, String(quantity), '']);
        index += 1;
      }
    }
  }
  return { name: 'Демо-ВОР', rows };
}

/** Профиль под демо-лист: шапка в первой строке и пять нужных колонок. */
export function demoProfile(): { profile: ImportProfile; form: FormProfile } {
  const form = formProfileById('fkp-list');
  if (!form) throw new Error('Профиль разбора не найден — обновите страницу');
  const columns: ColumnMapping[] = [
    { field: 'section_floor', columnIndex: 1, headerText: 'Этаж' },
    { field: 'location_label', columnIndex: 2, headerText: 'Помещение' },
    { field: 'name', columnIndex: 3, headerText: 'Наименование работ' },
    { field: 'unit', columnIndex: 4, headerText: 'Ед. изм.' },
    { field: 'quantity', columnIndex: 5, headerText: 'Объём' }
  ];
  return { profile: { ...form.profile, headerRow: 1, headerRows: 1, columns, sheetPattern: undefined }, form };
}

/** Разбор демо-листа тем же путём, что и настоящий импорт. */
export function demoAnalysis() {
  const { profile, form } = demoProfile();
  const sheet = demoSheet();
  const rows = rawRowsFromSheets([sheet], profile, sheet.name);
  const context = normalizeContextOf({ ...form, profile });
  const analysis = analyze(rows, { ...form, profile }, context);
  return { analysis, profile, form, sheet };
}

function services(): {
  locations?: { createNode: (input: { nodeType: string; displayName: string }) => Promise<{ id: string }> };
  objects?: { rebuildFromLocations?: () => Promise<void> | void };
  settings?: { set: (key: string, value: unknown) => Promise<unknown>; get?: (key: string) => unknown };
  permissions?: { getAssignedProjects?: () => string[] };
  storage?: { put: (store: string, record: unknown) => Promise<unknown> };
} {
  const rbi = window.RBI as unknown as { services?: Record<string, unknown> } | undefined;
  return (rbi?.services ?? {}) as never;
}

function storeName(key: string): string {
  const stores = (window.RBI as unknown as { services?: { storage?: { stores?: () => Record<string, string> } } })
    ?.services?.storage?.stores?.();
  const name = stores?.[key];
  if (!name) throw new Error(`Сторадж ${key} не объявлен — обновите страницу`);
  return name;
}

/**
 * Загрузить демо: объект → пробная ВОР → контуры → факт.
 * Возвращает созданный объект, чтобы интерфейс сразу открыл его.
 */
export async function seedDemo(objectName = 'Демо-объект: ЖК Северный, корпус 1'): Promise<DemoSeedResult> {
  const api = services();
  if (!api.locations?.createNode || !api.storage?.put) {
    throw new Error('Демо-данные недоступны: сервисы платформы не загрузились');
  }
  // Сужаем тип один раз: внутри вложенных функций проверка выше уже не видна компилятору.
  const storage = api.storage;

  const node = await api.locations.createNode({ nodeType: 'object', displayName: objectName });
  await api.objects?.rebuildFromLocations?.();

  // Для ролей с ограниченной видимостью объект нужно назначить — иначе он не появится в списке.
  try {
    const assigned = api.permissions?.getAssignedProjects?.() ?? [];
    if (!assigned.includes(node.id)) {
      const next = [...assigned, node.id];
      // appSettings — глобальное состояние платформы, в типах модуля его нет: пишем через сервис настроек.
      await api.settings?.set?.('assignedProjects', next);
    }
  } catch (_error) {
    // Если назначение недоступно — модуль всё равно покажет объект для ролей со scope 'all'.
  }

  const { analysis, profile, form } = demoAnalysis();
  if (analysis.rows.length === 0) {
    throw new Error('Демо-ВОР не разобрался — сообщите об ошибке, данные объекта созданы');
  }

  const saved = await saveImport({
    objectId: node.id,
    filename: 'Демо-ВОР (синтетические данные).xlsx',
    profileId: profile.id,
    profileTitle: `${form.title} · демо`,
    rows: analysis.rows,
    stats: analysis.stats
  });

  // Контуры пишем **напрямую**: `setContour` проверяет права ПТО, а демо запускает любая роль
  // (например «Инженер»), и через домен контуры молча не сохранялись — раздел выглядел пустым.
  const rows = await import('./store.ts').then((module) => module.listWorRows(node.id));
  const contourStore = storeName('PLAN_FACT_QUANTITIES');
  const putContour = async (row: { id: string }, kind: string, quantity: number): Promise<void> => {
    await storage.put(contourStore, {
      id: `pfqty_demo_${row.id}_${kind}`,
      objectId: node.id,
      worItemId: row.id,
      kind,
      quantity: String(quantity),
      source: 'демо',
      method: 'демо',
      note: '',
      updatedBy: 'Демо',
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    });
  };
  // Три состояния видны сразу: у части позиций заполнены все пять контуров, у части — два-три,
  // у нескольких — ни одного. Иначе демо показывает однообразную картинку и «Пусто: 0».
  for (const [index, row] of rows.entries()) {
    const plan = Number(row.quantity);
    const round = (value: number): number => Math.round(value * 100) / 100;
    const state = index % 5; // 0 - пусто, 1-2 - частично, 3-4 - полностью
    if (state === 0) continue;
    await putContour(row, 'CONTRACT', plan);
    await putContour(row, 'PROPOSED', round(plan * (state === 1 ? 1.15 : 1.03)));
    if (state >= 2) await putContour(row, 'RD', round(plan * 1.12));
    if (state >= 3) {
      await putContour(row, 'APPROVED', plan);
      await putContour(row, 'CUSTOMER_ACCEPTED', round(plan * 0.95));
    }
  }

  // Предложение на утверждении — чтобы раздел «Утверждение» не выглядел пустым.
  const proposalStore = storeName('PLAN_FACT_PROPOSALS');
  const proposalRowStore = storeName('PLAN_FACT_PROPOSAL_ROWS');
  const now = new Date().toISOString();
  const proposalId = `pfprop_demo_${node.id}`;
  await storage.put(proposalStore, {
    id: proposalId, objectId: node.id, title: 'Демо: объёмы на утверждение', status: 'submitted',
    submittedBy: 'Демо', submittedAt: now, decidedBy: '', decidedAt: null, decisionReason: '',
    createdAt: now, updatedAt: now, syncStatus: 'pending'
  });
  for (const [index, row] of rows.slice(0, 6).entries()) {
    await storage.put(proposalRowStore, {
      id: `pfprow_demo_${index}_${row.id}`, proposalId, worItemId: row.id,
      quantity: String(Number(row.quantity)), note: '', createdAt: now, updatedAt: now, syncStatus: 'pending'
    });
  }

  // Факт прораба по части позиций — чтобы в сводке было выполнение, а не только план.
  const factsStore = storeName('PLAN_FACT_FACTS');
  for (const [index, row] of rows.entries()) {
    if (index % 4 !== 0) continue;
    await storage.put(factsStore, {
      id: `pffact_demo_${row.id}`,
      objectId: node.id,
      section: row.section,
      floor: row.floor,
      place: row.place,
      workKey: row.workId,
      workRaw: row.workRaw,
      unit: row.unit,
      quantity: String(Math.round(Number(row.quantity) * 0.4 * 100) / 100),
      factDate: new Date().toISOString().slice(0, 10),
      comment: 'Демо-данные',
      author: 'Демо',
      createdAt: new Date().toISOString(),
      syncStatus: 'pending'
    });
  }

  return { objectId: node.id, objectName, importId: saved.importId, positions: analysis.rows.length };
}
