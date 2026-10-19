/**
 * etalon.docx-export.js
 * Word-экспорт Акта-Эталона v1 (.docx) через libs/docx.bundle.js.
 * Структура как у PDF-печати: реквизиты, отклонения, узлы, мультифото с подписями.
 */

const root = typeof globalThis !== 'undefined' ? globalThis : window;

const FONT = 'Times New Roman';
const COLOR_INK = '111827';
const COLOR_MUTED = '4b5563';
const COLOR_LINE = '9ca3af';
const PAGE_W = 11906;
const MARGIN = 850;
const CONTENT_W = PAGE_W - MARGIN * 2; // 10206

function _toast(msg) {
    if (typeof root.showToast === 'function') root.showToast(msg);
    else console.warn('[etalon-docx]', msg);
}

function _lib() {
    return root.docx || null;
}

function _etalonActs() {
    try {
        if (root.RBI && root.RBI.services && root.RBI.services.knowledge
            && typeof root.RBI.services.knowledge.getEtalonActsSync === 'function') {
            return root.RBI.services.knowledge.getEtalonActsSync() || [];
        }
    } catch (_) { /* ignore */ }
    return Array.isArray(root.etalonActsArray) ? root.etalonActsArray : [];
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
        .slice(0, 40) || 'эталон';
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
        columnSpan: o.columnSpan,
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

/** Перекодировать в jpeg без смены пропорций; длинная сторона ≤ maxSide. */
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
        return {
            dataUrl: canvas.toDataURL('image/jpeg', 0.9),
            natW: w,
            natH: h
        };
    } catch (_) {
        return null;
    }
}

function _orientation(natW, natH) {
    if (natH > natW * 1.08) return 'portrait';
    if (natW > natH * 1.08) return 'landscape';
    return 'square';
}

/** Размер в Word (px) с сохранением реального соотношения сторон. */
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

/**
 * Загрузить фото с реальными пропорциями (всегда jpeg для Word).
 * @returns {{ data: Uint8Array, type: string, natW: number, natH: number, orientation: string }|null}
 */
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
        out.push(_p('Нет фото', { size: 18, color: '94a3b8', italics: true, after: 60, align: D.AlignmentType.CENTER }));
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
                altText: {
                    title: caption || 'Фото',
                    description: caption || 'Фото эталона',
                    name: 'etalon-photo'
                }
            })
        ]
    }));
    if (caption) {
        out.push(_p(caption, {
            size: 15,
            color: COLOR_MUTED,
            bold: true,
            after: 80,
            align: D.AlignmentType.CENTER
        }));
    }
    return out;
}

/** Упаковка фото узла: портреты парами рядом, горизонтальные — на всю ширину блока. */
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

async function _buildNodePhotoChildren(photoRefs, nodeNo, nodeName, contentW) {
    const D = _lib();
    const W = contentW || CONTENT_W;
    const children = [];
    if (!photoRefs.length) {
        children.push(_p('Фотофиксация не приложена', {
            size: 18, color: '94a3b8', italics: true, after: 40, align: D.AlignmentType.CENTER
        }));
        return children;
    }

    const assets = [];
    for (let p = 0; p < photoRefs.length; p++) {
        const asset = await _loadPhotoAsset(photoRefs[p]);
        if (asset) {
            asset._idx = p + 1;
            assets.push(asset);
        }
    }
    if (!assets.length) {
        children.push(_p('Фото не удалось загрузить', {
            size: 18, color: '94a3b8', italics: true, after: 40, align: D.AlignmentType.CENTER
        }));
        return children;
    }

    const rows = _packPhotoRows(assets);
    const half = Math.floor(W / 2);

    rows.forEach(function (row) {
        if (row.kind === 'pair') {
            const left = row.items[0];
            const right = row.items[1];
            // Портреты рядом: одинаковый max-box, пропорции реальные
            children.push(new D.Table({
                width: { size: W, type: D.WidthType.DXA },
                columnWidths: [half, W - half],
                rows: [
                    new D.TableRow({
                        children: [
                            _cell(
                                _photoBlock(left, 'Рис. ' + nodeNo + '.' + left._idx, 210, 330),
                                half,
                                { borders: _noBorder(), valign: D.VerticalAlign.CENTER }
                            ),
                            _cell(
                                _photoBlock(right, 'Рис. ' + nodeNo + '.' + right._idx, 210, 330),
                                W - half,
                                { borders: _noBorder(), valign: D.VerticalAlign.CENTER }
                            )
                        ]
                    })
                ]
            }));
            children.push(_p('', { after: 60 }));
            return;
        }

        const one = row.items[0];
        const isPortrait = one.orientation === 'portrait';
        // Горизонталь/квадрат — шире; одиночный портрет — по центру, выше
        const maxW = isPortrait ? 250 : 480;
        const maxH = isPortrait ? 370 : 290;
        children.push.apply(children, _photoBlock(
            one,
            'Рис. ' + nodeNo + '.' + one._idx,
            maxW,
            maxH
        ));
    });

    return children;
}

// Читает и старый строковый формат participants (свободный текст), и новый
// массив {role, name} из конструктора «Комиссия (Участники)».
function _formatEtalonParticipantsText(value) {
    if (Array.isArray(value)) {
        const parts = value.map(function (p) {
            const name = (p && p.name) || '';
            const role = (p && p.role) || '';
            if (name && role) return name + ' — ' + role;
            return name || role;
        }).filter(Boolean);
        return parts.join('; ');
    }
    return value || '';
}

function _metaRow(label, value) {
    const D = _lib();
    const labelW = Math.floor(CONTENT_W * 0.32);
    const valueW = CONTENT_W - labelW;
    return new D.TableRow({
        children: [
            _cell([_p(label, { size: 18, bold: true, color: COLOR_MUTED, after: 0 })], labelW, { shading: 'f8fafc' }),
            _cell([_p(value || '—', { size: 20, bold: true, after: 0 })], valueW)
        ]
    });
}

/** Как в PDF getBrandedHeader: height:45px; width:auto; max-width:220px; object-fit:contain */
const LOGO_PDF_MAX_H = 45;
const LOGO_PDF_MAX_W = 220;

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
        let natW = 0;
        let natH = 0;
        if (packed && (packed.type === 'png' || packed.type === 'jpg' || packed.type === 'gif' || packed.type === 'bmp')) {
            const dims = await _loadImageMeta(src);
            if (dims) { natW = dims.natW; natH = dims.natH; }
            return { type: packed.type, data: packed.data, fromIcon: false, natW: natW, natH: natH };
        }
        const jpg = await _toJpegKeepAspect(src, 480);
        if (jpg) {
            packed = _bytesFromDataUrl(jpg.dataUrl);
            if (packed) {
                return { type: 'jpg', data: packed.data, fromIcon: false, natW: jpg.natW, natH: jpg.natH };
            }
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
                    new D.TextRun({
                        text: 'RBI',
                        font: FONT,
                        bold: true,
                        size: 20,
                        color: COLOR_INK
                    })
                ]
            })
        ];
    }
    // PDF getBrandedHeader: height:45px; width:auto; max-width:220px; object-fit:contain
    // (допускает upscale до высоты кадра — без потолка scale≤1)
    const natW = Math.max(1, logo.natW || (logo.fromIcon ? 192 : 220));
    const natH = Math.max(1, logo.natH || (logo.fromIcon ? 192 : 45));
    const scale = Math.min(LOGO_PDF_MAX_W / natW, LOGO_PDF_MAX_H / natH);
    const size = {
        w: Math.max(1, Math.round(natW * scale)),
        h: Math.max(1, Math.round(natH * scale))
    };
    return [
        new D.Paragraph({
            alignment: D.AlignmentType.LEFT,
            spacing: { after: 0 },
            children: [
                new D.ImageRun({
                    type: logo.type || 'png',
                    data: logo.data,
                    transformation: { width: size.w, height: size.h },
                    altText: {
                        title: 'Логотип',
                        description: 'Логотип организации',
                        name: 'brand-logo'
                    }
                })
            ]
        })
    ];
}

async function _buildDocument(record) {
    const D = _lib();
    const d = record.details || {};
    const elements = Array.isArray(d.elements) ? d.elements : [];
    const dateRu = _fmtDate(record.date);
    const hasDev = d.deviations && d.deviations !== 'Отклонений не выявлено';
    let totalPhotos = 0;
    elements.forEach(function (el) {
        const refs = (Array.isArray(el.photos) && el.photos.length)
            ? el.photos.filter(Boolean)
            : (el.photo ? [el.photo] : []);
        totalPhotos += refs.length;
    });

    const children = [];

    children.push(_p('АКТ ПРИЁМКИ ЭТАЛОННОГО ОБРАЗЦА', {
        size: 28, bold: true, after: 40, align: D.AlignmentType.CENTER
    }));
    children.push(_p(
        'Дата: ' + (dateRu || '—')
        + '  |  Узлов: ' + elements.length
        + '  |  Фото: ' + totalPhotos,
        { size: 18, color: COLOR_MUTED, after: 160, align: D.AlignmentType.CENTER }
    ));

    children.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA },
        columnWidths: [Math.floor(CONTENT_W * 0.32), CONTENT_W - Math.floor(CONTENT_W * 0.32)],
        rows: [
            _metaRow('Объект', record.projectName),
            _metaRow('Подрядная организация', record.contractorName),
            _metaRow('Вид работ', record.templateTitle),
            _metaRow('Участок (локация)', record.location),
            _metaRow('Участники приёмки', _formatEtalonParticipantsText(d.participants)),
            _metaRow('Инженер СК', record.inspectorName || record.author || _getSetting('engineerName') || '—')
        ]
    }));

    children.push(_p('', { after: 140 }));

    children.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA },
        columnWidths: [CONTENT_W],
        rows: [
            new D.TableRow({
                children: [
                    _cell([
                        _p('1. Отклонения и допущения', { size: 18, bold: true, color: COLOR_INK, after: 40 }),
                        _p(d.deviations || 'Отклонений не выявлено', {
                            size: 20,
                            bold: hasDev,
                            after: 0
                        })
                    ], CONTENT_W, {
                        shading: 'ffffff',
                        borderColor: COLOR_LINE,
                        margins: { top: 80, bottom: 80, left: 100, right: 100 }
                    })
                ]
            })
        ]
    }));

    children.push(_p('', { after: 160 }));
    children.push(_p('2. Зафиксированные узлы и элементы', {
        size: 20, bold: true, after: 120
    }));

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const nodeNo = i + 1;
        const nodeName = el.name || 'Без названия';
        const photoRefs = (Array.isArray(el.photos) && el.photos.length)
            ? el.photos.filter(Boolean)
            : (el.photo ? [el.photo] : []);

        const bodyChildren = [];
        bodyChildren.push(_p(nodeNo + '. ' + String(nodeName), {
            size: 22, bold: true, after: 60
        }));
        bodyChildren.push(_p(el.desc || 'Описание отсутствует', {
            size: 20, after: 60
        }));
        bodyChildren.push(_p(
            photoRefs.length
                ? ('Фотофиксация: ' + photoRefs.length + ' шт.')
                : 'Фотофиксация: нет',
            { size: 16, color: COLOR_MUTED, after: 100 }
        ));

        const photoChildren = await _buildNodePhotoChildren(photoRefs, nodeNo, nodeName, CONTENT_W - 160);
        bodyChildren.push.apply(bodyChildren, photoChildren);

        // Строгий блок узла: тонкая серая рамка, без цветных акцентов
        children.push(new D.Table({
            width: { size: CONTENT_W, type: D.WidthType.DXA },
            columnWidths: [CONTENT_W],
            rows: [
                new D.TableRow({
                    children: [
                        _cell(bodyChildren, CONTENT_W, {
                            shading: 'ffffff',
                            borders: _thinBorder(COLOR_LINE),
                            margins: { top: 100, bottom: 100, left: 120, right: 120 }
                        })
                    ]
                })
            ]
        }));
        children.push(_p('', { after: 140 }));
    }

    children.push(_p('', { after: 200 }));
    const sigW = Math.floor(CONTENT_W * 0.42);
    const gapW = CONTENT_W - sigW * 2;
    children.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA },
        columnWidths: [sigW, gapW, sigW],
        rows: [
            new D.TableRow({
                children: [
                    _cell([
                        _p('____________________________', { size: 18, after: 40, align: D.AlignmentType.CENTER }),
                        _p('Представитель подрядчика', { size: 18, bold: true, after: 20, align: D.AlignmentType.CENTER }),
                        _p('подпись / Ф.И.О. / дата', { size: 14, color: '94a3b8', after: 0, align: D.AlignmentType.CENTER })
                    ], sigW, { borders: _noBorder() }),
                    _cell([_p('', { after: 0 })], gapW, { borders: _noBorder() }),
                    _cell([
                        _p('____________________________', { size: 18, after: 40, align: D.AlignmentType.CENTER }),
                        _p('Инженер строительного контроля', { size: 18, bold: true, after: 20, align: D.AlignmentType.CENTER }),
                        _p('подпись / Ф.И.О. / дата', { size: 14, color: '94a3b8', after: 0, align: D.AlignmentType.CENTER })
                    ], sigW, { borders: _noBorder() })
                ]
            })
        ]
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
 * Собрать и скачать .docx акта-эталона v1 по id.
 * @param {string} id
 */
export async function exportEtalonDocx(id) {
    const D = _lib();
    if (!D || typeof D.Document !== 'function' || !D.Packer || typeof D.Packer.toBlob !== 'function') {
        _toast('Библиотека Word (docx) не загружена');
        return null;
    }

    const record = _etalonActs().find(function (c) { return c && String(c.id) === String(id); });
    if (!record) {
        _toast('Эталон не найден');
        return null;
    }
    if (record.source_kind === 'act_v18' || record.source_kind === 'act_v18b') {
        _toast('Word для Бета-акта пока недоступен — используйте PDF');
        return null;
    }
    if (!record.details || !Array.isArray(record.details.elements)) {
        _toast('Нет данных узлов для Word');
        return null;
    }

    _toast('Формируем Word (Акт-Эталон)...');
    try {
        const doc = await _buildDocument(record);
        const blob = await D.Packer.toBlob(doc);
        const fileName = 'Акт-Эталон_' + _safeFilePart(record.contractorName) + '_' + _fileDate(record.date) + '.docx';
        _downloadBlob(blob, fileName);
        _toast('Word сохранён: ' + fileName);
        return { blob: blob, fileName: fileName };
    } catch (err) {
        console.error('[etalon-docx]', err);
        _toast('Ошибка экспорта Word');
        return null;
    }
}

root['exportEtalonDocx'] = exportEtalonDocx;
root['rbi_exportEtalonDocx'] = exportEtalonDocx;
