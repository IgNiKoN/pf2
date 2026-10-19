/* Файл: js/shared/smart-input.utils.js */
/* Умная структурированная локация + кастомные dropdown автозаполнения (без datalist) — перенесено из js/app.js */

function _objects() {
    try {
        if (window.RBI && window.RBI.services && window.RBI.services.objects) {
            return window.RBI.services.objects;
        }
    } catch (e) {}
    return null;
}
function _contractors() {
    try {
        if (window.RBI && window.RBI.services && window.RBI.services.contractors) {
            return window.RBI.services.contractors;
        }
    } catch (e) {}
    return null;
}
function _objectList() {
    var o = _objects();
    if (!o || typeof o.list !== 'function') return [];
    var l = o.list();
    return Array.isArray(l) ? l : [];
}
function _contractorList() {
    var c = _contractors();
    if (!c || typeof c.list !== 'function') return [];
    var l = c.list();
    return Array.isArray(l) ? l : [];
}

// === УМНАЯ СТРУКТУРИРОВАННАЯ ЛОКАЦИЯ ===
// === НАЧАЛО ЗАМЕНЫ 1 (УМНАЯ ЛОКАЦИЯ) ===
function updateLocationFromStructured() {
    const secInput = document.getElementById('inp-section');
    const floorInput = document.getElementById('inp-floor');
    const roomInput = document.getElementById('inp-room');
    const locHidden = document.getElementById('inp-location');
    if (!secInput || !floorInput || !roomInput || !locHidden) return;

    let parts = [];

    let secVal = secInput.value.trim();
    if (secVal) {
        // НОВАЯ ЛОГИКА: "1" -> "Корпус 1", "1/2" -> "Корпус 1, секция 2"
        let slashMatch = secVal.match(/^(\d+)\s*\/\s*(\d+)$/);
        if (slashMatch) {
            parts.push(`Корпус ${slashMatch[1]}, секция ${slashMatch[2]}`);
        } else if (/^\d+$/.test(secVal)) {
            parts.push(`Корпус ${secVal}`);
        } else if (/^[\dА-Яа-яA-Za-z]+$/.test(secVal) && !secVal.toLowerCase().includes('корпус')) {
            parts.push(`Корпус ${secVal}`);
        } else {
            parts.push(secVal);
        }
    }

    let floorVal = floorInput.value.trim();
    if (floorVal) {
        if (/^-?\d+$/.test(floorVal)) parts.push(`Этаж ${floorVal}`);
        else parts.push(floorVal);
    }

    let roomVal = roomInput.value.trim();
    if (roomVal) {
        if (isNaN(roomVal) && !roomVal.toLowerCase().includes('оси') && !roomVal.toLowerCase().includes('пом')) {
            parts.push(`Оси ${roomVal}`);
        } else {
            parts.push(roomVal);
        }
    }

    locHidden.value = parts.join(', ');
    // scheduleSessionSave живёт в audit.actions — появляется после loadModule('quality').
    // На DCL (settings → object-directory.initUI) функции ещё нет — no-op, не error.
    if (typeof window.scheduleSessionSave === 'function') {
        window.scheduleSessionSave();
    }
    document.dispatchEvent(new CustomEvent('sharedSmartInput:locationUpdated'));
    setTimeout(updateBodyPadding, 50);
}
window.updateLocationFromStructured = updateLocationFromStructured;

// Привязка слушателей к инпутам локации
document.addEventListener("DOMContentLoaded", () => {
    ['inp-section', 'inp-floor', 'inp-room'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateLocationFromStructured);
            el.addEventListener('blur', () => {
                let val = el.value.trim();
                if (!val) return;
                // Форматируем для красоты при потере фокуса
                if (id === 'inp-section') {
                    let slashMatch = val.match(/^(\d+)\s*\/\s*(\d+)$/);
                    if (slashMatch) el.value = `Корпус ${slashMatch[1]}, секция ${slashMatch[2]}`;
                    else if (/^\d+$/.test(val)) el.value = `Корпус ${val}`;
                    else if (/^[\dА-Яа-яA-Za-z]+$/.test(val) && !val.toLowerCase().includes('корпус')) el.value = `Корпус ${val}`;
                }
                if (id === 'inp-floor' && /^-?\d+$/.test(val)) el.value = `Этаж ${val}`;
                if (id === 'inp-room' && isNaN(val) && !val.toLowerCase().includes('оси') && !val.toLowerCase().includes('пом')) el.value = `Оси ${val}`;
                updateLocationFromStructured();
            });
            el.addEventListener('focus', () => {
                // При фокусе убираем слова для удобного редактирования
                if (id === 'inp-section') {
                    el.value = el.value.replace(/^Корпус\s+(\d+),\s*секция\s+(\d+)$/i, '$1/$2').replace(/^Корпус\s+/i, '');
                }
                el.value = el.value.replace(/^(Секция|Этаж|Оси)\s+/i, '');
            });
        }
    });

    initSmartInput('inp-inspector', 'inspectorName');
    initSmartInput('inp-contractor', 'contractorName');
    initSmartInput('inp-section', 'section');
    initSmartInput('inp-floor', 'floor');
    initSmartInput('inp-room', 'room');
});
// === КОНЕЦ ЗАМЕНЫ 1 ===
// === Подгрузка нормализованных подрядчиков в поле "Подрядчик" на осмотре ===
// === Подгрузка нормализованных подрядчиков (Кастомный Dropdown) ===
// === Подгрузка нормализованных подрядчиков (Кастомный Dropdown) ===
window.loadContractorDirectoryToInspectionInput = async function () {
    const input = document.getElementById('inp-contractor');
    if (!input) return;

    // Убираем старый глючный datalist
    input.removeAttribute('list');

    try {
        let contractorNames = [];

        // Берем подрядчиков из справочника
        var contractorItems = _contractorList();
        if (contractorItems.length > 0) {
            contractorNames = contractorItems.map(c => c.display_name);
        } else if (window.RBI && window.RBI.services && window.RBI.services.storage) {
            const dirs = await window.RBI.services.storage.getAll('contractor_directory');
            if (dirs) {
                contractorNames = dirs.filter(c => !c._deleted && !c.is_deleted).map(c => c.display_name);
            }
        }

        // Добавляем тех, кто уже есть в нашей истории (на случай если справочник пуст)
        if (typeof window.contractorArray !== 'undefined') {
            const histNames = window.contractorArray.map(c => c.contractorName).filter(Boolean);
            contractorNames = contractorNames.concat(histNames);
        }

        // Оставляем только уникальные и сортируем по алфавиту
        if (contractorNames.length > 0) {
            contractorNames = [...new Set(contractorNames)].sort();

            // Загоняем их в кэш умного инпута
            if (!_smartInputMemoryCache) _smartInputMemoryCache = JSON.parse(localStorage.getItem('smart_input_cache') || '{}');
            _smartInputMemoryCache['contractorName'] = contractorNames;
            window._smartInputMemoryCache = _smartInputMemoryCache;
            localStorage.setItem('smart_input_cache', JSON.stringify(_smartInputMemoryCache));
        }

        // Инициализируем красивый iOS-подобный дропдаун
        initSmartInput('inp-contractor', 'contractorName');

    } catch (e) {
        console.warn('[Осмотр] Не удалось загрузить справочник подрядчиков:', e);
    }
};

window.loadObjectDirectoryToInspectionInput = async function () {
    const input = document.getElementById('inp-project');
    if (!input) return;

    input.removeAttribute('list');

    try {
        let objectNames = [];

        const cleanFn = (function () {
            var o = _objects();
            if (o && typeof o.cleanString === 'function') {
                return function (s) { return o.cleanString(s); };
            }
            const loc = window.RBI && window.RBI.services && window.RBI.services.locations;
            if (loc && typeof loc.cleanObjectName === 'function') {
                return function (s) { return loc.cleanObjectName(s); };
            }
            return function (s) {
                return String(s || '').toLowerCase().replace(/['"«»]/g, '').replace(/жк\s+/gi, '').trim();
            };
        })();

        // 1. Берём объекты из ObjectDirectory (C2b: проекция locations)
        var objectItems = _objectList();
        if (objectItems.length > 0) {
            objectNames = objectItems
                .filter(o => !o._deleted && !o.is_deleted)
                .map(o => o.display_name || o.name || o.canonical_key)
                .filter(Boolean);
        }

        // 2. C2b: если facade ещё пуст — locations first (не IDB project_objects)
        if (objectNames.length === 0) {
            try {
                const locEarly = window.RBI && window.RBI.services && window.RBI.services.locations;
                if (locEarly && typeof locEarly.listNodes === 'function') {
                    (locEarly.listNodes({ nodeType: 'object', parentId: null }) || []).forEach(function (n) {
                        if (n && n.displayName) objectNames.push(n.displayName);
                    });
                }
            } catch (_e0) { /* ignore */ }
        }

        // 2b. Merge locations.objects + synonyms — без дублей по clean-имени
        try {
            const loc = window.RBI && window.RBI.services && window.RBI.services.locations;
            if (loc && typeof loc.listNodes === 'function') {
                // parentId filter optional — берём все object, в т.ч. root
                const locObjs = (loc.listNodes({ nodeType: 'object', parentId: null }) || [])
                    .concat((loc.listNodes({ nodeType: 'object' }) || []).filter(function (n) {
                        return n && (n.parentId == null);
                    }));
                locObjs.forEach(function (n) {
                    if (n && n.displayName) objectNames.push(n.displayName);
                    if (n && Array.isArray(n.synonyms)) {
                        n.synonyms.forEach(function (syn) {
                            if (syn) objectNames.push(String(syn));
                        });
                    }
                });
            }
        } catch (_e) { /* ignore */ }

        // 3. Добавляем объекты из истории осмотров
        if (typeof window.contractorArray !== 'undefined') {
            const histNames = window.contractorArray
                .map(i => i.project_display_name || i.projectName || i.project_canonical_key)
                .filter(Boolean);

            objectNames = objectNames.concat(histNames);
        }

        const seen = new Set();
        const unique = [];
        objectNames.forEach(function (raw) {
            const v = String(raw || '').trim();
            if (!v) return;
            const k = cleanFn(v);
            if (!k || seen.has(k)) return;
            seen.add(k);
            unique.push(v);
        });
        objectNames = unique.sort();

        // Пишем в window-кэш (module-scope let может быть невидим другим classic-скриптам)
        let cacheObj = window._smartInputMemoryCache;
        if (!cacheObj || typeof cacheObj !== 'object') {
            try {
                cacheObj = JSON.parse(localStorage.getItem('smart_input_cache') || '{}') || {};
            } catch (_e) {
                cacheObj = {};
            }
        }
        cacheObj.projectName = objectNames;
        window._smartInputMemoryCache = cacheObj;
        // синхронизируем module-scope, если доступен
        try {
            if (typeof _smartInputMemoryCache !== 'undefined') {
                _smartInputMemoryCache = cacheObj;
            }
        } catch (_e) { /* ignore */ }
        localStorage.setItem('smart_input_cache', JSON.stringify(cacheObj));

        initSmartInput('inp-project', 'projectName');
        var od = _objects();
        if (od && typeof od.initUI === 'function') {
            od.initUI();
            // initUI может перезаписать projectName только из OD — возвращаем merge
            cacheObj = window._smartInputMemoryCache || cacheObj;
            cacheObj.projectName = objectNames;
            window._smartInputMemoryCache = cacheObj;
            try {
                if (typeof _smartInputMemoryCache !== 'undefined') _smartInputMemoryCache = cacheObj;
            } catch (_e2) { /* ignore */ }
            localStorage.setItem('smart_input_cache', JSON.stringify(cacheObj));
        }

    } catch (e) {
        console.warn('[Осмотр] Не удалось загрузить справочник объектов:', e);
    }
};
window.refreshInspectionDirectoriesAfterSync = async function () {
    try {
        // Обновляем внутренние справочники из IndexedDB после pull
        var contrSvc = _contractors();
        if (contrSvc && typeof contrSvc.init === 'function') {
            await contrSvc.init();
        }

        var objSvc = _objects();
        if (objSvc && typeof objSvc.init === 'function') {
            await objSvc.init();
        }

        // Пересобираем выпадающие списки в шапке осмотра
        if (typeof window.loadContractorDirectoryToInspectionInput === 'function') {
            await window.loadContractorDirectoryToInspectionInput();
        }

        if (typeof window.loadObjectDirectoryToInspectionInput === 'function') {
            await window.loadObjectDirectoryToInspectionInput();
        }

        var odRefresh = _objects();
        if (odRefresh && typeof odRefresh.initUI === 'function') {
            odRefresh.initUI();
        }

        console.log('[Inspection] Справочники подрядчиков и объектов обновлены после синхронизации');

    } catch (e) {
        console.warn('[Inspection] Не удалось обновить справочники после синхронизации:', e);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (
            typeof window.triggerSync === 'function' &&
            !window.triggerSync.__rbiInspectionRefreshWrapped
        ) {
            const originalTriggerSync = window.triggerSync;

            window.triggerSync = async function (...args) {
                const result = await originalTriggerSync.apply(this, args);

                setTimeout(() => {
                    if (typeof window.refreshInspectionDirectoriesAfterSync === 'function') {
                        window.refreshInspectionDirectoriesAfterSync();
                    }
                }, 500);

                return result;
            };

            window.triggerSync.__rbiInspectionRefreshWrapped = true;
            console.log('[Inspection] triggerSync обёрнут для обновления справочников');
        }
    }, 1000);
});
// Автоматически подгружаем подрядчиков после запуска приложения
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof window.loadContractorDirectoryToInspectionInput === 'function') {
            window.loadContractorDirectoryToInspectionInput();
        }

        if (typeof window.loadObjectDirectoryToInspectionInput === 'function') {
            window.loadObjectDirectoryToInspectionInput();
        }
    }, 1500);
});

// === Нормализация подрядчика перед сохранением осмотра ===
window.normalizeInspectionContractorBeforeSave = async function () {
    const input = document.getElementById('inp-contractor');

    if (!input) {
        return {
            contractor_raw_name: '',
            contractor_name: '',
            contractor_canonical_key: '',
            contractor_normalization_status: 'empty',
            contractorId: ''
        };
    }

    const rawName = input.value.trim();

    if (!rawName) {
        return {
            contractor_raw_name: '',
            contractor_name: '',
            contractor_canonical_key: '',
            contractor_normalization_status: 'empty',
            contractorId: ''
        };
    }

    const resolveContractorId = (normalized) => {
        var contrSvc = _contractors();
        if (contrSvc && typeof contrSvc.resolveIdFromNormalized === 'function') {
            return contrSvc.resolveIdFromNormalized(normalized) || '';
        }
        if (contrSvc && typeof contrSvc.getByCanonicalKey === 'function') {
            const key = normalized && normalized.canonical_key;
            const card = key ? contrSvc.getByCanonicalKey(key) : null;
            return (card && card.id) ? String(card.id) : '';
        }
        return '';
    };

    // Если справочник подрядчиков подключен — пробуем нормализовать
    var contrNormSvc = _contractors();
    if (contrNormSvc && (typeof contrNormSvc.normalize === 'function' || typeof contrNormSvc.normalizeContractorName === 'function')) {
        const result = typeof contrNormSvc.normalize === 'function'
            ? await contrNormSvc.normalize(rawName)
            : await contrNormSvc.normalizeContractorName(rawName);

        // Нашли подрядчика в справочнике / алиасах / синонимах
        if (result && result.canonical_key && result.display_name) {
            input.value = result.display_name;

            return {
                contractor_raw_name: rawName,
                contractor_name: result.display_name,
                contractor_canonical_key: result.canonical_key,
                contractor_normalization_status: 'matched',
                contractorId: resolveContractorId(result)
            };
        }

        // Не нашли — ContractorDirectory сам создаст заявку в очередь
        return {
            contractor_raw_name: rawName,
            contractor_name: rawName,
            contractor_canonical_key: '',
            contractor_normalization_status: 'pending',
            contractorId: ''
        };
    }

    // Если справочник не загрузился — просто сохраняем как текст
    return {
        contractor_raw_name: rawName,
        contractor_name: rawName,
        contractor_canonical_key: '',
        contractor_normalization_status: 'pending',
        contractorId: ''
    };
};

// === КАСТОМНЫЕ DROPDOWN АВТОЗАПОЛНЕНИЯ (БЕЗ DATALIST) ===
let _smartInputMemoryCache = null;

function _syncSmartInputCache() {
    window._smartInputMemoryCache = _smartInputMemoryCache;
}

function getSmartInputCache(field) {
    if (!_smartInputMemoryCache) {
        _smartInputMemoryCache = JSON.parse(localStorage.getItem('smart_input_cache') || '{}');
        _syncSmartInputCache();
    }
    if (!_smartInputMemoryCache[field]) {
        _smartInputMemoryCache[field] = [...new Set(window.contractorArray.map(i => i[field]).filter(Boolean))].slice(0, 15);
        localStorage.setItem('smart_input_cache', JSON.stringify(_smartInputMemoryCache));
    }
    return _smartInputMemoryCache[field];
}
window.getSmartInputCache = getSmartInputCache;

function updateSmartInputCache(field, value) {
    if (!value) return;
    if (!_smartInputMemoryCache) { _smartInputMemoryCache = JSON.parse(localStorage.getItem('smart_input_cache') || '{}'); _syncSmartInputCache(); }
    if (!_smartInputMemoryCache[field]) _smartInputMemoryCache[field] = [];

    if (_smartInputMemoryCache[field].includes(value)) {
        _smartInputMemoryCache[field] = _smartInputMemoryCache[field].filter(v => v !== value);
    }
    _smartInputMemoryCache[field].unshift(value);
    if (_smartInputMemoryCache[field].length > 15) _smartInputMemoryCache[field].pop();

    localStorage.setItem('smart_input_cache', JSON.stringify(_smartInputMemoryCache));
}
window.updateSmartInputCache = updateSmartInputCache;

function initSmartInput(inputId, dataField) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // Если уже инициализирован — не навешиваем повторные обработчики
    if (input.dataset.smartInputReady === '1') return;
    input.dataset.smartInputReady = '1';

    const wrapper = input.parentElement;
    if (wrapper && getComputedStyle(wrapper).position === 'static') {
        wrapper.style.position = 'relative';
    }
    const dropdown = document.createElement('div');
    // ЖЕСТКО ЗАДАЕМ ID ДЛЯ ЗАКРЫТИЯ
    dropdown.id = 'dd_' + inputId;
    dropdown.className = 'absolute top-full left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg mt-1 z-[5000] hidden max-h-48 overflow-y-auto custom-scrollbar';
    wrapper.appendChild(dropdown);

    const renderList = (filter = '') => {
        if (input.readOnly || input.disabled) {
            dropdown.classList.add('hidden');
            return;
        }

        let items = getSmartInputCache(dataField);
        if (filter) items = items.filter(i => String(i).toLowerCase().includes(filter.toLowerCase()));

        if (items.length === 0) {
            dropdown.innerHTML = '';
            dropdown.classList.add('hidden');
            return;
        }

        dropdown.innerHTML = items.map(val => {
            const safeVal = String(val).replace(/'/g, "\\'").replace(/"/g, '&quot;');
            // ТЕПЕРЬ ОН ТОЧНО ЗАКРОЕТСЯ, ТАК КАК ID ИЗВЕСТЕН
            return `<div class="p-2.5 text-[11px] font-bold border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-slate-700 dark:text-slate-300 transition-colors" 
                onmousedown="document.getElementById('${inputId}').value='${safeVal}'; document.getElementById('${inputId}').dispatchEvent(new Event('input')); document.getElementById('${dropdown.id}').classList.add('hidden');">
                ${val}
            </div>`;
        }).join('');
        dropdown.classList.remove('hidden');
    };

    input.addEventListener('focus', () => renderList());
    input.addEventListener('input', (e) => renderList(e.target.value));
    input.addEventListener('blur', () => { setTimeout(() => dropdown.classList.add('hidden'), 200); });
}
window.initSmartInput = initSmartInput;
