/**
 * Защита файлов при импорте (ТЗ §11): контроль zip-bomb, макросов, формул и размеров.
 *
 * Зачем это в клиенте, а не «на сервере»: файл приходит в браузер, и распаковывает его тоже браузер.
 * Один xlsx на 200 КБ может развернуться в гигабайты и убить вкладку до того, как кто-то успеет
 * что-то проверить. Поэтому смотрим на сам архив **до** разбора, а не после.
 *
 * Что именно проверяется:
 *   * размер файла и **суммарный распакованный размер** из оглавления ZIP + коэффициент сжатия;
 *   * макросы (`vbaProject.bin`) — мы их не выполняем, но и не принимаем такой файл: переименованный
 *     `.xlsm` в `.xlsx` не должен проходить молча;
 *   * формулы — берутся **сохранённые значения**, они могли устареть, и об этом говорится в протоколе;
 *   * расширение: принимаем xlsx/xls/csv, отказываем макросным и двоичным форматам.
 */

export type FileKind = 'xlsx' | 'xls' | 'csv' | 'xlsm' | 'xlsb' | 'unknown';

export interface ZipInfo {
  entries: number;
  uncompressed: number;
  compressed: number;
  zip64: boolean;
}

export interface FileVerdict {
  ok: boolean;
  kind: FileKind;
  /** Причина отказа — то, что показывается человеку. */
  error?: string;
  /** Что стоит знать, но что не мешает импорту. */
  warnings: string[];
  bytes: number;
  zip: ZipInfo | null;
  ratio: number | null;
  macros: boolean;
}

/** Пределы. Числа выбраны с запасом к реальным формам (самая большая — 830 строк, ~1 МБ). */
export const LIMITS = {
  maxFileBytes: 30 * 1024 * 1024,
  maxUncompressedBytes: 200 * 1024 * 1024,
  maxRatio: 150
};

/** Оглавление ZIP: сколько всего распакуется. Ничего не распаковываем — только читаем заголовки. */
export function zipInfo(bytes: Uint8Array): ZipInfo | null {
  if (bytes.length < 22) return null;

  // End of central directory ищем с конца: после него может быть комментарий до 64 КБ.
  const limit = Math.max(0, bytes.length - 66_000);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= limit; index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  let uncompressed = 0;
  let compressed = 0;
  let zip64 = false;
  let seen = 0;

  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.length) break;
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) zip64 = true;
    compressed += compressedSize;
    uncompressed += uncompressedSize;
    seen += 1;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return { entries: seen, uncompressed, compressed, zip64 };
}

/** Макросы ищем в самом архиве: имя `vbaProject.bin` лежит в нём открытым текстом. */
export function hasMacros(bytes: Uint8Array): boolean {
  const needle = 'vbaProject.bin';
  const pattern = [...needle].map((symbol) => symbol.charCodeAt(0));
  const last = bytes.length - pattern.length;
  for (let index = 0; index <= last; index += 1) {
    if (bytes[index] !== pattern[0]) continue;
    let matched = true;
    for (let offset = 1; offset < pattern.length; offset += 1) {
      if (bytes[index + offset] !== pattern[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function kindOf(name: string): FileKind {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.xlsm') || lower.endsWith('.xltm')) return 'xlsm';
  if (lower.endsWith('.xlsb')) return 'xlsb';
  if (lower.endsWith('.xls')) return 'xls';
  return 'unknown';
}

/** Проверка файла до разбора: вердикт + предупреждения, которые показываются человеку. */
export function inspectFile(name: string, bytes: Uint8Array): FileVerdict {
  const kind = kindOf(name);
  const warnings: string[] = [];
  const verdict: FileVerdict = {
    ok: true, kind, warnings, bytes: bytes.length, zip: null, ratio: null, macros: false
  };

  if (kind === 'unknown') {
    return { ...verdict, ok: false, error: 'Формат не поддержан: принимаем XLSX, XLS и CSV.' };
  }
  if (kind === 'xlsm' || kind === 'xlsb') {
    return {
      ...verdict,
      ok: false,
      error: 'Файл с макросами или двоичный формат (xlsm/xlsb) не принимаем: сохраните как XLSX. '
        + 'Макросы не выполняются, но и такой файл мы не разбираем — так безопаснее.'
    };
  }
  if (bytes.length > LIMITS.maxFileBytes) {
    return {
      ...verdict,
      ok: false,
      error: `Файл больше ${Math.round(LIMITS.maxFileBytes / 1024 / 1024)} МБ — импорт таких файлов не поддержан.`
    };
  }
  if (kind === 'xls') {
    warnings.push('Старый формат XLS: значения берутся как есть, формулы не пересчитываются.');
    return verdict;
  }
  if (kind === 'csv') {
    warnings.push('CSV: кодировка и разделитель определяются по файлу.');
    return verdict;
  }

  // XLSX — это ZIP: смотрим оглавление и содержимое до разбора.
  const zip = zipInfo(bytes);
  const macros = hasMacros(bytes);
  const ratio = zip && zip.compressed > 0 ? zip.uncompressed / zip.compressed : null;
  const withZip: FileVerdict = { ...verdict, zip, ratio, macros };

  if (zip?.zip64) {
    return {
      ...withZip,
      ok: false,
      error: 'Архив файла слишком большой (ZIP64) — такой файл не принимаем.'
    };
  }
  if (zip && zip.uncompressed > LIMITS.maxUncompressedBytes) {
    return {
      ...withZip,
      ok: false,
      error: `Файл разворачивается в ${Math.round(zip.uncompressed / 1024 / 1024)} МБ `
        + `(предел ${Math.round(LIMITS.maxUncompressedBytes / 1024 / 1024)} МБ) — похоже на архив-бомбу.`
    };
  }
  if (ratio !== null && ratio > LIMITS.maxRatio) {
    return {
      ...withZip,
      ok: false,
      error: `Сжатие ${Math.round(ratio)}× превышает предел ${LIMITS.maxRatio}× — похоже на архив-бомбу.`
    };
  }
  if (macros) {
    return {
      ...withZip,
      ok: false,
      error: 'В файле есть макросы (vbaProject.bin): они не выполняются, но такой файл мы не принимаем — '
        + 'сохраните книгу как XLSX без макросов.'
    };
  }
  if (zip) {
    warnings.push(`Архив: ${zip.entries} частей, распаковка ${Math.round(zip.uncompressed / 1024)} КБ`
      + (ratio ? `, сжатие ${ratio.toFixed(1)}×` : '') + '.');
  }
  return withZip;
}
