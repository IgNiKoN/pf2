/* Файл: js/services/sync/sync-cloud-prepare.utils.js — перенесено из js/sync.js без изменения логики */
// === ПК СК: подготовка записи для таблицы public.sk_records ===
// ВАЖНО: в Supabase нельзя отправлять лишние JS-поля, которых нет в таблице.
// Поэтому собираем чистый объект только из разрешённых колонок.
function prepareSkRecordForCloud(record, projectCode) {
    if (!record) return null;

    const skNumber = String(record.sk_number || record.number || '').trim();
    if (!skNumber) return null;

    const pCode = String(projectCode || record.project_code || window.syncConfig?.projectCode || 'LOCAL').trim() || 'LOCAL';
    const uniqueKey = record.sk_unique_key || `${pCode}_${skNumber}`;

    return {
        id: record.id || `sk_${uniqueKey}`,

        project_code: pCode,
        sk_number: skNumber,
        sk_unique_key: uniqueKey,

        row_number: record.row_number || '',
        text: record.text || '',
        category: record.category || '',
        date_issued: record.date_issued || null,

        contractor_raw: record.contractor_raw || record.raw_contractor || record.contractor || '',
        contractor_name: record.contractor_name || record.contractorName || record.contractor || '',
        contractor_canonical_key: record.contractor_canonical_key || '',
        contractor_normalization_status: record.contractor_normalization_status || 'pending',
        contractor_representative: record.contractor_representative || '',
        ...(isUuidLike(record.contractorId || record.contractor_id)
            ? { contractorId: String(record.contractorId || record.contractor_id).trim() }
            : {}),
        ...(isUuidLike(record.projectId || record.project_id)
            ? { projectId: String(record.projectId || record.project_id).trim() }
            : {}),

        deadline: record.deadline || null,
        status_raw: record.status_raw || record.status || '',
        status_normalized: record.status_normalized || '',
        is_verified_closed: record.is_verified_closed === true,
        date_resolved: record.date_resolved || null,

        issued_by: record.issued_by || record.inspector || '',
        closed_by: record.closed_by || '',

        structure: record.structure || '',
        project_loc: record.project_loc || '',
        project_raw_path: record.project_raw_path || record.project_loc || '',
        project_raw_name: record.project_raw_name || '',
        project_canonical_key: record.project_canonical_key || '',
        project_display_name: record.project_display_name || record.display_name || '',
        project_block: record.project_block || record.block || '',
        project_floor: record.project_floor || record.floor || '',
        project_normalization_status: record.project_normalization_status || 'pending',

        uploaded_by: record.uploaded_by || record.sk_uploaded_by || record.imported_by || '',
        sk_uploaded_by: record.sk_uploaded_by || record.uploaded_by || record.imported_by || '',
        imported_by: record.imported_by || '',

        first_uploaded_by: record.first_uploaded_by || record.uploaded_by || record.sk_uploaded_by || '',
        last_uploaded_by: record.last_uploaded_by || record.uploaded_by || record.sk_uploaded_by || '',

        import_batch_id: record.import_batch_id || '',
        import_count: record.import_count || 1,
        first_imported_at: record.first_imported_at || record.created_at || new Date().toISOString(),
        last_imported_at: record.last_imported_at || record.updated_at || record.updatedAt || new Date().toISOString(),

        source: 'cloud',
        sync_status: 'synced',
        sync_block_reason: '',

        is_deleted: record.is_deleted === true || record._deleted === true,
        deleted_at: record.deleted_at || record._deletedAt || null,

        created_at: record.created_at || record.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
}

// === ПК СК: преобразование строки public.sk_records из Supabase в локальный формат ===
function normalizeCloudSkRecordForLocal(row) {
    if (!row) return null;

    const isDeleted = row.is_deleted === true;

    return {
        ...row,

        id: row.id,
        number: row.sk_number || row.number || '',
        sk_number: row.sk_number || row.number || '',
        sk_unique_key: row.sk_unique_key || `${row.project_code || window.syncConfig?.projectCode || 'LOCAL'}_${row.sk_number || row.number || ''}`,

        contractor: row.contractor_name || row.contractor_raw || '',
        contractorName: row.contractor_name || row.contractor_raw || '',
        contractor_name: row.contractor_name || row.contractor_raw || '',
        raw_contractor: row.contractor_raw || '',
        contractorId: row.contractorId || row.contractor_id || '',

        status: row.status_raw || '',
        status_raw: row.status_raw || '',
        status_normalized: row.status_normalized || '',
        is_verified_closed: row.is_verified_closed === true,

        inspector: row.issued_by || '',
        issued_by: row.issued_by || '',
        closed_by: row.closed_by || '',

        canonical_key: row.project_canonical_key || '',
        display_name: row.project_display_name || row.project_raw_name || '',
        block: row.project_block || '',
        floor: row.project_floor || '',

        // Восстанавливаем нормативы на лету из текста
        standards: typeof sk_extractStandards === 'function' ? sk_extractStandards(row.text || '') : [],

        source: 'cloud',
        syncStatus: row.sync_status || 'synced',
        sync_status: row.sync_status || 'synced',
        syncBlockReason: row.sync_block_reason || '',
        sync_block_reason: row.sync_block_reason || '',

        _deleted: isDeleted,
        is_deleted: isDeleted,
        _deletedAt: row.deleted_at || null,
        deleted_at: row.deleted_at || null,

        _updatedAt: row.updated_at || new Date().toISOString(),
        updatedAt: row.updated_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString()
    };
}

function isSkRecordDirtyForPush(record) {
    if (!record) return false;

    const status = record.syncStatus || record.sync_status || '';
    const source = record.source || '';

    // Отправляем только то, что реально требует отправки.
    // synced/cloud больше не гоняем туда-сюда.
    if (status === 'not_synced') return true;
    if (status === 'blocked') return true;
    if (source === 'local') return true;

    return false;
}

// === ПК СК: подготовка журнала импорта для public.sk_import_batches ===
function prepareSkImportBatchForCloud(batch, projectCode) {
    if (!batch) return null;

    return {
        id: batch.id,
        project_code: batch.project_code || projectCode || window.syncConfig?.projectCode || 'LOCAL',
        uploaded_by: batch.uploaded_by || window.syncConfig?.engineerName || '',
        uploaded_at: batch.uploaded_at || batch.date || new Date().toISOString(),

        file_name: batch.file_name || '',
        file_hash: batch.file_hash || '',

        project_canonical_key: batch.project_canonical_key || '',
        project_display_name: batch.project_display_name || '',

        records_total: batch.records_total || 0,
        records_created: batch.records_created || batch.added || 0,
        records_updated: batch.records_updated || batch.updated || 0,
        records_skipped: batch.records_skipped || batch.skipped || 0,

        status: batch.status || 'completed',
        error_message: batch.error_message || '',

        created_at: batch.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
}


// === ПК СК: подготовка подрядчика для public.contractor_directory ===
function isUuidLike(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

// === ПК СК: подготовка подрядчика для public.contractor_directory ===
function prepareContractorForCloud(item, projectCode) {
    if (!item) return null;

    const pCode = String(projectCode || item.project_code || window.syncConfig?.projectCode || 'LOCAL').trim() || 'LOCAL';
    const canonicalKey = String(item.canonical_key || '').trim();
    const displayName = String(item.display_name || '').trim();

    if (!canonicalKey || !displayName) return null;

    const payload = {
        project_code: pCode,
        canonical_key: canonicalKey,
        display_name: displayName,
        synonyms: Array.isArray(item.synonyms) ? item.synonyms : [],
        inn: item.inn || '',
        created_by: item.created_by || window.syncConfig?.engineerName || '',
        is_deleted: item.is_deleted === true || item._deleted === true,
        created_at: item.created_at || item.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // В Supabase id = uuid. Строковые id не отправляем.
    if (isUuidLike(item.id)) {
        payload.id = item.id;
    }

    return payload;
}

// === ПК СК: подготовка алиаса подрядчика для public.contractor_aliases ===
// === ПК СК: подготовка алиаса подрядчика для public.contractor_aliases ===
function prepareContractorAliasForCloud(item, projectCode) {
    if (!item) return null;

    const pCode = String(projectCode || item.project_code || window.syncConfig?.projectCode || 'LOCAL').trim() || 'LOCAL';
    const rawName = String(item.raw_name || '').trim();
    const canonicalKey = String(item.canonical_key || '').trim();

    if (!rawName || !canonicalKey) return null;

    const payload = {
        project_code: pCode,
        raw_name: rawName,
        canonical_key: canonicalKey,
        created_by: item.created_by || window.syncConfig?.engineerName || '',
        created_at: item.created_at || item.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    if (isUuidLike(item.id)) {
        payload.id = item.id;
    }

    return payload;
}

// === ПК СК: подготовка очереди нормализации подрядчиков для public.contractor_normalization_queue ===
// === ПК СК: подготовка очереди нормализации подрядчиков для public.contractor_normalization_queue ===
function prepareContractorQueueForCloud(item, projectCode) {
    if (!item) return null;

    const pCode = String(projectCode || item.project_code || window.syncConfig?.projectCode || 'LOCAL').trim() || 'LOCAL';
    const rawName = String(item.raw_name || '').trim();

    if (!rawName) return null;

    const payload = {
        project_code: pCode,
        raw_name: rawName,
        cleaned_name: item.cleaned_name || '',
        suggested_canonical_key: item.suggested_canonical_key || '',
        source_table: item.source_table || 'sk_records',
        source_record_id: item.source_record_id || '',
        created_by: item.created_by || window.syncConfig?.engineerName || '',
        status: item.status || 'pending',
        admin_comment: item.admin_comment || '',
        created_at: item.created_at || item.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    if (isUuidLike(item.id)) {
        payload.id = item.id;
    }

    return payload;
}

// === Платформенная таблица contractors (dual-write с contractor_directory) ===
function preparePlatformContractorForCloud(item) {
    if (!item || !isUuidLike(item.id)) return null;

    const displayName = String(item.display_name || item.displayName || '').trim();
    const canonicalKey = String(item.canonical_key || '').trim();
    if (!displayName || !canonicalKey) return null;

    const isDeleted = item.is_deleted === true || item._deleted === true;
    const nowIso = new Date().toISOString();
    const payload = {
        id: item.id,
        companyId: item.companyId || 'rbi',
        canonical_key: canonicalKey,
        displayName: displayName,
        synonyms: Array.isArray(item.synonyms) ? item.synonyms : [],
        inn: item.inn || '',
        legal_name: item.legal_name || '',
        legal_form: item.legal_form || '',
        legal_address: item.legal_address || '',
        contact_person: item.contact_person || '',
        contact_phone: item.contact_phone || '',
        contact_email: item.contact_email || '',
        created_by: item.created_by || window.syncConfig?.engineerName || '',
        is_deleted: isDeleted,
        created_at: item.created_at || item.createdAt || nowIso,
        updated_at: nowIso,
        version: Number.isFinite(item.version) ? item.version : 1
    };

    if (item.locationId) {
        payload.locationId = item.locationId;
    }

    if (isDeleted) {
        payload.deleted_at = item.deleted_at || nowIso;
    }

    return payload;
}

// === Платформенная таблица contracts ===
function prepareContractForCloud(item) {
    if (!item || !isUuidLike(item.id)) return null;

    const contractorId = String(item.contractorId || item.contractor_id || '').trim();
    if (!isUuidLike(contractorId)) return null;

    const isDeleted = item.is_deleted === true || item._deleted === true;
    const nowIso = new Date().toISOString();
    const payload = {
        id: item.id,
        companyId: item.companyId || 'rbi',
        contractorId: contractorId,
        contract_number: item.contract_number || '',
        contract_date: item.contract_date || null,
        work_type: item.work_type || '',
        status: item.status || '',
        created_by: item.created_by || window.syncConfig?.engineerName || '',
        is_deleted: isDeleted,
        created_at: item.created_at || item.createdAt || nowIso,
        updated_at: nowIso,
        version: Number.isFinite(item.version) ? item.version : 1
    };

    if (isDeleted) {
        payload.deleted_at = item.deleted_at || nowIso;
    }

    return payload;
}

window.prepareSkRecordForCloud = prepareSkRecordForCloud;
window.normalizeCloudSkRecordForLocal = normalizeCloudSkRecordForLocal;
window.isSkRecordDirtyForPush = isSkRecordDirtyForPush;
window.prepareSkImportBatchForCloud = prepareSkImportBatchForCloud;
window.prepareContractorForCloud = prepareContractorForCloud;
window.prepareContractorAliasForCloud = prepareContractorAliasForCloud;
window.prepareContractorQueueForCloud = prepareContractorQueueForCloud;
window.preparePlatformContractorForCloud = preparePlatformContractorForCloud;
window.prepareContractForCloud = prepareContractForCloud;

// === Платформенная иерархия location_nodes + construction_floors_v2 ===
function prepareLocationNodeForCloud(item) {
    if (!item || !item.id) return null;
    const isDeleted = item.is_deleted === true || item._deleted === true;
    const nowIso = new Date().toISOString();
    const payload = {
        id: item.id,
        companyId: item.companyId || 'rbi',
        nodeType: item.nodeType || item.node_type || null,
        parentId: item.parentId === undefined ? (item.parent_id ?? null) : item.parentId,
        displayName: item.displayName || item.display_name || '',
        canonical_key: item.canonical_key || null,
        sort_order: Number.isFinite(item.sort_order) ? item.sort_order : 0,
        synonyms: item.synonyms != null ? item.synonyms : [],
        created_by: item.created_by || window.syncConfig?.engineerName || '',
        is_deleted: isDeleted,
        created_at: item.created_at || item.createdAt || nowIso,
        updated_at: nowIso,
        version: Number.isFinite(item.version) ? item.version : 1
    };
    if (isDeleted) payload.deleted_at = item.deleted_at || nowIso;
    return payload;
}

function prepareFloorPlanForCloud(item) {
    if (!item || !item.id || !item.locationId) return null;
    const isDeleted = item.is_deleted === true || item._deleted === true;
    const nowIso = new Date().toISOString();
    const payload = {
        id: item.id,
        companyId: item.companyId || 'rbi',
        locationId: item.locationId,
        name: item.name || '',
        sort_order: Number.isFinite(item.sort_order) ? item.sort_order : 0,
        pdf_url: item.pdf_url || '',
        pdf_name: item.pdf_name || '',
        pdf_size: item.pdf_size || '',
        is_active: item.is_active !== false,
        created_by: item.created_by || window.syncConfig?.engineerName || '',
        is_deleted: isDeleted,
        created_at: item.created_at || item.createdAt || nowIso,
        updated_at: nowIso,
        version: Number.isFinite(item.version) ? item.version : 1
    };
    if (isDeleted) payload.deleted_at = item.deleted_at || nowIso;
    return payload;
}

/** Локальные photos[] / legacy photo → значение колонки photo (JSON-массив URL или один URL). */
function serializeConstructionDefectV2Photo(item) {
    let photos = [];
    if (Array.isArray(item.photos) && item.photos.length) {
        photos = item.photos.filter(function (p) { return typeof p === 'string' && p.trim(); });
    } else if (typeof item.photo === 'string' && item.photo.trim()) {
        var raw = item.photo.trim();
        if (raw.charAt(0) === '[') {
            try {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    photos = parsed.filter(function (p) { return typeof p === 'string' && p.trim(); });
                } else {
                    photos = [raw];
                }
            } catch (_) {
                photos = [raw];
            }
        } else {
            photos = [raw];
        }
    }
    if (!photos.length) return null;
    if (photos.length === 1) return photos[0];
    return JSON.stringify(photos);
}

function normalizeConstructionDefectV2Status(status) {
    var s = String(status || '').trim().toLowerCase();
    if (s === 'open') return 'issued';
    if (s === 'cancelled') return 'rejected';
    if (s === 'issued' || s === 'in_progress' || s === 'fixed' || s === 'closed' || s === 'rejected') return s;
    return 'issued';
}

function prepareConstructionDefectV2ForCloud(item) {
    if (!item || !item.id || !item.locationId) return null;
    const isDeleted = item.is_deleted === true || item._deleted === true;
    const nowIso = new Date().toISOString();
    const x = Number(item.x);
    const y = Number(item.y);
    const description = item.description || item.text || '';
    const payload = {
        id: item.id,
        companyId: item.companyId || 'rbi',
        locationId: item.locationId,
        x: Number.isFinite(x) ? x : null,
        y: Number.isFinite(y) ? y : null,
        template_key: item.template_key || null,
        item_id: item.item_id || null,
        item_name: item.item_name || null,
        norm_text: item.norm_text || null,
        text: item.text || description || null,
        category: item.category || null,
        deadline: item.deadline || null,
        contractorId: item.contractorId || null,
        description: description || null,
        photo: serializeConstructionDefectV2Photo(item),
        status: normalizeConstructionDefectV2Status(item.status),
        history: item.history != null ? item.history : [],
        created_by: item.created_by || window.syncConfig?.engineerName || '',
        is_deleted: isDeleted,
        created_at: item.created_at || item.createdAt || nowIso,
        updated_at: nowIso,
        version: Number.isFinite(item.version) ? item.version : 1
    };
    if (isDeleted) payload.deleted_at = item.deleted_at || nowIso;
    return payload;
}

window.serializeConstructionDefectV2Photo = serializeConstructionDefectV2Photo;
window.normalizeConstructionDefectV2Status = normalizeConstructionDefectV2Status;

window.prepareLocationNodeForCloud = prepareLocationNodeForCloud;
window.prepareFloorPlanForCloud = prepareFloorPlanForCloud;
window.prepareConstructionDefectV2ForCloud = prepareConstructionDefectV2ForCloud;

function normalizeConstructionAcceptanceV2Status(status) {
    const s = String(status || '').trim().toLowerCase();
    if (s === 'pending' || s === 'rejected' || s === 'accepted') return s;
    return 'pending';
}

function prepareConstructionAcceptanceV2ForCloud(item) {
    if (!item || !item.id || !item.locationId) return null;
    const isDeleted = item.is_deleted === true || item._deleted === true;
    const nowIso = new Date().toISOString();
    let zone = null;
    if (item.zone && typeof item.zone === 'object') {
        const z = item.zone;
        const x = Number(z.x);
        const y = Number(z.y);
        const w = Number(z.w);
        const h = Number(z.h);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h)) {
            zone = {
                x: Math.max(0, Math.min(100, x)),
                y: Math.max(0, Math.min(100, y)),
                w: Math.max(0.1, Math.min(100, w)),
                h: Math.max(0.1, Math.min(100, h))
            };
            if (z.room != null && String(z.room).trim()) zone.room = String(z.room).trim();
        }
    }
    let requestedDate = item.requested_date || null;
    if (requestedDate) {
        const m = String(requestedDate).match(/^(\d{4}-\d{2}-\d{2})/);
        requestedDate = m ? m[1] : null;
    }
    // Deep-copy checklist_results; strip leftover local:// if any slipped past upload
    let checklistResults = null;
    if (item.checklist_results && typeof item.checklist_results === 'object') {
        try {
            checklistResults = JSON.parse(JSON.stringify(item.checklist_results));
            if (Array.isArray(checklistResults.items)) {
                checklistResults.items = checklistResults.items.map((row) => {
                    if (!row || typeof row !== 'object') return row;
                    const next = { ...row };
                    if (Array.isArray(next.photos)) {
                        next.photos = next.photos.filter(
                            (p) =>
                                typeof p === 'string' &&
                                p &&
                                !p.startsWith('local://') &&
                                !p.startsWith('data:image')
                        );
                        if (!next.photos.length) delete next.photos;
                    }
                    return next;
                });
            }
        } catch (_e) {
            checklistResults = item.checklist_results;
        }
    }
    const payload = {
        id: item.id,
        companyId: item.companyId || 'rbi',
        locationId: item.locationId,
        zone,
        template_key: item.template_key || null,
        work_type: item.work_type || null,
        volume: item.volume || null,
        requested_date: requestedDate,
        requested_time: item.requested_time || null,
        contractorId: item.contractorId || null,
        status: normalizeConstructionAcceptanceV2Status(item.status),
        checklist_results: checklistResults,
        created_by: item.created_by || window.syncConfig?.engineerName || '',
        is_deleted: isDeleted,
        created_at: item.created_at || item.createdAt || nowIso,
        updated_at: nowIso,
        version: Number.isFinite(item.version) ? item.version : 1
    };
    if (isDeleted) payload.deleted_at = item.deleted_at || nowIso;
    return payload;
}

window.normalizeConstructionAcceptanceV2Status = normalizeConstructionAcceptanceV2Status;
window.prepareConstructionAcceptanceV2ForCloud = prepareConstructionAcceptanceV2ForCloud;

/** Canonical статусы передачи v2 + aliases старого MVP → canonical. */
function normalizeConstructionUnitV2Status(status) {
    const s = String(status || '').trim().toLowerCase();
    const canonical = [
        'not_inspected',
        'finishing',
        'has_defects',
        'ready_for_transfer',
        'transferred',
        'shareholder_defects'
    ];
    if (canonical.includes(s)) return s;
    const aliases = {
        none: 'not_inspected',
        ready: 'finishing',
        defects: 'has_defects',
        accepted: 'transferred'
    };
    if (aliases[s]) return aliases[s];
    return 'not_inspected';
}

function _unitPdfField(v) {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** construction_unit_v2 → Supabase construction_units_v2 (camelCase; pdf_* после sql/008). */
function prepareConstructionUnitV2ForCloud(item) {
    if (!item || !item.id || !item.locationId) return null;
    const isDeleted = item.is_deleted === true || item._deleted === true;
    const nowIso = new Date().toISOString();
    const sortRaw = Number(item.sort_order);
    const payload = {
        id: item.id,
        companyId: item.companyId || 'rbi',
        locationId: item.locationId,
        name: item.name != null ? String(item.name) : '',
        type: item.type != null ? String(item.type) : 'КВ',
        sort_order: Number.isFinite(sortRaw) ? sortRaw : 0,
        status: normalizeConstructionUnitV2Status(item.status),
        // Требует sql/008_construction_units_v2_apartment_plan.sql (иначе upsert 400).
        pdf_url: _unitPdfField(item.pdf_url),
        pdf_name: _unitPdfField(item.pdf_name),
        pdf_size: _unitPdfField(item.pdf_size),
        created_by: item.created_by || window.syncConfig?.engineerName || '',
        is_deleted: isDeleted,
        created_at: item.created_at || item.createdAt || nowIso,
        updated_at: nowIso,
        version: Number.isFinite(item.version) ? item.version : 1
    };
    if (isDeleted) payload.deleted_at = item.deleted_at || nowIso;
    return payload;
}

window.normalizeConstructionUnitV2Status = normalizeConstructionUnitV2Status;
window.prepareConstructionUnitV2ForCloud = prepareConstructionUnitV2ForCloud;
