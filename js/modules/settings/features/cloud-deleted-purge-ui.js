/**
 * cloud-deleted-purge-ui.js
 * Админ: сканирование soft-deleted в облаке → превью размера → hard-delete
 * строк + файлов в Storage. Живые (is_deleted=false) не трогает.
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

const PAGE_SIZE = 500;
const REMOVE_BATCH = 80;
const DELETE_BATCH = 100;
const URL_MARKER = '/storage/v1/object/public/';

/** Таблицы с is_deleted (project_code где scoped). Без несуществующих в API (tasks, location_plans). */
const PURGE_TABLES = [
    { name: 'rbi_inspections', scoped: true },
    { name: 'shared_reports', scoped: true },
    { name: 'shared_report_snapshots', scoped: false },
    { name: 'construction_defects', scoped: true },
    { name: 'construction_objects', scoped: true },
    { name: 'construction_buildings', scoped: true },
    { name: 'construction_floors', scoped: true },
    { name: 'construction_floors_v2', scoped: false },
    { name: 'construction_units', scoped: true },
    { name: 'construction_acceptance', scoped: true },
    { name: 'shared_twi_cards', scoped: false },
    { name: 'shared_nodes', scoped: false },
    { name: 'shared_docs', scoped: false },
    { name: 'shared_checklists', scoped: false },
    { name: 'shared_practices', scoped: false },
    { name: 'shared_etalons', scoped: false },
    { name: 'shared_feedback', scoped: false },
    { name: 'shared_report_templates', scoped: false },
    { name: 'project_meetings', scoped: true },
    { name: 'project_interventions', scoped: true },
    { name: 'project_fmea', scoped: true },
    { name: 'project_schedule_stages', scoped: true },
    { name: 'sk_data_bundles', scoped: true },
    { name: 'sk_records', scoped: true },
    { name: 'project_objects', scoped: false },
    { name: 'object_aliases', scoped: false },
    { name: 'app_assistant_kb', scoped: false }
];

const KNOWN_BUCKETS = [
    'inspection-photos',
    'reports',
    'construction-defects',
    'construction-plans',
    'custom-assets',
    'library-twi',
    'library-nodes',
    'library-docs',
    'library-checklists',
    'library-practices',
    'library-etalons'
];

let _delegationBound = false;
let _busy = false;
/** @type {null | object} */
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

function _projectCode() {
    return String(window.syncConfig?.projectCode || '').trim() || 'LOCAL';
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

function _formatBytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return _t('settings.admin.purge.bytes_b', '{n} Б', { n: v });
    if (v < 1024 * 1024) return _t('settings.admin.purge.bytes_kb', '{n} КБ', { n: (v / 1024).toFixed(1) });
    if (v < 1024 * 1024 * 1024) return _t('settings.admin.purge.bytes_mb', '{n} МБ', { n: (v / (1024 * 1024)).toFixed(1) });
    return _t('settings.admin.purge.bytes_gb', '{n} ГБ', { n: (v / (1024 * 1024 * 1024)).toFixed(2) });
}

function _idleStatusHtml() {
    return '<div class="text-[10px] text-[var(--text-muted)]">' + _escapeHtml(_t('settings.admin.purge.not_checked', 'Ещё не проверялось.')) + '</div>';
}

function _pathFromUrl(url, bucketHint) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;
    if (typeof window.getStoragePathFromPublicUrl === 'function' && bucketHint) {
        const p = window.getStoragePathFromPublicUrl(url, bucketHint);
        if (p) return { bucket: bucketHint, path: p, public_url: url };
    }
    const idx = url.indexOf(URL_MARKER);
    if (idx === -1) return null;
    const rest = url.slice(idx + URL_MARKER.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) return null;
    const bucket = rest.slice(0, slash);
    try {
        return {
            bucket,
            path: decodeURIComponent(rest.slice(slash + 1)),
            public_url: url
        };
    } catch (_e) {
        return { bucket, path: rest.slice(slash + 1), public_url: url };
    }
}

function _refKey(bucket, path) {
    return String(bucket || '') + '::' + String(path || '');
}

function _collectUrlsFromValue(value, out) {
    if (value == null) return;
    if (typeof value === 'string') {
        const s = value.trim();
        if (!s) return;
        if (s.startsWith('http') && s.includes(URL_MARKER)) {
            out.push(s);
            return;
        }
        if ((s.startsWith('[') || s.startsWith('{')) && s.includes('http')) {
            try {
                _collectUrlsFromValue(JSON.parse(s), out);
            } catch (_e) { /* ignore */ }
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((v) => _collectUrlsFromValue(v, out));
        return;
    }
    if (typeof value === 'object') {
        Object.values(value).forEach((v) => _collectUrlsFromValue(v, out));
    }
}

function _extractRefsFromRow(row, defaultBucket) {
    const map = new Map();
    const add = (ref, sizeHint) => {
        if (!ref || !ref.bucket || !ref.path) return;
        const key = _refKey(ref.bucket, ref.path);
        const prev = map.get(key) || {
            bucket: ref.bucket,
            path: ref.path,
            public_url: ref.public_url || '',
            size_bytes: 0,
            size_known: false
        };
        if (ref.public_url) prev.public_url = ref.public_url;
        const sz = Number(sizeHint) || 0;
        if (sz > 0) {
            prev.size_bytes = Math.max(prev.size_bytes, sz);
            prev.size_known = true;
        }
        map.set(key, prev);
    };

    if (!row || typeof row !== 'object') return map;

    const bucketHint = String(row.bucket_name || row.bucket || defaultBucket || '').trim();
    const storagePath = String(row.storage_path || row.storagePath || '').trim();
    if (storagePath && bucketHint) {
        add({
            bucket: bucketHint,
            path: storagePath,
            public_url: row.public_url || row.file_url || ''
        }, row.size_bytes || row.file_size || row.pdf_size);
    }

    const urls = [];
    _collectUrlsFromValue(row, urls);
    urls.forEach((url) => {
        let ref = null;
        if (bucketHint) ref = _pathFromUrl(url, bucketHint);
        if (!ref) {
            for (let i = 0; i < KNOWN_BUCKETS.length; i++) {
                ref = _pathFromUrl(url, KNOWN_BUCKETS[i]);
                if (ref) break;
            }
        }
        if (!ref) ref = _pathFromUrl(url, '');
        if (ref) add(ref, row.size_bytes || row.file_size || row.pdf_size);
    });

    return map;
}

async function _fetchDeletedPage(table, scoped, from) {
    const client = window.supabaseClient;
    let q = client.from(table.name).select('*').eq('is_deleted', true).range(from, from + PAGE_SIZE - 1);
    if (scoped && table.scoped) {
        q = q.eq('project_code', _projectCode());
    }
    return q;
}

async function _fetchAllDeleted(table) {
    const rows = [];
    let from = 0;
    let skipped = false;
    let skipReason = '';

    while (true) {
        const { data, error } = await _fetchDeletedPage(table, true, from);
        if (error) {
            skipped = true;
            skipReason = error.message || String(error.code || 'error');
            break;
        }
        const batch = Array.isArray(data) ? data : [];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return { rows, skipped, skipReason };
}

async function _fetchPhotosForInspectionIds(ids) {
    const client = window.supabaseClient;
    const out = [];
    const uniq = Array.from(new Set((ids || []).map(String).filter(Boolean)));
    for (let i = 0; i < uniq.length; i += 40) {
        const chunk = uniq.slice(i, i + 40);
        const { data, error } = await client
            .from('rbi_inspection_photos')
            .select('id,inspection_id,public_url,storage_path,bucket_name')
            .in('inspection_id', chunk);
        if (error) {
            console.warn('[cloud-purge] photos by inspection:', error.message);
            continue;
        }
        if (Array.isArray(data)) out.push(...data);
    }
    return out;
}

function _estimateFileBytes(ref) {
    const p = String((ref && (ref.path || ref.public_url)) || '').toLowerCase();
    if (p.endsWith('.pdf')) return 350 * 1024;
    if (/\.(jpe?g|png|webp|gif)$/.test(p)) return 220 * 1024;
    return 160 * 1024;
}

/** Размеры из локального FILE_REGISTRY — без гигантских GET в облако. */
async function _enrichSizesFromLocalRegistry(refsMap) {
    const stores = (typeof window.STORES !== 'undefined' && window.STORES)
        || (typeof STORES !== 'undefined' ? STORES : null);
    const storeName = stores && stores.FILE_REGISTRY;
    if (!storeName || typeof window.dbGetAll !== 'function') return;

    let rows = [];
    try {
        rows = await window.dbGetAll(storeName) || [];
    } catch (_e) {
        return;
    }

    const byUrl = new Map();
    const byKey = new Map();
    rows.forEach((r) => {
        if (!r) return;
        const url = r.public_url || r.publicUrl || '';
        const bucket = r.bucket || '';
        const path = r.storage_path || r.storagePath || '';
        if (url) byUrl.set(url, r);
        if (bucket && path) byKey.set(_refKey(bucket, path), r);
    });

    refsMap.forEach((ref) => {
        if (ref.size_known && ref.size_bytes > 0) return;
        const hit = byKey.get(_refKey(ref.bucket, ref.path))
            || (ref.public_url ? byUrl.get(ref.public_url) : null);
        if (!hit) return;
        const sz = Number(hit.size_bytes || hit.sizeBytes || hit.file_size || 0) || 0;
        if (sz > 0) {
            ref.size_bytes = sz;
            ref.size_known = true;
            ref.size_estimated = false;
        }
    });
}

function _applySizeEstimates(refsMap) {
    refsMap.forEach((ref) => {
        if (ref.size_known && ref.size_bytes > 0) return;
        ref.size_bytes = _estimateFileBytes(ref);
        ref.size_known = false;
        ref.size_estimated = true;
    });
}

async function scanCloudDeleted() {
    if (!_cloudReady()) throw new Error(_t('settings.admin.purge.cloud_offline', 'Облако не подключено'));

    const tableStats = {};
    const refsMap = new Map();
    const rowIdsByTable = {};
    const cascadePhotoIds = [];
    const cascadeItemInspectionIds = [];
    const skippedTables = [];

    for (const table of PURGE_TABLES) {
        const { rows, skipped, skipReason } = await _fetchAllDeleted(table);
        if (skipped) {
            skippedTables.push({ name: table.name, reason: skipReason });
            continue;
        }
        if (!rows.length) {
            tableStats[table.name] = 0;
            continue;
        }
        tableStats[table.name] = rows.length;
        rowIdsByTable[table.name] = rows.map((r) => r.id).filter(Boolean);

        const defaultBucket = table.name === 'shared_reports'
            ? 'reports'
            : (table.name === 'construction_defects'
                ? 'construction-defects'
                : (table.name === 'construction_floors' || table.name === 'construction_floors_v2'
                    ? 'construction-plans'
                    : ''));

        rows.forEach((row) => {
            _extractRefsFromRow(row, defaultBucket).forEach((ref, key) => {
                const prev = refsMap.get(key);
                if (!prev) {
                    refsMap.set(key, ref);
                    return;
                }
                if (ref.size_bytes > prev.size_bytes) prev.size_bytes = ref.size_bytes;
                if (ref.size_known) prev.size_known = true;
                if (ref.public_url && !prev.public_url) prev.public_url = ref.public_url;
            });
        });

        if (table.name === 'rbi_inspections') {
            cascadeItemInspectionIds.push(...rowIdsByTable[table.name]);
        }
    }

    if (cascadeItemInspectionIds.length) {
        const photos = await _fetchPhotosForInspectionIds(cascadeItemInspectionIds);
        photos.forEach((row) => {
            if (row && row.id) cascadePhotoIds.push(row.id);
            _extractRefsFromRow(row, 'inspection-photos').forEach((ref, key) => {
                if (!refsMap.has(key)) refsMap.set(key, ref);
            });
        });
    }

    await _enrichSizesFromLocalRegistry(refsMap);
    _applySizeEstimates(refsMap);

    const files = Array.from(refsMap.values());
    let sizeKnown = 0;
    let sizeEstimated = 0;
    let knownBytes = 0;
    let estimatedBytes = 0;
    const byBucket = {};
    files.forEach((f) => {
        byBucket[f.bucket] = (byBucket[f.bucket] || 0) + 1;
        const sz = Number(f.size_bytes) || 0;
        estimatedBytes += sz;
        if (f.size_known && sz > 0) {
            sizeKnown += 1;
            knownBytes += sz;
        } else {
            sizeEstimated += 1;
        }
    });

    const totalRows = Object.values(tableStats).reduce((a, b) => a + b, 0);

    return {
        projectCode: _projectCode(),
        scannedAt: new Date().toISOString(),
        tableStats,
        totalRows,
        files,
        byBucket,
        knownBytes,
        estimatedBytes,
        sizeKnown,
        sizeEstimated,
        sizeUnknown: sizeEstimated,
        rowIdsByTable,
        cascadePhotoIds: Array.from(new Set(cascadePhotoIds)),
        cascadeItemInspectionIds: Array.from(new Set(cascadeItemInspectionIds)),
        skippedTables
    };
}

async function _removeStorageBatch(bucket, paths) {
    const client = window.supabaseClient;
    let removed = 0;
    let errors = 0;
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
        const chunk = paths.slice(i, i + REMOVE_BATCH);
        const { error } = await client.storage.from(bucket).remove(chunk);
        if (error) {
            errors += chunk.length;
            console.warn('[cloud-purge] storage.remove', bucket, error.message);
        } else {
            removed += chunk.length;
        }
    }
    return { removed, errors };
}

async function _deleteIds(table, ids) {
    const client = window.supabaseClient;
    let deleted = 0;
    let errors = 0;
    const list = (ids || []).filter(Boolean);
    for (let i = 0; i < list.length; i += DELETE_BATCH) {
        const chunk = list.slice(i, i + DELETE_BATCH);
        const { error, count } = await client.from(table).delete({ count: 'exact' }).in('id', chunk);
        if (error) {
            errors += chunk.length;
            console.warn('[cloud-purge] delete', table, error.message);
        } else {
            deleted += (typeof count === 'number' ? count : chunk.length);
        }
    }
    return { deleted, errors };
}

async function _deleteByInspectionIds(table, inspectionIds) {
    const client = window.supabaseClient;
    let deleted = 0;
    let errors = 0;
    const list = (inspectionIds || []).filter(Boolean);
    for (let i = 0; i < list.length; i += 40) {
        const chunk = list.slice(i, i + 40);
        const { error, count } = await client.from(table).delete({ count: 'exact' }).in('inspection_id', chunk);
        if (error) {
            errors += 1;
            console.warn('[cloud-purge] delete by inspection', table, error.message);
        } else {
            deleted += (typeof count === 'number' ? count : 0);
        }
    }
    return { deleted, errors };
}

async function _deleteRegistryRefs(files) {
    const client = window.supabaseClient;
    let deleted = 0;
    for (let i = 0; i < files.length; i += 1) {
        const f = files[i];
        if (!f.bucket || !f.path) continue;
        const { error } = await client
            .from('file_registry')
            .delete()
            .eq('bucket', f.bucket)
            .eq('storage_path', f.path);
        if (!error) deleted += 1;
    }
    return deleted;
}

async function purgeCloudDeleted(preview) {
    if (!_cloudReady()) throw new Error(_t('settings.admin.purge.cloud_offline', 'Облако не подключено'));
    if (!preview) throw new Error(_t('settings.admin.purge.need_scan', 'Сначала выполните проверку'));

    const result = {
        storageRemoved: 0,
        storageErrors: 0,
        rowsDeleted: 0,
        rowErrors: 0,
        registryDeleted: 0,
        cascadePhotos: 0,
        cascadeItems: 0
    };

    const byBucket = {};
    (preview.files || []).forEach((f) => {
        if (!byBucket[f.bucket]) byBucket[f.bucket] = [];
        byBucket[f.bucket].push(f.path);
    });
    for (const bucket of Object.keys(byBucket)) {
        const uniq = Array.from(new Set(byBucket[bucket]));
        const r = await _removeStorageBatch(bucket, uniq);
        result.storageRemoved += r.removed;
        result.storageErrors += r.errors;
    }

    try {
        result.registryDeleted = await _deleteRegistryRefs(preview.files || []);
    } catch (e) {
        console.warn('[cloud-purge] file_registry:', e);
    }

    if (preview.cascadeItemInspectionIds && preview.cascadeItemInspectionIds.length) {
        const photos = await _deleteByInspectionIds('rbi_inspection_photos', preview.cascadeItemInspectionIds);
        result.cascadePhotos = photos.deleted;
        result.rowErrors += photos.errors;
        const items = await _deleteByInspectionIds('rbi_inspection_items', preview.cascadeItemInspectionIds);
        result.cascadeItems = items.deleted;
        result.rowErrors += items.errors;
    }

    const order = Object.keys(preview.rowIdsByTable || {}).sort((a, b) => {
        if (a === 'rbi_inspections') return 1;
        if (b === 'rbi_inspections') return -1;
        return a.localeCompare(b);
    });
    for (const table of order) {
        const ids = preview.rowIdsByTable[table] || [];
        if (!ids.length) continue;
        const r = await _deleteIds(table, ids);
        result.rowsDeleted += r.deleted;
        result.rowErrors += r.errors;
    }

    return result;
}

function _setStatus(html) {
    const el = document.getElementById('cloud-deleted-purge-status');
    if (el) el.innerHTML = html;
}

function _setBusy(busy) {
    _busy = !!busy;
    ['cloud-deleted-purge-scan', 'cloud-deleted-purge-run'].forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = _busy;
    });
}

function _renderPreview(preview) {
    if (!preview) {
        return _idleStatusHtml();
    }
    const tableRows = Object.keys(preview.tableStats || {})
        .filter((k) => preview.tableStats[k] > 0)
        .sort()
        .map((k) => `<div class="flex justify-between gap-2 text-[10px] py-0.5 border-b border-[var(--card-border)]/50 last:border-0">
            <span class="font-mono">${_escapeHtml(k)}</span>
            <span class="font-bold">${preview.tableStats[k]}</span>
        </div>`)
        .join('');

    const bucketRows = Object.keys(preview.byBucket || {})
        .sort()
        .map((k) => `<div class="flex justify-between gap-2 text-[10px] py-0.5">
            <span class="font-mono">${_escapeHtml(k)}</span>
            <span>${_escapeHtml(_t('settings.admin.purge.files_count', '{count} файл(ов)', { count: preview.byBucket[k] }))}</span>
        </div>`)
        .join('');

    const skipped = (preview.skippedTables || []).length
        ? `<div class="text-[10px] text-amber-700 dark:text-amber-300 mt-2">${_escapeHtml(_t('settings.admin.purge.skipped_tables', 'Пропущено таблиц: {count} (нет доступа / нет колонки).', { count: preview.skippedTables.length }))}</div>`
        : '';

    const sizeNote = preview.sizeEstimated
        ? _t('settings.admin.purge.size_est_note', ' (из них оценка: {count})', { count: preview.sizeEstimated })
        : '';
    const volumeLabel = _formatBytes(preview.estimatedBytes || preview.knownBytes || 0);
    const summary = _t('settings.admin.purge.summary', 'Записей: {rows} · файлов: {files} · объём ≈ {size}{est}', {
        rows: preview.totalRows,
        files: (preview.files || []).length,
        size: volumeLabel,
        est: sizeNote
    });

    return `
        <div class="space-y-2">
            <div class="text-[11px] font-bold text-slate-800 dark:text-white">
                ${_escapeHtml(summary)}
            </div>
            <div class="text-[10px] text-[var(--text-muted)]">${_escapeHtml(_t('settings.admin.purge.project', 'Проект: {code}', { code: preview.projectCode }))}</div>
            <div class="rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] p-2 max-h-40 overflow-y-auto">
                ${tableRows || '<div class="text-[10px] text-[var(--text-muted)]">' + _escapeHtml(_t('settings.admin.purge.no_rows', 'Нет soft-deleted строк')) + '</div>'}
            </div>
            ${bucketRows ? `<div class="rounded-lg border border-[var(--card-border)] bg-[var(--hover-bg)] p-2">${bucketRows}</div>` : ''}
            ${skipped}
        </div>
    `;
}

async function _onScan() {
    if (_busy) return;
    if (!_isAdmin()) return _toast(_t('settings.admin.purge.admin_only', '⛔ Только администратор'));
    if (!_cloudReady()) return _toast(_t('settings.admin.purge.cloud_offline', 'Облако не подключено'));

    _setBusy(true);
    _setStatus('<div class="text-[10px] text-indigo-600 font-bold">' + _escapeHtml(_t('settings.admin.purge.scanning', 'Сканирование облака…')) + '</div>');
    try {
        _preview = await scanCloudDeleted();
        _setStatus(_renderPreview(_preview));
        const runBtn = document.getElementById('cloud-deleted-purge-run');
        if (runBtn) {
            runBtn.disabled = !(_preview.totalRows > 0 || (_preview.files && _preview.files.length));
        }
        _toast(_t('settings.admin.purge.found', '✅ Найдено: {rows} записей, {files} файлов', {
            rows: _preview.totalRows,
            files: (_preview.files || []).length
        }));
    } catch (e) {
        console.error('[cloud-purge] scan', e);
        _preview = null;
        _setStatus('<div class="text-[10px] text-rose-600">' + _escapeHtml(_t('settings.admin.purge.error_prefix', 'Ошибка: {msg}', { msg: e.message || e })) + '</div>');
        _toast(_t('settings.admin.purge.scan_error', '❌ Ошибка сканирования'));
    } finally {
        _setBusy(false);
        const runBtn = document.getElementById('cloud-deleted-purge-run');
        if (runBtn && _preview) {
            runBtn.disabled = !(_preview.totalRows > 0 || (_preview.files && _preview.files.length));
        }
    }
}

async function _onPurge() {
    if (_busy) return;
    if (!_isAdmin()) return _toast(_t('settings.admin.purge.admin_only', '⛔ Только администратор'));
    if (!_preview) return _toast(_t('settings.admin.purge.need_check_btn', 'Сначала нажмите «Проверить»'));

    const rows = _preview.totalRows || 0;
    const files = (_preview.files || []).length;
    const size = _formatBytes(_preview.estimatedBytes || _preview.knownBytes || 0);
    const ok = confirm(_t('settings.admin.purge.confirm1',
        'Окончательно удалить из ОБЛАКА всё помеченное is_deleted?\n\nЗаписей: {rows}\nФайлов в бакетах: {files}\nОбъём ≈ {size}\nПроект: {code}\n\nЖивые данные (не удалённые) не трогаются.\nЭто необратимо.',
        { rows: rows, files: files, size: size, code: _preview.projectCode }));
    if (!ok) return;
    const ok2 = confirm(_t('settings.admin.purge.confirm2', 'Подтвердите ещё раз: hard-delete soft-deleted в облаке?'));
    if (!ok2) return;

    _setBusy(true);
    _setStatus('<div class="text-[10px] text-rose-600 font-bold">' + _escapeHtml(_t('settings.admin.purge.deleting', 'Удаление из облака…')) + '</div>');
    try {
        const result = await purgeCloudDeleted(_preview);
        _setStatus(`
            <div class="space-y-1 text-[11px]">
                <div class="font-bold text-emerald-700 dark:text-emerald-300">${_escapeHtml(_t('settings.admin.purge.done', 'Готово'))}</div>
                <div>${_escapeHtml(_t('settings.admin.purge.result_files', 'Файлов удалено: {removed} (ошибок: {errors})', { removed: result.storageRemoved, errors: result.storageErrors }))}</div>
                <div>${_escapeHtml(_t('settings.admin.purge.result_rows', 'Строк удалено: {removed} (ошибок: {errors})', { removed: result.rowsDeleted, errors: result.rowErrors }))}</div>
                <div>${_escapeHtml(_t('settings.admin.purge.result_cascade', 'Каскад фото/пунктов: {photos} / {items}', { photos: result.cascadePhotos, items: result.cascadeItems }))}</div>
                <div>${_escapeHtml(_t('settings.admin.purge.result_registry', 'file_registry: {count}', { count: result.registryDeleted }))}</div>
            </div>
        `);
        _preview = null;
        const runBtn = document.getElementById('cloud-deleted-purge-run');
        if (runBtn) runBtn.disabled = true;
        _toast(_t('settings.admin.purge.cleaned', '✅ Облако очищено от удалённых'));
    } catch (e) {
        console.error('[cloud-purge] purge', e);
        _setStatus('<div class="text-[10px] text-rose-600">' + _escapeHtml(_t('settings.admin.purge.error_prefix', 'Ошибка: {msg}', { msg: e.message || e })) + '</div>');
        _toast(_t('settings.admin.purge.purge_error', '❌ Ошибка очистки облака'));
    } finally {
        _setBusy(false);
    }
}

function _bindDelegation() {
    if (_delegationBound) return;
    _delegationBound = true;
    document.addEventListener('click', (e) => {
        const t = e.target && e.target.closest
            ? e.target.closest('[data-cloud-purge-action]')
            : null;
        if (!t) return;
        const act = t.getAttribute('data-cloud-purge-action');
        if (act === 'scan') _onScan();
        if (act === 'purge') _onPurge();
    });
}

export function mountCloudDeletedPurgeUI() {
    const root = document.getElementById('cloud-deleted-purge-root');
    if (!root) return;

    const section = document.getElementById('cloud-deleted-purge-section');
    if (!_isAdmin()) {
        if (section) section.classList.add('hidden');
        root.innerHTML = '';
        return;
    }
    if (section) section.classList.remove('hidden');

    _bindDelegation();

    const keep = _preview ? _renderPreview(_preview) : _idleStatusHtml();
    const canPurge = !!(
        _preview &&
        (_preview.totalRows > 0 || (_preview.files && _preview.files.length))
    );

    root.innerHTML = `
        <div class="space-y-3 p-4">
            <p class="text-[10px] text-[var(--text-muted)] leading-snug">
                ${_escapeHtml(_t('settings.admin.purge.intro', 'Собирает в облаке записи с is_deleted = true (для текущего project_code где применимо), считает файлы в бакетах и известный объём, затем окончательно удаляет файлы и строки. Живые данные не затрагиваются.'))}
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button id="cloud-deleted-purge-scan" type="button"
                    class="w-full px-3 py-2.5 rounded-xl text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 active:scale-95"
                    data-cloud-purge-action="scan">
                    ${_escapeHtml(_t('settings.admin.purge.scan_btn', 'Проверить удалённые'))}
                </button>
                <button id="cloud-deleted-purge-run" type="button"
                    class="w-full px-3 py-2.5 rounded-xl text-[10px] font-black uppercase bg-rose-600 text-white shadow-sm active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    data-cloud-purge-action="purge"
                    ${canPurge ? '' : 'disabled'}>
                    ${_escapeHtml(_t('settings.admin.purge.run_btn', 'Очистить облако'))}
                </button>
            </div>
            <div id="cloud-deleted-purge-status" class="min-h-[2rem]">${keep}</div>
        </div>
    `;
}

export const CloudDeletedPurgeUI = { mount: mountCloudDeletedPurgeUI };
