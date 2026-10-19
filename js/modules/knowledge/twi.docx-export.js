/**
 * twi.docx-export.js
 * Word-экспорт TWI: WORKER (пошаговая) и INSPECTOR (технадзор).
 * Стиль: Times, серые рамки, логотип в колонтитуле.
 * У технадзора акцент — крупные фото «правильно / брак» сверху.
 */

const root = typeof globalThis !== 'undefined' ? globalThis : window;

const FONT = 'Times New Roman';
const COLOR_INK = '111827';
const COLOR_MUTED = '4b5563';
const COLOR_LINE = '9ca3af';
const PAGE_W = 11906;
const MARGIN = 850;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LOGO_PDF_MAX_H = 45;
const LOGO_PDF_MAX_W = 220;

function _toast(msg) {
    if (typeof root.showToast === 'function') root.showToast(msg);
    else console.warn('[twi-docx]', msg);
}

function _lib() {
    return root.docx || null;
}

function _twiCards() {
    try {
        if (root.RBI && root.RBI.services && root.RBI.services.knowledge
            && typeof root.RBI.services.knowledge.getTwiCardsSync === 'function') {
            return root.RBI.services.knowledge.getTwiCardsSync() || [];
        }
    } catch (_) { /* ignore */ }
    if (Array.isArray(root.customTwiCards) && root.customTwiCards.length) return root.customTwiCards;
    return Array.isArray(root.rbi_twiCards) ? root.rbi_twiCards : [];
}

function _stripHtml(s) {
    return String(s || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .trim();
}

function _resolveInspectorNorm(card) {
    let itemName = '';
    let normText = 'Норматив не указан';
    try {
        const ck = String(card.checklistKey || '');
        if (ck && card.itemId != null && card.itemId !== '' && card.itemId !== 'ALL') {
            const type = ck.split('_')[0];
            const key = ck.replace(type + '_', '');
            let groups = [];
            const sys = root.SYSTEM_TEMPLATES || {};
            const user = root.userTemplates || {};
            if (type === 'sys' && sys[key] && sys[key].groups) groups = sys[key].groups;
            else if (user[key] && user[key].groups) groups = user[key].groups;
            const flat = typeof root.getFlatList === 'function' ? root.getFlatList(groups || []) : [];
            const itemInfo = flat.find(function (i) { return String(i.id) === String(card.itemId); });
            if (itemInfo) {
                itemName = itemInfo.n || '';
                if (itemInfo.t) normText = _stripHtml(itemInfo.t) || normText;
            }
        }
    } catch (_) { /* ignore */ }
    return { itemName: itemName, normText: normText };
}

function _getSetting(key) {
    try {
        if (root.RBI && root.RBI.services && root.RBI.services.settings
            && typeof root.RBI.services.settings.get === 'function') {
            return root.RBI.services.settings.get(key);
        }
    } catch (_) { /* ignore */ }
    const s = root.appSettings || {};
    return s[key];
}

function _fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('ru-RU'); }
    catch (_) { return String(iso); }
}

function _fileDate(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return 'без_даты';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '-' + mm + '-' + d.getFullYear();
}

function _safeFilePart(s) {
    return String(s || '')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 40) || 'TWI';
}

function _thinBorder(color) {
    const D = _lib();
    const b = { style: D.BorderStyle.SINGLE, size: 4, color: color || COLOR_LINE };
    return { top: b, bottom: b, left: b, right: b };
}

function _noBorder() {
    const D = _lib();
    const none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    return { top: none, bottom: none, left: none, right: none };
}

function _cell(children, width, opts) {
    const D = _lib();
    const o = opts || {};
    return new D.TableCell({
        width: { size: width, type: D.WidthType.DXA },
        verticalAlign: o.valign || D.VerticalAlign.TOP,
        shading: o.shading ? { type: D.ShadingType.CLEAR, fill: o.shading } : undefined,
        borders: o.borders || _thinBorder(o.borderColor),
        margins: o.margins || { top: 60, bottom: 60, left: 80, right: 80 },
        children: children && children.length ? children : [new D.Paragraph({ children: [] })]
    });
}

function _p(text, opts) {
    const D = _lib();
    const o = opts || {};
    return new D.Paragraph({
        spacing: { after: o.after != null ? o.after : 80, before: o.before || 0 },
        alignment: o.align || D.AlignmentType.LEFT,
        children: [
            new D.TextRun({
                text: String(text == null ? '' : text),
                font: FONT,
                size: o.size || 22,
                bold: !!o.bold,
                italics: !!o.italics,
                color: o.color || COLOR_INK
            })
        ]
    });
}

function _bytesFromDataUrl(src) {
    const m = String(src || '').match(/^data:image\/([\w+.-]+);base64,(.+)$/i);
    if (!m) return null;
    let type = m[1].toLowerCase();
    if (type === 'jpeg') type = 'jpg';
    if (type === 'svg+xml') return null;
    try {
        const bin = atob(m[2]);
        const data = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
        return { type: type, data: data };
    } catch (_) {
        return null;
    }
}

async function _blobToDataUrl(blob) {
    return new Promise(function (resolve) {
        const fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result || '')); };
        fr.onerror = function () { resolve(''); };
        fr.readAsDataURL(blob);
    });
}

function _loadImageMeta(dataUrl) {
    return new Promise(function (resolve) {
        try {
            const img = new Image();
            img.onload = function () {
                resolve({
                    natW: img.naturalWidth || img.width || 1,
                    natH: img.naturalHeight || img.height || 1,
                    img: img
                });
            };
            img.onerror = function () { resolve(null); };
            img.src = dataUrl;
        } catch (_) { resolve(null); }
    });
}

async function _toJpegKeepAspect(dataUrl, maxSide) {
    const meta = await _loadImageMeta(dataUrl);
    if (!meta) return null;
    const max = maxSide || 1600;
    let w = meta.natW;
    let h = meta.natH;
    const long = Math.max(w, h);
    if (long > max) {
        const s = max / long;
        w = Math.max(1, Math.round(w * s));
        h = Math.max(1, Math.round(h * s));
    }
    try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(meta.img, 0, 0, w, h);
        return { dataUrl: canvas.toDataURL('image/jpeg', 0.9), natW: w, natH: h };
    } catch (_) {
        return null;
    }
}

function _orientation(natW, natH) {
    if (natH > natW * 1.08) return 'portrait';
    if (natW > natH * 1.08) return 'landscape';
    return 'square';
}

function _fitDisplay(natW, natH, maxW, maxH) {
    const nw = Math.max(1, natW || 1);
    const nh = Math.max(1, natH || 1);
    const scale = Math.min(maxW / nw, maxH / nh, 1);
    return {
        w: Math.max(40, Math.round(nw * scale)),
        h: Math.max(40, Math.round(nh * scale))
    };
}

async function _fetchPhotoDataUrl(ref) {
    if (!ref) return '';
    let dataUrl = '';
    try {
        if (root.PhotoManager && typeof root.PhotoManager.getBase64 === 'function') {
            dataUrl = await root.PhotoManager.getBase64(ref) || '';
        }
    } catch (_) { /* ignore */ }
    if (dataUrl && String(dataUrl).startsWith('data:')) return dataUrl;
    try {
        let url = '';
        if (root.PhotoManager && typeof root.PhotoManager.getAsyncUrl === 'function') {
            url = await root.PhotoManager.getAsyncUrl(ref) || '';
        }
        if (!url && typeof root.getPhotoSrc === 'function') url = root.getPhotoSrc(ref) || '';
        if (url && String(url).startsWith('data:')) return url;
        if (url && !/^local:|^cloud:/.test(String(url))) {
            const resp = await fetch(url);
            if (resp.ok) return await _blobToDataUrl(await resp.blob());
        }
    } catch (_) { /* ignore */ }
    return '';
}

async function _loadPhotoAsset(ref) {
    const raw = await _fetchPhotoDataUrl(ref);
    if (!raw) return null;
    const jpg = await _toJpegKeepAspect(raw, 1600);
    if (!jpg) return null;
    const packed = _bytesFromDataUrl(jpg.dataUrl);
    if (!packed || !packed.data) return null;
    return {
        data: packed.data,
        type: 'jpg',
        natW: jpg.natW,
        natH: jpg.natH,
        orientation: _orientation(jpg.natW, jpg.natH)
    };
}

function _photoBlock(asset, caption, maxW, maxH) {
    const D = _lib();
    const out = [];
    if (!asset || !asset.data) {
        out.push(_p('Нет фото', { size: 18, color: '94a3b8', italics: true, after: 40, align: D.AlignmentType.CENTER }));
        return out;
    }
    const size = _fitDisplay(asset.natW, asset.natH, maxW, maxH);
    out.push(new D.Paragraph({
        alignment: D.AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [
            new D.ImageRun({
                type: asset.type || 'jpg',
                data: asset.data,
                transformation: { width: size.w, height: size.h },
                altText: { title: caption || 'Фото', description: caption || 'Фото шага', name: 'twi-photo' }
            })
        ]
    }));
    if (caption) {
        out.push(_p(caption, { size: 15, color: COLOR_MUTED, bold: true, after: 60, align: D.AlignmentType.CENTER }));
    }
    return out;
}

function _packPhotoRows(assets) {
    const rows = [];
    let i = 0;
    while (i < assets.length) {
        const a = assets[i];
        const b = assets[i + 1];
        if (a && b && a.orientation === 'portrait' && b.orientation === 'portrait') {
            rows.push({ kind: 'pair', items: [a, b] });
            i += 2;
        } else {
            rows.push({ kind: 'single', items: [a] });
            i += 1;
        }
    }
    return rows;
}

function _stepPhotos(step) {
    if (typeof root.normalizeItemPhotos === 'function') {
        return root.normalizeItemPhotos(step && step.photo).filter(Boolean);
    }
    return step && step.photo ? [step.photo] : [];
}

async function _buildStepPhotoChildren(photoRefs, stepNo, contentW) {
    const D = _lib();
    const W = contentW || CONTENT_W;
    const children = [];
    if (!photoRefs.length) return children;

    const assets = [];
    for (let p = 0; p < photoRefs.length; p++) {
        const asset = await _loadPhotoAsset(photoRefs[p]);
        if (asset) {
            asset._idx = p + 1;
            assets.push(asset);
        }
    }
    if (!assets.length) return children;

    const rows = _packPhotoRows(assets);
    const half = Math.floor(W / 2);

    rows.forEach(function (row) {
        if (row.kind === 'pair') {
            const left = row.items[0];
            const right = row.items[1];
            children.push(new D.Table({
                width: { size: W, type: D.WidthType.DXA },
                columnWidths: [half, W - half],
                rows: [
                    new D.TableRow({
                        children: [
                            _cell(_photoBlock(left, 'Рис. ' + stepNo + '.' + left._idx, 200, 300), half, {
                                borders: _noBorder(), valign: D.VerticalAlign.CENTER
                            }),
                            _cell(_photoBlock(right, 'Рис. ' + stepNo + '.' + right._idx, 200, 300), W - half, {
                                borders: _noBorder(), valign: D.VerticalAlign.CENTER
                            })
                        ]
                    })
                ]
            }));
            return;
        }
        const one = row.items[0];
        const isPortrait = one.orientation === 'portrait';
        children.push.apply(children, _photoBlock(
            one,
            'Рис. ' + stepNo + '.' + one._idx,
            isPortrait ? 240 : 460,
            isPortrait ? 340 : 280
        ));
    });

    return children;
}

function _metaRow(label, value) {
    const labelW = Math.floor(CONTENT_W * 0.32);
    const valueW = CONTENT_W - labelW;
    return new (_lib()).TableRow({
        children: [
            _cell([_p(label, { size: 18, bold: true, color: COLOR_MUTED, after: 0 })], labelW, { shading: 'f8fafc' }),
            _cell([_p(value || '—', { size: 20, bold: true, after: 0 })], valueW)
        ]
    });
}

async function _dimsFromBytes(type, data) {
    try {
        const mime = type === 'jpg' ? 'image/jpeg' : ('image/' + (type || 'png'));
        const blob = new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        const meta = await _loadImageMeta(url);
        try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
        if (meta) return { natW: meta.natW, natH: meta.natH };
    } catch (_) { /* ignore */ }
    return null;
}

async function _resolveLogoImage() {
    let src = '';
    const brand = _getSetting('brandLogo');
    if (brand) {
        try {
            if (root.PhotoManager && typeof root.PhotoManager.getAsyncUrl === 'function') {
                src = await root.PhotoManager.getAsyncUrl(brand) || '';
            }
        } catch (_) { /* ignore */ }
        if (!src) src = String(brand);
    }

    if (src && String(src).startsWith('data:')) {
        let packed = _bytesFromDataUrl(src);
        if (packed && (packed.type === 'png' || packed.type === 'jpg' || packed.type === 'gif' || packed.type === 'bmp')) {
            const dims = await _loadImageMeta(src);
            return {
                type: packed.type,
                data: packed.data,
                fromIcon: false,
                natW: dims ? dims.natW : 220,
                natH: dims ? dims.natH : 45
            };
        }
        const jpg = await _toJpegKeepAspect(src, 480);
        if (jpg) {
            packed = _bytesFromDataUrl(jpg.dataUrl);
            if (packed) return { type: 'jpg', data: packed.data, fromIcon: false, natW: jpg.natW, natH: jpg.natH };
        }
    }

    const candidates = [];
    if (src && /^https?:|^blob:|^\.?\//.test(src)) candidates.push(src);
    candidates.push('./icons/icon-192.png', 'icons/icon-192.png');

    for (let i = 0; i < candidates.length; i++) {
        try {
            const resp = await fetch(candidates[i], { cache: 'force-cache' });
            if (!resp.ok) continue;
            const buf = new Uint8Array(await resp.arrayBuffer());
            if (buf.length < 32) continue;
            const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
            const type = isJpg ? 'jpg' : 'png';
            const fromIcon = /icon-192|icons\//i.test(candidates[i]);
            const dims = await _dimsFromBytes(type, buf);
            return {
                type: type,
                data: buf,
                fromIcon: fromIcon,
                natW: dims ? dims.natW : (fromIcon ? 192 : 220),
                natH: dims ? dims.natH : (fromIcon ? 192 : 45)
            };
        } catch (_) { /* try next */ }
    }
    return null;
}

function _logoHeaderChildren(logo) {
    const D = _lib();
    if (!logo || !logo.data) {
        return [
            new D.Paragraph({
                alignment: D.AlignmentType.LEFT,
                children: [
                    new D.TextRun({ text: 'RBI', font: FONT, bold: true, size: 20, color: COLOR_INK })
                ]
            })
        ];
    }
    const natW = Math.max(1, logo.natW || (logo.fromIcon ? 192 : 220));
    const natH = Math.max(1, logo.natH || (logo.fromIcon ? 192 : 45));
    const scale = Math.min(LOGO_PDF_MAX_W / natW, LOGO_PDF_MAX_H / natH);
    const size = { w: Math.max(1, Math.round(natW * scale)), h: Math.max(1, Math.round(natH * scale)) };
    return [
        new D.Paragraph({
            alignment: D.AlignmentType.LEFT,
            spacing: { after: 0 },
            children: [
                new D.ImageRun({
                    type: logo.type || 'png',
                    data: logo.data,
                    transformation: { width: size.w, height: size.h },
                    altText: { title: 'Логотип', description: 'Логотип организации', name: 'brand-logo' }
                })
            ]
        })
    ];
}

function _sectionBox(title, bodyText) {
    const D = _lib();
    const inner = [
        _p(title, { size: 18, bold: true, color: COLOR_MUTED, after: 60 }),
        _p(bodyText || '—', { size: 20, after: 0 })
    ];
    return new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA },
        columnWidths: [CONTENT_W],
        rows: [
            new D.TableRow({
                children: [
                    _cell(inner, CONTENT_W, {
                        shading: 'ffffff',
                        borders: _thinBorder(COLOR_LINE),
                        margins: { top: 100, bottom: 100, left: 120, right: 120 }
                    })
                ]
            })
        ]
    });
}

async function _inspectorPhotoCell(asset, label, borderColor, width) {
    const D = _lib();
    const kids = [];
    kids.push(_p(label, {
        size: 18, bold: true, after: 80, align: D.AlignmentType.CENTER,
        color: borderColor === '16a34a' ? '166534' : '991b1b'
    }));
    if (asset && asset.data) {
        const size = _fitDisplay(asset.natW, asset.natH, 240, 320);
        kids.push(new D.Paragraph({
            alignment: D.AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
                new D.ImageRun({
                    type: asset.type || 'jpg',
                    data: asset.data,
                    transformation: { width: size.w, height: size.h },
                    altText: { title: label, description: label, name: 'twi-inspector-photo' }
                })
            ]
        }));
    } else {
        kids.push(_p('Нет фото', {
            size: 18, italics: true, color: '94a3b8', after: 40, align: D.AlignmentType.CENTER
        }));
    }
    return _cell(kids, width, {
        borders: _thinBorder(borderColor),
        shading: borderColor === '16a34a' ? 'f0fdf4' : 'fef2f2',
        valign: D.VerticalAlign.TOP,
        margins: { top: 100, bottom: 100, left: 80, right: 80 }
    });
}

async function _buildInspectorDocument(card) {
    const D = _lib();
    const author = card.author || card.owner || _getSetting('engineerName') || 'Инженер';
    const dateIso = card.date || card.createdAt || card.updatedAt || new Date().toISOString();
    const dateRu = _fmtDate(dateIso);
    const checklistName = card.checklistName || card.category || '—';
    const norm = _resolveInspectorNorm(card);
    const howToCheck = _stripHtml(card.howToCheck) || 'Методика не заполнена';
    const whyImportant = _stripHtml(card.whyImportant) || 'Обоснование не заполнено';
    const itemLabel = norm.itemName
        || (card.itemId != null && card.itemId !== '' && card.itemId !== 'ALL' ? ('п. ' + card.itemId) : '—');

    const goodAsset = card.photoGood ? await _loadPhotoAsset(card.photoGood) : null;
    const badAsset = card.photoBad ? await _loadPhotoAsset(card.photoBad) : null;
    const half = Math.floor(CONTENT_W / 2);

    const children = [];
    children.push(_p('КАРТА КАЧЕСТВА · ТЕХНАДЗОР (TWI)', {
        size: 28, bold: true, after: 40, align: D.AlignmentType.CENTER
    }));
    children.push(_p(String(card.title || 'Карта качества'), {
        size: 24, bold: true, after: 80, align: D.AlignmentType.CENTER
    }));
    children.push(_p('Дата: ' + (dateRu || '—') + '  |  Автор: ' + author, {
        size: 18, color: COLOR_MUTED, after: 140, align: D.AlignmentType.CENTER
    }));

    children.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA },
        columnWidths: [Math.floor(CONTENT_W * 0.32), CONTENT_W - Math.floor(CONTENT_W * 0.32)],
        rows: [
            _metaRow('Чек-лист / контекст', checklistName),
            _metaRow('Пункт контроля', itemLabel),
            _metaRow('Автор', author),
            _metaRow('Назначение', 'Передача подрядчику / визуальный стандарт')
        ]
    }));

    children.push(_p('', { after: 140 }));
    children.push(_p('1. Визуальный стандарт (правильно / брак)', {
        size: 20, bold: true, after: 100
    }));

    children.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA },
        columnWidths: [half, CONTENT_W - half],
        rows: [
            new D.TableRow({
                children: [
                    await _inspectorPhotoCell(goodAsset, 'ЭТАЛОН · ПРАВИЛЬНО', '16a34a', half),
                    await _inspectorPhotoCell(badAsset, 'БРАК · НАРУШЕНИЕ', 'dc2626', CONTENT_W - half)
                ]
            })
        ]
    }));

    children.push(_p('', { after: 160 }));
    children.push(_p('2. Пояснения к контролю', {
        size: 20, bold: true, after: 100
    }));
    children.push(_sectionBox('Почему это важно · риски', whyImportant));
    children.push(_p('', { after: 100 }));
    children.push(_sectionBox('Как проверять · методика', howToCheck));
    children.push(_p('', { after: 100 }));
    children.push(_sectionBox('Норматив · СНиП / ГОСТ', norm.normText));

    children.push(_p('', { after: 140 }));
    children.push(_p('TWI · технадзор · ' + author + ' · ' + dateRu, {
        size: 16, color: COLOR_MUTED, after: 0, align: D.AlignmentType.CENTER
    }));

    const logo = await _resolveLogoImage();
    return new D.Document({
        sections: [{
            properties: {
                page: {
                    size: { width: PAGE_W, height: 16838 },
                    margin: { top: MARGIN + 200, right: MARGIN, bottom: MARGIN, left: MARGIN }
                }
            },
            headers: {
                default: new D.Header({
                    children: _logoHeaderChildren(logo)
                })
            },
            children: children
        }]
    });
}

async function _buildWorkerDocument(card) {
    const D = _lib();
    const steps = Array.isArray(card.steps) ? card.steps : [];
    const author = card.author || card.owner || _getSetting('engineerName') || 'Инженер';
    const dateIso = card.date || card.createdAt || card.updatedAt || new Date().toISOString();
    const dateRu = _fmtDate(dateIso);
    const checklistName = card.checklistName || card.category || '—';

    const children = [];
    children.push(_p('ПОШАГОВАЯ ИНСТРУКЦИЯ (TWI)', {
        size: 28, bold: true, after: 40, align: D.AlignmentType.CENTER
    }));
    children.push(_p(String(card.title || 'Рабочая инструкция'), {
        size: 24, bold: true, after: 80, align: D.AlignmentType.CENTER
    }));
    children.push(_p('Дата: ' + (dateRu || '—') + '  |  Шагов: ' + steps.length + '  |  Время: ~' + (card.totalTime || 0) + ' мин', {
        size: 18, color: COLOR_MUTED, after: 140, align: D.AlignmentType.CENTER
    }));

    children.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA },
        columnWidths: [Math.floor(CONTENT_W * 0.32), CONTENT_W - Math.floor(CONTENT_W * 0.32)],
        rows: [
            _metaRow('Чек-лист / контекст', checklistName),
            _metaRow('Автор', author),
            _metaRow('Количество шагов', String(steps.length)),
            _metaRow('Нормативное время', '~' + (card.totalTime || 0) + ' мин')
        ]
    }));

    children.push(_p('', { after: 140 }));
    children.push(_p('1. Последовательность выполнения', {
        size: 20, bold: true, after: 120
    }));

    if (!steps.length) {
        children.push(_p('Шаги не заполнены.', { size: 20, italics: true, color: COLOR_MUTED, after: 120 }));
    }

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i] || {};
        const stepNo = step.order != null ? step.order : (i + 1);
        const photoRefs = _stepPhotos(step);
        const body = [];
        body.push(_p('Шаг ' + stepNo + (step.time ? ('  |  ' + step.time + ' мин') : ''), {
            size: 20, bold: true, after: 60
        }));
        body.push(_p(step.text || '—', { size: 20, after: 80 }));
        if (photoRefs.length) {
            body.push(_p('Фотофиксация: ' + photoRefs.length + ' шт.', {
                size: 16, color: COLOR_MUTED, after: 80
            }));
            const photos = await _buildStepPhotoChildren(photoRefs, stepNo, CONTENT_W - 160);
            body.push.apply(body, photos);
        }

        children.push(new D.Table({
            width: { size: CONTENT_W, type: D.WidthType.DXA },
            columnWidths: [CONTENT_W],
            rows: [
                new D.TableRow({
                    children: [
                        _cell(body, CONTENT_W, {
                            shading: 'ffffff',
                            borders: _thinBorder(COLOR_LINE),
                            margins: { top: 100, bottom: 100, left: 120, right: 120 }
                        })
                    ]
                })
            ]
        }));
        children.push(_p('', { after: 120 }));
    }

    children.push(_p('TWI-инструкция · ' + author + ' · ' + dateRu, {
        size: 16, color: COLOR_MUTED, after: 0, align: D.AlignmentType.CENTER
    }));

    const logo = await _resolveLogoImage();
    return new D.Document({
        sections: [{
            properties: {
                page: {
                    size: { width: PAGE_W, height: 16838 },
                    margin: { top: MARGIN + 200, right: MARGIN, bottom: MARGIN, left: MARGIN }
                }
            },
            headers: {
                default: new D.Header({
                    children: _logoHeaderChildren(logo)
                })
            },
            children: children
        }]
    });
}

function _downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
        try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
    }, 1500);
}

/**
 * @param {string} [id] — id карты; если нет — из открытого viewer
 */
export async function exportTwiDocx(id) {
    const D = _lib();
    if (!D || typeof D.Document !== 'function' || !D.Packer || typeof D.Packer.toBlob !== 'function') {
        _toast('Библиотека Word (docx) не загружена');
        return null;
    }

    const twiId = id || document.getElementById('twi-viewer-overlay')?.dataset?.currentTwiId;
    if (!twiId) {
        _toast('TWI-карта не выбрана');
        return null;
    }

    const card = _twiCards().find(function (c) { return c && String(c.id) === String(twiId); });
    if (!card) {
        _toast('TWI-карта не найдена');
        return null;
    }
    if (card.type !== 'WORKER' && card.type !== 'INSPECTOR') {
        _toast('Word доступен для TWI Технадзор и Инструкция');
        return null;
    }

    _toast('Формируем Word (TWI)...');
    try {
        const doc = card.type === 'INSPECTOR'
            ? await _buildInspectorDocument(card)
            : await _buildWorkerDocument(card);
        const blob = await D.Packer.toBlob(doc);
        const prefix = card.type === 'INSPECTOR' ? 'TWI_Технадзор_' : 'TWI_';
        const fileName = prefix + _safeFilePart(card.title) + '_' + _fileDate(card.date || card.createdAt) + '.docx';
        _downloadBlob(blob, fileName);
        _toast('Word сохранён: ' + fileName);
        return { blob: blob, fileName: fileName };
    } catch (err) {
        console.error('[twi-docx]', err);
        _toast('Ошибка экспорта Word');
        return null;
    }
}

root['exportTwiDocx'] = exportTwiDocx;
root['rbi_exportTwiDocx'] = exportTwiDocx;
