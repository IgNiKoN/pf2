/* Файл: js/shared/photo-editor.utils.js */
/* Фоторедактор/фотопросмотрщик (canvas-рисование по фото + просмотр) — перенесено из js/app.js */

// RBI NEW: безопасная подстановка local:// / cloud:// фото в интерфейсе (перенесено из js/app.js)
window.rbiPhotoPlaceholder = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="220">
    <rect width="100%" height="100%" fill="#f1f5f9"/>
</svg>
`);

window.rbiPhotoCloudPlaceholder = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360">
    <rect width="100%" height="100%" fill="#f1f5f9"/>
    <text x="50%" y="45%" text-anchor="middle" fill="#64748b" font-size="22" font-family="Arial" font-weight="700">
        Файл очищен с устройства
    </text>
    <text x="50%" y="55%" text-anchor="middle" fill="#94a3b8" font-size="16" font-family="Arial">
        Подключитесь к интернету для загрузки из облака
    </text>
</svg>
`);

window.rbiEscapeAttr = function (value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

/**
 * Атрибуты <img> для офлайн-превью: blob из RAM сразу, иначе placeholder + data-local-src
 * (bootstrap / rbiHydrateLocalImages → PhotoManager.getAsyncUrl из IDB).
 * Не ставить сырой https в src — в офлайне браузер не ходит в PhotoManager.
 * @param {string|string[]} ref
 * @param {{ preferThumb?: boolean }} [opts]
 * @returns {string} например `src="..." data-local-src="..." data-prefer-thumb="1"`
 */
window.rbiBuildPhotoImgAttrs = function (ref, opts) {
    if (Array.isArray(ref)) ref = ref[0];
    if (!ref || typeof ref !== 'string') return 'src=""';

    const preferThumb = !!(opts && opts.preferThumb);
    const esc = window.rbiEscapeAttr(ref);
    const ph = window.rbiPhotoPlaceholder || '';
    const refAttr = ' data-photo-ref="' + esc + '"';
    const needsHydrate = ref.startsWith('local://')
        || ref.startsWith('cloud://')
        || /^https?:\/\//i.test(ref);

    if (!needsHydrate) {
        const sync = (typeof window.getPhotoSrc === 'function' ? window.getPhotoSrc(ref) : ref) || ref;
        return 'src="' + window.rbiEscapeAttr(sync) + '"' + refAttr;
    }

    let ram = '';
    try {
        if (preferThumb && typeof window.getPhotoThumbSrc === 'function') {
            ram = window.getPhotoThumbSrc(ref) || '';
        }
        if (!ram && typeof window.getPhotoSrc === 'function') {
            ram = window.getPhotoSrc(ref) || '';
        }
    } catch (e) { /* ignore */ }

    const thumbAttr = preferThumb ? ' data-prefer-thumb="1"' : '';

    if (ram && String(ram).startsWith('blob:')) {
        return 'src="' + window.rbiEscapeAttr(ram) + '"' + refAttr + thumbAttr;
    }

    return 'src="' + ph + '" data-local-src="' + esc + '"' + refAttr + thumbAttr;
};

/**
 * Сжатие файла изображения → dataURL (webp/jpeg).
 * Общий хелпер для ES-модулей (практики, TWI, задачи, FMEA, совещания):
 * в module-scope bare `compressImageToBase64` не резолвится в window.
 */
window.compressImageToBase64 = function compressImageToBase64(file, oldMaxWidth, oldQuality, callback) {
    const maxWidth = 1200;
    const quality = 0.6;

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height && width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            } else if (height > maxWidth) {
                width *= maxWidth / height;
                height = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);

            let mimeType = 'image/webp';
            let dataUrl = canvas.toDataURL(mimeType, quality);

            if (dataUrl.startsWith('data:image/png')) {
                mimeType = 'image/jpeg';
                dataUrl = canvas.toDataURL(mimeType, quality);
            }

            callback(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

// =========================================================================
// РАЗМЕТКА «photo-editor-overlay» + «photo-source-modal» (перенос из
// index.html:650-680/975-996, перенос 30 modal/overlay-блоков #app-modals в
// JS-рендер). HTML-строки 1:1 идентичны прежней статичной разметке.
// photo-source-modal — межмодульный shared UI-примитив (используется quality
// и construction), владение закреплено здесь как за файлом, уже владеющим
// соседним photo-editor-overlay (единый поток «сделать фото»).
// =========================================================================
function renderPhotoEditorOverlayMarkup() {
    return `
    <div id="photo-editor-overlay" class="fixed inset-0 bg-slate-900 z-[10200] hidden flex-col">
        <div class="flex justify-between items-center p-4 bg-slate-900 text-white border-b border-slate-700">
            <button data-photo-editor-action="cancelPhotoEditor"
                class="text-sm font-bold text-slate-400 active:scale-95">Отмена</button>
            <div class="text-[12px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round"
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z">
                    </path>
                </svg>
                Укажите дефект
            </div>
            <button data-photo-editor-action="saveEditedPhoto"
                class="text-sm font-bold text-green-400 active:scale-95">Сохранить</button>
        </div>
        <div class="flex-1 relative overflow-hidden flex items-center justify-center bg-black"
            id="editor-canvas-container">
            <canvas id="drawing-canvas" class="touch-none max-w-full max-h-full object-contain"></canvas>
        </div>
        <div class="p-4 bg-slate-900 border-t border-slate-700 flex justify-center">
            <button data-photo-editor-action="clearPhotoEditor"
                class="bg-slate-800 text-slate-300 border border-slate-600 px-6 py-3.5 rounded-xl font-bold text-[11px] uppercase tracking-wider active:scale-95 flex items-center gap-2 shadow-md">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16">
                    </path>
                </svg>
                Очистить рисунок
            </button>
        </div>
    </div>
`;
}

function renderPhotoSourceModalMarkup() {
    return `
    <div id="photo-source-modal"
        class="fixed inset-0 bg-slate-900/70 z-[10100] hidden items-center justify-center p-4 backdrop-blur-sm"
        onclick="this.style.display='none'">
        <div class="bg-[var(--card-bg)] w-full max-w-xs p-6 rounded-2xl shadow-2xl flex flex-col gap-3"
            onclick="event.stopPropagation()">
            <div
                class="font-black text-center text-[14px] uppercase tracking-tight mb-2 text-slate-800 dark:text-white">
                Добавить фото</div>
            <button
                onclick="document.getElementById('photo-input-camera').click(); document.getElementById('photo-source-modal').style.display='none';"
                class="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-[12px] uppercase shadow-md flex items-center justify-center gap-2 active:scale-95">
                Сделать снимок
            </button>
            <button
                onclick="document.getElementById('photo-input-gallery').click(); document.getElementById('photo-source-modal').style.display='none';"
                class="w-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 py-3.5 rounded-xl font-bold text-[12px] uppercase shadow-sm flex items-center justify-center gap-2 active:scale-95 border border-slate-200 dark:border-slate-700">
                Из галереи
            </button>
            <button onclick="document.getElementById('photo-source-modal').style.display='none'"
                class="w-full mt-1 text-slate-400 py-2 font-bold text-[10px] uppercase active:scale-95">Отмена</button>
        </div>
    </div>
`;
}

(function mountPhotoEditorModalsMarkup() {
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    if (!document.getElementById('photo-editor-overlay')) {
        root.insertAdjacentHTML('beforeend', renderPhotoEditorOverlayMarkup());
    }
    if (!document.getElementById('photo-source-modal')) {
        root.insertAdjacentHTML('beforeend', renderPhotoSourceModalMarkup());
    }
}());

window.rbiHydrateLocalImages = async function (root = document) {
    if (typeof PhotoManager === 'undefined' || typeof PhotoManager.getAsyncUrl !== 'function') return;

    const scope = root || document;
    const imgs = Array.from(scope.querySelectorAll('img[data-local-src]'));

    for (const img of imgs) {
        const src = img.getAttribute('data-local-src');
        if (!src) continue;
        const preferThumb = img.getAttribute('data-prefer-thumb') === '1';

        try {
            const realUrl = await PhotoManager.getAsyncUrl(src, preferThumb ? { preferThumb: true } : undefined);

            if (
                realUrl &&
                !String(realUrl).startsWith('local://') &&
                !String(realUrl).startsWith('cloud://')
            ) {
                img.src = realUrl;
                img.removeAttribute('data-local-src');
                continue;
            }

            img.src = window.rbiPhotoCloudPlaceholder || window.rbiPhotoPlaceholder || img.src;

        } catch (e) {
            img.src = window.rbiPhotoCloudPlaceholder || window.rbiPhotoPlaceholder || img.src;
        }
    }
};

// === ФОТОРЕДАКТОР (ЗАГРУЗКА И РИСОВАНИЕ) ===
// editorCanvas/editorCtx/editorImgElement живут на window (не модульные let):
// их читают другие ES-модули (audit.actions.js, knowledge.module.js,
// etalon.actions.js) в своих saveXxxMarkupPhoto()/reader.onload — модульная
// переменная была бы недоступна им как implicit global (строгий режим
// ES-модулей бросал ReferenceError, см. фикс editorImgElement ранее и
// аналогичный баг с editorCanvas, найденный позже).
let isDrawing = false;
window.editorCanvas = null;
window.editorCtx = null;
window.editorImgElement = null; // Оригинальное изображение для сброса
let currentPhotoId = null;

// Переменные зума фото
let currentZoom = 1;
let isDragging = false;
let startX, startY, translateX = 0, translateY = 0;

function resolvePhotoTargetId() {
    return currentPhotoId || window.currentPhotoId || null;
}
window.resolvePhotoTargetId = resolvePhotoTargetId;

// RBI NEW (Множественные фото к пункту чек-листа, B1): единая нормализация
// значения photos[itemId] к массиву — покрывает и новый формат (массив), и
// старые записи IndexedDB/облака (одна строка на itemId, без принудительной
// миграции истории). Используется во всех точках чтения photos[itemId]
// (аудит/история/отчёты), не только в этом файле.
window.normalizeItemPhotos = function (value) {
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value)) return value;
    return [value];
};

function syncPhotoTargetId(id) {
    currentPhotoId = id || null;
    window.currentPhotoId = id || null;
}
window.syncPhotoTargetId = syncPhotoTargetId;

window.ensureLocalPhotoRef = async function (photoRef, prefix = 'img', meta = {}) {
    if (!photoRef) return photoRef;
    const value = String(photoRef);
    if (value.startsWith('local://') || value.startsWith('http')) return photoRef;
    if (value.startsWith('data:') && typeof PhotoManager !== 'undefined' && typeof PhotoManager.saveLocal === 'function') {
        return await PhotoManager.saveLocal(photoRef, prefix, meta);
    }
    return photoRef;
};

/** File Asset Standard: entity fields keep only refs; bytes live in PhotoManager. */
window.ensureLocalFileRef = async function (fileRef, prefix = 'file', meta = {}) {
    if (!fileRef) return fileRef;
    const value = String(fileRef);
    if (value.startsWith('local://') || value.startsWith('cloud://') || value.startsWith('http')) return fileRef;
    if (value.startsWith('data:') && typeof PhotoManager !== 'undefined' && typeof PhotoManager.saveLocal === 'function') {
        return await PhotoManager.saveLocal(fileRef, prefix, meta);
    }
    return fileRef;
};

async function updateConstDefectPhotoPreview(photoId) {
    const photoRef = photos[photoId];
    if (!photoRef) return;
    const previewDiv = document.getElementById('const-defect-photo-preview');
    const imgEl = document.getElementById('const-defect-img');
    if (!previewDiv || !imgEl) return;

    const ref = String(photoRef);
    if (ref.startsWith('local://') || ref.startsWith('cloud://')) {
        imgEl.src = typeof window.getPhotoSrc === 'function' ? window.getPhotoSrc(photoRef) : '';
        imgEl.setAttribute('data-local-src', photoRef);
        imgEl.setAttribute('data-defect-id', photoId);
        imgEl.onclick = () => openPhotoViewer(photoRef);
        if (typeof window.rbiHydrateLocalImages === 'function') {
            await window.rbiHydrateLocalImages(previewDiv);
        }
    } else {
        imgEl.removeAttribute('data-local-src');
        imgEl.setAttribute('data-defect-id', photoId);
        imgEl.src = typeof window.getPhotoSrc === 'function' ? window.getPhotoSrc(photoRef) : photoRef;
        imgEl.onclick = () => openPhotoViewer(photoRef);
    }

    previewDiv.classList.remove('hidden');
    const btn = document.getElementById('const-defect-photo-btn');
    if (btn) btn.innerHTML = '📷 Изменить фото';
}
window.updateConstDefectPhotoPreview = updateConstDefectPhotoPreview;

function initPhotoEditor() {
    window.editorCanvas = document.getElementById('drawing-canvas');
    window.editorCtx = window.editorCanvas.getContext('2d');

    // Оптимизируем размер (HD качество, но не гигантское)
    const MAX_WIDTH = 1280; const MAX_HEIGHT = 1280;
    let width = window.editorImgElement.width;
    let height = window.editorImgElement.height;

    if (width > height) {
        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
    } else {
        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
    }

    window.editorCanvas.width = width;
    window.editorCanvas.height = height;

    // Рисуем картинку на холсте
    clearPhotoEditor();

    // Настраиваем кисть
    window.editorCtx.strokeStyle = '#ef4444'; // Красный цвет
    window.editorCtx.lineWidth = Math.max(4, width / 150); // Толщина зависит от размера фото
    window.editorCtx.lineCap = 'round';
    window.editorCtx.lineJoin = 'round';

    // Привязываем события рисования
    window.editorCanvas.onmousedown = startDrawing;
    window.editorCanvas.onmousemove = draw;
    window.editorCanvas.onmouseup = stopDrawing;
    window.editorCanvas.onmouseout = stopDrawing;

    window.editorCanvas.ontouchstart = startDrawing;
    window.editorCanvas.ontouchmove = draw;
    window.editorCanvas.ontouchend = stopDrawing;
}
window.initPhotoEditor = initPhotoEditor;

function clearPhotoEditor() {
    if (!window.editorCtx || !window.editorImgElement) return;
    window.editorCtx.clearRect(0, 0, window.editorCanvas.width, window.editorCanvas.height);
    window.editorCtx.drawImage(window.editorImgElement, 0, 0, window.editorCanvas.width, window.editorCanvas.height);
}
window.clearPhotoEditor = clearPhotoEditor;

function getCanvasCoordinates(e) {
    const rect = window.editorCanvas.getBoundingClientRect();
    const scaleX = window.editorCanvas.width / rect.width;
    const scaleY = window.editorCanvas.height / rect.height;

    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function startDrawing(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getCanvasCoordinates(e);
    window.editorCtx.beginPath();
    window.editorCtx.moveTo(pos.x, pos.y);
}

function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getCanvasCoordinates(e);
    window.editorCtx.lineTo(pos.x, pos.y);
    window.editorCtx.stroke();
}

function stopDrawing(e) {
    if (e) e.preventDefault();
    isDrawing = false;
    window.editorCtx.closePath();
}

function cancelPhotoEditor() {
    document.getElementById('photo-editor-overlay').style.display = 'none';
    document.body.classList.remove('modal-open');
    syncPhotoTargetId(null);
    window.editorImgElement = null;
    window.activePhotoContext = null; // Очищаем контекст, чтобы не ломать другие загрузки
}
window.cancelPhotoEditor = cancelPhotoEditor;

async function saveEditedPhoto() {
    const photoId = resolvePhotoTargetId();
    const photoContext = window.activePhotoContext;
    if (!photoId || !window.editorCanvas) return;

    // Добавляем штамп времени на финальное фото
    const now = new Date();
    const timestamp = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    const w = window.editorCanvas.width;
    const h = window.editorCanvas.height;
    const fontSize = Math.max(16, Math.floor(w / 35)); // Адаптивный шрифт

    window.editorCtx.fillStyle = 'rgba(0,0,0,0.6)';
    window.editorCtx.fillRect(15, h - (fontSize + 20), fontSize * 10, fontSize + 15);
    window.editorCtx.font = `bold ${fontSize}px Arial`;
    window.editorCtx.fillStyle = 'white';
    window.editorCtx.fillText(timestamp, 25, h - 20);

    let photoRef = window.editorCanvas.toDataURL('image/jpeg', 0.85);

    // НОВОЕ: Если фото сделано Подрядчиком при устранении дефекта
    if (photoContext === 'defect_fix') {
        photoRef = await window.ensureLocalPhotoRef(photoRef, 'const_fix', {
            entityType: 'construction_defect_history',
            entityId: window.currentDefectFixId
        });

        document.dispatchEvent(new CustomEvent('sharedPhotoEditor:defectFixSaved', { detail: { defectId: window.currentDefectFixId, userName: window.syncConfig?.engineerName || 'Подрядчик', comment: window.currentDefectFixComment, photoRef: photoRef } }));

        showToast("📸 Фото устранения прикреплено!");
        cancelPhotoEditor();
        return; // Выходим из функции, чтобы не идти по старому пути
    }

    if (photoContext === 'defect') {
        photoRef = await window.ensureLocalPhotoRef(photoRef, 'const', {
            entityType: 'construction_defect',
            entityId: photoId
        });
        // Фото дефекта СК — своя однофото-семантика (не входит в этот блок), перезапись.
        photos[photoId] = photoRef;
    } else {
        // Обычный контекст (пункт чек-листа аудита): добавление в массив, не перезапись.
        if (!Array.isArray(photos[photoId])) photos[photoId] = photos[photoId] ? [photos[photoId]] : [];
        photos[photoId].push(photoRef);
    }
    showToast("📸 Фото с пометками сохранено!");

    if (photoContext === 'defect') {
        await updateConstDefectPhotoPreview(photoId);
    } else {
        document.dispatchEvent(new CustomEvent('sharedPhotoEditor:photoSaved', { detail: { photoId: photoId } }));
    }
    cancelPhotoEditor();
}
window.saveEditedPhoto = saveEditedPhoto;

async function openPhotoViewer(src) {
    const viewer = document.getElementById('photo-viewer-overlay');
    const img = document.getElementById('photo-viewer-img');

    if (!viewer || !img) return;

    viewer.style.display = 'flex';
    img.style.opacity = '0.5';
    img.src = window.rbiPhotoPlaceholder || '';

    currentZoom = 1;
    translateX = 0;
    translateY = 0;
    img.style.transform = `translate(0px, 0px) scale(1)`;

    setTimeout(() => viewer.classList.remove('opacity-0'), 10);

    let finalSrc = null;
    const srcStr = String(src || '');

    if (srcStr.startsWith('data:') || srcStr.startsWith('blob:')) {
        finalSrc = src;
    } else {
        try {
            if (src && typeof PhotoManager !== 'undefined' && typeof PhotoManager.getAsyncUrl === 'function') {
                const resolvedSrc = await PhotoManager.getAsyncUrl(src);

                if (
                    resolvedSrc &&
                    !String(resolvedSrc).startsWith('local://') &&
                    !String(resolvedSrc).startsWith('cloud://')
                ) {
                    finalSrc = resolvedSrc;
                }
            }
        } catch (e) {
            finalSrc = null;
        }
    }

    if (finalSrc) {
        img.src = finalSrc;
    } else {
        img.src = window.rbiPhotoCloudPlaceholder || window.rbiPhotoPlaceholder || '';
    }

    img.style.opacity = '1';
}
window.openPhotoViewer = openPhotoViewer;

// НОВАЯ ФУНКЦИЯ: Правильно закрывает фото и чистит за собой память
function closePhotoViewer() {
    const viewer = document.getElementById('photo-viewer-overlay');
    const img = document.getElementById('photo-viewer-img');

    viewer.classList.add('opacity-0');
    setTimeout(() => {
        viewer.style.display = 'none';
        // Если картинка была временной ссылкой (blob:), очищаем память, чтобы iOS не вылетел
        if (img.src && img.src.startsWith('blob:')) {
            // URL.revokeObjectURL(img.src); // Пока закомментируем жесткую очистку, т.к. кэш держит PhotoManager
            img.src = '';
        }
    }, 300);
}
window.closePhotoViewer = closePhotoViewer;

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-photo-editor-action).
// Файл самостоятельный <script> без платформенного init(ctx) — биндится сразу при загрузке.
(function bindPhotoEditorActionDelegation() {
    if (window.__photoEditorActionDelegationBound) return;
    window.__photoEditorActionDelegationBound = true;

    var dispatch = function (el) {
        var action = el.dataset.photoEditorAction;
        var fn = window[action];
        if (typeof fn !== 'function') return;
        fn();
    };

    var resolveActionElement = function (target) {
        var el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.photoEditorAction) return el;
            var inlineOnclick = el.getAttribute && el.getAttribute('onclick');
            if (inlineOnclick && inlineOnclick.includes('stopPropagation')) return null;
            el = el.parentElement;
        }
        return null;
    };

    document.addEventListener('click', function (e) {
        var el = resolveActionElement(e.target);
        if (el) dispatch(el);
    }, true);
})();
