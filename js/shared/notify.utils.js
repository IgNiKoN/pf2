/* Файл: js/shared/notify.utils.js */
/* Генерические уведомления/модалки — перенесено из js/app.js */

// =========================================================================
// РАЗМЕТКА «modal-overlay» (перенос из index.html:1132-1142, перенос 30
// modal/overlay-блоков #app-modals в JS-рендер). HTML-строка 1:1 идентична
// прежней статичной разметке. Межмодульный shared UI-примитив (13+
// потребителей quality) — владение закреплено здесь, за файлом, уже
// владеющим поведением этого примитива (closeModal). Потребители не меняются.
// =========================================================================
(function mountModalOverlayMarkup() {
    if (document.getElementById('modal-overlay')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', `
    <div id="modal-overlay" class="modal-overlay" data-notify-action="closeModal">
        <div class="modal-content" onclick="event.stopPropagation()">
            <div id="modal-icon" class="mb-4"></div>
            <div id="modal-title"
                class="text-lg font-black uppercase mb-4 leading-tight tracking-tight border-b border-slate-100 dark:border-slate-700 pb-2 text-slate-800 dark:text-white">
            </div>
            <div id="modal-body" class="text-sm leading-relaxed space-y-3"></div>
            <button data-notify-action="closeModal"
                class="w-full mt-6 bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-[11px] uppercase tracking-widest active:scale-95 shadow-md">Закрыть</button>
        </div>
    </div>
`);
}());

// === УВЕДОМЛЕНИЯ И МОДАЛКИ (v15 100% совместимость) ===
function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const kind = typeof window.rbiClassifyToastMessage === 'function'
        ? window.rbiClassifyToastMessage(message)
        : '';
    if (kind === 'ok') toast.classList.add('toast-ok');
    if (kind === 'err') toast.classList.add('toast-err');
    toast.innerText = message;
    container.appendChild(toast);

    // Лёгкий flash рядом со статусом синка / шапкой при ok/err
    if (kind && typeof window.rbiFlashFeedback === 'function') {
        const flashTarget =
            document.getElementById('analytics-status-icon-container') ||
            document.getElementById('sync-status-icon') ||
            document.querySelector('.header-fixed');
        if (flashTarget) window.rbiFlashFeedback(flashTarget, kind === 'err' ? 'error' : 'ok');
    }

    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.classList.remove('modal-open');
    // History plan viewer: restore above-modal stacking after inspection detail closes
    try {
        const plan = document.getElementById('quality-plan-pin-overlay');
        if (plan && plan.getAttribute('data-qpin-under-modal') === '1') {
            plan.style.zIndex = '';
            plan.removeAttribute('data-qpin-under-modal');
        }
    } catch (_e) { /* ignore */ }
}

window.showToast = showToast;
window.closeModal = closeModal;

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-notify-action).
// Файл самостоятельный <script> без платформенного init(ctx) — биндится сразу при загрузке.
(function bindNotifyActionDelegation() {
    if (window.__notifyActionDelegationBound) return;
    window.__notifyActionDelegationBound = true;

    var dispatch = function (el) {
        var action = el.dataset.notifyAction;
        var fn = window[action];
        if (typeof fn !== 'function') return;
        fn();
    };

    var resolveActionElement = function (target) {
        var el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.notifyAction) return el;
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
