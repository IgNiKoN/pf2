/* Файл: js/services/object-directory.service.js */
/* Object Directory Service — справочник объектов, нормализация названий, панель управления объектами */
/* Слито из legacy js/objectDirectory.js (2026-07-06) */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    const objectDirectory = {
        objects: [], // C2b: проекция locations.object (не независимый каталог)
        leftoverObjects: [], // C2b: IDB project_objects без peer в locations (banner)
        aliases: {}, // Кэш алиасов (synonyms + leftover aliases)

        /** C2b: locations.object → OD-shape. */
        _nodeToOdShape(n) {
            if (!n) return null;
            const key = String(n.canonical_key || '').trim()
                || this.cleanString(n.displayName || '');
            return {
                id: n.id,
                canonical_key: key,
                display_name: n.displayName || key,
                name: n.displayName || key,
                synonyms: Array.isArray(n.synonyms)
                    ? n.synonyms.map((s) => String(s || '').trim()).filter(Boolean)
                    : [],
                project_code: window.syncConfig?.projectCode || '',
                created_by: n.created_by || '',
                updated_at: n.updated_at || new Date().toISOString(),
                is_deleted: false,
                _deleted: false,
                source: 'locations',
                sync_status: n.syncStatus || 'local'
            };
        },

        _locationsSvc() {
            return window.RBI && window.RBI.services && window.RBI.services.locations
                ? window.RBI.services.locations
                : null;
        },

        /** C2b: пересобрать objects/aliases из locations (+ leftover IDB). */
        async rebuildFromLocations() {
            const loc = this._locationsSvc();
            if (loc && typeof loc.init === 'function') {
                try { await loc.init(); } catch (_e) { /* ignore */ }
            }

            const nodes = (loc && typeof loc.listNodes === 'function')
                ? (loc.listNodes({ nodeType: 'object', parentId: null }) || [])
                    .filter((n) => n && !n.is_deleted && !n._deleted)
                : [];

            this.objects = nodes.map((n) => this._nodeToOdShape(n)).filter(Boolean);

            const nextAliases = {};
            this.objects.forEach((o) => {
                if (Array.isArray(o.synonyms)) {
                    o.synonyms.forEach((syn) => {
                        const s = String(syn || '').trim();
                        if (s && o.canonical_key) nextAliases[s] = o.canonical_key;
                    });
                }
            });

            this.leftoverObjects = [];
            try {
                if (typeof dbGetAll !== 'undefined') {
                    const storedObjs = await dbGetAll('project_objects');
                    const locKeys = new Set(
                        this.objects.map((o) => this.cleanString(o.canonical_key || '')).filter(Boolean)
                    );
                    (storedObjs || []).forEach((o) => {
                        if (!o || o._deleted || o.is_deleted) return;
                        const ck = this.cleanString(o.canonical_key || '');
                        if (!ck || locKeys.has(ck)) return;
                        this.leftoverObjects.push(o);
                    });

                    const storedAliases = await dbGetAll('object_aliases');
                    (storedAliases || []).forEach((a) => {
                        if (!a || !a.raw_name || !a.canonical_key) return;
                        if (!nextAliases[a.raw_name]) nextAliases[a.raw_name] = a.canonical_key;
                    });
                }
            } catch (e) {
                console.warn('[ObjectDirectory] leftover IDB read failed:', e);
            }

            this.aliases = nextAliases;
            return true;
        },

        // C2b: SoT = locations; IDB project_objects только leftover
        async init() {
            try {
                await this.rebuildFromLocations();
            } catch (e) {
                console.error("[ObjectDirectory] Ошибка инициализации:", e);
            }
            this.initUI();
        },

        // Очистка строки перед сравнением
        cleanString(str) {
            if (!str) return "";
            return str.toLowerCase()
                .replace(/['"«»]/g, '')
                .replace(/жк\s+/gi, '') // убираем приставку ЖК
                .trim();
        },


        /**
         * C2b: ensure locations.object (не пишет project_objects / не dirty OD sync).
         */
        async _ensureLocationsObjectPeer(canonicalKey, displayName, synonyms) {
            const key = String(canonicalKey || '').trim();
            if (!key) return null;
            try {
                const loc = this._locationsSvc();
                if (!loc) return null;
                if (typeof loc.init === 'function') await loc.init();
                const name = String(displayName || canonicalKey).trim() || key;
                const syn = Array.isArray(synonyms) ? synonyms : [];
                let node = null;
                if (typeof loc.ensureObjectNode === 'function') {
                    node = await loc.ensureObjectNode({
                        canonical_key: key,
                        displayName: name,
                        synonyms: syn
                    });
                } else if (typeof loc.createNode === 'function') {
                    const existing = (loc.listNodes({ nodeType: 'object', parentId: null }) || [])
                        .find((n) => this.cleanString(n.canonical_key || '') === this.cleanString(key));
                    if (existing) {
                        node = existing;
                        if (syn.length) {
                            const cur = Array.isArray(existing.synonyms) ? existing.synonyms.slice() : [];
                            syn.forEach((s) => {
                                if (!cur.some((x) => this.cleanString(x) === this.cleanString(s))) cur.push(s);
                            });
                            node = await loc.updateNode(existing.id, { synonyms: cur });
                        }
                    } else {
                        node = await loc.createNode({
                            nodeType: 'object',
                            displayName: name,
                            parentId: null,
                            canonical_key: key,
                            synonyms: syn
                        });
                    }
                }
                await this.rebuildFromLocations();
                return node;
            } catch (e) {
                console.warn('[ObjectDirectory] locations ensure failed:', e);
                return null;
            }
        },

        /** C2: match locations.object (locations-only) по key/display/synonyms. */
        _matchLocationsObject(cleanInput, rawName) {
            try {
                const loc = window.RBI && window.RBI.services && window.RBI.services.locations;
                if (!loc || typeof loc.listNodes !== 'function' || !cleanInput) return null;
                const nodes = (loc.listNodes({ nodeType: 'object', parentId: null }) || [])
                    .filter((n) => n && !n.is_deleted && !n._deleted);
                for (const n of nodes) {
                    const disp = this.cleanString(n.displayName || '');
                    const key = this.cleanString(n.canonical_key || '');
                    if (disp === cleanInput || (key && key === cleanInput)) {
                        return {
                            status: 'matched',
                            canonical_key: n.canonical_key || this.cleanString(n.displayName || rawName),
                            display_name: n.displayName || rawName,
                            raw_name: rawName,
                            match_type: 'locations_exact',
                            score: 1
                        };
                    }
                    if (Array.isArray(n.synonyms)) {
                        const hit = n.synonyms.some((syn) => this.cleanString(syn) === cleanInput);
                        if (hit) {
                            return {
                                status: 'matched',
                                canonical_key: n.canonical_key || this.cleanString(n.displayName || rawName),
                                display_name: n.displayName || rawName,
                                raw_name: rawName,
                                match_type: 'locations_synonym',
                                score: 1
                            };
                        }
                    }
                }
                let best = null;
                for (const n of nodes) {
                    const scores = [
                        this.getSimilarity(cleanInput, this.cleanString(n.displayName || '')),
                        this.getSimilarity(cleanInput, this.cleanString(n.canonical_key || ''))
                    ];
                    if (Array.isArray(n.synonyms)) {
                        n.synonyms.forEach((syn) => {
                            scores.push(this.getSimilarity(cleanInput, this.cleanString(syn || '')));
                        });
                    }
                    const score = Math.max(...scores);
                    if (score > 0.75 && (!best || score > best.score)) {
                        best = { n, score };
                    }
                }
                if (best) {
                    return {
                        status: 'matched',
                        canonical_key: best.n.canonical_key || this.cleanString(best.n.displayName || rawName),
                        display_name: best.n.displayName || rawName,
                        raw_name: rawName,
                        match_type: 'locations_fuzzy',
                        score: best.score
                    };
                }
            } catch (_e) { /* ignore */ }
            return null;
        },

        // Расчет процента совпадения (расстояние Левенштейна)
        getSimilarity(s1, s2) {
            if (!s1 || !s2) return 0;
            let longer = s1; let shorter = s2;
            if (s1.length < s2.length) { longer = s2; shorter = s1; }
            let longerLength = longer.length;
            if (longerLength === 0) return 1.0;

            let costs = new Array();
            for (let i = 0; i <= shorter.length; i++) costs[i] = i;
            for (let i = 1; i <= longer.length; i++) {
                let costsTemp = costs[0]; costs[0] = i; let nw = i - 1;
                for (let j = 1; j <= shorter.length; j++) {
                    let cj = Math.min(1 + Math.min(costs[j], costs[j - 1]), shorter[j - 1] === longer[i - 1] ? nw : nw + 1);
                    nw = costs[j]; costs[j] = cj;
                }
            }
            return (longerLength - costs[shorter.length]) / parseFloat(longerLength);
        },

        // Умная нормализация названия объекта
        async normalizeProjectName(inputRawName, isFromSkImport = false) {
            if (!inputRawName) {
                return {
                    status: 'empty',
                    canonical_key: '',
                    display_name: 'Не указан',
                    raw_name: ''
                };
            }

            const rawName = String(inputRawName).trim();
            const cleanInput = this.cleanString(rawName);

            // 1. Проверяем кэш алиасов
            if (this.aliases[rawName]) {
                const foundObj = this.objects.find(o => o.canonical_key === this.aliases[rawName]);
                if (foundObj) {
                    return {
                        status: 'matched',
                        canonical_key: foundObj.canonical_key,
                        display_name: foundObj.display_name,
                        raw_name: rawName,
                        match_type: 'alias',
                        score: 1
                    };
                }
            }

            // 2. Точное совпадение по display_name / canonical_key / synonyms
            for (let obj of this.objects) {
                const objDisplay = this.cleanString(obj.display_name || '');
                const objKey = this.cleanString(obj.canonical_key || '');

                if (objDisplay === cleanInput || objKey === cleanInput) {
                    return {
                        status: 'matched',
                        canonical_key: obj.canonical_key,
                        display_name: obj.display_name,
                        raw_name: rawName,
                        match_type: 'exact',
                        score: 1
                    };
                }

                if (Array.isArray(obj.synonyms)) {
                    const isSynonym = obj.synonyms.some(syn => this.cleanString(syn) === cleanInput);

                    if (isSynonym) {
                        return {
                            status: 'matched',
                            canonical_key: obj.canonical_key,
                            display_name: obj.display_name,
                            raw_name: rawName,
                            match_type: 'synonym',
                            score: 1
                        };
                    }
                }
            }

            // 2b. C2: locations exact/synonym до OD-fuzzy (locations — источник истины по структуре)
            const locExact = this._matchLocationsObject(cleanInput, rawName);
            if (locExact && (locExact.match_type === 'locations_exact' || locExact.match_type === 'locations_synonym')) {
                return locExact;
            }

            // 3. Нечёткий поиск по display_name, canonical_key и synonyms
            let matches = [];

            for (let obj of this.objects) {
                let scores = [];

                scores.push(this.getSimilarity(cleanInput, this.cleanString(obj.display_name || '')));
                scores.push(this.getSimilarity(cleanInput, this.cleanString(obj.canonical_key || '')));

                if (Array.isArray(obj.synonyms)) {
                    obj.synonyms.forEach(syn => {
                        scores.push(this.getSimilarity(cleanInput, this.cleanString(syn || '')));
                    });
                }

                const bestScore = Math.max(...scores);

                if (bestScore > 0.75) {
                    matches.push({
                        obj,
                        score: bestScore
                    });
                }
            }

            matches.sort((a, b) => b.score - a.score);

            // 4. Если найдено несколько близких совпадений — пока выбираем лучший,
            // но помечаем, что были альтернативы. Интерфейс выбора добавим позже.
            if (matches.length > 0) {
                const bestMatch = matches[0].obj;
                const bestScore = matches[0].score;

                this.aliases[rawName] = bestMatch.canonical_key;

                // C2b: memory-only alias + synonyms на locations — без dirty object_aliases sync
                try {
                    await this._ensureLocationsObjectPeer(
                        bestMatch.canonical_key,
                        bestMatch.display_name,
                        [rawName]
                    );
                } catch (_e) { /* ignore */ }

                return {
                    status: matches.length > 1 ? 'multiple_matched_auto_best' : 'matched',
                    canonical_key: bestMatch.canonical_key,
                    display_name: bestMatch.display_name,
                    raw_name: rawName,
                    match_type: 'fuzzy',
                    score: bestScore,
                    alternatives: matches.slice(1, 5).map(m => ({
                        canonical_key: m.obj.canonical_key,
                        display_name: m.obj.display_name,
                        score: m.score
                    }))
                };
            }

            // 4b. C2: locations fuzzy fallback (если OD fuzzy не сработал)
            const locFuzzy = this._matchLocationsObject(cleanInput, rawName);
            if (locFuzzy) return locFuzzy;

            // 5. Если совпадений нет — отправляем заявку руководителю на подтверждение
            const newKey = this.cleanString(rawName);

            if (typeof appSettings !== 'undefined' && !isFromSkImport) {
                if (!Array.isArray(appSettings.pendingAssignedProjects)) appSettings.pendingAssignedProjects = [];

                // Добавляем в очередь инженера
                const exists = appSettings.pendingAssignedProjects.some(p => p.raw_name === rawName);
                if (!exists) {
                    const reqObj = {
                        raw_name: rawName,
                        canonical_key: newKey,
                        display_name: rawName,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    };

                    appSettings.pendingAssignedProjects.push(reqObj);
                    if (typeof dbPut === 'function') dbPut('app_settings', { key: 'user_prefs', ...appSettings });

                    // Немедленно пушим заявку в профиль Supabase, чтобы Админ увидел её в панели
                    if (typeof window.pushObjectRequestToCloud === 'function') {
                        window.pushObjectRequestToCloud(reqObj).catch(e => {
                            console.warn('[ObjectDirectory] Не удалось отправить заявку на объект:', e);
                            localStorage.setItem('rbi_cloud_dirty', '1');
                        });
                    }
                }
            }

            return {
                status: 'not_normalized',
                canonical_key: newKey, // Временный системный ключ для связи дефектов
                display_name: rawName,
                raw_name: rawName,
                match_type: 'none',
                score: 0
            };
        },

        // Получить объект по canonical_key (без учёта регистра)
        getObjectByKey(canonicalKey) {
            if (!canonicalKey) return null;
            const clean = this.cleanString(canonicalKey);
            return this.objects.find(o =>
                this.cleanString(o.canonical_key || '') === clean
            ) || null;
        },

        getObjectById(id) {
            if (!id) return null;
            const sid = String(id).trim();
            return this.objects.find(o => String(o.id || '') === sid) || null;
        },

        _isUuidLike(value) {
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
        },

        /**
         * Резолв ссылки (UUID | canonical_key | display | synonym) → карточка объекта.
         */
        resolveObjectRef(ref) {
            const raw = String(ref || '').trim();
            if (!raw) return null;
            if (this._isUuidLike(raw)) {
                const byId = this.getObjectById(raw);
                if (byId) return byId;
            }
            const byKey = this.getObjectByKey(raw);
            if (byKey) return byKey;
            const clean = this.cleanString(raw);
            const byDisplay = this.objects.find(o =>
                this.cleanString(o.display_name || o.name || '') === clean
            );
            if (byDisplay) return byDisplay;
            if (this.aliases[raw]) {
                const viaAlias = this.getObjectByKey(this.aliases[raw]);
                if (viaAlias) return viaAlias;
            }
            const aliasKey = Object.keys(this.aliases || {}).find(a => this.cleanString(a) === clean);
            if (aliasKey) {
                const viaCleanAlias = this.getObjectByKey(this.aliases[aliasKey]);
                if (viaCleanAlias) return viaCleanAlias;
            }
            const bySyn = this.objects.find(o =>
                Array.isArray(o.synonyms) && o.synonyms.some(s => this.cleanString(s) === clean)
            );
            return bySyn || null;
        },

        /** UUID объекта из имени/ключа/id (пусто если не найден). */
        resolveProjectId(ref) {
            const obj = this.resolveObjectRef(ref);
            return obj && obj.id ? String(obj.id) : '';
        },

        /**
         * Нормализация assignedProjects → массив UUID (стабильный id узла locations.object).
         * Нерезолвленные строки сохраняются как есть (переходный dual-read).
         */
        normalizeAssignedProjectsList(list) {
            const arr = Array.isArray(list) ? list : [];
            const out = [];
            const seen = {};
            arr.forEach((item) => {
                const raw = String(item || '').trim();
                if (!raw) return;
                const obj = this.resolveObjectRef(raw);
                const id = obj && obj.id ? String(obj.id) : raw;
                if (seen[id]) return;
                seen[id] = true;
                out.push(id);
            });
            return out;
        },

        getDisplayForAssignedRef(ref) {
            const obj = this.resolveObjectRef(ref);
            if (obj) return obj.display_name || obj.canonical_key || String(ref || '');
            return String(ref || '');
        },

        /**
         * assignedProjects (UUID / key / name) → canonical_key[] для Supabase
         * `.in('project_canonical_key', …)`. Нерезолвленные строки оставляем как есть.
         */
        canonicalKeysForAssignedProjects(list) {
            const arr = Array.isArray(list) ? list : [];
            const out = [];
            const seen = {};
            arr.forEach((item) => {
                const raw = String(item || '').trim();
                if (!raw) return;
                const obj = this.resolveObjectRef(raw);
                const key = obj && obj.canonical_key ? String(obj.canonical_key) : raw;
                if (!key || seen[key]) return;
                seen[key] = true;
                out.push(key);
            });
            return out;
        },

        _recordProjectTokens(rec) {
            if (!rec || typeof rec !== 'object') {
                return { projectId: '', canonical: '', display: '', names: [] };
            }
            const projectId = String(rec.projectId || rec.project_id || '').trim();
            const canonical = String(rec.project_canonical_key || '').trim();
            const display = String(
                rec.project_display_name
                || rec.projectName
                || rec.project_name
                || rec.project_raw_name
                || rec.project
                || rec.display_name
                || ''
            ).trim();
            const names = [canonical, display].filter(Boolean);
            return { projectId, canonical, display, names };
        },

        /**
         * Совпадение записи с assignedProjects: primary UUID projectId,
         * fallback — cleanString canonical/display/synonym карточки.
         */
        isRecordInAssignedProjects(rec, assignedList) {
            const assigned = Array.isArray(assignedList) ? assignedList : [];
            if (!assigned.length) return false;
            const tokens = this._recordProjectTokens(rec);
            const assignedIds = this.normalizeAssignedProjectsList(assigned);

            if (tokens.projectId && this._isUuidLike(tokens.projectId)) {
                if (assignedIds.indexOf(tokens.projectId) >= 0) return true;
            }

            for (let i = 0; i < assignedIds.length; i++) {
                const ref = assignedIds[i];
                const obj = this.resolveObjectRef(ref);
                if (obj) {
                    if (tokens.projectId && String(obj.id) === tokens.projectId) return true;
                    const objCleanKey = this.cleanString(obj.canonical_key || '');
                    const objCleanDisplay = this.cleanString(obj.display_name || obj.name || '');
                    for (let n = 0; n < tokens.names.length; n++) {
                        const c = this.cleanString(tokens.names[n]);
                        if (!c) continue;
                        if (c === objCleanKey || c === objCleanDisplay) return true;
                        if (Array.isArray(obj.synonyms) && obj.synonyms.some(s => this.cleanString(s) === c)) {
                            return true;
                        }
                    }
                } else {
                    // Legacy assigned string без карточки — cleanString equals
                    const refClean = this.cleanString(ref);
                    for (let n = 0; n < tokens.names.length; n++) {
                        if (refClean && refClean === this.cleanString(tokens.names[n])) return true;
                    }
                }
            }
            return false;
        },

        /**
         * C2b facade: «создать OD» = ensure locations + rebuild проекции.
         * Не пишет project_objects / не включает OD sync.
         */
        async createFromLocation(opts) {
            const options = opts || {};
            const displayName = String(options.displayName || options.display_name || '').trim();
            if (!displayName) throw new Error('displayName обязателен');

            let key = String(options.canonical_key || '').trim();
            if (!key) key = this.cleanString(displayName);

            const existing = this.getObjectByKey(key)
                || this.objects.find(o =>
                    !o._deleted && !o.is_deleted
                    && this.cleanString(o.display_name || o.name || '') === this.cleanString(displayName)
                );
            if (existing) return existing;

            await this._ensureLocationsObjectPeer(key, displayName, []);
            await this.rebuildFromLocations();
            return this.getObjectByKey(key) || this.resolveObjectRef(displayName) || {
                id: key,
                canonical_key: key,
                display_name: displayName,
                synonyms: [],
                source: 'locations',
                sync_status: 'local',
                _deleted: false,
                is_deleted: false
            };
        },

        // Получить красивое название по canonical_key
        getDisplayNameByKey(canonicalKey) {
            const obj = this.resolveObjectRef(canonicalKey) || this.getObjectByKey(canonicalKey);
            return obj ? obj.display_name : canonicalKey;
        },

        /**
         * Слить написание (raw) в канонический объект: synonym + remap assigned у профилей.
         */
        async mergeRawNameIntoObject(rawName, targetObjectIdOrKey) {
            const raw = String(rawName || '').trim();
            const target = this.resolveObjectRef(targetObjectIdOrKey);
            if (!raw || !target || !target.id) {
                return { ok: false, error: 'missing_raw_or_target' };
            }
            const loc = this._locationsSvc();
            if (loc && typeof loc.updateNode === 'function') {
                const cur = Array.isArray(target.synonyms) ? target.synonyms.map(String) : [];
                if (!cur.some(s => this.cleanString(s) === this.cleanString(raw))) {
                    cur.push(raw);
                    await loc.updateNode(target.id, { synonyms: cur });
                    await this.rebuildFromLocations();
                }
            }
            this.aliases[raw] = target.canonical_key;

            // Remap assignedProjects в облачных профилях: старая строка → UUID
            let remappedProfiles = 0;
            if (window.supabaseClient && window.syncConfig && window.syncConfig.enabled) {
                const pCode = window.syncConfig.projectCode;
                try {
                    const { data: profiles } = await window.supabaseClient
                        .from('rbi_engineer_profiles')
                        .select('inspector_id, assigned_projects, settings')
                        .eq('project_code', pCode);
                    const list = Array.isArray(profiles) ? profiles : [];
                    for (let i = 0; i < list.length; i++) {
                        const p = list[i];
                        const col = Array.isArray(p.assigned_projects) ? p.assigned_projects.slice() : [];
                        const sett = (p.settings && typeof p.settings === 'object') ? Object.assign({}, p.settings) : {};
                        const settArr = Array.isArray(sett.assignedProjects) ? sett.assignedProjects.slice() : [];
                        const before = JSON.stringify(col) + JSON.stringify(settArr);
                        const mapOne = (v) => {
                            const s = String(v || '').trim();
                            if (!s) return s;
                            if (this.cleanString(s) === this.cleanString(raw) || s === target.canonical_key) {
                                return String(target.id);
                            }
                            return s;
                        };
                        const nextCol = this.normalizeAssignedProjectsList(col.map(mapOne));
                        const nextSett = this.normalizeAssignedProjectsList(settArr.map(mapOne));
                        sett.assignedProjects = nextSett;
                        if (JSON.stringify(nextCol) + JSON.stringify(nextSett) === before) continue;
                        const perm = window.RBI && window.RBI.services && window.RBI.services.permissions;
                        if (perm && typeof perm.writeUserProjectAssignment === 'function') {
                            await perm.writeUserProjectAssignment(p.inspector_id, nextCol, null, {
                                assignedProjects: nextSett,
                                requestedProjects: sett.requestedProjects
                            });
                        } else {
                            await window.supabaseClient.from('rbi_engineer_profiles').update({
                                assigned_projects: nextCol,
                                settings: sett,
                                updated_at: new Date().toISOString()
                            }).eq('inspector_id', p.inspector_id);
                        }
                        remappedProfiles++;
                    }
                } catch (e) {
                    console.warn('[ObjectDirectory.mergeRawNameIntoObject] profile remap', e);
                }
            }
            return { ok: true, targetId: target.id, remappedProfiles };
        },

        _emptyProjectBackfillCounters() {
            return { updated: 0, skipped: 0, already: 0, unmatched: 0, errors: 0 };
        },

        _legacyProjectBackfillTables() {
            // Облако: snake_case. Quality — project_name / project_*_key;
            // legacy construction — без project_canonical_key (object_id / floor_id).
            const inspSelect = 'id, projectId, project_canonical_key, project_display_name, project_name, is_deleted';
            const skSelect = 'id, projectId, project_canonical_key, project_display_name, project_raw_name, is_deleted';
            const defectSelect = 'id, projectId, floor_id, is_deleted';
            const acceptSelect = 'id, projectId, object_id, is_deleted';
            return [
                {
                    key: 'rbi_inspections',
                    cloudTable: 'rbi_inspections',
                    localStore: (typeof STORES !== 'undefined' && STORES.HISTORY) ? STORES.HISTORY : 'app_history',
                    cloudSelect: inspSelect
                },
                {
                    key: 'sk_records',
                    cloudTable: 'sk_records',
                    localStore: (typeof STORES !== 'undefined' && STORES.SK_RECORDS) ? STORES.SK_RECORDS : 'sk_records',
                    cloudSelect: skSelect
                },
                {
                    key: 'construction_defects',
                    cloudTable: 'construction_defects',
                    localStore: (typeof STORES !== 'undefined' && STORES.CONST_DEFECTS) ? STORES.CONST_DEFECTS : 'construction_defects',
                    cloudSelect: defectSelect
                },
                {
                    key: 'construction_acceptance',
                    cloudTable: 'construction_acceptance',
                    localStore: (typeof STORES !== 'undefined' && STORES.CONST_ACCEPTANCE) ? STORES.CONST_ACCEPTANCE : 'construction_acceptance',
                    cloudSelect: acceptSelect
                }
            ];
        },

        _resolveProjectIdFromConstructionLinks(rec) {
            if (!rec) return '';
            const oid = String(rec.object_id || rec.objectId || '').trim();
            if (oid) {
                if (this._isUuidLike(oid) && this.getObjectById(oid)) {
                    return oid;
                }
                const viaDir = this.resolveProjectId(oid);
                if (viaDir) return viaDir;
                if (window.ConstManager && Array.isArray(window.ConstManager.objects)) {
                    const cmObj = window.ConstManager.objects.find(o => o && String(o.id) === oid);
                    if (cmObj) {
                        const id = this.resolveProjectId(cmObj.canonical_key || cmObj.name || cmObj.display_name || '');
                        if (id) return id;
                    }
                }
            }
            const fid = String(rec.floor_id || rec.floorId || '').trim();
            if (fid && window.ConstManager) {
                const floors = Array.isArray(window.ConstManager.floors) ? window.ConstManager.floors : [];
                const buildings = Array.isArray(window.ConstManager.buildings) ? window.ConstManager.buildings : [];
                const objects = Array.isArray(window.ConstManager.objects) ? window.ConstManager.objects : [];
                const floor = floors.find(f => f && String(f.id) === fid);
                const bld = floor
                    ? buildings.find(b => b && String(b.id) === String(floor.building_id || ''))
                    : null;
                const cmObj = bld
                    ? objects.find(o => o && String(o.id) === String(bld.object_id || ''))
                    : null;
                if (cmObj) {
                    const id = this.resolveProjectId(cmObj.canonical_key || cmObj.name || cmObj.display_name || '');
                    if (id) return id;
                }
            }
            return '';
        },

        _classifyLegacyProjectId(rec) {
            const existing = String(rec && (rec.projectId || rec.project_id) || '').trim();
            if (this._isUuidLike(existing)) {
                return { status: 'already', id: existing };
            }
            const tokens = this._recordProjectTokens(rec);
            const candidates = [tokens.canonical, tokens.display].concat(tokens.names || []);
            for (let i = 0; i < candidates.length; i++) {
                const id = this.resolveProjectId(candidates[i]);
                if (id) return { status: 'update', id: id };
            }
            const viaConst = this._resolveProjectIdFromConstructionLinks(rec);
            if (viaConst) return { status: 'update', id: viaConst };

            if (!tokens.canonical && !tokens.display
                && !String(rec && (rec.object_id || rec.objectId || rec.floor_id || rec.floorId) || '').trim()) {
                return { status: 'skipped', id: '' };
            }
            return { status: 'unmatched', id: '' };
        },

        async _patchLocalProjectId(storeName, rec, projectId) {
            if (!rec || !rec.id || typeof dbPut !== 'function') return false;
            rec.projectId = projectId;
            if (Object.prototype.hasOwnProperty.call(rec, 'project_id')) {
                rec.project_id = projectId;
            }
            const obj = this.getObjectById(projectId);
            if (obj) {
                if (!rec.project_canonical_key) rec.project_canonical_key = obj.canonical_key;
                if (!rec.project_display_name) rec.project_display_name = obj.display_name;
            }
            await dbPut(storeName, rec);
            if (storeName === ((typeof STORES !== 'undefined' && STORES.HISTORY) ? STORES.HISTORY : 'app_history')
                && Array.isArray(window.contractorArray)) {
                const mem = window.contractorArray.find(x => x && x.id === rec.id);
                if (mem) {
                    mem.projectId = projectId;
                    if (obj) {
                        if (!mem.project_canonical_key) mem.project_canonical_key = obj.canonical_key;
                        if (!mem.project_display_name) mem.project_display_name = obj.display_name;
                    }
                }
            }
            return true;
        },

        async _updateCloudProjectId(cloudTable, id, projectId) {
            if (!window.supabaseClient || !id || !this._isUuidLike(projectId)) {
                throw new Error('cloud update unavailable');
            }
            const { error } = await window.supabaseClient
                .from(cloudTable)
                .update({ projectId: projectId })
                .eq('id', id);
            if (error) throw error;
            return true;
        },

        async backfillProjectIdsOnLegacyRecords(opts) {
            const options = opts || {};
            const batchSize = Math.max(1, Math.min(200, Number(options.batchSize) || 50));
            const onProgress = options.onProgress;

            await this.init();

            const tables = {};
            const totals = this._emptyProjectBackfillCounters();
            const cloudAvailable = !!(window.supabaseClient && window.syncConfig && window.syncConfig.enabled);
            const pCode = String(window.syncConfig?.projectCode || '').trim();
            const processedCloudIds = new Set();

            const bump = (counters, field) => {
                counters[field] = (counters[field] || 0) + 1;
                totals[field] = (totals[field] || 0) + 1;
            };

            for (const table of this._legacyProjectBackfillTables()) {
                const counters = this._emptyProjectBackfillCounters();
                tables[table.key] = counters;

                let localRows = [];
                try {
                    if (typeof dbGetAll === 'function') {
                        localRows = await dbGetAll(table.localStore) || [];
                    }
                } catch (e) {
                    console.warn('[objects.backfill] local read failed', table.key, e);
                    bump(counters, 'errors');
                }

                for (let i = 0; i < localRows.length; i++) {
                    const rec = localRows[i];
                    if (!rec || rec._deleted === true || rec.is_deleted === true) continue;
                    const decision = this._classifyLegacyProjectId(rec);
                    if (decision.status === 'already') {
                        bump(counters, 'already');
                        if (rec.id) processedCloudIds.add(String(rec.id));
                        continue;
                    }
                    if (decision.status === 'skipped') {
                        bump(counters, 'skipped');
                        continue;
                    }
                    if (decision.status === 'unmatched') {
                        bump(counters, 'unmatched');
                        continue;
                    }
                    try {
                        await this._patchLocalProjectId(table.localStore, rec, decision.id);
                        bump(counters, 'updated');
                        if (cloudAvailable && rec.id) {
                            try {
                                await this._updateCloudProjectId(table.cloudTable, rec.id, decision.id);
                                processedCloudIds.add(String(rec.id));
                            } catch (cloudErr) {
                                console.warn('[objects.backfill] cloud patch after local', table.key, rec.id, cloudErr);
                                bump(counters, 'errors');
                            }
                        }
                    } catch (e) {
                        console.warn('[objects.backfill] local patch failed', table.key, e);
                        bump(counters, 'errors');
                    }
                    if (typeof onProgress === 'function') {
                        onProgress({ phase: 'local', table: table.key, tables: tables, totals: totals, cloudAvailable: cloudAvailable });
                    }
                }

                // Cloud-only pages (records not on device)
                if (cloudAvailable && pCode) {
                    let from = 0;
                    let hasMore = true;
                    while (hasMore) {
                        let q = window.supabaseClient
                            .from(table.cloudTable)
                            .select(table.cloudSelect)
                            .range(from, from + batchSize - 1);
                        // project_code filter when column exists — inspections use it
                        try {
                            if (table.key === 'rbi_inspections' || table.key === 'sk_records') {
                                q = q.eq('project_code', pCode);
                            }
                        } catch (_e) { /* ignore */ }

                        const { data: page, error } = await q;
                        if (error) {
                            console.warn('[objects.backfill] cloud page', table.key, error);
                            bump(counters, 'errors');
                            break;
                        }
                        const rows = Array.isArray(page) ? page : [];
                        if (rows.length < batchSize) hasMore = false;
                        from += batchSize;

                        for (let r = 0; r < rows.length; r++) {
                            const rec = rows[r];
                            if (!rec || rec.is_deleted === true) continue;
                            if (rec.id && processedCloudIds.has(String(rec.id))) continue;
                            const decision = this._classifyLegacyProjectId(rec);
                            if (decision.status === 'already') {
                                bump(counters, 'already');
                                continue;
                            }
                            if (decision.status === 'skipped') {
                                bump(counters, 'skipped');
                                continue;
                            }
                            if (decision.status === 'unmatched') {
                                bump(counters, 'unmatched');
                                continue;
                            }
                            try {
                                await this._updateCloudProjectId(table.cloudTable, rec.id, decision.id);
                                bump(counters, 'updated');
                            } catch (e) {
                                console.warn('[objects.backfill] cloud-only patch', table.key, e);
                                bump(counters, 'errors');
                            }
                        }
                        if (typeof onProgress === 'function') {
                            onProgress({ phase: 'cloud', table: table.key, tables: tables, totals: totals, cloudAvailable: true });
                        }
                        if (!rows.length) hasMore = false;
                    }
                }

                if (typeof onProgress === 'function') {
                    onProgress({ phase: 'table_done', table: table.key, tables: tables, totals: totals, cloudAvailable: cloudAvailable });
                }
            }

            if (typeof onProgress === 'function') {
                onProgress({ phase: 'done', tables: tables, totals: totals, cloudAvailable: cloudAvailable });
            }
            return { tables: tables, totals: totals, cloudAvailable: cloudAvailable };
        },

        // Сверка локальной офлайн-истории нового инженера со справочником объектов
        // (current_plan.md §9, п.1) — вызывается ОДИН раз при первом переходе профиля
        // в cloud_status='approved' (симметрично флагу rbi_last_approved_pull_done
        // в sync-engine.core.js). Собирает уникальные "сырые" имена объектов из
        // локальных записей (app_history/sk_records), пропускает уже известные
        // справочнику (через normalizeProjectName), отправляет остальные через тот
        // же путь, что и импорт ПК СК (pushObjectRequestToCloud, source:'sk_import')
        // — админ увидит их в уже существующем экране «Заявки из ПК СК»
        // (object-directory.service.js:loadRequests/resolveDirectoryRequest),
        // обрабатывать можно по частям (заявки остаются pending до обработки).
        async scanOfflineHistoryForNewUser() {
            if (typeof dbGetAll !== 'function' || typeof window.pushObjectRequestToCloud !== 'function') return;

            try {
                const storeNames = ['app_history', 'sk_records'];
                const rawNames = new Set();

                for (const storeName of storeNames) {
                    let records = [];
                    try {
                        records = await dbGetAll(storeName) || [];
                    } catch (e) {
                        continue; // Стор может не существовать в конкретной сборке — не критично
                    }

                    records.forEach(r => {
                        if (r._deleted || r.is_deleted) return;
                        const raw = String(r.projectName || r.project_display_name || '').trim();
                        if (raw) rawNames.add(raw);
                    });
                }

                if (rawNames.size === 0) return;

                await this.init(); // Убеждаемся, что справочник свежий перед сверкой

                const nowIso = new Date().toISOString();
                for (const rawName of rawNames) {
                    let normalized;
                    try {
                        normalized = await this.normalizeProjectName(rawName, /* isFromSkImport */ true);
                    } catch (e) {
                        continue;
                    }

                    // matched/multiple_matched_auto_best — объект уже есть в справочнике,
                    // сверка не нужна. Только 'not_normalized' идёт админу на решение.
                    if (!normalized || normalized.status === 'matched' || normalized.status === 'multiple_matched_auto_best') {
                        continue;
                    }

                    try {
                        await window.pushObjectRequestToCloud({
                            raw_name: rawName,
                            canonical_key: '',
                            display_name: rawName,
                            status: 'pending',
                            source: 'sk_import',
                            created_at: nowIso
                        });
                    } catch (e) {
                        console.warn('[ObjectDirectory] scanOfflineHistoryForNewUser: не удалось отправить заявку для', rawName, e);
                    }
                }
            } catch (e) {
                console.error('[ObjectDirectory] scanOfflineHistoryForNewUser', e);
            }
        },

        /**
         * Закреплённые объекты → карточки для UI (display_name, не сырой UUID).
         * Берёт permissions.getAssignedProjects() (уже UUID-нормализованный),
         * резолв через resolveObjectRef (UUID | key | name).
         */
        getAssignedProjectObjects() {
            let assigned = [];
            try {
                const perm = window.RBI && window.RBI.services && window.RBI.services.permissions;
                if (perm && typeof perm.getAssignedProjects === 'function') {
                    assigned = perm.getAssignedProjects() || [];
                }
            } catch (_e) { /* fall through */ }
            if (!Array.isArray(assigned) || assigned.length === 0) {
                assigned = this.getAssignedProjects();
            }

            const out = [];
            const seen = {};
            (Array.isArray(assigned) ? assigned : []).forEach((ref) => {
                const raw = String(ref || '').trim();
                if (!raw) return;
                const obj = this.resolveObjectRef(raw);
                let id = '';
                let key = '';
                let display = '';
                if (obj) {
                    id = String(obj.id || '').trim();
                    key = String(obj.canonical_key || '').trim();
                    display = String(obj.display_name || obj.name || key || '').trim();
                } else {
                    key = raw;
                    display = String(this.getDisplayForAssignedRef(raw) || '').trim();
                    // Нерезолвленный UUID не показываем как «имя» в списках
                    if (this._isUuidLike(display)) display = key && !this._isUuidLike(key) ? key : '';
                }
                const dedupe = id || key || display || raw;
                if (!dedupe || seen[dedupe]) return;
                seen[dedupe] = true;
                // Для lock/count оставляем запись даже если display ещё пуст (карточка не подгрузилась)
                out.push({
                    id: id || undefined,
                    canonical_key: key || raw,
                    display_name: display || (this._isUuidLike(raw) ? '' : raw) || key
                });
            });
            return out;
        },
        getAssignedProjects() {
            if (typeof appSettings === 'undefined' || !appSettings.assignedProjects) return [];
            return appSettings.assignedProjects;
        },

        initUI() {
            const projectInput = document.getElementById('inp-project');
            if (!projectInput) return;

            const wrapper = projectInput.parentElement;
            if (wrapper && getComputedStyle(wrapper).position === 'static') {
                wrapper.style.position = 'relative';
            }

            const currentRole = window.RBI.services.permissions ? window.RBI.services.permissions.getCurrentRole() : 'guest';
            const isManagerRole = window.RBI.services.permissions ? window.RBI.services.permissions.canManageHierarchy() : ['director', 'deputy_manager', 'manager'].includes(currentRole);

            let availableObjects = [];

            if (isManagerRole) {
                availableObjects = Array.isArray(this.objects)
                    ? this.objects.filter(o => !o._deleted && !o.is_deleted)
                    : [];
            } else {
                availableObjects = this.getAssignedProjectObjects()
                    .filter(o => o && (o.display_name || o.canonical_key));
            }

            const objectNames = [...new Set(
                availableObjects
                    .map(o => String(o.display_name || o.name || '').trim())
                    .filter((name) => name && !this._isUuidLike(name))
            )];

            // C1: полный каталог locations.object — только менеджерам.
            // У инженера/РП список = только assigned (как до регресса 5852a45).
            if (isManagerRole) {
                try {
                    const loc = window.RBI && window.RBI.services && window.RBI.services.locations;
                    if (loc && typeof loc.listNodes === 'function') {
                        const locObjs = loc.listNodes({ nodeType: 'object', parentId: null }) || [];
                        locObjs.forEach(function (n) {
                            if (n && n.displayName) objectNames.push(String(n.displayName).trim());
                        });
                    }
                } catch (_e) { /* ignore */ }
            }

            const clean = (typeof this.cleanString === 'function')
                ? (s) => this.cleanString(s)
                : (s) => String(s || '').toLowerCase().trim();
            const seen = new Set();
            const mergedNames = [];
            objectNames.forEach(function (raw) {
                const v = String(raw || '').trim();
                if (!v) return;
                const k = clean(v);
                if (!k || seen.has(k)) return;
                seen.add(k);
                mergedNames.push(v);
            });
            mergedNames.sort();

            const cacheTarget = (typeof window._smartInputMemoryCache === 'object' && window._smartInputMemoryCache)
                ? window._smartInputMemoryCache
                : (JSON.parse(localStorage.getItem('smart_input_cache') || '{}') || {});
            cacheTarget.projectName = mergedNames;
            window._smartInputMemoryCache = cacheTarget;
            if (typeof _smartInputMemoryCache !== 'undefined') {
                try {
                    if (!_smartInputMemoryCache) {
                        _smartInputMemoryCache = cacheTarget;
                    } else {
                        _smartInputMemoryCache['projectName'] = mergedNames;
                    }
                } catch (_e2) { /* module-scope недоступен из classic */ }
            }
            localStorage.setItem('smart_input_cache', JSON.stringify(cacheTarget));

            // Убираем всё, что делает объект похожим на select/datalist
            projectInput.removeAttribute('list');
            projectInput.style.backgroundImage = 'none';

            projectInput.className = 'input-base text-center transition-colors';

            // Удаляем старый отдельный dropdown объекта, если он был создан прежней логикой
            const oldCustomDropdown = document.getElementById('dd_inp-project-custom');
            if (oldCustomDropdown) oldCustomDropdown.remove();

            // Удаляем старую стрелку, если она была создана прежней логикой
            if (wrapper) {
                wrapper.querySelectorAll('[data-project-arrow="1"]').forEach(el => el.remove());
            }

            const lockIcon = document.getElementById('lock-inp-project');

            const shouldLock = !isManagerRole && availableObjects.length === 1;

            if (shouldLock) {
                const onlyObj = availableObjects[0];
                let displayName = String(onlyObj.display_name || onlyObj.name || '').trim();
                if (!displayName || this._isUuidLike(displayName)) {
                    displayName = String(this.getDisplayForAssignedRef(onlyObj.id || onlyObj.canonical_key) || '').trim();
                }
                if (!displayName || this._isUuidLike(displayName)) {
                    const ck = String(onlyObj.canonical_key || '').trim();
                    displayName = (ck && !this._isUuidLike(ck)) ? ck : displayName;
                }

                projectInput.value = displayName;
                projectInput.dataset.displayName = displayName;
                projectInput.dataset.canonicalKey = onlyObj.canonical_key || displayName;
                if (onlyObj.id) projectInput.dataset.projectId = String(onlyObj.id);

                projectInput.setAttribute('readonly', 'true');

                projectInput.className =
                    'input-base text-center transition-colors bg-indigo-600 text-white border-indigo-400 font-black cursor-default pr-8 project-locked';

                if (lockIcon) {
                    lockIcon.classList.remove('hidden');
                    lockIcon.classList.add('project-lock-visible');
                }
            } else {
                projectInput.removeAttribute('readonly');
                projectInput.className = 'input-base text-center transition-colors';

                if (lockIcon) {
                    lockIcon.classList.add('hidden');
                    lockIcon.classList.remove('project-lock-visible');
                }

                // Если текущее значение не входит в доступные объекты, не стираем его:
                // пользователь мог вводить объект вручную до синхронизации.
                const currentValue = String(projectInput.value || '').trim();
                const matched = availableObjects.find(o =>
                    o.display_name === currentValue ||
                    o.canonical_key === currentValue
                );

                if (matched) {
                    projectInput.dataset.displayName = matched.display_name || currentValue;
                    projectInput.dataset.canonicalKey = matched.canonical_key || '';
                }
            }

            // Подключаем тот же кастомный dropdown, что и у подрядчика
            if (typeof initSmartInput === 'function') {
                initSmartInput('inp-project', 'projectName');
            }

            if (typeof updateLocationFromStructured === 'function') {
                updateLocationFromStructured();
            }

            if (typeof updateDataSummary === 'function') {
                updateDataSummary();
            }
        },

        renderManagerPanel() {
            const container = document.getElementById('manager-objects-list');
            if (!container) return;

            const leftover = Array.isArray(this.leftoverObjects) ? this.leftoverObjects.length : 0;
            const count = Array.isArray(this.objects) ? this.objects.length : 0;
            container.innerHTML = `
            <div class="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 p-3 rounded-xl mb-4 text-[10px] text-teal-800 dark:text-teal-300 shadow-sm leading-relaxed">
                <b>C2b:</b> каталог объектов ведётся в <b>Настройки → Администрирование → Объекты и планы</b>
                (иерархия object → building → …). Плоский CRUD здесь отключён.<br>
                В locations сейчас объектов: <b>${count}</b>.
                ${leftover ? `<br>OD leftover (локальный IDB без peer): <b>${leftover}</b> — без Apply/sync.` : ''}
            </div>
            <div class="text-center py-4 text-slate-400 text-[10px] font-bold uppercase tracking-widest border border-dashed border-slate-300 rounded-xl bg-white dark:bg-slate-800">
                Редактирование — в Настройки → Администрирование
            </div>`;
        },

        // НОВАЯ ФУНКЦИЯ: Загрузка заявок из Supabase
        async loadRequests() {
            const listEl = document.getElementById('obj-requests-list');
            if (!listEl || !window.supabaseClient) {
                if (listEl) listEl.innerHTML = '<div class="text-slate-400 text-[10px] text-center font-bold">Облако не подключено</div>';
                return;
            }

            try {
                const pCode = window.syncConfig?.projectCode || 'RBI';

                // 1. Получаем профили (заявки от инженеров на доступ)
                const { data: usersData, error: usersError } = await window.supabaseClient
                    .from('rbi_engineer_profiles')
                    .select('inspector_id, engineer_name, settings')
                    .eq('project_code', pCode);

                if (usersError) throw usersError;

                // 2. Получаем заявки из ПК СК (на добавление в справочник)
                const { data: directoryQueue, error: queueError } = await window.supabaseClient
                    .from('object_normalization_queue')
                    .select('id, project_code, raw_name, suggested_canonical_key, source_table, created_by, status, admin_comment, created_at, updated_at')
                    .eq('project_code', pCode)
                    .neq('status', 'linked')
                    .neq('status', 'resolved')
                    .neq('status', 'rejected')
                    .order('updated_at', { ascending: false });

                if (queueError) throw queueError;

                let requestsHtml = '';

                // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Формируем опции селекта ДО того, как их используем!
                let allObjsOptions = this.objects.map(o => `<option value="link_${o.canonical_key}">Связать с: ${o.display_name}</option>`).join('');

                // --- РЕНДЕР ЗАЯВОК ИЗ ПК СК ---
                if (Array.isArray(directoryQueue) && directoryQueue.length > 0) {
                    requestsHtml += `
                        <div class="text-[10px] font-black text-indigo-700 dark:text-indigo-400 uppercase mb-2 mt-2 flex items-center gap-1">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> 
                            Заявки из ПК СК (Excel)
                        </div>
                        ${directoryQueue.map(q => {
                        const raw = String(q.raw_name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
                        const qid = String(q.id || '').replace(/"/g, '&quot;');
                        const selectId = 'obj_queue_action_' + qid;
                        return `
                                <div class="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-2">
                                    <div class="text-[11px] font-black text-slate-800 dark:text-white mb-1 uppercase truncate">${raw}</div>
                                    <div class="text-[8px] text-slate-400 mb-2 font-bold">Автор загрузки: ${q.created_by || 'Система'}</div>
                                    <div class="flex flex-col gap-2">
                                        <select id="${selectId}" class="input-base !py-1.5 !text-[10px] font-bold w-full bg-[var(--hover-bg)]">
                                            <option value="create">✨ Создать новый объект</option>
                                            <optgroup label="Связать со справочником:">${allObjsOptions}</optgroup>
                                            <option value="reject">❌ Отклонить</option>
                                        </select>
                                        <button onclick="const action = document.getElementById('${selectId}').value; ObjectDirectory.resolveDirectoryRequest('${qid}', '${raw}', action);" class="bg-indigo-600 text-white py-2 rounded-lg text-[10px] font-black uppercase shadow-sm active:scale-95 transition-transform w-full">Сохранить решение</button>
                                    </div>
                                </div>
                            `;
                    }).join('')}
                    `;
                }

                // --- РЕНДЕР ЗАЯВОК ОТ ИНЖЕНЕРОВ ---
                if (usersData && usersData.length > 0) {
                    usersData.forEach(user => {
                        const reqs = user.settings?.requestedProjects || [];
                        if (reqs.length === 0) return;

                        const safeEng = String(user.engineer_name || user.inspector_id).replace(/"/g, '&quot;');

                        requestsHtml += `
                        <div class="text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase mb-2 mt-4 flex items-center gap-1">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg> 
                            Заявки на доступ: ${safeEng}
                        </div>
                        ${reqs.map((req, idx) => {
                            const raw = String(req.raw_name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
                            const selectId = 'req_action_' + user.inspector_id + '_' + idx;
                            // Заявка на снятие объекта (self-service снятие запрещено —
                            // current_plan.md §8): нет смысла в "создать"/"связать",
                            // только подтвердить снятие или отклонить (оставить объект).
                            if (req.request_type === 'unassign') {
                                return `
                                <div class="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-2">
                                    <div class="text-[11px] font-black text-slate-800 dark:text-white mb-2 uppercase truncate">⬅️ Снять объект: ${raw}</div>
                                    <div class="flex gap-2">
                                        <button onclick="ObjectDirectory.resolveRequest('${user.inspector_id}', ${idx}, '${raw}', 'unassign_confirm')" class="flex-1 bg-orange-50 text-orange-700 border border-orange-200 py-2 rounded-lg text-[9px] font-black uppercase shadow-sm active:scale-95 transition-transform">Подтвердить снятие</button>
                                        <button onclick="ObjectDirectory.resolveRequest('${user.inspector_id}', ${idx}, '${raw}', 'reject')" class="flex-1 bg-red-50 text-red-600 border border-red-200 py-2 rounded-lg text-[9px] font-black uppercase shadow-sm active:scale-95 transition-transform">Отклонить</button>
                                    </div>
                                </div>
                            `;
                            }
                            return `
                                <div class="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--card-border)] shadow-sm mb-2">
                                    <div class="text-[11px] font-black text-slate-800 dark:text-white mb-2 uppercase truncate">${raw}</div>
                                    <div class="flex gap-2 mb-2">
                                        <button onclick="ObjectDirectory.resolveRequest('${user.inspector_id}', ${idx}, '${raw}', 'create')" class="flex-1 bg-green-50 text-green-700 border border-green-200 py-2 rounded-lg text-[9px] font-black uppercase shadow-sm active:scale-95 transition-transform">Создать новый</button>
                                        <button onclick="ObjectDirectory.resolveRequest('${user.inspector_id}', ${idx}, '${raw}', 'reject')" class="flex-1 bg-red-50 text-red-600 border border-red-200 py-2 rounded-lg text-[9px] font-black uppercase shadow-sm active:scale-95 transition-transform">Отклонить</button>
                                    </div>
                                    <div class="flex items-center gap-1">
                                        <select id="${selectId}" class="input-base !py-1.5 !text-[9px] font-bold flex-1 bg-[var(--hover-bg)]">
                                            <option value="" disabled selected>Или связать с...</option>
                                            ${allObjsOptions}
                                        </select>
                                        <button onclick="const sel = document.getElementById('${selectId}').value; if(!sel) return showToast('Выберите объект!'); ObjectDirectory.resolveRequest('${user.inspector_id}', ${idx}, '${raw}', sel);" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase shadow-sm active:scale-95 shrink-0 transition-transform">Связать</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}`;
                    });
                }

                if (!requestsHtml) {
                    listEl.innerHTML = '<div class="text-slate-500 text-[10px] font-bold text-center bg-[var(--card-bg)] p-4 rounded-xl border border-dashed border-[var(--card-border)]">Новых заявок на объекты нет</div>';
                } else {
                    listEl.innerHTML = requestsHtml;
                }

            } catch (e) {
                console.error('[ObjectDirectory] Ошибка loadRequests:', e);
                listEl.innerHTML = '<div class="text-red-500 text-[10px] font-bold text-center">Ошибка загрузки заявок</div>';
            }
        },
        // Применение решения Админа по справочной заявке из ПК СК.
        // ВАЖНО: не закрепляет объект ни за кем, только добавляет/связывает справочник.
        async resolveDirectoryRequest(queueId, rawName, action) {
            if (!queueId || !rawName) return showToast('Некорректная заявка');
            if (action === 'ignore') return showToast('Заявка оставлена в ожидании');

            showToast('Обработка заявки справочника...');

            try {
                const pCode = window.syncConfig?.projectCode || 'RBI';
                const nowIso = new Date().toISOString();

                if (action === 'create') {
                    const newKey = this.cleanString(rawName);

                    // C2b: создаём в locations (не project_objects)
                    await this._ensureLocationsObjectPeer(newKey, rawName, [rawName]);
                    this.aliases[rawName] = newKey;

                    showToast('✅ Объект добавлен в справочник локаций');
                }
                else if (action.startsWith('link_')) {
                    const canonicalKey = action.replace('link_', '');

                    await this._ensureLocationsObjectPeer(canonicalKey, null, [rawName]);
                    this.aliases[rawName] = canonicalKey;

                    showToast('✅ Объект связан со справочником');
                }

                // 3. Обновляем статус самой заявки в облаке (тут прямой запрос допустим, так как таблица простая)
                if (window.supabaseClient) {
                    let qStatus = action === 'reject' ? 'rejected' : 'linked';
                    await window.supabaseClient.from('object_normalization_queue').update({
                        status: qStatus,
                        admin_comment: action === 'reject' ? 'Отклонено' : 'Обработано',
                        updated_at: nowIso
                    }).eq('id', queueId);
                }

                // Перерисовываем интерфейс
                this.renderManagerPanel();
                this.loadRequests();

                // locations dirty → sync location_nodes (admin); OD sync отключён C2b
                localStorage.setItem('rbi_cloud_dirty', '1');
                if (typeof triggerSync === 'function') triggerSync('silent');

            } catch (e) {
                console.error('[ObjectDirectory.resolveDirectoryRequest]', e);
                showToast('❌ Ошибка обработки справочной заявки');
            }
        },
        // Применение решения Админа по заявке от Инженера
        async resolveRequest(inspectorId, reqIdx, rawName, action) {
            if (action === 'ignore') return showToast('Заявка оставлена в ожидании');

            showToast('Обработка заявки...');
            try {
                const pCode = window.syncConfig?.projectCode || 'RBI';
                const nowIso = new Date().toISOString();

                // 1. Получаем профиль инженера
                const { data: user, error: fetchErr } = await window.supabaseClient
                    .from('rbi_engineer_profiles')
                    .select('settings, assigned_projects')
                    .eq('inspector_id', inspectorId)
                    .single();

                if (fetchErr) throw fetchErr;

                let assigned = user.assigned_projects || [];
                let settings = user.settings || {};
                let reqs = settings.requestedProjects || [];

                // 2. Логика по действиям
                if (action === 'unassign_confirm') {
                    // Подтверждение заявки на снятие (self-service снятие запрещено —
                    // current_plan.md §8): пользователь нажал ✕ у себя, теперь реально
                    // убираем объект из assigned.
                    const req = reqs[reqIdx] || {};
                    const keyToRemove = req.canonical_key || rawName;
                    assigned = assigned.filter(p => p !== keyToRemove);
                    showToast('Объект снят с пользователя');
                }
                else if (action === 'create') {
                    const newKey = this.cleanString(rawName);

                    // C2b: locations only
                    await this._ensureLocationsObjectPeer(newKey, rawName, [rawName]);
                    this.aliases[rawName] = newKey;

                    if (!assigned.includes(newKey)) assigned.push(newKey);
                    showToast('Создан новый объект и выдан доступ!');
                }
                else if (action.startsWith('link_')) {
                    const canonicalKey = action.replace('link_', '');
                    if (!assigned.includes(canonicalKey)) assigned.push(canonicalKey);

                    await this._ensureLocationsObjectPeer(canonicalKey, null, [rawName]);
                    this.aliases[rawName] = canonicalKey;

                    showToast('Объект связан, доступ выдан!');
                }
                else if (action === 'reject') {
                    showToast('Заявка отклонена');
                }

                // 3. Удаляем заявку из массива инженера
                reqs.splice(reqIdx, 1);

                // 4. Сохраняем обновленный профиль инженера через единую точку
                // записи (permission.service.js) — обновляет ОБА поля профиля
                // (assigned_projects + settings.assignedProjects) синхронно;
                // раньше здесь settings.assignedProjects не трогалось вовсе,
                // расходясь с колонкой assigned_projects (см. current_plan.md §2).
                var _permSvcResolve = (window.RBI && window.RBI.services && window.RBI.services.permissions);
                if (_permSvcResolve && typeof _permSvcResolve.writeUserProjectAssignment === 'function') {
                    const { error: writeErr } = await _permSvcResolve.writeUserProjectAssignment(
                        inspectorId,
                        assigned,
                        {},
                        { requestedProjects: reqs }
                    );
                    if (writeErr) throw writeErr;
                } else {
                    settings.requestedProjects = reqs;
                    settings.assignedProjects = assigned;
                    await window.supabaseClient.from('rbi_engineer_profiles').update({
                        assigned_projects: assigned,
                        settings: settings,
                        updated_at: nowIso
                    }).eq('inspector_id', inspectorId);
                }

                // Обновляем панель
                this.renderManagerPanel();
                this.loadRequests();

                localStorage.setItem('rbi_cloud_dirty', '1');
                if (typeof triggerSync === 'function') triggerSync('silent');

            } catch (e) {
                console.error(e);
                showToast('Ошибка обработки заявки');
            }
        },

        // C2b: создание объекта → locations (не project_objects)
        async addNewObjectInline() {
            const inputEl = document.getElementById('inline-new-obj-name');
            const name = inputEl ? inputEl.value.trim() : '';
            if (!name) return showToast("⚠️ Введите название объекта!");

            const canonical = this.cleanString(name);
            if (this.objects.find(o => o.canonical_key === canonical)) {
                return showToast("⚠️ Объект с таким названием уже существует!");
            }

            await this._ensureLocationsObjectPeer(canonical, name, []);

            showToast("✅ Объект добавлен в Справочник локаций!");
            if (inputEl) inputEl.value = '';
            this.renderManagerPanel();
        },

        // C2b: синоним → locations.synonyms (без dirty object_aliases)
        async addAliasInline(canonicalKey, predefinedValue = null) {
            const inputEl = document.getElementById(`alias_input_${canonicalKey}`);
            const alias = predefinedValue || (inputEl ? inputEl.value.trim() : '');

            if (!alias) return showToast("⚠️ Введите текст синонима!");

            if (this.aliases[alias]) {
                if (!predefinedValue) showToast("⚠️ Такой синоним уже привязан к другому объекту!");
                return;
            }

            if (!predefinedValue) showToast("⏳ Сохранение синонима...");

            try {
                this.aliases[alias] = canonicalKey;
                await this._ensureLocationsObjectPeer(canonicalKey, null, [alias]);

                if (!predefinedValue) {
                    if (inputEl) inputEl.value = '';
                    showToast("🔗 Синоним привязан!");
                    this.renderManagerPanel();
                    localStorage.setItem('rbi_cloud_dirty', '1');
                    if (typeof triggerSync === 'function') triggerSync('silent');
                }
            } catch (e) {
                console.error('[addAliasInline]', e);
                if (!predefinedValue) showToast("❌ Ошибка при добавлении синонима");
            }
        },

        // ИИ Генерация синонимов для объекта (Пакетное сохранение)
        async generateObjectSynonymsAI(canonicalKey, displayName) {
            if (typeof appSettings === 'undefined' || !appSettings.aiEnabled) return showToast("⚠️ Включите AI-ассистента в настройках!");

            showToast("🧠 DeepSeek придумывает возможные опечатки...");

            const promptSystem = `Ты — эксперт по строительному документообороту. Твоя задача — сгенерировать 5-6 самых вероятных вариантов, как инженеры могут сократить или написать с опечаткой название строительного объекта (ЖК) "${displayName}" в отчетах. (например, без слова ЖК, сокращенно, слитное написание очередей).
            Верни СТРОГО список через запятую. Никаких других слов, нумерации или приветствий.`;

            try {
                const response = await window.callAI([
                    { role: 'system', content: promptSystem },
                    { role: 'user', content: `Сгенерируй синонимы для объекта: ${displayName}` }
                ], { temperature: 0.4, max_tokens: 150 });

                const aiSynonyms = response.split(',').map(s => s.trim().replace(/['"«»]/g, '')).filter(Boolean);

                if (aiSynonyms.length === 0) throw new Error("ИИ вернул пустой список");

                showToast(`✨ ИИ придумал ${aiSynonyms.length} синонимов. Сохраняем...`);

                let addedCount = 0;
                const toAdd = [];
                for (let syn of aiSynonyms) {
                    if (!this.aliases[syn]) {
                        this.aliases[syn] = canonicalKey;
                        toAdd.push(syn);
                        addedCount++;
                    }
                }

                if (addedCount > 0) {
                    await this._ensureLocationsObjectPeer(canonicalKey, displayName, toAdd);
                }

                showToast("✅ Синонимы от ИИ успешно привязаны!");
                this.renderManagerPanel();
                localStorage.setItem('rbi_cloud_dirty', '1');
                if (typeof triggerSync === 'function') triggerSync('silent');

            } catch (e) {
                console.error('[generateObjectSynonymsAI]', e);
                showToast("❌ Ошибка ИИ: " + e.message);
            }
        },

        async deleteObject(id) {
            if (!confirm("Удалить этот объект из Справочника? Это не удалит историю проверок, но сломает авто-определение при импорте новых файлов.")) return;

            const objIndex = this.objects.findIndex(o => o.id === id);
            if (objIndex > -1) {
                const targetObj = this.objects[objIndex];
                try {
                    const loc = this._locationsSvc();
                    if (loc && typeof loc.softDeleteNode === 'function' && targetObj.id) {
                        await loc.softDeleteNode(targetObj.id);
                    }
                    await this.rebuildFromLocations();
                    showToast("🗑️ Объект удален из локаций");
                    this.renderManagerPanel();
                    localStorage.setItem('rbi_cloud_dirty', '1');
                } catch (e) {
                    console.error("Ошибка удаления:", e);
                    showToast("❌ Ошибка при удалении объекта");
                }
            }
        }
    };

    window.ObjectDirectory = objectDirectory;

    window.RBI.services.objects = {

        init: async function () {
            return objectDirectory.init();
        },

        initUI: function () {
            return objectDirectory.initUI();
        },

        list: function () {
            return objectDirectory.objects;
        },

        leftoverList: function () {
            return objectDirectory.leftoverObjects || [];
        },

        aliases: function () {
            return objectDirectory.aliases;
        },

        cleanString: function (str) {
            return objectDirectory.cleanString(str);
        },

        getObjectById: function (id) {
            return objectDirectory.getObjectById(id);
        },

        getObjectByKey: function (canonicalKey) {
            return objectDirectory.getObjectByKey(canonicalKey);
        },

        rebuildFromLocations: async function () {
            return objectDirectory.rebuildFromLocations();
        },

        loadRequests: async function () {
            return objectDirectory.loadRequests();
        },

        createFromLocation: async function (opts) {
            return objectDirectory.createFromLocation(opts);
        },

        normalize: async function (rawName, options) {
            var opts = options || {};
            if (typeof objectDirectory.normalizeProjectName === 'function') {
                return objectDirectory.normalizeProjectName(rawName, opts.isFromSkImport === true);
            }
            return {
                status: rawName ? 'unmapped' : 'empty',
                raw_name: rawName || '',
                canonical_key: '',
                display_name: rawName || 'Не указан'
            };
        },

        resolveProjectId: function (ref) {
            return objectDirectory.resolveProjectId(ref);
        },

        resolveObjectRef: function (ref) {
            return objectDirectory.resolveObjectRef(ref);
        },

        normalizeAssignedProjectsList: function (list) {
            return objectDirectory.normalizeAssignedProjectsList(list);
        },

        isRecordInAssignedProjects: function (rec, assignedList) {
            return objectDirectory.isRecordInAssignedProjects(rec, assignedList);
        },

        getDisplayForAssignedRef: function (ref) {
            return objectDirectory.getDisplayForAssignedRef(ref);
        },

        getAssignedProjectObjects: function () {
            return objectDirectory.getAssignedProjectObjects();
        },

        canonicalKeysForAssignedProjects: function (list) {
            return objectDirectory.canonicalKeysForAssignedProjects(list);
        },

        mergeRawNameIntoObject: function (rawName, targetObjectIdOrKey) {
            return objectDirectory.mergeRawNameIntoObject(rawName, targetObjectIdOrKey);
        },

        backfillProjectIdsOnLegacyRecords: function (opts) {
            return objectDirectory.backfillProjectIdsOnLegacyRecords(opts);
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.objects', window.RBI.services.objects);
    }

    console.log('[RBI Service] objects loaded');

    // Запуск инициализации справочника при старте
    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => { objectDirectory.init(); }, 1000);
    });
}());
