/**
 * meetings.docx-export.js
 * Официальный Word-протокол совещания (.docx) через libs/docx.bundle.js.
 * Шапка с brandLogo, реквизиты, повестка; HTML/markdown (** / <b>) → реальный bold в Word.
 */

import { collectMeetingSignatories } from './meetings.protocol.js';

const root = typeof globalThis !== 'undefined' ? globalThis : window;

const FONT = 'Times New Roman';
const COLOR_INK = '1c2b39';
const COLOR_MUTED = '475569';
const COLOR_LINE = 'cbd5e1';
const PAGE_W = 11906;
const MARGIN = 850;
const CONTENT_W = PAGE_W - MARGIN * 2; // 10206

function _t(key, fallback, vars) {
    try {
        var i18n = root.RBI && root.RBI.services && root.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var s = vars ? i18n.t(key, vars) : i18n.t(key);
            if (s && s !== key) return s;
        }
    } catch (e) {}
    if (vars && fallback) {
        return String(fallback).replace(/\{(\w+)\}/g, function (_m, k) {
            return vars[k] != null ? String(vars[k]) : '';
        });
    }
    return fallback;
}

function _toast(msg) {
    if (typeof root.showToast === 'function') root.showToast(msg);
    else console.warn('[docx-export]', msg);
}

function _lib() {
    return root.docx || null;
}

function _meetings() {
    return Array.isArray(root.rbi_meetingsData) ? root.rbi_meetingsData : [];
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

function _brandColor() {
    const raw = String(_getSetting('brandColor') || '#1c2b39').replace('#', '').trim();
    return /^[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : '1c2b39';
}

function _fmtDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('ru-RU');
    } catch (_) {
        return String(iso);
    }
}

function _fileDate(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return 'без_даты';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return dd + '-' + mm + '-' + yyyy;
}

function _projectLabel(meet) {
    if (!meet) return '—';
    if (Array.isArray(meet.projectNames) && meet.projectNames.length) {
        return meet.projectNames.map(function (n) { return String(n).trim(); }).filter(Boolean).join(', ') || '—';
    }
    return String(meet.projectName || meet.project || meet.project_display_name || '').trim() || '—';
}

/** Снять HTML/markdown-разметку; ** / <b>/<strong> → сегменты с bold. */
function _normalizeRich(raw) {
    let s = String(raw == null ? '' : raw);
    s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    s = s.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n');
    s = s.replace(/<\/\s*p\s*>/gi, '\n');
    s = s.replace(/<\/\s*div\s*>/gi, '\n');
    s = s.replace(/<\/\s*li\s*>/gi, '\n');
    s = s.replace(/<\s*li[^>]*>/gi, '• ');
    s = s.replace(/<\s*\/?\s*(b|strong)\s*>/gi, '**');
    s = s.replace(/<\s*\/?\s*(i|em)\s*>/gi, '__');
    s = s.replace(/<[^>]+>/g, '');
    s = s
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
    // После decode entities теги могут всплыть снова (&lt;b&gt; → <b>)
    s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n');
    s = s.replace(/<\s*\/?\s*(b|strong)\s*>/gi, '**');
    s = s.replace(/<\s*\/?\s*(i|em)\s*>/gi, '__');
    s = s.replace(/<[^>]+>/g, '');
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return s;
}

function _parseInlineRuns(line, base) {
    const D = _lib();
    const o = base || {};
    const runs = [];
    const re = /(\*\*|__)(.+?)\1/g;
    let last = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
        if (m.index > last) {
            runs.push(new D.TextRun({
                text: line.slice(last, m.index),
                font: FONT,
                size: o.size || 22,
                bold: !!o.bold,
                italics: !!o.italics,
                color: o.color || COLOR_INK
            }));
        }
        const marker = m[1];
        runs.push(new D.TextRun({
            text: m[2],
            font: FONT,
            size: o.size || 22,
            bold: marker === '**' ? true : !!o.bold,
            italics: marker === '__' ? true : !!o.italics,
            color: o.color || COLOR_INK
        }));
        last = m.index + m[0].length;
    }
    const rest = line.slice(last);
    if (rest || runs.length === 0) {
        runs.push(new D.TextRun({
            text: rest || ' ',
            font: FONT,
            size: o.size || 22,
            bold: !!o.bold,
            italics: !!o.italics,
            color: o.color || COLOR_INK
        }));
    }
    return runs;
}

function _parasFromRich(text, opts) {
    const D = _lib();
    const o = opts || {};
    const normalized = _normalizeRich(text);
    const lines = normalized ? normalized.split('\n') : [o.empty || ' '];
    return lines.map(function (line, idx) {
        return new D.Paragraph({
            alignment: o.align || D.AlignmentType.LEFT,
            spacing: {
                after: idx === lines.length - 1 ? (o.after != null ? o.after : 120) : 60,
                line: o.line || 276
            },
            indent: o.indent || undefined,
            children: _parseInlineRuns(line || ' ', o)
        });
    });
}

function _heading(text, opts) {
    const D = _lib();
    const o = opts || {};
    const brand = _brandColor();
    return new D.Paragraph({
        spacing: { before: o.before != null ? o.before : 240, after: o.after != null ? o.after : 120 },
        border: {
            bottom: {
                style: D.BorderStyle.SINGLE,
                size: 12,
                color: o.lineColor || brand,
                space: 6
            }
        },
        children: [
            new D.TextRun({
                text: String(text || ''),
                font: FONT,
                bold: true,
                size: o.size || 24,
                color: o.color || brand,
                allCaps: !!o.allCaps
            })
        ]
    });
}

function _labelValueRow(label, value) {
    const D = _lib();
    return new D.Paragraph({
        spacing: { after: 60 },
        children: [
            new D.TextRun({
                text: label + ': ',
                font: FONT,
                bold: true,
                size: 20,
                color: COLOR_MUTED
            }),
            new D.TextRun({
                text: value || '—',
                font: FONT,
                size: 20,
                color: COLOR_INK
            })
        ]
    });
}

function _noBorder() {
    const D = _lib();
    const none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    return { top: none, bottom: none, left: none, right: none };
}

function _thinBorder(color) {
    const D = _lib();
    const c = color || COLOR_LINE;
    const b = { style: D.BorderStyle.SINGLE, size: 4, color: c };
    return { top: b, bottom: b, left: b, right: b };
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

function _dataUrlToImage(src) {
    const m = String(src || '').match(/^data:image\/([\w+.-]+);base64,(.+)$/i);
    if (!m) return null;
    let type = m[1].toLowerCase();
    if (type === 'jpeg') type = 'jpg';
    if (type === 'svg+xml') return null;
    if (type !== 'png' && type !== 'jpg' && type !== 'gif' && type !== 'bmp') type = 'png';
    try {
        const bin = atob(m[2]);
        const data = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
        return { type: type, data: data };
    } catch (_) {
        return null;
    }
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
    let img = _dataUrlToImage(src);
    if (img) return img;

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
            const fromIcon = /icon-192|icons\//i.test(candidates[i]);
            return { type: isJpg ? 'jpg' : 'png', data: buf, fromIcon: fromIcon };
        } catch (_) { /* try next */ }
    }
    return null;
}

function _logoParagraph(logo) {
    const D = _lib();
    if (!logo) {
        return new D.Paragraph({
            children: [
                new D.TextRun({
                    text: 'RBI',
                    font: FONT,
                    bold: true,
                    size: 28,
                    color: _brandColor()
                })
            ]
        });
    }
    // Иконка приложения квадратная; брендовый логотип обычно шире.
    const square = !!logo.fromIcon;
    const w = square ? 52 : 130;
    const h = square ? 52 : 48;
    return new D.Paragraph({
        children: [
            new D.ImageRun({
                type: logo.type,
                data: logo.data,
                transformation: { width: w, height: h },
                altText: {
                    title: 'Логотип',
                    description: 'Логотип организации',
                    name: 'brand-logo'
                }
            })
        ]
    });
}

function _agendaDefectParas(a) {
    const D = _lib();
    const out = [];
    out.push(new D.Paragraph({
        spacing: { after: 60 },
        children: [
            new D.TextRun({
                text: String(a.contr || '—'),
                font: FONT,
                bold: true,
                size: 20,
                color: COLOR_INK
            })
        ]
    }));
    if (Array.isArray(a.details) && a.details.length > 0) {
        if (a.title) {
            out.push.apply(out, _parasFromRich(a.title, { size: 18, bold: true, after: 40 }));
        }
        a.details.forEach(function (d) {
            out.push.apply(out, _parasFromRich('• ' + String(d || ''), {
                size: 18,
                color: '334155',
                after: 20,
                indent: { left: 120 }
            }));
        });
    } else {
        out.push.apply(out, _parasFromRich(a.defect || '—', { size: 18, color: '334155', after: 40 }));
    }
    if (a.reopened || a.kind === 'REOPENED') {
        out.push(new D.Paragraph({
            spacing: { after: 40 },
            children: [
                new D.TextRun({
                    text: 'Повторно после решения',
                    font: FONT,
                    bold: true,
                    italics: true,
                    size: 16,
                    color: '9a3412'
                })
            ]
        }));
    }
    return out;
}

function _agendaDecisionParas(a) {
    const out = _parasFromRich(a.comment || 'Решение не зафиксировано', {
        size: 18,
        color: '334155',
        after: 40
    });
    if (a.resp) {
        out.push.apply(out, _parasFromRich('Ответственный: ' + a.resp, {
            size: 17,
            bold: true,
            color: COLOR_MUTED,
            after: 20
        }));
    }
    return out;
}

function _agendaStatusParas(a) {
    const D = _lib();
    const done = !!a.isDone;
    const out = [
        new D.Paragraph({
            alignment: D.AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
                new D.TextRun({
                    text: done ? 'Решено' : 'В работе',
                    font: FONT,
                    bold: true,
                    size: 18,
                    color: done ? '166534' : '9a3412'
                })
            ]
        })
    ];
    if (a.date) {
        out.push(new D.Paragraph({
            alignment: D.AlignmentType.CENTER,
            children: [
                new D.TextRun({
                    text: _fmtDate(a.date),
                    font: FONT,
                    size: 16,
                    color: COLOR_MUTED
                })
            ]
        }));
    }
    return out;
}

async function _buildDocument(meet) {
    const D = _lib();
    const brand = _brandColor();
    const meetDate = _fmtDate(meet.date);
    const author = String(meet.author || _getSetting('engineerName') || 'Инженер');
    const project = _projectLabel(meet);
    const logo = await _resolveLogoImage();
    const children = [];

    // —— Шапка: логотип | реквизиты ——
    const headLeft = 2200;
    const headRight = CONTENT_W - headLeft;
    children.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA },
        columnWidths: [headLeft, headRight],
        rows: [
            new D.TableRow({
                children: [
                    _cell([_logoParagraph(logo)], headLeft, {
                        borders: _noBorder(),
                        valign: D.VerticalAlign.CENTER,
                        margins: { top: 0, bottom: 0, left: 0, right: 120 }
                    }),
                    _cell([
                        new D.Paragraph({
                            alignment: D.AlignmentType.RIGHT,
                            spacing: { after: 40 },
                            children: [
                                new D.TextRun({
                                    text: 'RBI PLATFORM',
                                    font: FONT,
                                    bold: true,
                                    size: 18,
                                    color: brand
                                })
                            ]
                        }),
                        new D.Paragraph({
                            alignment: D.AlignmentType.RIGHT,
                            spacing: { after: 20 },
                            children: [
                                new D.TextRun({
                                    text: 'Контроль качества строительства',
                                    font: FONT,
                                    size: 16,
                                    color: COLOR_MUTED
                                })
                            ]
                        }),
                        new D.Paragraph({
                            alignment: D.AlignmentType.RIGHT,
                            children: [
                                new D.TextRun({
                                    text: 'Документ сформирован: ' + new Date().toLocaleString('ru-RU'),
                                    font: FONT,
                                    size: 14,
                                    color: '64748b'
                                })
                            ]
                        })
                    ], headRight, {
                        borders: _noBorder(),
                        valign: D.VerticalAlign.CENTER,
                        margins: { top: 0, bottom: 0, left: 80, right: 0 }
                    })
                ]
            })
        ]
    }));

    // accent line under letterhead
    children.push(new D.Paragraph({
        spacing: { before: 120, after: 280 },
        border: {
            bottom: { style: D.BorderStyle.SINGLE, size: 24, color: brand, space: 1 }
        },
        children: []
    }));

    // —— Заголовок ——
    children.push(new D.Paragraph({
        alignment: D.AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
            new D.TextRun({
                text: 'ПРОТОКОЛ СОВЕЩАНИЯ',
                font: FONT,
                bold: true,
                size: 36,
                color: COLOR_INK
            })
        ]
    }));
    children.push(new D.Paragraph({
        alignment: D.AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [
            new D.TextRun({
                text: 'по вопросам качества строительно-монтажных работ',
                font: FONT,
                italics: true,
                size: 20,
                color: COLOR_MUTED
            })
        ]
    }));

    // —— Реквизиты ——
    const metaCol = Math.floor(CONTENT_W / 2);
    children.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA },
        columnWidths: [metaCol, CONTENT_W - metaCol],
        rows: [
            new D.TableRow({
                children: [
                    _cell([
                        _labelValueRow('Дата', meetDate),
                        _labelValueRow('Объект', project)
                    ], metaCol, {
                        borders: _thinBorder(COLOR_LINE),
                        shading: 'f8fafc',
                        margins: { top: 100, bottom: 100, left: 120, right: 120 }
                    }),
                    _cell([
                        _labelValueRow('Составил', author),
                        _labelValueRow('Статус', 'Официальный протокол')
                    ], CONTENT_W - metaCol, {
                        borders: _thinBorder(COLOR_LINE),
                        shading: 'f8fafc',
                        margins: { top: 100, bottom: 100, left: 120, right: 120 }
                    })
                ]
            })
        ]
    }));

    // —— 1. Итоговое решение ——
    children.push(_heading('1. Итоговое решение', { before: 320, after: 140 }));
    children.push.apply(children, _parasFromRich(
        meet.memoText || 'Текст итогового решения отсутствует.',
        { size: 22, after: 160, line: 300 }
    ));

    // —— 2. Доп. тезисы ——
    if (meet.notes && String(meet.notes).trim()) {
        children.push(_heading('2. Дополнительные тезисы', { before: 200, after: 140 }));
        children.push.apply(children, _parasFromRich(meet.notes, { size: 20, after: 160, line: 276 }));
    }

    // —— Повестка ——
    const agendaNum = (meet.notes && String(meet.notes).trim()) ? '3' : '2';
    children.push(_heading(agendaNum + '. Повестка и принятые решения', { before: 200, after: 140 }));

    const col1 = 3400;
    const col2 = 4200;
    const col3 = CONTENT_W - col1 - col2;
    const headerOpts = { size: 16, bold: true, color: 'FFFFFF', after: 0 };
    const headerRow = new D.TableRow({
        tableHeader: true,
        children: [
            _cell(_parasFromRich('Подрядчик и проблема', headerOpts), col1, {
                shading: brand,
                borders: _thinBorder(brand)
            }),
            _cell(_parasFromRich('Решение и ответственный', headerOpts), col2, {
                shading: brand,
                borders: _thinBorder(brand)
            }),
            _cell([
                new D.Paragraph({
                    alignment: D.AlignmentType.CENTER,
                    children: [
                        new D.TextRun({
                            text: 'Статус / срок',
                            font: FONT,
                            bold: true,
                            size: 16,
                            color: 'FFFFFF'
                        })
                    ]
                })
            ], col3, {
                shading: brand,
                borders: _thinBorder(brand),
                valign: D.VerticalAlign.CENTER
            })
        ]
    });

    const agenda = Array.isArray(meet.agenda) ? meet.agenda : [];
    const bodyRows = agenda.length
        ? agenda.map(function (a, i) {
            const shade = i % 2 === 0 ? 'ffffff' : 'f8fafc';
            return new D.TableRow({
                children: [
                    _cell(_agendaDefectParas(a), col1, { shading: shade }),
                    _cell(_agendaDecisionParas(a), col2, { shading: shade }),
                    _cell(_agendaStatusParas(a), col3, {
                        shading: shade,
                        valign: D.VerticalAlign.CENTER
                    })
                ]
            });
        })
        : [
            new D.TableRow({
                children: [
                    _cell(_parasFromRich('Повестка не заполнена', {
                        size: 18,
                        color: '64748b',
                        align: D.AlignmentType.CENTER,
                        after: 0
                    }), col1, { shading: 'ffffff' }),
                    _cell([new D.Paragraph({ children: [] })], col2, { shading: 'ffffff' }),
                    _cell([new D.Paragraph({ children: [] })], col3, { shading: 'ffffff' })
                ]
            })
        ];

    children.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA },
        columnWidths: [col1, col2, col3],
        rows: [headerRow].concat(bodyRows)
    }));

    // —— Подписи: слева должность/ФИО ответственных, справа поле для подписи ——
    children.push(_heading('Подписи', { before: 320, after: 160 }));

    const sigLeftW = Math.floor(CONTENT_W * 0.55);
    const sigRightW = CONTENT_W - sigLeftW;
    const signatories = collectMeetingSignatories(meet);
    children.push(new D.Table({
        width: { size: CONTENT_W, type: D.WidthType.DXA },
        columnWidths: [sigLeftW, sigRightW],
        rows: signatories.map(function (s) {
            return new D.TableRow({
                children: [
                    _cell([
                        new D.Paragraph({
                            spacing: { after: 30 },
                            children: [
                                new D.TextRun({
                                    text: s.role,
                                    font: FONT,
                                    bold: true,
                                    size: 15,
                                    color: COLOR_MUTED,
                                    allCaps: true
                                })
                            ]
                        }),
                        new D.Paragraph({
                            children: [
                                new D.TextRun({
                                    text: s.name,
                                    font: FONT,
                                    bold: true,
                                    size: 21,
                                    color: COLOR_INK
                                })
                            ]
                        })
                    ], sigLeftW, {
                        borders: _noBorder(),
                        margins: { top: 160, bottom: 160, left: 0, right: 260 }
                    }),
                    _cell([
                        new D.Paragraph({
                            spacing: { after: 40 },
                            border: {
                                bottom: { style: D.BorderStyle.SINGLE, size: 6, color: COLOR_INK }
                            },
                            children: [new D.TextRun({ text: ' ', font: FONT, size: 18 })]
                        }),
                        new D.Paragraph({
                            alignment: D.AlignmentType.CENTER,
                            children: [
                                new D.TextRun({
                                    text: 'подпись',
                                    font: FONT,
                                    size: 15,
                                    color: '94a3b8'
                                })
                            ]
                        })
                    ], sigRightW, {
                        borders: _noBorder(),
                        margins: { top: 160, bottom: 160, left: 0, right: 0 }
                    })
                ]
            });
        })
    }));

    return new D.Document({
        sections: [{
            properties: {
                page: {
                    size: { width: PAGE_W, height: 16838 },
                    margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
                }
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
 * Собрать и скачать официальный .docx протокола по id.
 * @param {string} id
 */
export async function exportMeetingDocx(id) {
    const D = _lib();
    if (!D || typeof D.Document !== 'function' || !D.Packer || typeof D.Packer.toBlob !== 'function') {
        _toast(_t('quality.meetings.docx.toast.lib_missing', 'Библиотека Word (docx) не загружена'));
        return null;
    }
    const meet = _meetings().find(function (m) { return m && m.id === id; });
    if (!meet) {
        _toast(_t('quality.meetings.docx.toast.not_found', 'Протокол не найден'));
        return null;
    }

    _toast(_t('quality.meetings.docx.toast.building', 'Формируем официальный Word-протокол...'));
    try {
        const doc = await _buildDocument(meet);
        const blob = await D.Packer.toBlob(doc);
        const fileName = 'Протокол_' + _fileDate(meet.date) + '.docx';
        _downloadBlob(blob, fileName);
        _toast(_t('quality.meetings.docx.toast.saved', 'Word сохранён: {name}', { name: fileName }));
        return { blob: blob, fileName: fileName };
    } catch (err) {
        console.error('[docx-export]', err);
        _toast(_t('quality.meetings.docx.toast.error', 'Ошибка экспорта Word'));
        return null;
    }
}

root['exportMeetingDocx'] = exportMeetingDocx;
root['rbi_exportMeetingDocx'] = exportMeetingDocx;
