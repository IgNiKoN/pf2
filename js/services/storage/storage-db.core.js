/* Файл: js/services/storage/storage-db.core.js — перенесено из js/storage.js без изменения логики */
/* Файл: js/storage.js */

const DB_NAME = 'RBI_QUALITY_DB';
// Повышаем версию только при изменении структуры IndexedDB
const DB_VERSION = 37; // БЫЛО 36, СТАЛО 37 — plan-fact (ТЗ-9): пороги сверки контуров

// Глобально отдаём версию БД в интерфейс диагностики
window.RBI_DB_VERSION = DB_VERSION;

const STORES = {
    // --- НОВЫЕ ТАБЛИЦЫ ДЛЯ СТРОЙКОНТРОЛЯ ---
    CONST_OBJECTS: 'construction_objects',
    CONST_BUILDINGS: 'construction_buildings',
    CONST_FLOORS: 'construction_floors',
    CONST_DEFECTS: 'construction_defects',
    CONST_UNITS: 'construction_units',           
    CONST_ACCEPTANCE: 'construction_acceptance',  // <-- НОВОЕ (Заявки на приемку)
    // ---------------------------------------

    OBJECT_QUEUE: 'object_normalization_queue',
    STATE: 'app_state',
    HISTORY: 'app_history',
    SETTINGS: 'app_settings',
    TEMPLATES: 'user_templates',
    PHOTOS: 'app_photos',
    REPORTS: 'app_reports',
    REPORT_TEMPLATES: 'report_templates',
    TASKS: 'rbi_tasks',
    SCHEDULE: 'rbi_schedule_stages',
    MEETINGS: 'rbi_meetings',
    INTERVENTIONS: 'rbi_interventions',
    PRACTICES: 'rbi_practices',
    ETALON_ACTS: 'rbi_etalon_acts',
    ETALON_DRAFT: 'rbi_etalon_draft',
    FMEA: 'rbi_fmea',
    SK_IMPORTS: 'sk_imports',

    SK_RECORDS: 'sk_records',
    SK_IMPORT_BATCHES: 'sk_import_batches',

    SK_CONTRACTOR_MAP: 'sk_contractor_map',
    SK_VOLUMES: 'sk_volumes',
    SK_ISD_HISTORY: 'sk_isd_history',
    SK_CATEGORY_MAP: 'sk_category_map',
    SK_MAPPING: 'sk_mapping',

    CONTRACTOR_DIRECTORY: 'contractor_directory',
    CONTRACTOR_ALIASES: 'contractor_aliases',
    CONTRACTOR_QUEUE: 'contractor_normalization_queue',
    CONTRACTS: 'contracts',
    LOCATION_NODES: 'location_nodes',
    LOCATION_NODE_ALIASES: 'location_node_aliases',
    CONST_FLOORS_V2: 'construction_floors_v2',
    CONST_DEFECTS_V2: 'construction_defects_v2',
    CONST_ACCEPTANCE_V2: 'construction_acceptance_v2',
    CONST_UNITS_V2: 'construction_units_v2',
    PROJECT_OBJECTS: 'project_objects',
    OBJECT_ALIASES: 'object_aliases',
    BACKUP_LOGS: 'backup_logs',
    GAME_LOGS: 'game_logs',
    TWI_CARDS: 'twi_cards',
    CUSTOM_DOCS: 'custom_docs',
    CUSTOM_NODES: 'custom_nodes',
    FEEDBACK_LIST: 'feedback_list',
    ASSISTANT_KB: 'app_assistant_kb',
    FILE_REGISTRY: 'file_registry_cache',
    STORAGE_EVENTS: 'storage_events',
    SYNC_QUEUE: 'sync_queue',

    // --- МОДУЛЬ plan-fact (ПФ-2): импорт формы заказчика и позиции ВОР ---
    // Синхронизации у этих стораджей пока нет (облако — блок ПФ-5), поэтому записи в них
    // не помечаются syncStatus: притворяться, что они уедут в облако, нельзя.
    PLAN_FACT_IMPORTS: 'plan_fact_imports',
    PLAN_FACT_WOR: 'plan_fact_wor',
    // Реестр норм выработки ведёт ПТО (одна запись на вид работ) и рабочий календарь компании.
    PLAN_FACT_NORMS: 'plan_fact_norms',
    PLAN_FACT_CALENDAR: 'plan_fact_calendar',
    // Факт выполнения: записи не перезаписываются — исправление идёт сторно (новая запись со ссылкой на исходную).
    PLAN_FACT_FACTS: 'plan_fact_facts',
    // Контуры объёмов (ТЗ-2): один объём на пару «позиция + вид контура».
    PLAN_FACT_QUANTITIES: 'plan_fact_quantities',
    // Справочник видов работ и связки названий (ТЗ-4): данные, а не константы кода.
    PLAN_FACT_WORKS: 'plan_fact_works',
    PLAN_FACT_WORK_ALIASES: 'plan_fact_work_aliases',
    // Шаблоны сопоставления колонок для повторяющихся форматов (ТЗ-5, VOR-004).
    PLAN_FACT_TEMPLATES: 'plan_fact_templates',
    // Пороги сверки контуров по объекту (ТЗ-9, VOR-024).
    PLAN_FACT_THRESHOLDS: 'plan_fact_thresholds',
    // Утверждение ПТО → РП: предложения, их строки, неизменяемые baseline, запросы на изменение, аудит (ТЗ-2б).
    PLAN_FACT_PROPOSALS: 'plan_fact_proposals',
    PLAN_FACT_PROPOSAL_ROWS: 'plan_fact_proposal_rows',
    PLAN_FACT_BASELINES: 'plan_fact_baselines',
    PLAN_FACT_CHANGE_REQUESTS: 'plan_fact_change_requests',
    PLAN_FACT_AUDIT: 'plan_fact_audit'
};
window.STORES = STORES;

// Индексы Object Store → [{ name, keyPath }]. onupgradeneeded создаёт только
// отсутствующие — безопасно для уже заполненной локальной БД (upgrade 23→24).
// by_contractor_date не добавляем: пагинация журнала идёт по by_date (YAGNI).
const INDEX_DEFINITIONS = {
    [STORES.HISTORY]: [
        { name: 'by_date', keyPath: 'date' },
        { name: 'by_contractor', keyPath: 'contractorName' },
        // Мягко удалённые (_deleted:true). Записи без поля в индекс не попадают —
        // getActive() по-прежнему фильтрует после чтения; индекс для точечных выборок.
        { name: 'by_deleted', keyPath: '_deleted' }
    ],
    // plan-fact (ПФ-2): выборка ВОР и импортов по объекту без полного скана стораджа.
    [STORES.PLAN_FACT_IMPORTS]: [
        { name: 'by_objectId', keyPath: 'objectId' }
    ],
    [STORES.PLAN_FACT_WOR]: [
        { name: 'by_objectId', keyPath: 'objectId' },
        { name: 'by_importId', keyPath: 'importId' }
    ],
    // Нормы выработки: выборка по виду работ (id = ключ работы), поэтому отдельный индекс не нужен.
    [STORES.PLAN_FACT_NORMS]: [],
    [STORES.PLAN_FACT_FACTS]: [
        { name: 'by_objectId', keyPath: 'objectId' }
    ],
    [STORES.PLAN_FACT_QUANTITIES]: [
        { name: 'by_worItemId', keyPath: 'worItemId' }
    ],
    [STORES.PLAN_FACT_WORKS]: [
        { name: 'by_name', keyPath: 'name' }
    ],
    [STORES.PLAN_FACT_WORK_ALIASES]: [
        { name: 'by_workId', keyPath: 'workId' },
        { name: 'by_normalizedAlias', keyPath: 'normalizedAlias' }
    ],
    [STORES.PLAN_FACT_TEMPLATES]: [
        { name: 'by_formId', keyPath: 'formId' }
    ],
    [STORES.PLAN_FACT_THRESHOLDS]: [
        { name: 'by_objectId', keyPath: 'objectId' }
    ],
    [STORES.PLAN_FACT_PROPOSALS]: [
        { name: 'by_objectId', keyPath: 'objectId' }
    ],
    [STORES.PLAN_FACT_PROPOSAL_ROWS]: [
        { name: 'by_proposalId', keyPath: 'proposalId' }
    ],
    [STORES.PLAN_FACT_BASELINES]: [
        { name: 'by_objectId', keyPath: 'objectId' }
    ],
    [STORES.PLAN_FACT_CHANGE_REQUESTS]: [
        { name: 'by_worItemId', keyPath: 'worItemId' }
    ],
    [STORES.PLAN_FACT_AUDIT]: [
        { name: 'by_entityId', keyPath: 'entityId' }
    ]
};
window.INDEX_DEFINITIONS = INDEX_DEFINITIONS;

/**
 * Инициализация и открытие базы данных IndexedDB (Singleton).
 * Self-heal: если версия уже ≥ DB_VERSION, но какого-то store из STORES нет
 * (типичный случай: bump версии без store / частично закэшированный storage-db),
 * закрываем соединение и форсируем upgrade на db.version+1.
 * Если self-heal ранее поднял IDB выше константы DB_VERSION — открываем текущую
 * версию (без downgrade), иначе VersionError «requested < existing».
 */
let _dbPromise = null;

function _missingStores(db) {
    return Object.values(STORES).filter((storeName) => !db.objectStoreNames.contains(storeName));
}

/** Открыть БД на уже существующей версии (без указания version). */
function _openDbCurrent() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);
        request.onblocked = function () {
            console.error('IndexedDB заблокирована! Закройте другие вкладки.');
            if (typeof showToast === 'function') {
                showToast('⚠️ Закройте все вкладки приложения и откройте заново!');
            }
            reject(new Error('БД заблокирована'));
        };
        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                db.close();
                _dbPromise = null;
                if (typeof showToast === 'function') {
                    showToast('⚠️ База данных обновлена. Пожалуйста, перезагрузите страницу.');
                }
            };
            resolve(db);
        };
        request.onerror = () => reject(request.error);
    });
}

function _applySchemaUpgrade(db, upgradeTx) {
    Object.values(STORES).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
            let keyOptions = { keyPath: 'id' };
            if (storeName === STORES.STATE || storeName === STORES.SETTINGS) keyOptions = { keyPath: 'key' };
            if (storeName === STORES.TEMPLATES) keyOptions = { keyPath: 'slug' };
            db.createObjectStore(storeName, keyOptions);
        }
    });

    Object.keys(INDEX_DEFINITIONS).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) return;
        const store = upgradeTx.objectStore(storeName);
        (INDEX_DEFINITIONS[storeName] || []).forEach((def) => {
            if (!store.indexNames.contains(def.name)) {
                store.createIndex(def.name, def.keyPath, def.options || {});
            }
        });
    });
}

function _openDbAtVersion(version) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, version);

        request.onupgradeneeded = function (event) {
            _applySchemaUpgrade(event.target.result, event.target.transaction);
        };

        request.onblocked = function () {
            console.error('IndexedDB заблокирована! Закройте другие вкладки.');
            if (typeof showToast === 'function') {
                showToast('⚠️ Закройте все вкладки приложения и откройте заново!');
            }
            reject(new Error('БД заблокирована'));
        };

        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                db.close();
                _dbPromise = null;
                if (typeof showToast === 'function') {
                    showToast('⚠️ База данных обновлена. Пожалуйста, перезагрузите страницу.');
                }
            };
            resolve(db);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

function openAppDb() {
    if (!_dbPromise) {
        _dbPromise = (async () => {
            let db;
            try {
                db = await _openDbAtVersion(DB_VERSION);
            } catch (err) {
                if (err && err.name === 'VersionError') {
                    console.warn('[DB] Requested version', DB_VERSION, '< existing — opening current');
                    db = await _openDbCurrent();
                } else {
                    throw err;
                }
            }
            let missing = _missingStores(db);
            if (missing.length) {
                const bump = db.version + 1;
                console.warn('[DB] Missing object stores — forcing upgrade →', bump, missing);
                try {
                    db.close();
                } catch (_) {
                    /* ignore */
                }
                db = await _openDbAtVersion(bump);
                missing = _missingStores(db);
                if (missing.length) {
                    console.error('[DB] Stores still missing after forced upgrade:', missing);
                }
            }
            window.RBI_DB_VERSION = Math.max(DB_VERSION, db.version);
            return db;
        })().catch((err) => {
            _dbPromise = null;
            throw err;
        });
    }
    return _dbPromise;
}
/**
 * ГЛОБАЛЬНЫЙ НОРМАЛИЗАТОР СИСТЕМНЫХ КЛЮЧЕЙ (JS vs Supabase)
 * Автоматически выравнивает camelCase и snake_case перед любым сохранением в базу.
 */
/**
 * ГЛОБАЛЬНЫЙ НОРМАЛИЗАТОР СИСТЕМНЫХ КЛЮЧЕЙ
 * Автоматически выравнивает структуру, добавляет проект и владельца перед любым сохранением.
 */
function normalizeSystemKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    // 1. УНИВЕРСАЛЬНОЕ КЛЕЙМО ПРОЕКТА
    const pCode = window.syncConfig?.projectCode || 'LOCAL';
    if (!obj.project_code) obj.project_code = pCode;

    // 2. ВЛАДЕЛЕЦ (Критично для RLS политик Supabase)
    const currentEng = window.syncConfig?.engineerName || 'Инженер';
    const owner = obj.owner || obj.created_by || obj.author || obj.inspectorName || obj.engineer_name || currentEng;
    if (!obj.owner) obj.owner = owner;
    if (!obj.created_by) obj.created_by = owner;

    // 3. МЕТКИ УДАЛЕНИЯ (_deleted <-> is_deleted)
    const isDel = obj._deleted === true || obj.is_deleted === true;
    obj._deleted = isDel;
    obj.is_deleted = isDel;

    const delAt = obj._deletedAt || obj.deleted_at || null;
    if (delAt) {
        obj._deletedAt = delAt;
        obj.deleted_at = delAt;
    }

    // 4. СТАТУСЫ СИНХРОНИЗАЦИИ (syncStatus <-> sync_status)
    const sStatus = obj.syncStatus || obj.sync_status || 'not_synced';
    obj.syncStatus = sStatus;
    obj.sync_status = sStatus;

    const sReason = obj.syncBlockReason || obj.sync_block_reason || '';
    obj.syncBlockReason = sReason;
    obj.sync_block_reason = sReason;

    // 5. ВРЕМЕННЫЕ МЕТКИ (updatedAt <-> updated_at)
    const updAt = obj.updatedAt || obj.updated_at || new Date().toISOString();
    obj.updatedAt = updAt;
    obj.updated_at = updAt;

    const creAt = obj.createdAt || obj.created_at;
    if (creAt) {
        obj.createdAt = creAt;
        obj.created_at = creAt;
    }

    return obj;
}
/**
 * Базовые операции CRUD
 */
async function dbPut(storeName, data, retryAfterCleanup = true) {
    const db = await openAppDb();

    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const normalizedData = normalizeSystemKeys(data);

            store.put(normalizedData);

            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        if (e && e.name === 'QuotaExceededError' && retryAfterCleanup) {
            console.warn('[DB] QuotaExceededError. Запускаем аварийную очистку...');

            if (window.RbiStorageManager) {
                await window.RbiStorageManager.runAdaptiveStorageCleanup('quota_exceeded');
            }

            return dbPut(storeName, data, false);
        }

        if (e && e.name === 'QuotaExceededError') {
            if (typeof showToast === 'function') {
                showToast('❌ Память устройства заполнена. Несинхронизированные файлы не удалены.');
            }
        }

        throw e;
    }
}
// МАССОВОЕ СОХРАНЕНИЕ (УСКОРЕНИЕ В 10 РАЗ)
async function dbPutBatch(storeName, itemsArray, retryAfterCleanup = true) {
    if (!itemsArray || itemsArray.length === 0) return true;

    const db = await openAppDb();

    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);

            itemsArray.forEach(item => {
                const normalizedItem = normalizeSystemKeys(item);
                store.put(normalizedItem);
            });

            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        if (e && e.name === 'QuotaExceededError' && retryAfterCleanup) {
            console.warn('[DB] QuotaExceededError batch. Запускаем аварийную очистку...');

            if (window.RbiStorageManager) {
                await window.RbiStorageManager.runAdaptiveStorageCleanup('quota_exceeded');
            }

            return dbPutBatch(storeName, itemsArray, false);
        }

        if (e && e.name === 'QuotaExceededError') {
            if (typeof showToast === 'function') {
                showToast('❌ Память устройства заполнена. Автоочистка не смогла освободить достаточно места.');
            }
        }

        throw e;
    }
}
async function dbGet(storeName, key) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Есть ли ключ в store без чтения value (не поднимает blob в RAM). */
async function dbHasKey(storeName, key) {
    if (key == null || key === '') return false;
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        if (typeof store.getKey === 'function') {
            const req = store.getKey(key);
            req.onsuccess = () => resolve(req.result !== undefined);
            req.onerror = () => reject(req.error);
            return;
        }
        const req = store.count(IDBKeyRange.only(key));
        req.onsuccess = () => resolve((req.result || 0) > 0);
        req.onerror = () => reject(req.error);
    });
}

async function dbGetAll(storeName) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();

        req.onsuccess = () => {
            let results = req.result || [];

            // --- ГЛОБАЛЬНАЯ ИЗОЛЯЦИЯ ПРОЕКТОВ ---
            const pCode = window.syncConfig?.projectCode || 'LOCAL';

            // Исключения: эти таблицы общие для всего телефона (настройки, логи, фото-кэш)
            const globalStores = [STORES.STATE, STORES.SETTINGS, STORES.PHOTOS, STORES.BACKUP_LOGS, STORES.GAME_LOGS];

            if (!globalStores.includes(storeName)) {
                results = results.filter(item => {
                    // Разрешаем системные шаблоны и узлы (они начинаются на sys_)
                    if (String(item.id).startsWith('sys_') || String(item.slug).startsWith('sys_')) return true;

                    const itemProject = item.project_code || item.data?.project_code;

                    // Пропускаем записи, если они принадлежат текущему проекту
                    // (или если project_code вообще пустой — это старые локальные данные до обновления)
                    return !itemProject || itemProject === pCode;
                });
            }
            // ------------------------------------

            resolve(results);
        };
        req.onerror = () => reject(req.error);
    });
}

// КУРСОРНОЕ ЧТЕНИЕ СТРАНИЦЫ ПО ИНДЕКСУ (Журнал проверок, DB_VERSION 21).
// Не заменяет dbGetAll — используется точечно там, где нужна страница,
// а не весь стор (см. inspection.service.js getPage()).
// opts: { indexName, limit, direction: 'prev'|'next', range: IDBKeyRange|null,
//         cursorKey: значение поля индекса, с которого продолжить,
//         cursorPrimaryKey: primary key (id) записи, на которой остановилась
//         предыдущая страница — обязателен вместе с cursorKey }
//
// ИСПРАВЛЕНИЕ (см. отчёт "История показывает меньше записей, чем есть в базе"):
// граница по одному только значению cursorKey была ИСКЛЮЧАЮЩЕЙ (upperBound/
// lowerBound с exclusive=true) — если у нескольких записей совпадает значение
// поля `date` (секундная точность ISO-строки, массовый импорт/pull одним
// batch'ем — совсем не редкость), ВСЕ записи с этим значением, кроме уже
// прочитанных на предыдущей странице, навсегда пропускались курсором. Теперь
// граница по cursorKey ВКЛЮЧАЮЩАЯ, а точную позицию (с точностью до записи)
// определяем сами: пропускаем курсором все записи вплоть до и включая
// (cursorKey, cursorPrimaryKey) записи с предыдущей страницы, затем начинаем
// собирать со следующей.
//
// ПОЧЕМУ НЕ cursor.continuePrimaryKey() (первая версия фикса, откачена):
// спецификация IndexedDB требует, чтобы целевая позиция была строго ПОСЛЕ
// текущей позиции курсора — но открытый с включающей границей курсор нередко
// сам сразу встаёт РОВНО на запись (cursorKey, cursorPrimaryKey) (когда её
// значение `date` уникально в пределах диапазона). Вызов continuePrimaryKey
// с координатами собственной текущей позиции запрещён спецификацией и кидает
// `DataError: The parameter is greater than or equal to this cursor's
// position` — воспроизведено при живом клике «Загрузить более старые
// проверки». Ручное сравнение ключей через cursor.continue() (ниже) работает
// в обоих случаях (уникальное и повторяющееся значение `date`) без риска
// этой ошибки.
async function dbGetPageByIndex(storeName, opts) {
    const { indexName, limit = 50, direction = 'prev', range = null, cursorKey = null, cursorPrimaryKey = null } = opts || {};
    const db = await openAppDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);

        let effectiveRange = range;
        const hasCursor = cursorKey !== undefined && cursorKey !== null
            && cursorPrimaryKey !== undefined && cursorPrimaryKey !== null;
        if (hasCursor) {
            // Включающая граница — сама запись (cursorKey, cursorPrimaryKey) и всё,
            // что совпадает с ней по значению `date`, попадут в диапазон курсора;
            // пропускаем их вручную ниже (skipUntilPastCursor), пока не пройдём
            // именно ту запись, primaryKey которой совпадает с cursorPrimaryKey.
            if (direction === 'prev') {
                effectiveRange = IDBKeyRange.upperBound(cursorKey, false);
            } else {
                effectiveRange = IDBKeyRange.lowerBound(cursorKey, false);
            }
        }

        const results = [];
        let lastKey = null;
        let lastPrimaryKey = null;
        // Пока true — курсор идёт по записям с ключом cursorKey и ищет ровно
        // запись с primaryKey === cursorPrimaryKey, чтобы понять, где кончилась
        // предыдущая страница; сама эта запись и всё до неё — не результат.
        let skipUntilPastCursor = hasCursor;
        const pCode = window.syncConfig?.projectCode || 'LOCAL';
        const req = index.openCursor(effectiveRange, direction === 'prev' ? 'prev' : 'next');

        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
                resolve({
                    items: results,
                    hasMore: false,
                    nextCursorKey: lastKey,
                    nextCursorPrimaryKey: lastPrimaryKey
                });
                return;
            }

            if (skipUntilPastCursor) {
                // cursor.key !== cursorKey означает, что записей с cursorKey больше
                // нет (все они шли первыми в диапазоне) — искомая запись либо уже
                // прошла, либо её нет вовсе; в любом случае со следующей записи
                // начинаем собирать страницу.
                const isSameKey = indexedDB.cmp(cursor.key, cursorKey) === 0;
                const isCursorRecord = isSameKey && String(cursor.primaryKey) === String(cursorPrimaryKey);
                if (!isSameKey) {
                    skipUntilPastCursor = false;
                    // Не return — обрабатываем эту запись как первую страницы ниже.
                } else {
                    cursor.continue();
                    if (isCursorRecord) skipUntilPastCursor = false;
                    return;
                }
            }

            const item = cursor.value;

            if (results.length >= limit) {
                resolve({
                    items: results,
                    hasMore: true,
                    nextCursorKey: lastKey,
                    nextCursorPrimaryKey: lastPrimaryKey
                });
                return;
            }

            const itemProject = item.project_code || item.data?.project_code;
            const belongsToProject = !itemProject || itemProject === pCode;

            if (belongsToProject) {
                results.push(item);
                lastKey = cursor.key;
                lastPrimaryKey = cursor.primaryKey;
            }
            cursor.continue();
        };
        req.onerror = () => reject(req.error);
    });
}

/** Число записей в store без чтения value (не поднимает данные в RAM). */
async function dbCount(storeName) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => reject(req.error);
    });
}

// КУРСОРНЫЙ ПРОХОД ПО СТОРУ (без dbGetAll — не накапливает весь стор в RAM).
// Используется там, где нужно обработать каждую запись по одной (например,
// PHOTOS с тяжёлыми ArrayBuffer в поле data) — см. storage-cache-manager.js.
//
// ВАЖНО: callback ДОЛЖЕН быть синхронным (без await внутри). Асинхронная
// работа (dbPut/dbDelete/сетевые вызовы) между двумя cursor.continue() рвёт
// активность транзакции курсора (TransactionInactiveError) — тяжёлые async
// операции по каждой записи нужно откладывать в отдельный массив лёгких
// дескрипторов (без ссылки на .data) и выполнять ПОСЛЕ resolve этого промиса.
//
// Фильтрация по project_code — как в dbGetAll (см. выше): системные записи
// (id/slug начинается на sys_) всегда проходят, остальные — если project_code
// пуст или совпадает с текущим. Для globalStores фильтрация не применяется.
async function dbForEachCursor(storeName, callback) {
    const db = await openAppDb();
    const pCode = window.syncConfig?.projectCode || 'LOCAL';
    const globalStores = [STORES.STATE, STORES.SETTINGS, STORES.PHOTOS, STORES.BACKUP_LOGS, STORES.GAME_LOGS];
    const isGlobalStore = globalStores.includes(storeName);

    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.openCursor();

        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) {
                resolve();
                return;
            }

            const item = cursor.value;

            if (!isGlobalStore) {
                const isSystemRecord = String(item?.id).startsWith('sys_') || String(item?.slug).startsWith('sys_');
                const itemProject = item?.project_code || item?.data?.project_code;
                const belongsToProject = isSystemRecord || !itemProject || itemProject === pCode;
                if (!belongsToProject) {
                    cursor.continue();
                    return;
                }
            }

            try {
                callback(item);
            } catch (e) {
                reject(e);
                return;
            }

            cursor.continue();
        };
        req.onerror = () => reject(req.error);
    });
}

async function dbDelete(storeName, key) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

async function dbClear(storeName) {
    const db = await openAppDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
    });
}

window.dbPut = dbPut;
window.dbGet = dbGet;
window.dbHasKey = dbHasKey;
window.dbGetAll = dbGetAll;
window.dbGetPageByIndex = dbGetPageByIndex;
window.dbCount = dbCount;
window.dbForEachCursor = dbForEachCursor;
window.dbDelete = dbDelete;
window.dbClear = dbClear;
window.dbPutBatch = dbPutBatch;

