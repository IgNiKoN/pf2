/**
 * Чтение CSV (ТЗ VOR-002). Даёт ту же структуру, что и XLSX, поэтому дальше работает
 * тот же разбор: профиль раскладки, разбор помещений, сопоставление работ, сохранение.
 *
 * Две вещи, из-за которых CSV в России ломается чаще всего, и обе здесь учтены:
 *   1. **Кодировка.** Файл из 1С или из выгрузки заказчика обычно windows-1251, а не UTF-8.
 *      Читаем строго как UTF-8; если не получилось — перечитываем как windows-1251 и говорим об этом.
 *   2. **Разделитель.** Точка с запятой (русская локаль Excel) или запятая. Определяем по файлу,
 *      а не по имени, и не считаем разделители внутри кавычек.
 */

import type { XlsxSheet } from './types';

export type CsvDelimiter = ';' | ',' | '\t';

export interface CsvReadResult {
  sheet: XlsxSheet;
  delimiter: CsvDelimiter;
  encoding: 'utf-8' | 'windows-1251';
  /** Перекодировали — значит об этом надо сказать человеку, а не молчать. */
  transcoded: boolean;
}

/** Декодирование текста: строгий UTF-8, при неудаче — windows-1251. */
export function decodeCsv(buffer: ArrayBuffer | Uint8Array): { text: string; encoding: 'utf-8' | 'windows-1251' } {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // BOM в начале файла снимает вопрос о кодировке.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-8' };
  }

  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch (_error) {
    // Не UTF-8 — значит почти всегда windows-1251: перечитываем, а не показываем «кракозябры».
    return { text: new TextDecoder('windows-1251').decode(bytes), encoding: 'windows-1251' };
  }
}

/** Разделитель определяем по первым строкам: побеждает тот, что встречается чаще и ровнее. */
export function detectDelimiter(text: string): CsvDelimiter {
  const candidates: CsvDelimiter[] = [';', ',', '\t'];
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '').slice(0, 10);
  if (lines.length === 0) return ';';

  let best: CsvDelimiter = ';';
  let bestScore = -1;
  for (const candidate of candidates) {
    const counts = lines.map((line) => countOutsideQuotes(line, candidate));
    const total = counts.reduce((sum, value) => sum + value, 0);
    if (total === 0) continue;
    const positive = counts.filter((value) => value > 0);
    const average = total / positive.length;
    // Ровность важнее количества: в тексте запятых может быть много, а колонок — три.
    const even = positive.filter((value) => value === positive[0]).length;
    const score = even * 10 + average;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const symbol = line[index];
    if (symbol === '"') {
      if (inQuotes && line[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
    } else if (symbol === delimiter && !inQuotes) {
      count += 1;
    }
  }
  return count;
}

/** Разбор CSV: кавычки, удвоенные кавычки, переводы строк внутри поля, CRLF и LF. */
export function parseCsv(text: string, delimiter: CsvDelimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const symbol = text[index];

    if (inQuotes) {
      if (symbol === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += symbol;
      }
      continue;
    }

    if (symbol === '"') {
      inQuotes = true;
    } else if (symbol === delimiter) {
      row.push(field);
      field = '';
    } else if (symbol === '\r') {
      // CRLF: перевод строки обработает следующий символ \n.
      if (text[index + 1] !== '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      }
    } else if (symbol === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += symbol;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** CSV в виде листа — дальше работает обычный разбор формы. */
export function readCsvSheet(buffer: ArrayBuffer | Uint8Array, name = 'CSV'): CsvReadResult {
  const decoded = decodeCsv(buffer);
  const delimiter = detectDelimiter(decoded.text);
  const rows = parseCsv(decoded.text, delimiter);

  // Пустые хвостовые строки не несут смысла, но ломают определение заголовка.
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => String(cell).trim() === '')) rows.pop();

  // Кавычки-обёртки у заголовков («Этаж») мешают сопоставлению колонок — снимаем их.
  const cleaned = rows.map((row, rowIndex) => rowIndex < 3
    ? row.map((cell) => String(cell).replace(/^"|"$/g, '').trim())
    : row.map((cell) => String(cell)));

  return {
    sheet: { name, rows: cleaned },
    delimiter,
    encoding: decoded.encoding,
    transcoded: decoded.encoding !== 'utf-8'
  };
}
