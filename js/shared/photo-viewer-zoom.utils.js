/* Файл: js/shared/photo-viewer-zoom.utils.js */

// =========================================================================
// РАЗМЕТКА «photo-viewer-overlay» (перенос из index.html:736-747, перенос 30
// modal/overlay-блоков #app-modals в JS-рендер). HTML-строка 1:1 идентична
// прежней статичной разметке.
// ВАЖНО (риск тайминга, найденный архитектором): монтаж должен физически
// предшествовать строкам document.getElementById('photo-viewer-img'/-overlay')
// ниже — этот блок вставлен первым исполняемым выражением файла, до
// объявления const viewerImg/viewerOverlay (обе строки читают DOM синхронно
// при загрузке файла).
// =========================================================================
(function mountPhotoViewerOverlayMarkup() {
    if (document.getElementById('photo-viewer-overlay')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', `
    <div id="photo-viewer-overlay"
        class="fixed inset-0 bg-black/90 z-[9999] flex-col items-center justify-center transition-opacity duration-300 opacity-0"
        style="display:none;" data-photo-editor-action="closePhotoViewer">
        <div class="absolute top-5 right-5 w-10 h-10 bg-white/20 text-white rounded-full flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
            data-photo-editor-action="closePhotoViewer">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </div>
        <img id="photo-viewer-img" src="" class="max-w-full max-h-[80vh] object-contain cursor-grab"
            onclick="event.stopPropagation()">
    </div>
`);
}());

const viewerImg = document.getElementById('photo-viewer-img');
const viewerOverlay = document.getElementById('photo-viewer-overlay');

if (viewerImg && viewerOverlay) {
    let currentZoom = 1;
    let translateX = 0, translateY = 0;
    let isDragging = false, isPinching = false;
    let startX, startY;
    let initialDistance = 0, initialZoom = 1;
    let reqFrame = null;
    let lastTap = 0;

    function updateTransform() {
        viewerImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentZoom})`;
    }

    function resetZoom() {
        currentZoom = 1; translateX = 0; translateY = 0;
        viewerImg.style.transition = 'transform 0.2s ease-out';
        updateTransform();
    }

    viewerOverlay.addEventListener('click', (e) => {
        if (e.target === viewerOverlay || e.target.closest('div.absolute')) resetZoom();
    });

    function disableTransition() { viewerImg.style.transition = 'none'; }

    viewerImg.addEventListener('touchend', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) {
            resetZoom();
            e.preventDefault();
        }
        lastTap = currentTime;

        if (e.touches.length < 2) isPinching = false;
        if (e.touches.length === 0) isDragging = false;
        if (currentZoom <= 1 && !isPinching) resetZoom();
    });

    // Мышь (ПК)
    viewerOverlay.addEventListener('wheel', (e) => {
        e.preventDefault();
        disableTransition();
        currentZoom += e.deltaY * -0.002;
        currentZoom = Math.min(Math.max(1, currentZoom), 5);
        if (currentZoom <= 1) { translateX = 0; translateY = 0; }
        updateTransform();
    }, { passive: false });

    viewerImg.addEventListener('mousedown', (e) => {
        if (currentZoom > 1) {
            e.preventDefault();
            isDragging = true;
            disableTransition();
            viewerImg.style.cursor = 'grabbing';
            startX = e.clientX - translateX;
            startY = e.clientY - translateY;
        }
    });
    window.addEventListener('mouseup', () => { isDragging = false; viewerImg.style.cursor = 'grab'; });
    window.addEventListener('mousemove', (e) => {
        if (isDragging && currentZoom > 1) {
            e.preventDefault();
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            if (reqFrame) cancelAnimationFrame(reqFrame);
            reqFrame = requestAnimationFrame(updateTransform);
        }
    });

    // Сенсор (Мобильные)
    viewerImg.addEventListener('touchstart', (e) => {
        disableTransition();
        if (e.touches.length === 2) {
            isPinching = true; isDragging = false;
            initialDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            initialZoom = currentZoom;
            // Сохраняем центр для перемещения 2 пальцами
            startX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - translateX;
            startY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - translateY;
        } else if (e.touches.length === 1 && currentZoom > 1) {
            isDragging = true;
            startX = e.touches[0].clientX - translateX;
            startY = e.touches[0].clientY - translateY;
        }
    });

    window.addEventListener('touchmove', (e) => {
        if (viewerOverlay.style.display !== 'none' && (isPinching || isDragging)) e.preventDefault();

        if (isPinching && e.touches.length === 2) {
            const currentDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            currentZoom = Math.min(Math.max(1, initialZoom * (currentDistance / initialDistance)), 5);
            if (currentZoom <= 1) { translateX = 0; translateY = 0; }

            // Позволяем перемещать фото 2 пальцами во время зума
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            translateX = midX - startX;
            translateY = midY - startY;

            if (reqFrame) cancelAnimationFrame(reqFrame);
            reqFrame = requestAnimationFrame(updateTransform);
        } else if (isDragging && currentZoom > 1 && e.touches.length === 1) {
            translateX = e.touches[0].clientX - startX;
            translateY = e.touches[0].clientY - startY;
            if (reqFrame) cancelAnimationFrame(reqFrame);
            reqFrame = requestAnimationFrame(updateTransform);
        }
    }, { passive: false });
}
