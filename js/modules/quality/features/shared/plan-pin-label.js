/**
 * Shared quality plan-pin numbering (A) + place labels.
 * Pure ES module — no window.* assignments.
 */

/** @returns {object|null} planPin from item or metrics */
export function planPinOf(item) {
  if (!item) return null;
  if (item.planPin) return item.planPin;
  if (item.metrics && item.metrics.planPin) return item.metrics.planPin;
  return null;
}

function _pinCoordsOk(pin) {
  if (!pin) return false;
  const x = Number(pin.x);
  const y = Number(pin.y);
  return Number.isFinite(x) && Number.isFinite(y) && pin.locationId != null;
}

/**
 * Live inspections with a valid pin on the given floor, sorted createdAt ASC (+ id).
 * @returns {object[]}
 */
export function listFloorPinItems(inspections, floorId) {
  const fid = String(floorId);
  const list = (inspections || []).filter(function (item) {
    const pin = planPinOf(item);
    return _pinCoordsOk(pin) && String(pin.locationId) === fid;
  });
  list.sort(function (a, b) {
    const ta = Date.parse(a.createdAt || a.timestamp || a.date || '') || 0;
    const tb = Date.parse(b.createdAt || b.timestamp || b.date || '') || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  return list;
}

/**
 * Stable floor point numbers: Map id → 1…N (keys are String(id)).
 * @returns {Map<string, number>}
 */
export function assignFloorPointNumbers(inspections, floorId) {
  const list = listFloorPinItems(inspections, floorId);
  const map = new Map();
  list.forEach(function (item, idx) {
    map.set(String(item.id), idx + 1);
  });
  return map;
}

/**
 * Overlay markers with stable nums for a floor.
 * @param {function(string):string} [titleFn] templateKey → title
 * @returns {{id,num,x,y,templateKey,title}[]}
 */
export function collectFloorPinMarkers(inspections, floorId, titleFn) {
  const list = listFloorPinItems(inspections, floorId);
  return list.map(function (item, idx) {
    const pin = planPinOf(item);
    const key = String(item.templateKey || '');
    return {
      id: item.id,
      num: idx + 1,
      x: Number(pin.x),
      y: Number(pin.y),
      templateKey: key,
      title: item.templateTitle || (typeof titleFn === 'function' ? titleFn(key) : key) || 'Вид работ'
    };
  });
}

/**
 * Shorten long object names: clean ЖК/quotes; keep house number; abbreviate start.
 * @param {string} name
 * @param {number} [maxLen=24]
 */
export function shortenObjectName(name, maxLen) {
  maxLen = maxLen == null ? 24 : maxLen;
  let s = String(name || '')
    .replace(/[«»""„]/g, '')
    .replace(/ЖК\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s.length <= maxLen) return s;

  const m = s.match(/^(.*?)(\s+)(\d+[а-яА-Яa-zA-Z]?)$/);
  let head = s;
  let num = '';
  if (m) {
    head = m[1].trim();
    num = m[3];
  }
  const budget = maxLen - (num ? num.length + 1 : 0);
  if (budget < 3) return num ? ('… ' + num) : s.slice(0, maxLen);

  const words = head.split(/\s+/).filter(Boolean);
  if (!words.length) return num || s.slice(0, maxLen);

  const result = words.slice();
  let guard = 0;
  while (result.join(' ').length > budget && guard < 32) {
    guard++;
    let abbreviated = false;
    for (let i = 0; i < result.length - 1; i++) {
      if (result[i].length > 2 && !/^[A-Za-zА-Яа-яЁё]\.$/.test(result[i])) {
        result[i] = result[i].charAt(0).toUpperCase() + '.';
        abbreviated = true;
        break;
      }
    }
    if (!abbreviated) {
      if (result.length > 1) result.shift();
      else break;
    }
  }
  let out = result.join(' ');
  if (out.length > budget) out = '…' + out.slice(-(budget - 1));
  return num ? (out + ' ' + num) : out;
}

function _resolveFloorLabel(item, pin, opts) {
  if (opts && opts.floorLabel) return String(opts.floorLabel);
  const loc = opts && opts.locations;
  if (loc && typeof loc.getNode === 'function' && pin && pin.locationId != null) {
    try {
      const node = loc.getNode(pin.locationId);
      if (node && node.displayName) return String(node.displayName);
    } catch (_e) { /* ignore */ }
  }
  if (item && item.floor) return String(item.floor);
  return '';
}

function _floorDisplayN(floorLabel) {
  const raw = String(floorLabel || '').replace(/^этаж\s+/i, '').trim();
  return raw || '?';
}

function _resolvePointNo(item, pin, opts) {
  if (opts && opts.pointNo != null) return opts.pointNo;
  if (opts && opts.numberMap) {
    const id = String(item && item.id);
    if (typeof opts.numberMap.get === 'function') return opts.numberMap.get(id);
    if (opts.numberMap[id] != null) return opts.numberMap[id];
    if (item && item.id != null && opts.numberMap[item.id] != null) return opts.numberMap[item.id];
  }
  if (opts && Array.isArray(opts.inspections) && pin && pin.locationId != null) {
    const map = assignFloorPointNumbers(opts.inspections, pin.locationId);
    return map.get(String(item.id));
  }
  return null;
}

/**
 * Format 2 place label for a pin inspection.
 * Without axes: `{Объект} · эт. {N} · т. {K}`
 * With axes: `{оси} ({Объект} · эт. {N} · т. {K})`
 * Falls back to item.location when no valid pin.
 */
export function formatPlanPinPlaceLabel(item, opts) {
  opts = opts || {};
  const pin = planPinOf(item);
  if (!_pinCoordsOk(pin)) {
    return item && item.location ? String(item.location) : '';
  }

  const objRaw = (item && (item.projectName || item.project_display_name)) || '';
  const obj = shortenObjectName(objRaw, opts.maxObjLen != null ? opts.maxObjLen : 24);
  const floorN = _floorDisplayN(_resolveFloorLabel(item, pin, opts));
  const pointNo = _resolvePointNo(item, pin, opts);
  const k = pointNo != null ? pointNo : '?';
  const core = (obj || 'Объект') + ' · эт. ' + floorN + ' · т. ' + k;
  const axes = item && item.room ? String(item.room).trim() : '';
  if (axes) return axes + ' (' + core + ')';
  return core;
}
