/**
 * Профили реальных форм заказчиков.
 *
 * Перенесено из `platform-2-0/apps/web/src/importForm.ts`. Профиль — это «паспорт раскладки»:
 * где шапка, какие колонки канонические, какие колонки являются работами обмерной матрицы и
 * как разбираются строки-локации. Reader ничего не угадывает: читаются только описанные колонки.
 */

import { UNITS, WORK_ALIASES, WORKS } from './reference.ts';
import type { ColumnMapping, ImportProfile, LocationParserRule, NormalizeContext, WorkColumn } from './types.ts';

const LOCATION_RULES: LocationParserRule[] = [
  { id: 'loc-section', pattern: '^Секц\\S*\\s*([\\d.]+)', target: 'section', group: 1 },
  { id: 'loc-floor', pattern: '^Этаж\\s*([\\d.]+)', target: 'floor', group: 1 },
  { id: 'loc-room-kio', pattern: '^КИО$', target: 'room' },
  { id: 'loc-zone-mop', pattern: '^МОП', target: 'zone' },
  // Обмерная матрица: помещение задано голым номером квартиры («2», «15а»).
  { id: 'loc-room-number', pattern: '^\\d+\\s*[а-я]?$', target: 'room' }
];

/** Обмерная матрица «Спутник»: строка = помещение, колонки-работы во второй строке шапки. */
const MATRIX_WORKS: WorkColumn[] = [
  { columnIndex: 98, headerText: 'Штукатурка гипсовая 10-20мм', unitRaw: 'S, м2' },
  { columnIndex: 99, headerText: 'Штукатурка цеметная', unitRaw: 'S, м2' },
  { columnIndex: 100, headerText: 'Шпаклёвка', unitRaw: 'S, м2' },
  { columnIndex: 101, headerText: 'Обои', unitRaw: 'S, м2' },
  { columnIndex: 102, headerText: 'Окраска обои', unitRaw: 'S, м2' },
  { columnIndex: 103, headerText: 'Плинтус', unitRaw: 'м.пог.' },
  { columnIndex: 104, headerText: 'Ламинат', unitRaw: 'S, м2' },
  { columnIndex: 105, headerText: 'Натяжной потолок', unitRaw: 'S, м2' },
  { columnIndex: 106, headerText: 'Подшивной потолок', unitRaw: 'S, м2' },
  { columnIndex: 107, headerText: 'Плитка стен СУ', unitRaw: 'S, м2' },
  { columnIndex: 108, headerText: 'Пороги (в с/у)', unitRaw: 'м.пог.' },
  { columnIndex: 109, headerText: 'Плитка пола СУ', unitRaw: 'S, м2' },
  { columnIndex: 110, headerText: 'Плитка балкон', unitRaw: 'S, м3' },
  { columnIndex: 111, headerText: 'Откосы S, м2 Гипрок', unitRaw: 'S, м2' }
];

const MATRIX_COLUMNS: ColumnMapping[] = [
  { field: 'section_floor', columnIndex: 1, headerText: 'Секция' },
  { field: 'code', columnIndex: 2, headerText: 'Этаж' },
  { field: 'location_label', columnIndex: 3, headerText: 'Квартира' },
  // Reader кладёт в эти колонки заголовок и значение колонки-работы: имя вида работ,
  // единицу из второй строки шапки и объём из строки помещения.
  { field: 'name', columnIndex: 100, headerText: 'колонка-работа' },
  { field: 'unit', columnIndex: 102, headerText: 'единица колонки-работы' },
  { field: 'quantity', columnIndex: 101, headerText: 'объём колонки-работы' }
];

/** Форма «ФКП, 142»: локации отдельными строками, материалы отличает «Норма расхода». */
const LIST_COLUMNS: ColumnMapping[] = [
  { field: 'code', columnIndex: 1, headerText: '№ п/п' },
  { field: 'name', columnIndex: 2, headerText: 'Наименование работ' },
  { field: 'unit', columnIndex: 3, headerText: 'Ед. изм.' },
  { field: 'norm_consumption', columnIndex: 4, headerText: 'Норма расхода' },
  { field: 'quantity', columnIndex: 5, headerText: 'Объём' }
];

/**
 * Колонки-работы «Расчёта 2 секции»: та же форма, но состав и порядок колонок другие —
 * нет «Шпаклёвки», потолки идут в обратном порядке, блок начинается на 8 правее.
 * Поэтому список задан явно, а не сдвигом: сдвиг молча читал бы чужие колонки.
 */
const MATRIX_WORKS_2: WorkColumn[] = [
  { columnIndex: 106, headerText: 'Штукатурка гипсовая 10-20мм', unitRaw: 'S, м2' },
  { columnIndex: 107, headerText: 'Штукатурка цеметная', unitRaw: 'S, м2' },
  { columnIndex: 108, headerText: 'Обои', unitRaw: 'S, м2' },
  { columnIndex: 109, headerText: 'Окраска обои', unitRaw: 'S, м2' },
  { columnIndex: 110, headerText: 'Плинтус', unitRaw: 'м.пог.' },
  { columnIndex: 111, headerText: 'Ламинат', unitRaw: 'S, м2' },
  { columnIndex: 112, headerText: 'Плитка стен СУ', unitRaw: 'S, м2' },
  { columnIndex: 113, headerText: 'Плитка пола СУ', unitRaw: 'S, м2' },
  { columnIndex: 114, headerText: 'Натяжной потолок', unitRaw: 'S, м2' },
  { columnIndex: 115, headerText: 'Подшивной потолок', unitRaw: 'S, м2' },
  { columnIndex: 116, headerText: 'Пороги (в с/у)', unitRaw: 'м.пог.' },
  { columnIndex: 117, headerText: 'Плитка балкон', unitRaw: 'S, м2' }
];

const MATRIX_COLUMNS_2: ColumnMapping[] = [
  { field: 'section_floor', columnIndex: 1, headerText: 'Секция' },
  { field: 'code', columnIndex: 2, headerText: 'Этаж' },
  { field: 'location_label', columnIndex: 3, headerText: 'Квартира' },
  { field: 'name', columnIndex: 105, headerText: 'колонка-работа' },
  { field: 'unit', columnIndex: 107, headerText: 'единица колонки-работы' },
  { field: 'quantity', columnIndex: 106, headerText: 'объём колонки-работы' }
];

/** Профиль формы + признак «раскладка матрицы» для построения строки ВОР. */
export interface FormProfile {
  id: string;
  title: string;
  profile: ImportProfile;
  matrix: boolean;
}

/** Профили реальных форм заказчика. Первый — по умолчанию. */
export const FORM_PROFILES: FormProfile[] = [
  {
    id: 'sputnik-matrix',
    title: 'Обмерная матрица (Спутник): строка = помещение',
    matrix: true,
    profile: {
      id: 'p-sputnik-matrix',
      name: 'Расчёт 1 секции Квартиры',
      layout: 'measurement_matrix',
      headerRow: 1,
      headerRows: 2,
      columns: MATRIX_COLUMNS,
      locationRules: LOCATION_RULES,
      works: MATRIX_WORKS
    }
  },
  {
    id: 'sputnik-matrix-2',
    title: 'Обмерная матрица, 2 секция (Спутник): другой состав колонок',
    matrix: true,
    profile: {
      id: 'p-sputnik-matrix-2',
      name: 'Расчёт 2 секция',
      layout: 'measurement_matrix',
      headerRow: 1,
      headerRows: 2,
      columns: MATRIX_COLUMNS_2,
      locationRules: LOCATION_RULES,
      works: MATRIX_WORKS_2
    }
  },
  {
    id: 'fkp-list',
    title: 'Плоский список (ФКП 142): локации строками, материалы отдельно',
    matrix: false,
    profile: {
      id: 'p-fkp-list',
      name: 'ФКП, 142',
      layout: 'outline_location_rows',
      headerRow: 7,
      headerRows: 3,
      columns: LIST_COLUMNS,
      locationRules: LOCATION_RULES,
      works: [{ columnIndex: 2, headerText: 'Корпус' }, { columnIndex: 2, headerText: 'Комплекс работ' }],
      sheetPattern: 'ФКП'
    }
  }
];

export function formProfileById(id: string): FormProfile | null {
  return FORM_PROFILES.find((form) => form.id === id) ?? null;
}

/** Контекст нормализации для формы: справочник, алиасы, колонки и правила локаций. */
export function normalizeContextOf(form: FormProfile): NormalizeContext {
  return {
    units: UNITS,
    works: WORKS,
    aliases: WORK_ALIASES,
    columns: form.profile.columns,
    locationRules: form.profile.locationRules
  };
}
