/* Файл: js/shared/fab-export.utils.js */
/* Единый FAB-механизм экспорта — перенесено из js/app.js */

// =========================================================================
// РАЗМЕТКА «fab-export-menu-overlay» (перенос из index.html:879-906, перенос
// 30 modal/overlay-блоков #app-modals в JS-рендер). HTML-строка 1:1 идентична
// прежней статичной разметке.
// =========================================================================
(function mountFabExportMenuOverlayMarkup() {
    if (document.getElementById('fab-export-menu-overlay')) return;
    var root = window.RBI && window.RBI.services && window.RBI.services.shell
        ? window.RBI.services.shell.getModalsRoot()
        : document.getElementById('app-modals');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', `
    <div id="fab-export-menu-overlay"
        class="fixed inset-0 bg-slate-900/60 z-[9000] hidden items-end justify-center p-2 sm:p-4 backdrop-blur-sm transition-opacity duration-300 opacity-0"
        data-fab-export-action="closeFabExportMenu">
        <div class="bg-[var(--card-bg)] w-full max-w-xl rounded-3xl shadow-2xl transition-transform duration-300 transform translate-y-full mb-[80px] sm:mb-0 border border-slate-200/50 dark:border-slate-700/50 overflow-hidden flex flex-col max-h-[80vh]"
            id="fab-export-menu-content" onclick="event.stopPropagation()">

            <div class="p-4 border-b border-slate-100 dark:border-slate-800 bg-[var(--hover-bg)] shrink-0">
                <h3
                    class="font-black text-[13px] uppercase tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
                    <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                    Выгрузка и Печать
                </h3>
            </div>

            <div id="fab-menu-dynamic-list" class="p-2 space-y-1 overflow-y-auto custom-scrollbar flex-1">
                <!-- Сюда JS вставит нужные кнопки -->
            </div>

            <div class="p-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button data-fab-export-action="closeFabExportMenu"
                    class="w-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 py-3.5 rounded-xl font-bold text-[11px] uppercase tracking-widest active:scale-95 transition-transform">Отмена</button>
            </div>
        </div>
    </div>
`);
}());

// === ЕДИНАЯ УМНАЯ КНОПКА FAB (СКАЧАТЬ PDF) ===
function updateFabButton(tabId) {
    const fab = document.getElementById('fab-download-btn');
    if (!fab) return;

    if (tabId === 'tab-analytics') {
        // ЖЕСТКАЯ ПРОВЕРКА: Если мы на вкладке Инженеров (HR) - скрываем кнопку!
        if (window.RBI.services.analytics.getActiveSubTab() === 'sub-engineer-rating') {
            fab.classList.add('hidden');
            fab.classList.remove('fab-visible');
            fab.style.display = 'none';
        } else {
            fab.classList.remove('hidden');
            fab.classList.add('fab-visible');
            fab.style.display = 'flex';
            fab.dataset.context = window.RBI.services.analytics.getActiveSubTab() || 'pdf';
        }
    } else {
        fab.classList.add('hidden');
        fab.classList.remove('fab-visible');
        fab.style.display = 'none';
    }
}
window.updateFabButton = updateFabButton;

function handleFabDownload() {
    const fab = document.getElementById('fab-download-btn');
    const ctx = fab?.dataset.context || 'pdf';
    const data = getFilteredAnalyticsData();

    if (data.length === 0) return showToast('Нет данных для выгрузки');

    const menuOverlay = document.getElementById('fab-export-menu-overlay');
    const menuContent = document.getElementById('fab-export-menu-content');
    const dynamicList = document.getElementById('fab-menu-dynamic-list');

    if (!menuOverlay || !dynamicList) return;

    // SVG Иконки
    const iconPdf = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>`;
    const iconPrint = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>`;
    const iconDoc = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"></path></svg>`;
    const iconChart = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"></path></svg>`;
    const iconPoster = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"></path></svg>`;
    const iconTable = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125-.504 1.125-1.125M3.375 8.25v-1.5c0-.621.504-1.125 1.125-1.125m17.25 2.625v-1.5c0-.621-.504-1.125-1.125-1.125m-17.25 0h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0v1.5c0 .621.504 1.125 1.125 1.125"></path></svg>`;
    const iconPptx = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M9 8h6M9 12h6M9 16h4"></path></svg>`;

    // withPptx: третья кнопка PowerPoint (PDF / Печать / PPTX).
    const createRow = (action, title, desc, iconBg, iconColor, mainIcon, withPptx = false) => `
        <div class="w-full flex items-center justify-between p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
            <div class="flex items-center gap-3 min-w-0 pr-2">
                <div class="w-10 h-10 ${iconBg} ${iconColor} rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-slate-100 dark:border-slate-700">${mainIcon}</div>
                <div class="min-w-0">
                    <div class="font-bold text-[12px] text-slate-800 dark:text-white truncate">${title}</div>
                    <div class="text-[9px] font-bold text-slate-400 uppercase mt-0.5 truncate">${desc}</div>
                </div>
            </div>
            <div class="flex gap-1.5 shrink-0">
                <button onclick="handleFabExportAction('${action}', 'script')" class="w-10 h-10 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-lg flex items-center justify-center shadow-sm active:scale-90 transition-all border border-indigo-100 dark:border-indigo-800" title="Скачать PDF">
                    ${iconPdf}
                </button>
                <button onclick="handleFabExportAction('${action}', 'browser')" class="w-10 h-10 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 rounded-lg flex items-center justify-center shadow-sm active:scale-90 transition-all border border-slate-200 dark:border-slate-700" title="Напечатать">
                    ${iconPrint}
                </button>
                ${withPptx ? `<button onclick="closeFabExportMenu(); handleFabExportAction('${action}', 'pptx')" class="w-10 h-10 bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400 rounded-lg flex items-center justify-center shadow-sm active:scale-90 transition-all border border-orange-100 dark:border-orange-800" title="PowerPoint">
                    ${iconPptx}
                </button>` : ''}
            </div>
        </div>`;

    let contentHtml = '';

    if (ctx === 'sub-contractors') {
        contentHtml += createRow('current', 'Текущий экран', 'Детализация или список (А4)', 'bg-indigo-50 dark:bg-indigo-900/30', 'text-indigo-600 dark:text-indigo-400', iconDoc);
        contentHtml += createRow('full_report', 'Отчёт по объекту', 'Паспорта подрядчиков (А3)', 'bg-emerald-50 dark:bg-emerald-900/30', 'text-emerald-600 dark:text-emerald-400', iconChart, true);
        contentHtml += createRow('full_report_v2', 'Отчёт по объекту 2.0', 'Строгий стиль · OP4 + карточки подрядчиков (А3)', 'bg-slate-100 dark:bg-slate-800', 'text-slate-700 dark:text-slate-200', iconChart, true);
        contentHtml += createRow('defect_remediation', 'Повторяющиеся дефекты', 'Брак / устранение, ≥3 повтора (А3 альбом)', 'bg-rose-50 dark:bg-rose-900/30', 'text-rose-600 dark:text-rose-400', iconPoster, true);
        contentHtml += createRow('poster', 'Плакат качества', 'Рейтинги и фото (А3)', 'bg-orange-50 dark:bg-orange-900/30', 'text-orange-600 dark:text-orange-400', iconPoster, true);
        contentHtml += createRow('tender', 'Тендерный отчет', 'Левая кнопка: PDF | Правая: Excel CSV', 'bg-purple-50 dark:bg-purple-900/30', 'text-purple-600 dark:text-purple-400', iconTable);
    } else if (ctx === 'sub-onepager') {
        // HTML-превью с тумблерами секций → системная печать (без html2pdf).
        contentHtml += createRow('onepager_preview', 'Сводка к печати (OP2)', 'One-Pager 2.0 в HTML · секции on/off → Печать', 'bg-teal-50 dark:bg-teal-900/30', 'text-teal-600 dark:text-teal-400', iconDoc);
        contentHtml += createRow('onepager', 'Сводный статус объекта', 'Классический One-Pager (А3)', 'bg-indigo-50 dark:bg-indigo-900/30', 'text-indigo-600 dark:text-indigo-400', iconChart);
        contentHtml += createRow('onepager_v2', 'One-Pager 2.0', 'Метрики + ПК СК + рейтинги на 1 листе А3', 'bg-violet-50 dark:bg-violet-900/30', 'text-violet-600 dark:text-violet-400', iconPoster, true);
        contentHtml += createRow('onepager_v4', 'One-Pager 4.0', 'Те же метрики · строгий Times / серые рамки (А3)', 'bg-slate-100 dark:bg-slate-800', 'text-slate-700 dark:text-slate-200', iconPoster, true);
        contentHtml += createRow('defect_remediation', 'Повторяющиеся дефекты', 'Брак / устранение, ≥3 повтора (А3 альбом)', 'bg-rose-50 dark:bg-rose-900/30', 'text-rose-600 dark:text-rose-400', iconPoster, true);
        contentHtml += createRow('global_onepager_v2', 'Сводный отчет по компании 2.0', 'Титул с KPI + One-Pager 2.0 по каждому объекту (А3)', 'bg-violet-50 dark:bg-violet-900/30', 'text-violet-600 dark:text-violet-400', iconDoc, true);
        contentHtml += createRow('global_onepager_v3', 'Сводный отчет по компании 3.0', 'То же, что 2.0, укрупнённо на A1 альбом', 'bg-fuchsia-50 dark:bg-fuchsia-900/30', 'text-fuchsia-600 dark:text-fuchsia-400', iconDoc);
        contentHtml += createRow('global_onepager', 'Глобальная сводка', 'Все объекты компании (А3)', 'bg-blue-50 dark:bg-blue-900/30', 'text-blue-600 dark:text-blue-400', iconDoc);

        // --- НОВОЕ: МАРШРУТИЗАЦИЯ ДЛЯ ОСТАЛЬНЫХ ВКЛАДОК ---
    } else if (ctx === 'sub-data' || ctx === 'sub-history') {
        contentHtml += createRow('data', 'Реестр проверок', 'Сырая база данных (А4)', 'bg-slate-100 dark:bg-slate-800', 'text-slate-600 dark:text-slate-300', iconTable);
    } else if (ctx === 'sub-schedule') {
        contentHtml += createRow('schedule', 'График СМР', 'Текущий график работ (А4)', 'bg-emerald-50 dark:bg-emerald-900/30', 'text-emerald-600 dark:text-emerald-400', iconTable);
    } else if (ctx === 'sub-sk') {
        contentHtml += createRow('sk_dashboard', 'Дашборд Стройконтроля', 'Матрица сокрытия брака (А4)', 'bg-blue-50 dark:bg-blue-900/30', 'text-blue-600 dark:text-blue-400', iconChart);
    } else {
        contentHtml += `<div class="text-center text-sm text-slate-500 py-4 font-bold">Выгрузка для этого раздела недоступна</div>`;
    }

    dynamicList.innerHTML = contentHtml;

    // Показываем меню
    menuOverlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    setTimeout(() => {
        menuOverlay.classList.remove('opacity-0');
        menuContent.classList.remove('translate-y-full');
    }, 10);
}
window.handleFabDownload = handleFabDownload;

function closeFabExportMenu() {
    document.getElementById('fab-export-menu-overlay').classList.add('opacity-0');
    document.getElementById('fab-export-menu-content').classList.add('translate-y-full');
    setTimeout(() => {
        document.getElementById('fab-export-menu-overlay').style.display = 'none';
        document.body.classList.remove('modal-open');
    }, 300);
}
window.closeFabExportMenu = closeFabExportMenu;

// Паттерн делегирования событий для инициативы «Разбор inline onclick/onchange»
// (см. _ai/INDEX_HTML_HANDLERS_MAP.md), namespace-per-module (data-fab-export-action).
// Файл самостоятельный <script> без платформенного init(ctx) — биндится сразу при загрузке.
(function bindFabExportActionDelegation() {
    if (window.__fabExportActionDelegationBound) return;
    window.__fabExportActionDelegationBound = true;

    var dispatch = function (el) {
        var action = el.dataset.fabExportAction;
        var fn = window[action];
        if (typeof fn !== 'function') return;
        fn();
    };

    var resolveActionElement = function (target) {
        var el = target;
        while (el && el.nodeType === 1) {
            if (el.dataset && el.dataset.fabExportAction) return el;
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
