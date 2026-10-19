/**
 * meetings.protocol.js — сборщик повестки (AgendaItem[]) и HTML протокола.
 *
 * Чистые ES-экспорты (без window.*). Контракт AgendaItem — фундамент v3:
 * id, contr, kind, title, defect, details, count, sourceKey, isDone, date,
 * resp, comment, reopened, resolvedAt.
 *
 * Потребители: meetings.module.js (workspace), reports.actions.js (printMeeting).
 */

export const AGENDA_KIND = Object.freeze({
    B3: 'B3',
    B2: 'B2',
    SK: 'SK',
    CARRY: 'CARRY',
    REOPENED: 'REOPENED',
    MANUAL: 'MANUAL'
});

const TITLE_B3 = 'Крит. деф. (B3)';
const TITLE_B2 = 'Повторяющиеся нарушения';
const TITLE_SK = 'Просрочено в ПК СК';
const TITLE_CARRY = 'Долги с прошлых планерок';

function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Реальные переводы строк + «заэкранированные» \\n из JSON/sync. */
function _normalizeNewlines(raw) {
    let text = String(raw == null ? '' : raw);
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Двойное экранирование из облака/JSON: "\\n" как два символа
    text = text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    return text;
}

/**
 * callAI по умолчанию меняет ** на <b>. Если потом сделать только _esc(),
 * в просмотре мемо/протокола остаются буквальные теги &lt;b&gt;…&lt;/b&gt;.
 * Нормализуем HTML/markdown → читаемый plain (для textarea / карточек).
 */
export function meetingRichToPlain(raw) {
    let text = _normalizeNewlines(raw);
    text = text.replace(/^```[\w]*\n?/i, '').replace(/\n?```$/i, '');
    text = text.replace(/<\s*br\s*\/?\s*>/gi, '\n');
    text = text.replace(/<\s*\/\s*p\s*>/gi, '\n').replace(/<\s*p[^>]*>/gi, '');
    text = text.replace(/<\s*\/\s*li\s*>/gi, '\n').replace(/<\s*li[^>]*>/gi, '- ');
    text = text.replace(/<\s*\/\s*(ul|ol)\s*>/gi, '\n').replace(/<\s*(ul|ol)[^>]*>/gi, '\n');
    text = text.replace(/<\s*\/?\s*(div|span|h[1-6])[^>]*>/gi, '\n');
    text = text.replace(/<\s*\/?\s*(b|strong|i|em)\s*>/gi, '');
    text = text.replace(/<[^>]+>/g, '');
    text = text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/gi, "'");
    // на случай, если после decode снова всплыли теги
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
    text = text.replace(/\*\*(.+?)\*\*/g, '$1');
    text = text.replace(/__(.+?)__/g, '$1');
    text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return text;
}

/**
 * Safe HTML для просмотра/печати протокола: real &lt;b&gt;, списки, &lt;br&gt;.
 * Не путать с _esc(raw) — тот как раз показывает «тэги кода».
 */
export function meetingRichToSafeHtml(raw) {
    let text = _normalizeNewlines(raw).trim();
    if (!text) return '';
    text = text.replace(/^```[\w]*\n?/i, '').replace(/\n?```$/i, '').trim();

    text = text.replace(/<\s*br\s*\/?\s*>/gi, '\n');
    text = text.replace(/<\s*\/\s*p\s*>/gi, '\n').replace(/<\s*p[^>]*>/gi, '');
    text = text.replace(/<\s*\/\s*li\s*>/gi, '\n').replace(/<\s*li[^>]*>/gi, '• ');
    text = text.replace(/<\s*\/\s*(ul|ol)\s*>/gi, '\n').replace(/<\s*(ul|ol)[^>]*>/gi, '\n');
    text = text.replace(/<\s*\/?\s*(div|span|h[1-6])[^>]*>/gi, '\n');
    text = text.replace(/<\s*\/?\s*(b|strong)\s*>/gi, function (m) {
        return /^\<\s*\//i.test(m) ? '§/B§' : '§B§';
    });
    text = text.replace(/<\s*\/?\s*(i|em)\s*>/gi, '');
    text = text.replace(/<[^>]+>/g, '');
    text = text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/gi, "'");

    // После decode entities теги могут всплыть снова (&lt;b&gt; → <b>)
    text = text.replace(/<\s*\/?\s*(b|strong)\s*>/gi, function (m) {
        return /^\<\s*\//i.test(m) ? '§/B§' : '§B§';
    });
    text = text.replace(/<[^>]+>/g, '');

    text = text.replace(/\*\*\*(.+?)\*\*\*/g, '§B§$1§/B§');
    text = text.replace(/\*\*(.+?)\*\*/g, '§B§$1§/B§');
    text = text.replace(/__(.+?)__/g, '§B§$1§/B§');

    text = _esc(text);
    text = text
        .replace(/§B§([\s\S]+?)§\/B§/g, '<b>$1</b>')
        .replace(/§B§|§\/B§/g, '');
    text = text.replace(/\n/g, '<br>');
    return text;
}

function _normalizeName(name) {
    return String(name || '')
        .replace(/^\[Просрочено в СК\]\s*/i, '')
        .replace(/^\[Официальное предписание СК\]\s*/i, '')
        .replace(/^\[Просрочено в ПК СК\]\s*/i, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

/**
 * Ключ дедупа: contr|kind|normalizedName
 * @param {{contr?:string, kind?:string, title?:string, defect?:string, sourceKey?:string, name?:string}} item
 */
export function agendaItemSourceKey(item) {
    if (!item) return '';
    if (item.sourceKey) return item.sourceKey;
    const contr = String(item.contr || '').trim();
    const kind = String(item.kind || AGENDA_KIND.B2).trim() || AGENDA_KIND.B2;
    const raw = item.name || item.title || item.defect || '';
    return `${contr}|${kind}|${_normalizeName(raw)}`;
}

function _legacySourceKey(contr, defect) {
    const text = String(defect || '');
    let kind = AGENDA_KIND.B2;
    let name = text;
    if (/крит\.?\s*деф|критические аварии|^\s*b3/i.test(text) || text.includes('B3')) {
        kind = AGENDA_KIND.B3;
        name = text.split(':')[0] || TITLE_B3;
    } else if (/просрочено в (пк )?ск|открытые предписания|официальное предписание/i.test(text)) {
        kind = AGENDA_KIND.SK;
        name = text.replace(/^[^:]*:\s*/i, '').replace(/^•\s*/gm, '').trim() || text;
    } else if (/долг|прошлых планерок|carry/i.test(text)) {
        kind = AGENDA_KIND.CARRY;
        name = text.split(':')[0] || TITLE_CARRY;
    } else if (/повторяющ/i.test(text)) {
        kind = AGENDA_KIND.B2;
        name = text.split(':')[0] || TITLE_B2;
    }
    return agendaItemSourceKey({ contr, kind, name });
}

function _meetResolvedAt(meet) {
    return meet.updatedAt || meet.updated_at || meet.date || null;
}

function _baseKindFromItem(a) {
    if (!a) return AGENDA_KIND.B2;
    if (a.kind === AGENDA_KIND.B3 || a.kind === AGENDA_KIND.B2
        || a.kind === AGENDA_KIND.SK || a.kind === AGENDA_KIND.CARRY) {
        return a.kind;
    }
    const t = String(a.title || a.defect || '');
    if (/крит\.?\s*деф|b3/i.test(t)) return AGENDA_KIND.B3;
    if (/пк\s*ск|просрочено в/i.test(t)) return AGENDA_KIND.SK;
    if (/долг|прошлых/i.test(t)) return AGENDA_KIND.CARRY;
    return AGENDA_KIND.B2;
}

function _detailName(line) {
    return String(line || '').replace(/\s*\(×?\d+\s*раз\)\s*$/i, '').replace(/\s*\(×\d+\)\s*$/i, '').trim();
}

function _registryPut(registry, key, at) {
    if (!key || !at) return;
    const prev = registry.get(key);
    if (!prev || new Date(at) >= new Date(prev)) registry.set(key, at);
}

/**
 * Реестр решений: sourceKey → ISO resolvedAt (последний по времени).
 * Для групповых строк регистрирует и group-key, и каждый пункт details[].
 */
function _buildResolvedRegistry(pastMeetings) {
    const registry = new Map();
    (pastMeetings || []).forEach(meet => {
        if (!meet || !Array.isArray(meet.agenda)) return;
        const meetAt = _meetResolvedAt(meet);
        meet.agenda.forEach(a => {
            if (!a || !a.isDone) return;
            const at = a.resolvedAt || meetAt;
            const contr = a.contr || '';
            const baseKind = _baseKindFromItem(a);
            const groupKey = a.sourceKey || _legacySourceKey(contr, a.defect);
            _registryPut(registry, groupKey, at);

            let details = Array.isArray(a.details) ? a.details : [];
            if (!details.length && a.defect && String(a.defect).includes('•')) {
                details = _normalizeNewlines(a.defect).split('\n')
                    .map(l => l.replace(/^•\s*/, '').trim())
                    .filter(l => l && !/:$/.test(l) && l !== String(a.defect).split(':')[0]);
            }
            details.forEach(line => {
                const name = _detailName(line);
                if (!name) return;
                _registryPut(registry, agendaItemSourceKey({ contr, kind: baseKind, name }), at);
            });

            // одиночная SK/CARRY-строка без details
            if (!details.length && a.defect && baseKind === AGENDA_KIND.SK) {
                _registryPut(registry, agendaItemSourceKey({
                    contr, kind: AGENDA_KIND.SK, name: _detailName(a.defect)
                }), at);
            }
        });
    });
    return registry;
}

function _resolveTemplateFlat(inspection, templates, getFlatList) {
    if (!inspection || !inspection.templateKey || typeof getFlatList !== 'function') return [];
    const key = inspection.templateKey;
    const userKey = key.replace(/^user_/, '');
    const sysKey = key.replace(/^sys_/, '');
    const userT = templates && templates.getUserTemplates ? templates.getUserTemplates() : {};
    const sysT = templates && templates.getSystemTemplates ? templates.getSystemTemplates() : {};
    const groups = (userT[userKey] && userT[userKey].groups)
        || (sysT[sysKey] && sysT[sysKey].groups)
        || null;
    if (!groups) return [];
    return getFlatList(groups) || [];
}

function _defectLine(name, count) {
    const c = count > 1 ? ` (${count} раз)` : '';
    return `${name}${c}`;
}

function _groupDefectText(title, details) {
    if (!details || !details.length) return title;
    return title + ':\n• ' + details.join('\n• ');
}

function _makeId(prefix, idx) {
    return `${prefix}_${idx}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Чистая агрегация повестки.
 *
 * @param {object} input
 * @param {Array} input.inspections — отфильтрованные проверки
 * @param {Array} [input.skRecords]
 * @param {object} [input.skContractorMap]
 * @param {Array} [input.pastMeetings]
 * @param {object} [input.templates] — { getUserTemplates, getSystemTemplates }
 * @param {Function} [input.getFlatList]
 * @returns {Array} AgendaItem[]
 */
export function buildMeetingAgenda(input) {
    const inspections = (input && input.inspections) || [];
    const skRecords = (input && input.skRecords) || [];
    const skContractorMap = (input && input.skContractorMap) || {};
    const pastMeetings = (input && input.pastMeetings) || [];
    const templates = (input && input.templates) || {};
    const getFlatList = input && input.getFlatList;

    const selectedContrs = new Set(
        inspections.map(c => c.contractorName).filter(Boolean)
    );
    const resolved = _buildResolvedRegistry(pastMeetings);

    // --- B3/B2: сырые дефекты по подрядчику ---
    // Map: contr → Map(sourceKey → { name, count, isB3, maxDate, dates })
    const byContr = {};

    inspections.forEach(c => {
        const cName = c.contractorName;
        if (!cName || !c.state || !c.templateKey) return;
        const flat = _resolveTemplateFlat(c, templates, getFlatList);
        const inspDate = c.date || c.createdAt || '';

        Object.keys(c.state).forEach(id => {
            const st = c.state[id];
            if (st !== 'fail' && st !== 'fail_escalated') return;
            const item = flat.find(x => String(x.id) === String(id));
            if (!item) return;
            const isB3 = st === 'fail_escalated' || item.w === 3;
            const kind = isB3 ? AGENDA_KIND.B3 : AGENDA_KIND.B2;
            const key = agendaItemSourceKey({ contr: cName, kind, name: item.n });
            if (!byContr[cName]) byContr[cName] = new Map();
            const prev = byContr[cName].get(key);
            if (prev) {
                prev.count += 1;
                if (inspDate && (!prev.maxDate || new Date(inspDate) > new Date(prev.maxDate))) {
                    prev.maxDate = inspDate;
                }
            } else {
                byContr[cName].set(key, {
                    name: item.n,
                    count: 1,
                    isB3,
                    kind,
                    sourceKey: key,
                    maxDate: inspDate || ''
                });
            }
        });
    });

    const agenda = [];
    let idx = 0;

    const pushGroup = (contr, kind, title, defs, reopenedFlag) => {
        if (!defs.length) return;
        const details = defs
            .sort((a, b) => b.count - a.count)
            .map(d => _defectLine(d.name, d.count));
        const totalCount = defs.reduce((s, d) => s + d.count, 0);
        // sourceKey группы — по виду; дедуп reopen уже на уровне отдельных дефектов
        const groupKey = agendaItemSourceKey({ contr, kind, name: title });
        agenda.push({
            id: _makeId('ag', idx++),
            contr,
            kind: reopenedFlag ? AGENDA_KIND.REOPENED : kind,
            title,
            defect: _groupDefectText(title, details),
            details,
            count: totalCount,
            sourceKey: groupKey,
            isDone: false,
            date: '',
            resp: '',
            comment: '',
            reopened: !!reopenedFlag,
            resolvedAt: null
        });
    };

    Object.keys(byContr).sort().forEach(cName => {
        const b3 = [];
        const b2 = [];
        const b3Re = [];
        const b2Re = [];

        byContr[cName].forEach(def => {
            const resolvedAt = resolved.get(def.sourceKey);
            if (resolvedAt) {
                const maxD = def.maxDate ? new Date(def.maxDate) : null;
                const resD = new Date(resolvedAt);
                if (maxD && maxD > resD) {
                    // появился повторно после решения
                    if (def.isB3) b3Re.push(def);
                    else b2Re.push(def);
                    return;
                }
                // решён и нет новых проверок — не тянем
                return;
            }
            if (def.isB3) b3.push(def);
            else b2.push(def);
        });

        pushGroup(cName, AGENDA_KIND.B3, TITLE_B3, b3, false);
        pushGroup(cName, AGENDA_KIND.B3, TITLE_B3, b3Re, true);
        pushGroup(cName, AGENDA_KIND.B2, TITLE_B2, b2, false);
        pushGroup(cName, AGENDA_KIND.B2, TITLE_B2, b2Re, true);
    });

    // --- СК: просроченные → подрядчик → категория → уникальные тексты (×N) ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Map: contr → Map(category → Map(textKey → { text, count, date, reopened, sourceKey }))
    const skTree = new Map();

    const _skCategory = (r) => {
        const raw = (r.category_corrected && r.ai_category)
            ? r.ai_category
            : (r.category || r.ai_category || '');
        const c = String(raw || '').trim();
        if (!c || /^\d+$/.test(c)) return 'Без категории';
        return c;
    };

    const _skDetailLine = (it) => {
        const meta = [];
        if (it.count > 1) meta.push(`×${it.count}`);
        if (it.reopened) meta.push('↻ повторно');
        return meta.length ? `${it.text} · ${meta.join(' · ')}` : it.text;
    };

    skRecords.forEach(r => {
        const isOpen = r.status && String(r.status).toLowerCase().includes('не устран');
        if (!isOpen || !r.contractor) return;
        let targetContr = r.contractor;
        if (skContractorMap[r.contractor]) targetContr = skContractorMap[r.contractor];
        if (selectedContrs.size && !selectedContrs.has(targetContr)) return;

        if (!r.deadline) return;
        const deadlineDate = new Date(r.deadline);
        if (!(deadlineDate < today)) return;

        const text = (r.text && String(r.text).trim()) || 'Замечание без текста';
        const category = _skCategory(r);
        const key = agendaItemSourceKey({ contr: targetContr, kind: AGENDA_KIND.SK, name: text });
        const reopened = !!resolved.get(key);
        const dl = String(r.deadline).split('T')[0];

        if (!skTree.has(targetContr)) skTree.set(targetContr, new Map());
        const byCat = skTree.get(targetContr);
        if (!byCat.has(category)) byCat.set(category, new Map());
        const catMap = byCat.get(category);
        const prev = catMap.get(key);
        if (prev) {
            prev.count += 1;
            if (dl && (!prev.date || new Date(dl) < new Date(prev.date))) prev.date = dl;
            if (reopened) prev.reopened = true;
        } else {
            catMap.set(key, { text, count: 1, date: dl, sourceKey: key, reopened });
        }
    });

    const freshKeys = new Set(agenda.map(a => a.sourceKey));
    skTree.forEach((byCat, contr) => {
        const categories = Array.from(byCat.keys()).sort((a, b) => a.localeCompare(b, 'ru'));
        categories.forEach(category => {
            const items = Array.from(byCat.get(category).values()).sort((a, b) => b.count - a.count);
            if (!items.length) return;

            const details = items.map(_skDetailLine);
            let earliest = '';
            items.forEach(it => {
                if (it.date && (!earliest || new Date(it.date) < new Date(earliest))) {
                    earliest = it.date;
                }
            });
            const totalCount = items.reduce((s, it) => s + it.count, 0);
            const uniqueCount = items.length;
            const repeatCount = totalCount - uniqueCount;
            const anyReopened = items.some(it => it.reopened);

            // заголовок: категория + общее число замечаний (+ уник./повтор.)
            const zWord = (() => {
                const abs = Math.abs(totalCount) % 100;
                const d = abs % 10;
                if (abs > 10 && abs < 20) return 'замечаний';
                if (d === 1) return 'замечание';
                if (d >= 2 && d <= 4) return 'замечания';
                return 'замечаний';
            })();
            let stats = `${totalCount} ${zWord}`;
            if (uniqueCount !== totalCount) {
                stats += `, ${uniqueCount} уник.`;
                if (repeatCount > 0) stats += `, ${repeatCount} повтор.`;
            }
            const title = `${category} (${stats})`;
            const groupKey = agendaItemSourceKey({
                contr, kind: AGENDA_KIND.SK, name: `${TITLE_SK}|${category}`
            });

            freshKeys.add(groupKey);
            items.forEach(it => freshKeys.add(it.sourceKey));

            agenda.push({
                id: _makeId('ag', idx++),
                contr,
                kind: AGENDA_KIND.SK,
                title,
                defect: _groupDefectText(`Просрочено в ПК СК · ${title}`, details),
                details,
                count: totalCount,
                sourceKey: groupKey,
                isDone: false,
                date: earliest || '',
                resp: '',
                comment: '',
                reopened: anyReopened,
                resolvedAt: null
            });
        });
    });

    // --- Carry: нерешённые из прошлых протоколов ---
    const _inferOriginKind = (a) => {
        if (a.originKind && a.originKind !== AGENDA_KIND.CARRY) return a.originKind;
        if (a.kind && a.kind !== AGENDA_KIND.CARRY && a.kind !== AGENDA_KIND.REOPENED) return a.kind;
        const keyKind = String(a.sourceKey || '').split('|')[1] || '';
        if (keyKind === AGENDA_KIND.B3 || keyKind === AGENDA_KIND.B2 || keyKind === AGENDA_KIND.SK) return keyKind;
        const t = String(a.title || a.defect || '');
        if (/крит\.?\s*деф|^\s*b3\b/i.test(t)) return AGENDA_KIND.B3;
        if (/повторяющ|^\s*b2\b/i.test(t)) return AGENDA_KIND.B2;
        if (/пк\s*ск|просрочено в/i.test(t)) return AGENDA_KIND.SK;
        return AGENDA_KIND.CARRY;
    };

    const _detailsFromAgendaItem = (a) => {
        if (Array.isArray(a.details) && a.details.length) return a.details.slice();
        const defect = String(a.defect || '');
        if (!defect) return [];
        if (defect.includes('•')) {
            return _normalizeNewlines(defect).split('\n')
                .map(l => l.replace(/^[\s]*[•●\-]\s*/, '').trim())
                .filter(l => l && !/:$/.test(l)
                    && !/^(крит\.?\s*деф|повторяющ|просрочено|долг|пк\s*ск)/i.test(l));
        }
        // однострочный legacy — одна detail-карточка
        return [defect];
    };

    const carrySeen = new Set();
    pastMeetings.forEach(meet => {
        if (!meet || !Array.isArray(meet.agenda)) return;
        meet.agenda.forEach(a => {
            if (!a || a.isDone) return;
            const contr = a.contr || '';
            if (selectedContrs.size && contr && !selectedContrs.has(contr)) return;
            const key = a.sourceKey || _legacySourceKey(contr, a.defect);
            if (!key || freshKeys.has(key) || carrySeen.has(key)) return;
            carrySeen.add(key);
            const originKind = _inferOriginKind(a);
            const details = _detailsFromAgendaItem(a);
            let carryCount = parseInt(a.count, 10) || 0;
            if (!carryCount && details.length) {
                carryCount = details.reduce((s, d) => {
                    const m = String(d).match(/×(\d+)/);
                    return s + (m ? (parseInt(m[1], 10) || 1) : 1);
                }, 0);
            }
            if (!carryCount) carryCount = details.length || 1;
            agenda.push({
                id: _makeId('ag', idx++),
                contr,
                kind: AGENDA_KIND.CARRY,
                originKind,
                title: a.title || TITLE_CARRY,
                defect: a.defect || '',
                details,
                count: carryCount,
                sourceKey: key,
                isDone: false,
                date: a.date || '',
                resp: a.resp || '',
                comment: a.comment || '',
                reopened: false,
                resolvedAt: null
            });
        });
    });

    // стабильный порядок: подрядчик → kind weight
    const kindOrder = { B3: 0, REOPENED: 1, B2: 2, SK: 3, CARRY: 4 };
    agenda.sort((a, b) => {
        const c = String(a.contr).localeCompare(String(b.contr), 'ru');
        if (c !== 0) return c;
        return (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9);
    });

    return agenda;
}

/**
 * HTML тела протокола (без оболочки printPdfShell).
 * Асинхронный из‑за PhotoManager для qDayPhoto.
 *
 * @param {object} meet
 * @returns {Promise<string>}
 */
export async function buildMeetingProtocolHtml(meet) {
    if (!meet) return '';

    let photoHtml = '';
    if (meet.qDayPhoto) {
        let realSrc = '';
        try {
            if (typeof PhotoManager !== 'undefined' && PhotoManager.getAsyncUrl) {
                realSrc = await PhotoManager.getAsyncUrl(meet.qDayPhoto);
            }
        } catch (_) { /* ignore */ }
        const photoSrcFn = (typeof globalThis !== 'undefined' && globalThis.getPhotoSrc) || null;
        if (!realSrc && typeof photoSrcFn === 'function') {
            realSrc = photoSrcFn(meet.qDayPhoto);
        }
        if (realSrc) {
            photoHtml = `
                <div style="height: 250px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 20px;">
                    <img src="${_esc(realSrc)}" style="max-width: 100%; max-height: 100%; height: auto; width: auto; display: block; margin: 0 auto;">
                </div>
            `;
        }
    }

    let agendaHtml = '';
    if (meet.agenda && meet.agenda.length > 0) {
        agendaHtml = meet.agenda.map((a, i) => {
            const reopenBadge = a.reopened || a.kind === AGENDA_KIND.REOPENED
                ? `<div style="font-size: 9px; color: #b45309; font-weight: bold; margin-top: 4px;">↻ Появился повторно после решения</div>`
                : '';
            let defectHtml;
            if (Array.isArray(a.details) && a.details.length > 0) {
                const title = meetingRichToSafeHtml(a.title || '');
                const lis = a.details.map(d => `<li style="margin: 2px 0;">${meetingRichToSafeHtml(d)}</li>`).join('');
                defectHtml = `${title ? `<div style="font-weight: 900; margin-bottom: 4px;">${title}</div>` : ''}
                        <ul style="margin: 0; padding-left: 18px; font-size: 11px; color: #b91c1c; font-weight: 600; line-height: 1.45;">${lis}</ul>`;
            } else {
                defectHtml = `<div style="font-size: 11px; color: #b91c1c; font-weight: bold;">${meetingRichToSafeHtml(a.defect || '')}</div>`;
            }
            return `
                <tr style="border-bottom: 1px solid #e2e8f0; background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'}; page-break-inside: avoid;">
                    <td style="padding: 10px; border-right: 1px solid #e2e8f0; vertical-align: top; width: 35%;">
                        <div style="font-size: 11px; font-weight: 900; color: #0f172a; margin-bottom: 4px;">${_esc(a.contr)}</div>
                        ${defectHtml}
                        ${reopenBadge}
                    </td>
                    <td style="padding: 10px; border-right: 1px solid #e2e8f0; vertical-align: top; width: 45%;">
                        <div style="font-size: 11px; color: #334155; margin-bottom: 4px;">${meetingRichToSafeHtml(a.comment || 'Решение не зафиксировано')}</div>
                        ${a.resp ? `<div style="font-size: 9px; color: #64748b; font-weight: bold;">Отв: ${_esc(a.resp)}</div>` : ''}
                    </td>
                    <td style="padding: 10px; vertical-align: top; width: 20%; text-align: center;">
                        <div style="background: ${a.isDone ? '#dcfce7' : '#ffedd5'}; color: ${a.isDone ? '#166534' : '#9a3412'}; padding: 4px 6px; border-radius: 4px; font-weight: bold; font-size: 10px; border: 1px solid ${a.isDone ? '#bbf7d0' : '#fed7aa'}; display: inline-block; margin-bottom: 4px;">${a.isDone ? 'Решено' : 'В работе'}</div>
                        ${a.date ? `<div style="font-size: 9px; color: #475569; font-weight: bold;">Срок: ${new Date(a.date).toLocaleDateString('ru-RU')}</div>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    const signatories = collectMeetingSignatories(meet);
    const signRowsHtml = signatories.map(s => `
                    <tr>
                        <td style="width: 55%; padding: 12px 16px 12px 0; vertical-align: bottom;">
                            <div style="font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; font-weight: 700;">${_esc(s.role)}</div>
                            <div style="font-size: 12px; color: #0f172a; font-weight: 700; margin-top: 2px;">${_esc(s.name)}</div>
                        </td>
                        <td style="width: 45%; padding: 12px 0; vertical-align: bottom;">
                            <div style="border-bottom: 1px solid #0f172a; height: 22px;"></div>
                            <div style="font-size: 9px; color: #94a3b8; margin-top: 4px; text-align: center;">подпись</div>
                        </td>
                    </tr>`).join('');

    const meetDate = (function (raw) {
        const s = String(raw || '').trim();
        const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return m[3] + '.' + m[2] + '.' + m[1];
        if (!raw) return '';
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('ru-RU');
    })(meet.date);
    const author = _esc(meet.author || '');

    return `
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="font-size: 22px; text-transform: uppercase; color: #0f172a; margin: 0; font-weight:900; letter-spacing: 1px;">ПРОТОКОЛ СОВЕЩАНИЯ</h1>
                <div style="font-size: 12px; color: #4f46e5; font-weight: bold; margin-top: 5px;">ДАТА: ${meetDate} | АВТОР: ${author}</div>
            </div>

            ${photoHtml}

            <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 15px; border-radius: 8px; margin-bottom: 20px; page-break-inside: avoid;">
                <h3 style="margin-top: 0; font-size: 13px; text-transform: uppercase; color: #16a34a; border-bottom: 2px solid #bbf7d0; padding-bottom: 6px; margin-bottom: 10px;">✅ ИТОГОВОЕ РЕШЕНИЕ (МЕМО)</h3>
                <div style="font-size: 12px; line-height: 1.6; color: #1e293b; font-weight: 500;">${meetingRichToSafeHtml(meet.memoText || 'Текст протокола отсутствует.')}</div>
            </div>

            ${meet.notes ? `
            <div style="background: #fffbeb; border: 1px solid #fde047; padding: 15px; border-radius: 8px; margin-bottom: 20px; page-break-inside: avoid;">
                <h3 style="margin-top: 0; font-size: 13px; text-transform: uppercase; color: #b45309; border-bottom: 2px solid #fef08a; padding-bottom: 6px; margin-bottom: 10px;">📌 Дополнительные тезисы</h3>
                <div style="font-size: 11px; line-height: 1.5; color: #713f12;">${meetingRichToSafeHtml(meet.notes)}</div>
            </div>` : ''}

            <h3 style="font-size: 14px; text-transform: uppercase; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 15px;">📋 Детальная повестка и разбор дефектов</h3>
            
            <table style="width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #cbd5e1;">
                <thead style="background: #e2e8f0; text-transform: uppercase; font-size: 10px; color: #475569;">
                    <tr>
                        <th style="padding: 10px; border-right: 1px solid #cbd5e1; text-align: left;">Подрядчик и Проблема</th>
                        <th style="padding: 10px; border-right: 1px solid #cbd5e1; text-align: left;">Решение и Ответственный</th>
                        <th style="padding: 10px; text-align: center;">Статус и Срок</th>
                    </tr>
                </thead>
                <tbody>
                    ${agendaHtml || `<tr><td colspan="3" style="text-align: center; padding: 15px; font-size: 11px; color: #64748b;">Повестка не заполнена</td></tr>`}
                </tbody>
            </table>

            <div style="margin-top: 40px; page-break-inside: avoid;">
                <h3 style="font-size: 13px; text-transform: uppercase; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 14px;">Подписи</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    ${signRowsHtml}
                </table>
            </div>
        `;
}

/**
 * Список подписантов протокола: автор («Составил») + участники совещания,
 * введённые в конструкторе (meet.participants — {role, name}[]). Если явный
 * список участников не заполнен (старые протоколы) — fallback на уникальных
 * ответственных из повестки («Ответственный»), как раньше.
 * Общий источник для Word- и PDF/печатной верстки подписей
 * (слева должность/ФИО, справа поле для подписи).
 * @param {object} meet
 * @returns {Array<{role: string, name: string}>}
 */
export function collectMeetingSignatories(meet) {
    const author = String((meet && meet.author) || '').trim();
    const seen = new Set();
    const list = [];
    if (author) {
        list.push({ role: 'Составил', name: author });
        seen.add(author.toLowerCase());
    }
    const participants = Array.isArray(meet && meet.participants) ? meet.participants : [];
    participants.forEach(p => {
        const name = String((p && p.name) || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        list.push({ role: String((p && p.role) || '').trim() || 'Участник', name });
    });
    if (!participants.length) {
        const agenda = Array.isArray(meet && meet.agenda) ? meet.agenda : [];
        agenda.forEach(a => {
            const resp = String((a && a.resp) || '').trim();
            if (!resp) return;
            const key = resp.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            list.push({ role: 'Ответственный', name: resp });
        });
    }
    if (!list.length) list.push({ role: 'Участник', name: '—' });
    return list;
}

/** Собрать участников совещания (должность + ФИО) с DOM конструктора/редактора. */
export function collectParticipantsFromDom(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope) return [];
    const rows = scope.querySelectorAll('.meeting-participant-row');
    const out = [];
    rows.forEach(row => {
        const role = (row.querySelector('.mp-role')?.value || '').trim();
        const name = (row.querySelector('.mp-name')?.value || '').trim();
        if (!role && !name) return;
        out.push({ role, name });
    });
    return out;
}

/** Собрать AgendaItem[] с DOM workspace (включая meta-поля v2). */
export function collectAgendaFromDom(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope) return [];
    const rows = scope.querySelectorAll('.meeting-agenda-row');
    const out = [];
    rows.forEach(row => {
        const contr = row.querySelector('.agenda-meta-contr')?.value || '';
        const defect = row.querySelector('.agenda-meta-defect')?.value || '';
        const kind = row.querySelector('.agenda-meta-kind')?.value || AGENDA_KIND.B2;
        const sourceKey = row.querySelector('.agenda-meta-source-key')?.value
            || agendaItemSourceKey({ contr, kind, defect });
        let details = [];
        try {
            const raw = row.querySelector('.agenda-meta-details')?.value;
            if (raw) details = JSON.parse(raw);
        } catch (_) { details = []; }
        const count = parseInt(row.querySelector('.agenda-meta-count')?.value || '1', 10) || 1;
        const reopened = row.querySelector('.agenda-meta-reopened')?.value === '1';
        const id = row.querySelector('.agenda-meta-id')?.value || _makeId('ag', out.length);
        const title = row.querySelector('.agenda-meta-title')?.value || '';
        const originKind = row.querySelector('.agenda-meta-origin-kind')?.value || '';
        const isDone = !!row.querySelector('.agenda-done-cb')?.checked;
        const date = row.querySelector('.agenda-date')?.value || '';
        const resp = (row.querySelector('.agenda-resp')?.value || '').trim();
        const comment = (row.querySelector('.agenda-comment')?.value || '').trim();
        out.push({
            id,
            contr,
            kind: reopened && kind !== AGENDA_KIND.REOPENED ? kind : kind,
            originKind: originKind || undefined,
            title,
            defect,
            details,
            count,
            sourceKey,
            isDone,
            date,
            resp,
            comment,
            reopened,
            resolvedAt: isDone ? (new Date().toISOString()) : null
        });
    });
    return out;
}

/** Черновик meet-подобного объекта из workspace DOM (без записи в IDB). */
export function collectMeetingDraftFromDom(opts) {
    const o = opts || {};
    const memoEl = typeof document !== 'undefined' ? document.getElementById('rbi-meeting-memo-text') : null;
    const notesEl = typeof document !== 'undefined' ? document.getElementById('rbi-meeting-notes') : null;
    const photoBox = typeof document !== 'undefined' ? document.getElementById('meeting-photo-preview') : null;
    const authorEl = typeof document !== 'undefined' ? document.getElementById('inp-inspector') : null;
    return {
        id: o.id || 'draft_preview',
        date: o.date || new Date().toISOString(),
        author: (authorEl && authorEl.value.trim()) || o.author || 'Инженер',
        title: o.title || `Совещание (черновик)`,
        memoText: (memoEl && memoEl.value) || o.memoText || '',
        agenda: collectAgendaFromDom(),
        participants: collectParticipantsFromDom(
            typeof document !== 'undefined' ? document.getElementById('meeting-participants-list') : null
        ),
        notes: (notesEl && notesEl.value.trim()) || '',
        qDayPhoto: (photoBox && photoBox.dataset && photoBox.dataset.photo) || null
    };
}
