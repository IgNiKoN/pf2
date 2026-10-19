/**
 * Тесты защиты файлов (ТЗ §11): zip-bomb, макросы, размеры и форматы.
 *
 * ZIP-бомба собирается вручную — в тесте достаточно **оглавления**: проверка читает именно его,
 * а не распаковывает данные. Так тест остаётся быстрым и не создаёт гигабайты на диске.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hasMacros, inspectFile, zipInfo, LIMITS } from './fileGuard.ts';

/** Собирает ZIP только из оглавления: одна запись с заданными размерами. */
function fakeZip(options: { compressed: number; uncompressed: number; name?: string }): Uint8Array {
  const name = options.name ?? 'xl/worksheets/sheet1.xml';
  const nameBytes = [...name].map((symbol) => symbol.charCodeAt(0));
  const size = 22 + 46 + nameBytes.length;
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);

  // Запись оглавления (central directory file header).
  view.setUint32(0, 0x02014b50, true);
  view.setUint32(20, options.compressed, true);
  view.setUint32(24, options.uncompressed, true);
  view.setUint16(28, nameBytes.length, true);
  nameBytes.forEach((byte, index) => {
    bytes[46 + index] = byte;
  });

  // Конец оглавления (end of central directory).
  const eocd = 46 + nameBytes.length;
  view.setUint32(eocd, 0x06054b50, true);
  view.setUint16(eocd + 8, 1, true);
  view.setUint16(eocd + 10, 1, true);
  view.setUint32(eocd + 12, 46 + nameBytes.length, true);
  view.setUint32(eocd + 16, 0, true);
  return bytes;
}

test('оглавление ZIP читается: видно, сколько файл развернёт', () => {
  const info = zipInfo(fakeZip({ compressed: 1_000, uncompressed: 25_000 }));
  assert.ok(info, 'оглавление должно читаться');
  assert.equal(info?.entries, 1);
  assert.equal(info?.compressed, 1_000);
  assert.equal(info?.uncompressed, 25_000);
});

test('архив-бомба по размеру распаковки отбивается', () => {
  const bomb = fakeZip({ compressed: 5_000, uncompressed: 400 * 1024 * 1024 });
  const verdict = inspectFile('форма.xlsx', bomb);
  assert.equal(verdict.ok, false);
  assert.match(String(verdict.error), /бомбу|разворачивается/);
});

test('архив-бомба по коэффициенту сжатия отбивается', () => {
  const bomb = fakeZip({ compressed: 1_000, uncompressed: 50 * 1024 * 1024 });
  const verdict = inspectFile('форма.xlsx', bomb);
  assert.equal(verdict.ok, false, `сжатие ${verdict.ratio}× должно быть отбито`);
  assert.match(String(verdict.error), /Сжатие/);
});

test('обычный файл проходит и получает пояснение, а не отказ', () => {
  const normal = fakeZip({ compressed: 40_000, uncompressed: 120_000 });
  const verdict = inspectFile('форма.xlsx', normal);
  assert.equal(verdict.ok, true, verdict.error);
  assert.equal(verdict.macros, false);
  assert.ok(verdict.warnings.some((warning) => /Архив/.test(warning)));
});

test('макросы в файле видны, даже если файл переименован в xlsx', () => {
  const withMacro = new Uint8Array([...fakeZip({ compressed: 1_000, uncompressed: 20_000 })]);
  const macroBytes = [...'xl/vbaProject.bin'].map((symbol) => symbol.charCodeAt(0));
  const combined = new Uint8Array([...withMacro, ...macroBytes, 0, 0, 0]);
  assert.equal(hasMacros(combined), true);

  const verdict = inspectFile('переименованный.xlsx', combined);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.macros, true);
  assert.match(String(verdict.error), /макрос/i);
});

test('макросный формат отбивается по расширению, без чтения содержимого', () => {
  const verdict = inspectFile('форма.xlsm', fakeZip({ compressed: 1_000, uncompressed: 20_000 }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, 'xlsm');
  assert.match(String(verdict.error), /макрос/i);
});

test('слишком большой файл отбивается по размеру', () => {
  const big = new Uint8Array(LIMITS.maxFileBytes + 1);
  const verdict = inspectFile('форма.xlsx', big);
  assert.equal(verdict.ok, false);
  assert.match(String(verdict.error), /больше/);
});

test('CSV и старый XLS проходят, но с честными предупреждениями', () => {
  const csv = inspectFile('выгрузка.csv', new Uint8Array([0x3b, 0x3b]));
  assert.equal(csv.ok, true);
  assert.equal(csv.kind, 'csv');
  assert.ok(csv.warnings.some((warning) => /кодировка и разделитель/i.test(warning)));

  const xls = inspectFile('старый.xls', new Uint8Array([1, 2, 3]));
  assert.equal(xls.ok, true);
  assert.equal(xls.kind, 'xls');
  assert.ok(xls.warnings.some((warning) => /формулы не пересчитываются/i.test(warning)));
});

test('неизвестный формат отбивается понятной причиной', () => {
  const verdict = inspectFile('архив.zip', new Uint8Array([1, 2, 3]));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.kind, 'unknown');
  assert.match(String(verdict.error), /XLSX, XLS и CSV/);
});

test('файл без оглавления ZIP не считается бомбой, но и не проходит как книга', () => {
  // Битый xlsx: оглавления нет — проверка не должна падать.
  const broken = inspectFile('битый.xlsx', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]));
  assert.equal(broken.zip, null);
  assert.equal(broken.ok, true, 'решение о битом файле принимает разбор, а не защита');
});
