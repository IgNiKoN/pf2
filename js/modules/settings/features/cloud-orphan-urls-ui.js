/**
 * cloud-orphan-urls-ui.js
 * Админ: скан живых записей на битые Storage URL
 * (облако + локальный IndexedDB: FMEA / история / встречи / …)
 * → превью → обнуление выбранных ссылок. Blob не удаляем (его нет).
 */
function _t(key, fallback, vars) {
    try {
        var i18n = window.RBI && window.RBI.services && window.RBI.services.i18n;
        if (i18n && typeof i18n.t === 'function') {
            var s = i18n.t(key, vars);
            if (s && s !== key) return s;
        }
    } catch (_e) { /* ignore */ }
    if (vars && typeof fallback === 'string') {
        return fallback.replace(/\{(\w+)\}/g, function (_, name) {
            return vars[name] != null ? String(vars[name]) : '{' + name + '}';
        });
    }
    return fallback;
}

const PAGE_SIZE = 200;
const URL_MARKER = '/storage/v1/object/public/';
const PROBE_CONCURRENCY = 6;

let _delegationBound = false;
let _busy = false;
/** @type {null | { hits: object[], scanned: number, dead: number }} */
let _preview = null;

function _perm() {
    return (window.RBI && window.RBI.services && window.RBI.services.permissions) || null;
}

function _isAdmin() {
    const p = _perm();
    return !!(p && p.isAdmin && p.isAdmin());
}

function _cloudReady() {
    return !!(window.supabaseClient && window.syncConfig && window.syncConfig.enabled);
}

function _toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg);
}

function _escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _idleStatusHtml() {
    return '<div class="text-[10px] text-[var(--text-muted)]">' +
        _escapeHtml(_t('settings.admin.orphan.not_checked', 'Ещё не проверялось.')) + '</div>';
}

function _collectUrlPaths(value, path, out) {
    if (value == null) return;
    if (typeof value === 'string') {
        const s = value.trim();
        if (s.startsWith('http') && s.includes(URL_MARKER)) {
            out.push({ path: path || '$', url: s });
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((v, i) => _collectUrlPaths(v, path + '[' + i + ']', out));
        return;
    }
    if (typeof value === 'object') {
        Object.keys(value).forEach((k) => {
            if (k === 'template_data') return;
            _collectUrlPaths(value[k], path ? path + '.' + k : k, out);
        });
    }
}

function _stripUrlDeep(value, deadUrl) {
    if (value == null) return value;
    if (typeof value === 'string') {
        return value === deadUrl ? '' : value;
    }
    if (Array.isArray(value)) {
        return value
            .map((v) => _stripUrlDeep(v, deadUrl))
            .filter((v) => !(v === '' || v == null));
    }
    if (typeof value === 'object') {
        const out = Array.isArray(value) ? [] : {};
        Object.keys(value).forEach((k) => {
            out[k] = _stripUrlDeep(value[k], deadUrl);
        });
        return out;
    }
    return value;
}

async function _fetchAllLive(tableName, scoped) {
    const client = window.supabaseClient;
    const rows = [];
    let from = 0;
    while (true) {
        let q = client.from(tableName).select('*').eq('is_deleted', false).range(from, from + PAGE_SIZE - 1);
        if (scoped) q = q.eq('project_code', String(window.syncConfig?.projectCode || '').trim() || 'LOCAL');
        const { data, error } = await q;
        if (error) throw new Error(tableName + ': ' + (error.message || error.code || 'error'));
        const batch = Array.isArray(data) ? data : [];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return rows;
}

async function _urlExists(url) {
    try {
        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (!res.ok) return false;
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) {
            const t = await res.text();
            if (t.includes('Object not found') || t.includes('"statusCode":"404"') || t.includes('"statusCode":404')) {
                return false;
            }
            if (t.length < 200 && t.includes('not_found')) return false;
            return true;
        }
        await res.arrayBuffer();
        return true;
    } catch (_e) {
        return false;
    }
}

async function _mapPool(items, limit, fn) {
    const out = new Array(items.length);
    let i = 0;
    async function worker() {
        while (i < items.length) {
            const idx = i++;
            out[idx] = await fn(items[idx], idx);
        }
    }
    const n = Math.min(limit, Math.max(1, items.length));
    await Promise.all(Array.from({ length: n }, () => worker()));
    return out;
}

function _ownerOf(row) {
    if (!row || typeof row !== 'object') return '';
    const d = row.data && typeof row.data === 'object' ? row.data : {};
    return String(
        row.owner || row.engineer_name || row.inspector_name || row.created_by_name ||
        d.owner || d.author || d.engineerName || ''
    ).trim();
}

/** Таблицы облака, где часто лежат Storage URL (раньше сканер их пропускал — FMEA и т.п.). */
const EXTRA_CLOUD_TABLES = [
    { name: 'project_fmea', kind: 'fmea', scoped: true },
    { name: 'project_meetings', kind: 'meeting', scoped: true },
    { name: 'project_interventions', kind: 'intervention', scoped: true },
    { name: 'construction_defects', kind: 'const_defect', scoped: true },
    { name: 'shared_etalons', kind: 'etalon', scoped: false },
    { name: 'shared_twi_cards', kind: 'twi', scoped: false }
];

function _pushFound(candidates, found, meta) {
    found.forEach((f) => {
        candidates.push({
            kind: meta.kind,
            table: meta.table,
            id: String(meta.id),
            owner: meta.owner || '',
            path: f.path,
            url: f.url,
            scoped: !!meta.scoped,
            source: meta.source || 'cloud'
        });
    });
}

async function _collectLocalCandidates(candidates) {
    const counts = { fmea: 0, history: 0, meetings: 0, interventions: 0, tasks: 0, etalon: 0, defects: 0 };
    if (typeof dbGetAll !== 'function' || typeof STORES === 'undefined') return counts;

    async function walkStore(storeKey, kind, pick) {
        let rows = [];
        try {
            rows = (await dbGetAll(storeKey)) || [];
        } catch (_e) {
            return 0;
        }
        let n = 0;
        rows.forEach((row) => {
            if (!row || row._deleted || row.is_deleted) return;
            const found = [];
            const target = pick ? pick(row) : row;
            _collectUrlPaths(target, '', found);
            if (!found.length) return;
            n += 1;
            _pushFound(candidates, found, {
                kind: 'local_' + kind,
                table: 'local:' + storeKey,
                id: row.id,
                owner: _ownerOf(row) || String(row.author || row.engineerName || ''),
                scoped: false,
                source: 'local'
            });
        });
        return n;
    }

    counts.fmea = await walkStore(STORES.FMEA, 'fmea');
    counts.history = await walkStore(STORES.HISTORY, 'inspection', (row) => ({
        photos: row.photos,
        inspection_data: row.inspection_data || row.data
    }));
    counts.meetings = await walkStore(STORES.MEETINGS, 'meeting');
    counts.interventions = await walkStore(STORES.INTERVENTIONS, 'intervention');
    counts.tasks = await walkStore(STORES.TASKS, 'task', (row) => ({
        completionPhoto: row.completionPhoto,
        photo: row.photo
    }));
    counts.etalon = await walkStore(STORES.ETALON_ACTS, 'etalon');
    if (STORES.CONST_DEFECTS) {
        counts.defects = await walkStore(STORES.CONST_DEFECTS, 'const_defect', (row) => ({
            photo: row.photo,
            photos: row.photos
        }));
    }
    return counts;
}

async function scanOrphanUrls() {
    if (!_cloudReady()) throw new Error(_t('settings.admin.orphan.need_cloud', 'Облако не подключено'));

    const candidates = [];

    const practices = await _fetchAllLive('shared_practices', false);
    practices.forEach((row) => {
        const found = [];
        _collectUrlPaths(row, '', found);
        _pushFound(candidates, found, {
            kind: 'practice', table: 'shared_practices', id: row.id, owner: _ownerOf(row), scoped: false
        });
    });

    const docs = await _fetchAllLive('shared_docs', false);
    docs.forEach((row) => {
        const found = [];
        _collectUrlPaths(row, '', found);
        _pushFound(candidates, found, {
            kind: 'doc', table: 'shared_docs', id: row.id, owner: _ownerOf(row), scoped: false
        });
    });

    const inspections = await _fetchAllLive('rbi_inspections', true);
    inspections.forEach((row) => {
        const found = [];
        _collectUrlPaths(row.photos, 'photos', found);
        _collectUrlPaths(row.inspection_data, 'inspection_data', found);
        _pushFound(candidates, found, {
            kind: 'inspection', table: 'rbi_inspections', id: row.id, owner: _ownerOf(row), scoped: true
        });
    });

    // Отдельная таблица фото
    const photoRows = [];
    {
        const client = window.supabaseClient;
        let from = 0;
        const pCode = String(window.syncConfig?.projectCode || '').trim() || 'LOCAL';
        while (true) {
            const { data, error } = await client
                .from('rbi_inspection_photos')
                .select('id,inspection_id,public_url,item_id,is_deleted,project_code')
                .eq('is_deleted', false)
                .eq('project_code', pCode)
                .range(from, from + PAGE_SIZE - 1);
            if (error) throw new Error('rbi_inspection_photos: ' + (error.message || error.code));
            const batch = Array.isArray(data) ? data : [];
            photoRows.push(...batch);
            if (batch.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
        }
    }
    photoRows.forEach((row) => {
        const url = String(row.public_url || '').trim();
        if (!url.startsWith('http') || !url.includes(URL_MARKER)) return;
        candidates.push({
            kind: 'inspection_photo',
            table: 'rbi_inspection_photos',
            id: String(row.id),
            owner: String(row.inspection_id || ''),
            path: 'public_url',
            url,
            scoped: true,
            inspection_id: row.inspection_id,
            source: 'cloud'
        });
    });

    const extraCounts = {};
    for (const spec of EXTRA_CLOUD_TABLES) {
        let rows = [];
        try {
            rows = await _fetchAllLive(spec.name, spec.scoped);
        } catch (e) {
            console.warn('[orphan-urls] skip table', spec.name, e && e.message);
            extraCounts[spec.kind] = 'skip';
            continue;
        }
        extraCounts[spec.kind] = rows.length;
        rows.forEach((row) => {
            const found = [];
            _collectUrlPaths(row, '', found);
            _pushFound(candidates, found, {
                kind: spec.kind,
                table: spec.name,
                id: row.id,
                owner: _ownerOf(row),
                scoped: spec.scoped
            });
        });
    }

    const localCounts = await _collectLocalCandidates(candidates);

    // unique by url+table+id+path
    const seen = new Set();
    const uniq = [];
    candidates.forEach((c) => {
        const key = c.table + '|' + c.id + '|' + c.path + '|' + c.url;
        if (seen.has(key)) return;
        seen.add(key);
        uniq.push(c);
    });

    const results = await _mapPool(uniq, PROBE_CONCURRENCY, async (c) => {
        const ok = await _urlExists(c.url);
        return ok ? null : c;
    });

    const hits = results.filter(Boolean);
    return {
        hits,
        scanned: uniq.length,
        dead: hits.length,
        practices: practices.length,
        docs: docs.length,
        inspections: inspections.length,
        photoRows: photoRows.length,
        extraCounts,
        localCounts
    };
}

async function clearOrphanHits(hits) {
    const client = window.supabaseClient;
    let cleared = 0;
    let errors = 0;

    // Group by table+id so we strip all selected URLs for a row in one update
    const byRow = new Map();
    (hits || []).forEach((h) => {
        const key = h.table + '::' + h.id;
        if (!byRow.has(key)) byRow.set(key, { table: h.table, id: h.id, urls: [], source: h.source });
        byRow.get(key).urls.push(h.url);
    });

    for (const group of byRow.values()) {
        try {
            if (String(group.table).startsWith('local:')) {
                const storeName = String(group.table).slice('local:'.length);
                if (typeof dbGet !== 'function' || typeof dbPut !== 'function') {
                    throw new Error('IndexedDB API недоступен');
                }
                const row = await dbGet(storeName, group.id);
                if (!row) throw new Error('local row not found ' + group.id);
                let next = JSON.parse(JSON.stringify(row));
                group.urls.forEach((url) => {
                    next = _stripUrlDeep(next, url);
                });
                next.updatedAt = new Date().toISOString();
                next.updated_at = next.updatedAt;
                next.source = 'local';
                next.syncStatus = 'not_synced';
                next.sync_status = 'not_synced';
                await dbPut(storeName, next);
                // обновить in-memory зеркала
                if (storeName === (STORES && STORES.FMEA) && Array.isArray(window.rbi_fmeaData)) {
                    const ix = window.rbi_fmeaData.findIndex((x) => String(x && x.id) === String(group.id));
                    if (ix >= 0) window.rbi_fmeaData[ix] = next;
                }
                localStorage.setItem('rbi_cloud_dirty', '1');
                if (window.RBI && window.RBI.services && window.RBI.services.sync && typeof window.RBI.services.sync.trigger === 'function') {
                    window.RBI.services.sync.trigger('silent');
                } else if (typeof triggerSync === 'function') {
                    triggerSync('silent');
                }
                cleared += group.urls.length;
                continue;
            }

            if (group.table === 'rbi_inspection_photos') {
                for (const url of group.urls) {
                    const { error } = await client
                        .from('rbi_inspection_photos')
                        .update({
                            public_url: '',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', group.id)
                        .eq('public_url', url);
                    if (error) throw error;
                    cleared++;
                }
                continue;
            }

            const { data: rows, error: fetchErr } = await client
                .from(group.table)
                .select('*')
                .eq('id', group.id)
                .limit(1);
            if (fetchErr) throw fetchErr;
            const row = rows && rows[0];
            if (!row) throw new Error('row not found ' + group.id);

            let next = JSON.parse(JSON.stringify(row));
            group.urls.forEach((url) => {
                next = _stripUrlDeep(next, url);
            });

            // Preserve identity / audit columns; push mutable payload
            const patch = { updated_at: new Date().toISOString() };
            if (Object.prototype.hasOwnProperty.call(row, 'data')) patch.data = next.data;
            if (Object.prototype.hasOwnProperty.call(row, 'photos')) patch.photos = next.photos;
            if (Object.prototype.hasOwnProperty.call(row, 'inspection_data')) {
                patch.inspection_data = next.inspection_data;
            }
            // flat URL columns if any were stripped at top level
            ['photo', 'photoBefore', 'photoAfter', 'pdfData', 'file_url', 'public_url', 'pdf_url'].forEach((k) => {
                if (Object.prototype.hasOwnProperty.call(row, k)) patch[k] = next[k];
            });

            const { error: upErr } = await client.from(group.table).update(patch).eq('id', group.id);
            if (upErr) throw upErr;
            cleared += group.urls.length;
        } catch (e) {
            console.error('[orphan-urls] clear', group, e);
            errors++;
        }
    }

    return { cleared, errors };
}

function _setBusy(on) {
    _busy = !!on;
    ['cloud-orphan-urls-scan', 'cloud-orphan-urls-clear'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = !!on || (id === 'cloud-orphan-urls-clear' && !(_preview && _preview.hits && _preview.hits.length));
    });
}

function _setStatus(html) {
    const el = document.getElementById('cloud-orphan-urls-status');
    if (el) el.innerHTML = html;
}

function _renderPreview(preview) {
    if (!preview) return _idleStatusHtml();
    const hits = preview.hits || [];
    const rows = hits.slice(0, 80).map((h, idx) => {
        const tail = String(h.url || '').split('/').slice(-2).join('/');
        return `<label class="flex gap-2 items-start text-[10px] border-b border-[var(--card-border)] py-1.5">
            <input type="checkbox" class="mt-0.5" data-orphan-idx="${idx}" checked />
            <span class="min-w-0">
                <span class="font-bold uppercase text-amber-700 dark:text-amber-300">${_escapeHtml(h.kind)}</span>
                · ${_escapeHtml(h.id)}
                ${h.owner ? ' · ' + _escapeHtml(h.owner) : ''}
                <div class="text-[var(--text-muted)] truncate" title="${_escapeHtml(h.url)}">${_escapeHtml(tail)}</div>
                <div class="text-[9px] text-[var(--text-muted)]">${_escapeHtml(h.path)}</div>
            </span>
        </label>`;
    }).join('');

    const more = hits.length > 80
        ? `<div class="text-[10px] text-[var(--text-muted)]">… +${hits.length - 80}</div>`
        : '';

    return `
        <div class="space-y-2 text-[11px]">
            <div class="font-bold">${_escapeHtml(_t('settings.admin.orphan.summary',
                'Проверено URL: {scanned}, битых: {dead}',
                { scanned: preview.scanned, dead: preview.dead }))}</div>
            <div class="text-[10px] text-[var(--text-muted)]">
                ${_escapeHtml(_t('settings.admin.orphan.counts',
                    'Практик: {p}, доков: {d}, проверок: {i}, photo-rows: {ph}; FMEA(cloud/local): {fc}/{fl}',
                    {
                        p: preview.practices,
                        d: preview.docs,
                        i: preview.inspections,
                        ph: preview.photoRows,
                        fc: (preview.extraCounts && preview.extraCounts.fmea) || 0,
                        fl: (preview.localCounts && preview.localCounts.fmea) || 0
                    }))}
            </div>
            <div class="max-h-64 overflow-y-auto rounded-xl border border-[var(--card-border)] px-2">
                ${rows || '<div class="py-2 text-[var(--text-muted)]">' + _escapeHtml(_t('settings.admin.orphan.none', 'Битых ссылок не найдено.')) + '</div>'}
                ${more}
            </div>
        </div>
    `;
}

async function _onScan() {
    if (_busy) return;
    if (!_isAdmin()) return _toast(_t('settings.admin.orphan.admin_only', '⛔ Только администратор'));
    if (!_cloudReady()) return _toast(_t('settings.admin.orphan.need_cloud', 'Облако не подключено'));

    _setBusy(true);
    _setStatus('<div class="text-[10px] text-amber-700 font-bold">' +
        _escapeHtml(_t('settings.admin.orphan.scanning', 'Сканирование…')) + '</div>');
    try {
        _preview = await scanOrphanUrls();
        _setStatus(_renderPreview(_preview));
        const clearBtn = document.getElementById('cloud-orphan-urls-clear');
        if (clearBtn) clearBtn.disabled = !(_preview.hits && _preview.hits.length);
        _toast(_t('settings.admin.orphan.scan_done', 'Битых: {n}', { n: _preview.dead }));
    } catch (e) {
        console.error('[orphan-urls] scan', e);
        _setStatus('<div class="text-[10px] text-rose-600">' +
            _escapeHtml(_t('settings.admin.orphan.error_prefix', 'Ошибка: {msg}', { msg: e.message || e })) +
            '</div>');
        _toast(_t('settings.admin.orphan.scan_error', '❌ Ошибка скана'));
    } finally {
        _setBusy(false);
    }
}

async function _onClear() {
    if (_busy) return;
    if (!_isAdmin()) return _toast(_t('settings.admin.orphan.admin_only', '⛔ Только администратор'));
    if (!_preview || !(_preview.hits && _preview.hits.length)) {
        return _toast(_t('settings.admin.orphan.need_scan', 'Сначала нажмите «Проверить»'));
    }

    const root = document.getElementById('cloud-orphan-urls-status');
    const checked = root
        ? Array.from(root.querySelectorAll('input[data-orphan-idx]:checked'))
        : [];
    const selected = checked
        .map((el) => _preview.hits[Number(el.getAttribute('data-orphan-idx'))])
        .filter(Boolean);

    if (!selected.length) return _toast(_t('settings.admin.orphan.none_selected', 'Ничего не выбрано'));

    const ok = confirm(_t('settings.admin.orphan.confirm',
        'Обнулить выбранные битые ссылки в ОБЛАКЕ?\n\nЗаписей/URL: {n}\nФайлы в Storage не трогаем (их уже нет).\nЗаписи практик/доков/проверок остаются.',
        { n: selected.length }));
    if (!ok) return;

    _setBusy(true);
    _setStatus('<div class="text-[10px] text-amber-700 font-bold">' +
        _escapeHtml(_t('settings.admin.orphan.clearing', 'Очистка ссылок…')) + '</div>');
    try {
        const result = await clearOrphanHits(selected);
        _toast(_t('settings.admin.orphan.cleared', '✅ Обнулено: {n} (ошибок: {e})', {
            n: result.cleared,
            e: result.errors
        }));
        // Re-scan
        _preview = await scanOrphanUrls();
        _setStatus(_renderPreview(_preview));
        const clearBtn = document.getElementById('cloud-orphan-urls-clear');
        if (clearBtn) clearBtn.disabled = !(_preview.hits && _preview.hits.length);
    } catch (e) {
        console.error('[orphan-urls] clear', e);
        _setStatus('<div class="text-[10px] text-rose-600">' +
            _escapeHtml(_t('settings.admin.orphan.error_prefix', 'Ошибка: {msg}', { msg: e.message || e })) +
            '</div>');
        _toast(_t('settings.admin.orphan.clear_error', '❌ Ошибка очистки'));
    } finally {
        _setBusy(false);
    }
}

function _bindDelegation() {
    if (_delegationBound) return;
    _delegationBound = true;
    document.addEventListener('click', (e) => {
        const t = e.target && e.target.closest
            ? e.target.closest('[data-orphan-urls-action]')
            : null;
        if (!t) return;
        const act = t.getAttribute('data-orphan-urls-action');
        if (act === 'scan') _onScan();
        if (act === 'clear') _onClear();
    });
}

export function mountCloudOrphanUrlsUI() {
    const root = document.getElementById('cloud-orphan-urls-root');
    if (!root) return;

    const section = document.getElementById('cloud-orphan-urls-section');
    if (!_isAdmin()) {
        if (section) section.classList.add('hidden');
        root.innerHTML = '';
        return;
    }
    if (section) section.classList.remove('hidden');

    _bindDelegation();

    const keep = _preview ? _renderPreview(_preview) : _idleStatusHtml();
    const canClear = !!( _preview && _preview.hits && _preview.hits.length );

    root.innerHTML = `
        <div class="space-y-3 p-4">
            <p class="text-[10px] text-[var(--text-muted)] leading-snug">
                ${_escapeHtml(_t('settings.admin.orphan.intro',
                    'Ищет у живых записей ссылки на Storage, которых уже нет в бакете: практики, доки, проверки, FMEA, встречи, эталоны, TWI + локальный IndexedDB. Можно обнулить выбранные URL — сами записи не удаляются.'))}
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button id="cloud-orphan-urls-scan" type="button"
                    class="w-full px-3 py-2.5 rounded-xl text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 active:scale-95"
                    data-orphan-urls-action="scan">
                    ${_escapeHtml(_t('settings.admin.orphan.scan_btn', 'Проверить битые'))}
                </button>
                <button id="cloud-orphan-urls-clear" type="button"
                    class="w-full px-3 py-2.5 rounded-xl text-[10px] font-black uppercase bg-amber-600 text-white shadow-sm active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    data-orphan-urls-action="clear"
                    ${canClear ? '' : 'disabled'}>
                    ${_escapeHtml(_t('settings.admin.orphan.clear_btn', 'Обнулить выбранные'))}
                </button>
            </div>
            <div id="cloud-orphan-urls-status" class="min-h-[2rem]">${keep}</div>
        </div>
    `;
}

export const CloudOrphanUrlsUI = { mount: mountCloudOrphanUrlsUI };
