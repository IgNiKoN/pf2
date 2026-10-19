/**
 * Политика «тихий sync не ломает живой UI» (§5 / A9).
 * Чистые хелперы — без DOM; вызываются из analytics / desk / sync-ui-defer.
 */
'use strict';

/**
 * Нужно ли full-rebuild активного экрана аналитики.
 * Смена фильтра — да. Смена source-signature при уже нарисованном DOM
 * (тихий sync / IDB reorder) — нет: dirty остаётся до навигации.
 *
 * @param {{ filterFpChanged: boolean, dataChanged: boolean, sectionPainted: boolean }} p
 * @returns {boolean} true → делать full rebuild
 */
export function shouldFullRebuildAnalyticsLive(p) {
  var filterFpChanged = !!(p && p.filterFpChanged);
  var dataChanged = !!(p && p.dataChanged);
  var sectionPainted = !!(p && p.sectionPainted);
  if (filterFpChanged) return true;
  if (dataChanged && !sectionPainted) return true;
  return false;
}

/**
 * Тихий sync сдвинул данные, экран уже живой → skip paint, оставить dirty.
 * @param {{ filterFpChanged: boolean, dataChanged: boolean, sectionPainted: boolean }} p
 */
export function shouldSkipAnalyticsLivePaint(p) {
  var filterFpChanged = !!(p && p.filterFpChanged);
  var dataChanged = !!(p && p.dataChanged);
  var sectionPainted = !!(p && p.sectionPainted);
  return !filterFpChanged && dataChanged && sectionPainted;
}

/**
 * Desktop wrap: afterTabPaint только после реального paint (не early-return).
 * @param {unknown} paintResult — return renderCurrentAnalyticsTab()
 */
export function shouldScheduleDeskAfterTabPaint(paintResult) {
  return paintResult === true;
}

/**
 * Атрибут open для desk photo &lt;details&gt;.
 * prevOpen: true/false если узел уже был; null/undefined → defaultOpen.
 * @param {boolean|null|undefined} prevOpen
 * @param {boolean} [defaultOpen=true]
 * @returns {string} ' open' или ''
 */
export function deskDetailsOpenAttr(prevOpen, defaultOpen) {
  var def = defaultOpen !== false;
  if (prevOpen === true) return ' open';
  if (prevOpen === false) return '';
  return def ? ' open' : '';
}

/**
 * Стабильная сигнатура списка инспекций: length + края id после sort.
 * IDB reorder того же набора не выглядит как «данные изменились».
 * @param {Array<{id?: *}>|null|undefined} arr
 */
export function analyticsSourceDataSignatureFromArray(arr) {
  if (!arr || !arr.length) return '0';
  var ids = [];
  for (var i = 0; i < arr.length; i++) {
    var row = arr[i];
    ids.push(String((row && row.id) != null ? row.id : ''));
  }
  ids.sort();
  return arr.length + ':' + ids[0] + ':' + ids[ids.length - 1];
}

/**
 * Можно ли класть URL в analytics thumb-cache / подставлять в img.src.
 * blob: нельзя — PhotoManager LRU revoke → ERR_FILE_NOT_FOUND.
 * data: / http(s) — ок.
 * @param {unknown} url
 */
export function isReusablePhotoThumbUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.indexOf('blob:') === 0) return false;
  if (url.indexOf('data:') === 0) return true;
  if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) return true;
  return false;
}

/**
 * Desk zone-D уже с гидратированными галереями — не wipe при возврате на подвкладку.
 * @param {{ hasGalleryWrap?: boolean, force?: boolean }} p
 */
export function shouldRepaintDeskContextZones(p) {
  if (p && p.force) return true;
  if (p && p.hasGalleryWrap) return false;
  return true;
}
