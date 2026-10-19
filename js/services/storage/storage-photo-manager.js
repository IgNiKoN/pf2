/* Файл: js/services/storage/storage-photo-manager.js — перенесено из js/storage.js без изменения логики */
/**
/**
 * ГЛОБАЛЬНЫЙ МЕНЕДЖЕР ФОТОГРАФИЙ И ФАЙЛОВ (Умный кэш и Офлайн)
 */
const PhotoManager = {
    cache: {},
    activeUrls: new Set(),
    // LRU порядка ключей cache (самый свежий — в конце). Ограничивает RAM
    // от blob: ObjectURL на слабых устройствах без полной очистки UI.
    _lruKeys: [],
    MEMORY_URL_LIMIT: 80,
    // Превью для карточек (TWI, аудит, задачи…): раньше 150px/0.72 — мыло на retina.
    // THUMB_VERSION↑ → старые thumbData пересобираются при следующем preferThumb.
    THUMB_MAX_EDGE: 512,
    THUMB_JPEG_Q: 0.86,
    THUMB_VERSION: 2,

    async init() {
        console.log(`[PhotoManager] Инициализация`);
    },

    _touchLru(id) {
        if (!id) return;
        const i = this._lruKeys.indexOf(id);
        if (i >= 0) this._lruKeys.splice(i, 1);
        this._lruKeys.push(id);
    },

    releaseCachedUrl(id) {
        if (!id || !this.cache[id]) return;
        const url = this.cache[id];
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        this.activeUrls.delete(url);
        delete this.cache[id];
        const i = this._lruKeys.indexOf(id);
        if (i >= 0) this._lruKeys.splice(i, 1);
    },

    _rememberObjectUrl(id, url) {
        if (!id || !url) return;
        if (this.cache[id] && this.cache[id] !== url) {
            this.releaseCachedUrl(id);
        }
        this.cache[id] = url;
        this.activeUrls.add(url);
        this._touchLru(id);
        while (this._lruKeys.length > this.MEMORY_URL_LIMIT) {
            const oldest = this._lruKeys.shift();
            if (oldest) this.releaseCachedUrl(oldest);
        }
    },

    // Canvas-превью для списков/карточек (JPEG). Размер — THUMB_MAX_EDGE.
    // Старые фото без thumbData / со старым THUMB_VERSION — при preferThumb.
    async _makeThumbFromDataUrl(dataUrl, maxEdge) {
        if (!dataUrl || !String(dataUrl).startsWith('data:')) return null;
        maxEdge = maxEdge || this.THUMB_MAX_EDGE;
        try {
            const img = await new Promise((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = reject;
                el.src = dataUrl;
            });
            let w = img.width || maxEdge;
            let h = img.height || maxEdge;
            if (w > h && w > maxEdge) { h = Math.round(h * maxEdge / w); w = maxEdge; }
            else if (h > maxEdge) { w = Math.round(w * maxEdge / h); h = maxEdge; }
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, w);
            canvas.height = Math.max(1, h);
            const tctx = canvas.getContext('2d');
            // JPEG не хранит альфу — без белой подложки прозрачность PNG становится чёрной
            tctx.fillStyle = '#ffffff';
            tctx.fillRect(0, 0, canvas.width, canvas.height);
            tctx.imageSmoothingEnabled = true;
            tctx.imageSmoothingQuality = 'high';
            tctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const thumbUrl = canvas.toDataURL('image/jpeg', this.THUMB_JPEG_Q);
            return base64ToArrayBuffer(thumbUrl);
        } catch (e) {
            console.warn('[PhotoManager] thumb failed', e);
            return null;
        }
    },

    async _makeThumbFromBuffer(buffer, mimeType, maxEdge) {
        if (!buffer) return null;
        maxEdge = maxEdge || this.THUMB_MAX_EDGE;
        const blob = arrayBufferToBlob(buffer, mimeType || 'image/webp');
        const tmpUrl = URL.createObjectURL(blob);
        try {
            const img = await new Promise((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = reject;
                el.src = tmpUrl;
            });
            let w = img.width || maxEdge;
            let h = img.height || maxEdge;
            if (w > h && w > maxEdge) { h = Math.round(h * maxEdge / w); w = maxEdge; }
            else if (h > maxEdge) { w = Math.round(w * maxEdge / h); h = maxEdge; }
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, w);
            canvas.height = Math.max(1, h);
            const tctx = canvas.getContext('2d');
            tctx.fillStyle = '#ffffff';
            tctx.fillRect(0, 0, canvas.width, canvas.height);
            tctx.imageSmoothingEnabled = true;
            tctx.imageSmoothingQuality = 'high';
            tctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            return base64ToArrayBuffer(canvas.toDataURL('image/jpeg', this.THUMB_JPEG_Q));
        } catch (e) {
            console.warn('[PhotoManager] thumb-from-buffer failed', e);
            return null;
        } finally {
            try { URL.revokeObjectURL(tmpUrl); } catch (_) { /* ignore */ }
        }
    },

    _thumbNeedsRebuild(record) {
        if (!record) return true;
        const buf = record.thumbData || record.thumb_data;
        if (!buf) return true;
        const ver = record.thumbVersion != null ? record.thumbVersion : record.thumb_version;
        return ver !== this.THUMB_VERSION;
    },

    _applyThumbToRecord(record, thumbBuf) {
        if (!record || !thumbBuf) return;
        record.thumbData = thumbBuf;
        record.thumb_data = thumbBuf;
        record.thumbMimeType = 'image/jpeg';
        record.thumb_mime_type = 'image/jpeg';
        record.thumbVersion = this.THUMB_VERSION;
        record.thumb_version = this.THUMB_VERSION;
        record.thumbMaxEdge = this.THUMB_MAX_EDGE;
        record.thumb_max_edge = this.THUMB_MAX_EDGE;
    },

    _thumbCacheKey(id) {
        return id ? (String(id) + '#thumb') : '';
    },

    async saveLocal(base64Data, prefix = 'img', meta = {}) {
        if (!base64Data || !base64Data.startsWith('data:')) return base64Data;

        const id = 'local://' + prefix + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000);
        const mimeType = base64Data.match(/data:(.*?);/)?.[1] || 'image/webp';
        const buffer = await base64ToArrayBuffer(base64Data);
        const thumbBuffer = await this._makeThumbFromDataUrl(base64Data);
        const now = new Date().toISOString();

        await dbPut(STORES.PHOTOS, {
            id,
            data: buffer,
            mimeType,
            mime_type: mimeType,
            thumbData: thumbBuffer || null,
            thumb_data: thumbBuffer || null,
            thumbMimeType: thumbBuffer ? 'image/jpeg' : '',
            thumb_mime_type: thumbBuffer ? 'image/jpeg' : '',
            thumbVersion: thumbBuffer ? this.THUMB_VERSION : 0,
            thumb_version: thumbBuffer ? this.THUMB_VERSION : 0,
            thumbMaxEdge: thumbBuffer ? this.THUMB_MAX_EDGE : 0,
            thumb_max_edge: thumbBuffer ? this.THUMB_MAX_EDGE : 0,
            sizeBytes: buffer.byteLength,
            size_bytes: buffer.byteLength,
            createdAt: now,
            created_at: now,
            cachedAt: now,
            cached_at: now,
            lastAccessedAt: now,
            last_accessed_at: now,
            sourceUrl: meta.sourceUrl || '',
            source_url: meta.sourceUrl || '',
            entityType: meta.entityType || meta.entity_type || 'local_file',
            entity_type: meta.entityType || meta.entity_type || 'local_file',
            entityId: meta.entityId || meta.entity_id || '',
            entity_id: meta.entityId || meta.entity_id || '',
            fieldPath: meta.fieldPath || meta.field_path || '',
            field_path: meta.fieldPath || meta.field_path || '',
            cacheStatus: meta.cacheStatus || meta.cache_status || 'local_only',
            cache_status: meta.cacheStatus || meta.cache_status || 'local_only'
        });

        const blob = arrayBufferToBlob(buffer, mimeType);
        const url = URL.createObjectURL(blob);
        this._rememberObjectUrl(id, url);
        if (thumbBuffer) {
            const tBlob = arrayBufferToBlob(thumbBuffer, 'image/jpeg');
            this._rememberObjectUrl(this._thumbCacheKey(id), URL.createObjectURL(tBlob));
        }

        return id;
    },

    getSrc(url) {
        if (!url) return '';
        // photos[itemId] может быть массивом — берём первый ref.
        if (Array.isArray(url)) url = url[0];
        if (!url) return '';

        if (this.cache[url]) {
            this._touchLru(url);
            return this.cache[url];
        }

        // local:// и cloud:// нельзя отдавать напрямую в img.src
        if (String(url).startsWith('local://') || String(url).startsWith('cloud://')) {
            return window.rbiPhotoPlaceholder || '';
        }

        // http оставляем только для старых мест интерфейса.
        return url;
    },

    /** Sync: blob: превью если уже в RAM, иначе как getSrc (placeholder для local://). */
    getThumbSrc(url) {
        if (!url) return '';
        if (Array.isArray(url)) url = url[0];
        if (!url) return '';
        const tKey = this._thumbCacheKey(url);
        if (tKey && this.cache[tKey]) {
            this._touchLru(tKey);
            return this.cache[tKey];
        }
        return this.getSrc(url);
    },

    async getAsyncUrl(localIdOrHttp, opts) {
        if (!localIdOrHttp) return null;
        // photos[itemId] может быть массивом — String([u1,u2]) даёт "u1,u2" → Storage 400.
        if (Array.isArray(localIdOrHttp)) localIdOrHttp = localIdOrHttp[0];
        if (!localIdOrHttp) return null;
        const preferThumb = !!(opts && opts.preferThumb);
        const thumbKey = this._thumbCacheKey(localIdOrHttp);

        if (preferThumb && this.cache[thumbKey]) {
            this._touchLru(thumbKey);
            return this.cache[thumbKey];
        }
        if (!preferThumb && this.cache[localIdOrHttp]) {
            this._touchLru(localIdOrHttp);
            return this.cache[localIdOrHttp];
        }
        if (this.cache[localIdOrHttp] && !preferThumb) {
            this._touchLru(localIdOrHttp);
            return this.cache[localIdOrHttp];
        }

        try {
            const record = await dbGet(STORES.PHOTOS, localIdOrHttp);

            if (record && record.data) {
                const now = new Date().toISOString();

                record.lastAccessedAt = now;
                record.last_accessed_at = now;

                if (preferThumb) {
                    let thumbBuf = record.thumbData || record.thumb_data;
                    if (this._thumbNeedsRebuild(record)) {
                        thumbBuf = await this._makeThumbFromBuffer(
                            record.data,
                            record.mimeType || record.mime_type || 'image/webp'
                        );
                        if (thumbBuf) this._applyThumbToRecord(record, thumbBuf);
                    }
                    await dbPut(STORES.PHOTOS, record);
                    if (thumbBuf) {
                        const tUrl = URL.createObjectURL(arrayBufferToBlob(thumbBuf, 'image/jpeg'));
                        this._rememberObjectUrl(thumbKey, tUrl);
                        return tUrl;
                    }
                } else {
                    await dbPut(STORES.PHOTOS, record);
                }

                if (window.RbiStorageManager && typeof window.RbiStorageManager.markCloudFileCached === 'function') {
                    await window.RbiStorageManager.markCloudFileCached(
                        localIdOrHttp,
                        record.sizeBytes || record.size_bytes || record.data.byteLength || 0,
                        record.mimeType || record.mime_type || 'image/webp'
                    );
                } else if (window.RbiStorageManager && typeof window.RbiStorageManager.updateAccessByUrl === 'function') {
                    window.RbiStorageManager.updateAccessByUrl(localIdOrHttp);
                }

                const blob = arrayBufferToBlob(record.data, record.mimeType || record.mime_type || 'image/webp');
                const url = URL.createObjectURL(blob);
                this._rememberObjectUrl(localIdOrHttp, url);

                return url;
            }

            if (String(localIdOrHttp).startsWith('http')) {
                if (!navigator.onLine) {
                    return null;
                }

                const res = await rbiFetchCloudFileNoBrowserCache(localIdOrHttp);
                if (!res.ok) return null;

                const blob = await res.blob();
                const buffer = await blobToArrayBuffer(blob);
                const now = new Date().toISOString();

                await dbPut(STORES.PHOTOS, {
                    id: localIdOrHttp,
                    data: buffer,
                    mimeType: blob.type || 'image/jpeg',
                    mime_type: blob.type || 'image/jpeg',
                    sizeBytes: buffer.byteLength,
                    size_bytes: buffer.byteLength,
                    createdAt: now,
                    created_at: now,
                    cachedAt: now,
                    cached_at: now,
                    lastAccessedAt: now,
                    last_accessed_at: now,
                    sourceUrl: localIdOrHttp,
                    source_url: localIdOrHttp,
                    cacheStatus: 'cached_cloud',
                    cache_status: 'cached_cloud',
                    entityType: window.RbiStorageManager ? window.RbiStorageManager.guessEntityTypeByUrl(localIdOrHttp) : 'unknown_file',
                    entity_type: window.RbiStorageManager ? window.RbiStorageManager.guessEntityTypeByUrl(localIdOrHttp) : 'unknown_file'
                });



                if (window.RbiStorageManager && typeof window.RbiStorageManager.updateAccessByUrl === 'function') {
                    window.RbiStorageManager.updateAccessByUrl(localIdOrHttp);
                }

                const localUrl = URL.createObjectURL(blob);
                this._rememberObjectUrl(localIdOrHttp, localUrl);

                return localUrl;
            }

        } catch (e) {
            console.error("Ошибка загрузки фото", e);
        }

        // ВАЖНО: если локальной копии нет, не возвращаем обратно local:// или https://.
        // Иначе браузер может показать фото из своего HTTP-кэша, и тест очистки будет нечестным.
        return null;
    },
    async getBase64(localIdOrHttp) {
        if (!localIdOrHttp) return null;

        const value = String(localIdOrHttp);

        if (value.startsWith('data:')) {
            return value;
        }

        try {
            // 1. Пробуем взять файл из IndexedDB по ключу local:// или http-url
            const record = await dbGet(STORES.PHOTOS, localIdOrHttp);

            if (record && record.data) {
                const blob = arrayBufferToBlob(
                    record.data,
                    record.mimeType || record.mime_type || 'image/webp'
                );

                return await blobToBase64(blob);
            }

            // 2. Если это обычная ссылка на Storage — скачиваем и превращаем в base64
            if (value.startsWith('http')) {
                const res = await rbiFetchCloudFileNoBrowserCache(value);
                if (!res.ok) return null;

                const blob = await res.blob();
                return await blobToBase64(blob);
            }

            // 3. Если это local://, но прямой записи не нашли — пробуем через getAsyncUrl
            if (
                value.startsWith('local://') ||
                value.startsWith('cloud://')
            ) {
                const realUrl = await this.getAsyncUrl(value);

                if (realUrl && !String(realUrl).startsWith('local://') && !String(realUrl).startsWith('cloud://')) {
                    const res = await fetch(realUrl);
                    if (!res.ok) return null;

                    const blob = await res.blob();
                    return await blobToBase64(blob);
                }
            }

        } catch (e) {
            console.warn('[PhotoManager] getBase64 error:', e);
        }

        return null;
    },
    async getBase64(localId) {
        if (!localId) return null;

        try {
            const record = await dbGet(STORES.PHOTOS, localId);

            if (record && record.data) {
                const now = new Date().toISOString();

                record.lastAccessedAt = now;
                record.last_accessed_at = now;
                await dbPut(STORES.PHOTOS, record);

                return await arrayBufferToBase64(record.data, record.mimeType || record.mime_type || 'image/webp');
            }

            if (String(localId).startsWith('http')) {
                if (!navigator.onLine) return null;

                const res = await rbiFetchCloudFileNoBrowserCache(localId);
                if (!res.ok) return null;

                const blob = await res.blob();
                const buffer = await blobToArrayBuffer(blob);
                const now = new Date().toISOString();

                await dbPut(STORES.PHOTOS, {
                    id: localId,
                    data: buffer,
                    mimeType: blob.type || 'image/jpeg',
                    mime_type: blob.type || 'image/jpeg',
                    sizeBytes: buffer.byteLength,
                    size_bytes: buffer.byteLength,
                    createdAt: now,
                    created_at: now,
                    cachedAt: now,
                    cached_at: now,
                    lastAccessedAt: now,
                    last_accessed_at: now,
                    sourceUrl: localId,
                    source_url: localId,
                    cacheStatus: 'cached_cloud',
                    cache_status: 'cached_cloud',
                    entityType: window.RbiStorageManager ? window.RbiStorageManager.guessEntityTypeByUrl(localId) : 'unknown_file',
                    entity_type: window.RbiStorageManager ? window.RbiStorageManager.guessEntityTypeByUrl(localId) : 'unknown_file'
                });
                if (window.RbiStorageManager && typeof window.RbiStorageManager.markCloudFileCached === 'function') {
                    await window.RbiStorageManager.markCloudFileCached(
                        localId,
                        buffer.byteLength,
                        blob.type || 'image/jpeg'
                    );
                }
                return await arrayBufferToBase64(buffer, blob.type || 'image/jpeg');
            }
        } catch (e) {
            console.warn('[PhotoManager] getBase64 error:', e);
        }

        return null;
    },

    clearMemory() {
        this.activeUrls.forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) { }
        });

        this.activeUrls.clear();
        this.cache = {};
        this._lruKeys = [];
    },

    async linkCloudToLocal(oldLocalUrl, newCloudUrl) {
        const record = await dbGet(STORES.PHOTOS, oldLocalUrl);

        if (record) {
            const now = new Date().toISOString();

            await dbPut(STORES.PHOTOS, {
                ...record,
                id: newCloudUrl,
                sourceUrl: newCloudUrl,
                source_url: newCloudUrl,
                cacheStatus: 'cached_cloud',
                cache_status: 'cached_cloud',
                lastAccessedAt: now,
                last_accessed_at: now,
                cachedAt: record.cachedAt || now,
                cached_at: record.cached_at || now
            });

            await dbDelete(STORES.PHOTOS, oldLocalUrl);

            if (this.cache[oldLocalUrl]) {
                this.cache[newCloudUrl] = this.cache[oldLocalUrl];
                delete this.cache[oldLocalUrl];
                const i = this._lruKeys.indexOf(oldLocalUrl);
                if (i >= 0) this._lruKeys.splice(i, 1);
                this._touchLru(newCloudUrl);
            }

            if (window.RbiStorageManager) {
                await window.RbiStorageManager.upsertLocalFileRegistry({
                    id: 'localreg_' + Date.now().toString(36),
                    local_key: newCloudUrl,
                    localKey: newCloudUrl,
                    public_url: newCloudUrl,
                    publicUrl: newCloudUrl,
                    cache_status: 'cached_cloud',
                    cacheStatus: 'cached_cloud',
                    entity_type: record.entity_type || record.entityType || 'inspection_photo',
                    entityType: record.entity_type || record.entityType || 'inspection_photo',
                    size_bytes: record.sizeBytes || record.size_bytes || record.data?.byteLength || 0,
                    sizeBytes: record.sizeBytes || record.size_bytes || record.data?.byteLength || 0
                });
            }
        }
    },

    async downloadForOffline(url, opts = {}) {
        // skipMemoryCache=true по умолчанию: автокэш пишет только в IDB, без ObjectURL в RAM.
        // UI, которому нужен blob:-URL сразу, передаёт { skipMemoryCache: false }.
        // Возвращает { ok, bytes, fetched } — fetched=true только после реального сетевого скачивания.
        const skipMemoryCache = opts.skipMemoryCache !== false;

        if (!url || !String(url).startsWith('http')) {
            return { ok: false, bytes: 0, fetched: false };
        }
        // Чужие домены (CORS / demo PDF) в офлайн-кэш не тащим.
        if (typeof window.rbiIsOfflineCacheableUrl === 'function' && !window.rbiIsOfflineCacheableUrl(url)) {
            return { ok: false, bytes: 0, fetched: false };
        }
        if (this.cache[url]) {
            this._touchLru(url);
            return { ok: true, bytes: 0, fetched: false };
        }

        try {
            // Квоту проверяем редко лёгким snapshot — не на каждый файл.
            this._downloadsSinceQuotaCheck = (this._downloadsSinceQuotaCheck || 0) + 1;
            if (
                this._downloadsSinceQuotaCheck >= 25 &&
                window.RbiStorageManager &&
                typeof window.RbiStorageManager.getStorageSnapshot === 'function'
            ) {
                this._downloadsSinceQuotaCheck = 0;
                const snap = await window.RbiStorageManager.getStorageSnapshot();
                if (
                    snap.mode === 'critical_cleanup' &&
                    typeof window.RbiStorageManager.runAdaptiveStorageCleanup === 'function'
                ) {
                    await window.RbiStorageManager.runAdaptiveStorageCleanup('before_download');
                }
            }

            const cached = await dbGet(STORES.PHOTOS, url);
            if (cached && cached.data) {
                const existingBytes = cached.size_bytes || cached.sizeBytes || cached.data.byteLength || 0;
                if (!skipMemoryCache) {
                    const mime = cached.mimeType || cached.mime_type || 'application/octet-stream';
                    const blob = cached.data instanceof Blob
                        ? cached.data
                        : new Blob([cached.data], { type: mime });
                    const localUrl = URL.createObjectURL(blob);
                    this._rememberObjectUrl(url, localUrl);
                }
                return { ok: true, bytes: existingBytes, fetched: false };
            }

            const res = await rbiFetchCloudFileNoBrowserCache(url);
            if (!res.ok) throw new Error("Файл недоступен");

            const blob = await res.blob();
            const buffer = await blobToArrayBuffer(blob);
            const now = new Date().toISOString();

            await dbPut(STORES.PHOTOS, {
                id: url,
                data: buffer,
                mimeType: blob.type || 'application/octet-stream',
                mime_type: blob.type || 'application/octet-stream',
                sizeBytes: buffer.byteLength,
                size_bytes: buffer.byteLength,
                createdAt: now,
                created_at: now,
                cachedAt: now,
                cached_at: now,
                lastAccessedAt: now,
                last_accessed_at: now,
                sourceUrl: url,
                source_url: url,
                cacheStatus: 'cached_cloud',
                cache_status: 'cached_cloud',
                entityType: window.RbiStorageManager ? window.RbiStorageManager.guessEntityTypeByUrl(url) : 'unknown_file',
                entity_type: window.RbiStorageManager ? window.RbiStorageManager.guessEntityTypeByUrl(url) : 'unknown_file'
            });
            if (window.RbiStorageManager && typeof window.RbiStorageManager.markCloudFileCached === 'function') {
                await window.RbiStorageManager.markCloudFileCached(
                    url,
                    buffer.byteLength,
                    blob.type || 'application/octet-stream'
                );
            }
            if (!skipMemoryCache) {
                const localUrl = URL.createObjectURL(blob);
                this._rememberObjectUrl(url, localUrl);
            }
            return { ok: true, bytes: buffer.byteLength, fetched: true };
        } catch (e) {
            console.warn('[PhotoManager] downloadForOffline error:', e);
            return { ok: false, bytes: 0, fetched: false };
        }
    }
};

// Найдено при проверке блока (класс риска 3, не покрыт исходным аудитом — проверял только top-level function,
// не top-level const-объекты): PhotoManager вызывается bare-идентификатором из множества внешних classic/module файлов
// (session.service.js, bootstrap.js, sync-engine.core.js, knowledge.module.js и др.).
window.PhotoManager = PhotoManager;

// Глобальная функция для HTML разметки
window.getPhotoSrc = (url) => PhotoManager.getSrc(url);
window.getPhotoThumbSrc = (url) => PhotoManager.getThumbSrc(url);

// Обновленная функция авто-миграции
async function runPhotoMigration(historyArray) {
    for (let item of historyArray) {
        let itemChanged = false;
        if (item.photos) {
            for (let key in item.photos) {
                const photoData = item.photos[key];
                if (photoData && photoData.startsWith('data:image')) {
                    const localUrl = await PhotoManager.saveLocal(photoData, 'migr');
                    item.photos[key] = localUrl;
                    itemChanged = true;
                }
            }
        }
        if (itemChanged) await dbPut(STORES.HISTORY, item);
    }
}

window.runPhotoMigration = runPhotoMigration;
