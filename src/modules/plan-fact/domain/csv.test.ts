/**
 * Тесты чтения CSV: кодировки, разделители, кавычки и переводы строк внутри поля.
 * Все случаи взяты из того, чем реально ломается CSV: 1С (windows-1251, «;»),
 * Excel с русской локалью и выгрузки с кавычками и запятыми внутри значений.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodeCsv, detectDelimiter, parseCsv, readCsvSheet } from './csv.ts';
import { analyze } from './analyze.ts';
import { formProfileById, normalizeContextOf } from './profiles.ts';
import { rawRowsFromSheets } from './reader.ts';
import type { ImportProfile } from './types.ts';

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

test('UTF-8 читается как есть, BOM не мешает', () => {
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('Этаж;Работа')]);
  const decoded = decodeCsv(withBom);
  assert.equal(decoded.encoding, 'utf-8');
  assert.equal(decoded.text, 'Этаж;Работа');
});

test('windows-1251 перечитывается, а не показывается кракозябрами', () => {
  // «Этаж» в windows-1251: Э=0xDD, т=0xF2, а=0xE0, ж=0xE6
  const cp1251 = new Uint8Array([0xdd, 0xf2, 0xe0, 0xe6, 0x3b, 0xc0, 0xe1]);
  const decoded = decodeCsv(cp1251);
  assert.equal(decoded.encoding, 'windows-1251');
  assert.equal(decoded.text, 'Этаж;Аб');
});

test('битый UTF-8 не пугает: файл всё равно читается', () => {
  const broken = new Uint8Array([0x41, 0xff, 0xfe, 0x42]);
  assert.doesNotThrow(() => decodeCsv(broken));
});

test('разделитель определяется по файлу: точка с запятой, запятая, табуляция', () => {
  assert.equal(detectDelimiter('Этаж;Работа;Объём\n2;Штукатурка;10\n3;Окраска;5'), ';');
  assert.equal(detectDelimiter('Этаж,Работа,Объём\n2,Штукатурка,10\n3,Окраска,5'), ',');
  assert.equal(detectDelimiter('Этаж\tРабота\tОбъём\n2\tШтукатурка\t10'), '\t');
  // Запятые в тексте не должны победить точку с запятой, которой разделены колонки.
  assert.equal(detectDelimiter('Этаж;Работа;Объём\n2;Штукатурка, улучшенная;10,5\n3;Окраска, в 2 слоя;5'), ';');
  assert.equal(detectDelimiter(''), ';');
});

test('кавычки, удвоенные кавычки и запятые внутри поля', () => {
  const rows = parseCsv('a;"b,c";"он сказал ""да""";d', ';');
  assert.deepEqual(rows, [['a', 'b,c', 'он сказал "да"', 'd']]);
});

test('перевод строки внутри кавычек не рвёт строку', () => {
  const rows = parseCsv('1;"первая\nвторая";3\n4;5;6', ';');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], ['1', 'первая\nвторая', '3']);
  assert.deepEqual(rows[1], ['4', '5', '6']);
});

test('CRLF и хвостовой перевод строки обрабатываются', () => {
  const rows = parseCsv('a;b\r\nc;d\r\n', ';');
  assert.deepEqual(rows, [['a', 'b'], ['c', 'd']]);
});

test('CSV превращается в лист: пустые хвостовые строки убраны, кавычки в заголовке сняты', () => {
  const content = 'Этаж;Работа;Объём\n2;Штукатурка;10\n;;\n\n';
  const result = readCsvSheet(utf8(content), 'ВОР.csv');
  assert.equal(result.delimiter, ';');
  assert.equal(result.encoding, 'utf-8');
  assert.equal(result.transcoded, false);
  assert.equal(result.sheet.name, 'ВОР.csv');
  assert.deepEqual(result.sheet.rows[0], ['Этаж', 'Работа', 'Объём']);
  assert.equal(result.sheet.rows[1][1], 'Штукатурка');
  assert.equal(result.sheet.rows.length, 2, 'пустые хвостовые строки убраны');
});

test('файл в windows-1251 помечается как перекодированный', () => {
  const cp1251 = new Uint8Array([0xdd, 0xf2, 0xe0, 0xe6, 0x3b, 0xca, 0xee, 0xeb, 0x3b]);
  const result = readCsvSheet(cp1251, 'выгрузка.csv');
  assert.equal(result.transcoded, true, 'о перекодировке надо сказать человеку');
  assert.equal(result.sheet.rows[0][0], 'Этаж');
});

test('CSV с сопоставленными вручную колонками разбирается целиком и находит работы', () => {
  // Ровно тот случай, что был настоящей ошибкой: строки строились по ручному сопоставлению,
  // а смысл колонок разбор брал из профиля — и молча выдавал мусор. Тест ловит расхождение.
  const content = [
    'Этаж;Помещение;Наименование работ;Ед. изм.;Объём',
    '2;кв. 1;Штукатурка стен;м2;120,5',
    '2;кв. 2;Окраска стен;м2;240',
    '3;кв. 5;Плинтус;м.п.;41,8',
    '3;кв. 6;Монтаж вентиляции;м.п.;12'
  ].join('\n');

  const csv = readCsvSheet(utf8(content), 'выгрузка.csv');
  const form = formProfileById('fkp-list');
  const activeProfile: ImportProfile = {
    ...form.profile,
    headerRow: 1,
    headerRows: 1,
    columns: [
      { field: 'section_floor', columnIndex: 1, headerText: 'этаж' },
      { field: 'location_label', columnIndex: 2, headerText: 'помещение' },
      { field: 'name', columnIndex: 3, headerText: 'наименование работ' },
      { field: 'unit', columnIndex: 4, headerText: 'ед. изм.' },
      { field: 'quantity', columnIndex: 5, headerText: 'объём' }
    ]
  };

  const rows = rawRowsFromSheets([csv.sheet], activeProfile, csv.sheet.name);
  assert.equal(rows.length, 4, 'все строки данных прочитаны');

  const context = normalizeContextOf({ ...form, profile: activeProfile });
  const result = analyze(rows, { ...form, profile: activeProfile }, context);

  assert.equal(result.rows.length, 4, 'каждая строка стала позицией');
  assert.deepEqual(
    result.rows.map((row) => row.workRaw),
    ['Штукатурка стен', 'Окраска стен', 'Плинтус', 'Монтаж вентиляции'],
    'работы прочитаны из той колонки, что указал человек'
  );
  assert.deepEqual(
    result.rows.map((row) => row.unitRaw),
    ['м2', 'м2', 'м.п.', 'м.п.']
  );
  // «Монтаж вентиляции» в справочнике нет — строка обязана остаться нерешённой, а не «похожей».
  assert.equal(result.rows.filter((row) => row.workId === null).length, 1);

  // Адрес из колонок раскладывается по ролям: позиционный разбор выдал бы этаж за помещение.
  assert.deepEqual(
    result.rows.map((row) => `${row.floor}/${row.place}`),
    ['2/кв. 1', '2/кв. 2', '3/кв. 5', '3/кв. 6'],
    'этаж и помещение взяты из своих колонок'
  );
  assert.ok(result.rows.every((row) => row.section === '—'), 'секции в файле нет — и не выдумываем её');
});
