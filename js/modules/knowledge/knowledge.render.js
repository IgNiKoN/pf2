/**
 * knowledge.render.js
 * Рендер-функции модуля Knowledge.
 *
 * Читают данные из KnowledgeState, не из window.customTwiCards напрямую.
 * Экспортируют объект KnowledgeRender.
 */

import { KnowledgeState } from './knowledge.state.js';

function _getSetting(key) {
    return window.RBI.services.settings.get(key);
}

function _captureExpanded(container) {
    return typeof window._kbCaptureExpandedGroups === 'function'
        ? window._kbCaptureExpandedGroups(container)
        : new Set();
}

function _restoreExpanded(container, keys) {
    if (typeof window._kbRestoreExpandedGroups === 'function') {
        window._kbRestoreExpandedGroups(container, keys);
    }
}

export const KnowledgeRender = {

    /**
     * Рендер списка TWI-карточек.
     * Делегирует фильтрацию в KnowledgeState.getFilteredTwiCards().
     */
    renderTwiList() {
        var container = document.getElementById('twi-cards-container');
        if (!container) return;
        var expanded = _captureExpanded(container);

        var searchInput = '';
        var searchEl = document.getElementById('twi-search-input');
        if (searchEl) searchInput = searchEl.value.toLowerCase();

        // Магия TWI (плашка) — делегируем legacy-функции если она есть
        var newMagicCandidates = window.getMagicTwiCandidates ? window.getMagicTwiCandidates() : [];
        var magicTwiHtml = '';

        if (newMagicCandidates.length > 0 && !searchInput) {
            magicTwiHtml = KnowledgeRender._buildMagicBlock(newMagicCandidates);
        }

        var currentEngineer = _getSetting('engineerName') || 'Инженер';
        var filtered = KnowledgeState.getFilteredTwiCards(searchInput);

        var html = '';
        if (filtered.length === 0) {
            html = '<div class="text-center py-10 text-slate-500 text-xs font-bold uppercase tracking-widest bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">Инструкций пока нет</div>';
        } else {
            var grouped = {};
            filtered.forEach(function (c) {
                var groupName = c.checklistName || c.category || (c.data && c.data.checklistName) || 'Без привязки';
                if (!grouped[groupName]) grouped[groupName] = [];
                grouped[groupName].push(c);
            });

            for (var checklistName in grouped) {
                html += KnowledgeRender._buildTwiGroup(checklistName, grouped[checklistName], currentEngineer);
            }
        }

        container.innerHTML = magicTwiHtml + html;
        _restoreExpanded(container, expanded);
        if (typeof window.rbiHydrateLocalImages === 'function') window.rbiHydrateLocalImages(container);
    },

    /**
     * Рендер списка нормативных документов.
     */
    renderDocsList() {
        var container = document.getElementById('docs-list-container');
        if (!container) return;
        var expanded = _captureExpanded(container);

        var searchInput = '';
        var searchEl = document.getElementById('doc-search-input');
        if (searchEl) searchInput = searchEl.value.toLowerCase();

        var currentEngineer = _getSetting('engineerName') || 'Инженер';
        var filtered = KnowledgeState.getFilteredDocs(searchInput);

        if (filtered.length === 0) {
            container.innerHTML = '<div class="text-center py-10 text-slate-500 text-[11px] font-bold uppercase tracking-widest bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 shadow-sm">Документы не найдены</div>';
            return;
        }

        var grouped = {};
        filtered.forEach(function (doc) {
            var type = doc.type || (doc.data && doc.data.type) || 'Прочее';
            if (!grouped[type]) grouped[type] = [];
            grouped[type].push(doc);
        });

        var html = '';
        Object.keys(grouped).sort().forEach(function (type) {
            html += KnowledgeRender._buildDocsGroup(type, grouped[type], currentEngineer);
        });

        container.innerHTML = html;
        _restoreExpanded(container, expanded);
    },

    /**
     * Рендер списка конструктивных узлов.
     */
    renderNodesList() {
        var container = document.getElementById('nodes-list-container');
        if (!container) return;
        var expanded = _captureExpanded(container);

        var searchInput = '';
        var searchEl = document.getElementById('node-search-input');
        if (searchEl) searchInput = searchEl.value.toLowerCase();

        var currentEngineer = _getSetting('engineerName') || 'Инженер';
        var filtered = KnowledgeState.getFilteredNodes(searchInput);

        if (filtered.length === 0) {
            container.innerHTML = '<div class="text-center py-10 text-slate-500 text-xs font-bold uppercase tracking-widest bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">Узлы не найдены</div>';
            return;
        }

        var grouped = {};
        filtered.forEach(function (node) {
            var cat = node.category || (node.data && node.data.category) || 'Без категории';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(node);
        });

        var html = '';
        for (var cat in grouped) {
            html += KnowledgeRender._buildNodesGroup(cat, grouped[cat], currentEngineer);
        }

        container.innerHTML = html;
        _restoreExpanded(container, expanded);
        if (typeof window.rbiHydrateLocalImages === 'function') window.rbiHydrateLocalImages(container);
    },

    /**
     * Вспомогательный метод — рендер группы TWI-карточек.
     */
    _buildTwiGroup(checklistName, cards, currentEngineer) {
        var cardsHtml = cards.map(function (card) {
            var typeIcon = ''; var typeText = ''; var typeColor = '';
            if (card.type === 'INSPECTOR') {
                typeIcon = '<svg class="w-8 h-8 opacity-40 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>';
                typeText = 'Технадзор'; typeColor = 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-800';
            } else if (card.type === 'WORKER') {
                typeIcon = '<svg class="w-8 h-8 opacity-40 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>';
                typeText = 'Пошаговая'; typeColor = 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-800';
            } else if (card.type === 'PDF') {
                typeIcon = '<svg class="w-8 h-8 opacity-40 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"></path></svg>';
                typeText = 'Регламент'; typeColor = 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800';
            }

            var infoText = '';
            if (card.type === 'WORKER') infoText = 'Шагов: ' + (card.steps && card.steps.length || 0);
            else if (card.type === 'INSPECTOR') infoText = 'Визуал';
            else if (card.type === 'PDF') infoText = card.pdfSize || 'Файл';

            var previewImg = null;
            if (card.type === 'INSPECTOR') previewImg = card.photoGood || card.photoBad;
            else if (card.type === 'WORKER' && card.steps && card.steps.length > 0) {
                var stepWithPhoto = card.steps.find(function (s) { return s.photo; });
                if (stepWithPhoto) previewImg = stepWithPhoto.photo;
            }

            var previewHtml = '';
            if (card.type === 'PDF') {
                previewHtml = '<div class="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 relative"><div class="w-10 h-12 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between p-1.5 relative overflow-hidden"><div class="absolute top-0 left-0 right-0 h-3.5 bg-red-500 flex items-center justify-center"><span class="text-[7px] text-white font-black tracking-widest">PDF</span></div><div class="space-y-1 mt-4"><div class="h-0.5 bg-slate-200 dark:bg-slate-700 rounded w-full"></div><div class="h-0.5 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div><div class="h-0.5 bg-slate-200 dark:bg-slate-700 rounded w-4/6"></div></div></div></div>';
            } else {
                previewHtml = previewImg
                    ? '<img ' + ((typeof window.rbiBuildPhotoImgAttrs === 'function')
                        ? window.rbiBuildPhotoImgAttrs(previewImg, { preferThumb: true })
                        : ('src="' + (window.getPhotoThumbSrc || window.getPhotoSrc)(previewImg) + '"')) + ' class="w-full h-full object-cover" loading="lazy">'
                    : '<div class="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 ' + typeColor + '">' + typeIcon + '</div>';
            }

            var isOwner = !card.id.startsWith('sys_') && (!card.owner || card.owner === currentEngineer);
            var isSystem = card.id.startsWith('sys_');

            return '<div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden flex flex-col active:scale-[0.98] transition-transform relative cursor-pointer" onclick="openTwiViewer(\'' + card.id + '\')">'
                + (isSystem ? '<div class="absolute top-2 left-2 bg-indigo-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-md z-10">СИСТЕМА</div>' : '')
                + '<div class="h-28 sm:h-32 border-b border-[var(--card-border)] relative">'
                + previewHtml
                + '<button onclick="event.stopPropagation(); openUniversalActionSheet(\'' + card.id + '\', \'twi\', \'' + card.title.replace(/'/g, "\\'") + '\', ' + isOwner + ')" class="absolute top-2 right-2 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shadow-md border border-white/20"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg></button>'
                + '</div>'
                + '<div class="p-3 flex flex-col flex-1">'
                + '<div class="text-[8px] font-black px-1.5 py-0.5 rounded w-fit mb-1.5 uppercase border ' + typeColor + ' truncate max-w-full">' + typeText + '</div>'
                + '<div class="text-[12px] font-bold text-slate-800 dark:text-white leading-tight line-clamp-2 mb-2">' + card.title + '</div>'
                + '<div class="mt-auto border-t border-[var(--card-border)] pt-2 flex justify-between items-center">'
                + '<div class="text-[9px] font-bold text-[var(--text-muted)] truncate pr-2"><svg class="w-3 h-3 inline-block mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>'
                + (card.owner ? card.owner.split(' ')[0] : 'Система') + '</div>'
                + '<div class="text-[9px] font-black text-slate-400">' + infoText + '</div>'
                + '</div></div></div>';
        }).join('');

        return '<details class="mb-4 bg-transparent group [&_summary::-webkit-details-marker]:hidden">'
            + '<summary class="py-2.5 px-2 font-black text-slate-800 dark:text-white text-[12px] uppercase tracking-wider mb-1 border-b border-slate-200 dark:border-slate-700 cursor-pointer flex justify-between items-center select-none rounded-lg hover:bg-[var(--hover-bg)] transition-colors active:opacity-70">'
            + '<span class="truncate pr-4">' + checklistName + ' <span class="text-[10px] text-slate-400 ml-1">(' + cards.length + ')</span></span>'
            + '<span class="text-slate-400 shrink-0 transition-transform duration-300 group-open:rotate-180"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg></span>'
            + '</summary>'
            + '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 py-2">' + cardsHtml + '</div>'
            + '</details>';
    },

    /**
     * Вспомогательный метод — рендер группы документов.
     */
    _buildDocsGroup(type, docs, currentEngineer) {
        var docsHtml = docs.map(function (doc) {
            var isSystem = String(doc.id).startsWith('sys_');
            var isOwner  = !isSystem && (!doc.owner || doc.owner === currentEngineer);
            var tagColor = 'text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400';
            var infoText = isSystem ? 'Системный' : (doc.pdfSize ? 'PDF: ' + doc.pdfSize : 'Без файла');

            return '<div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden flex flex-col active:scale-[0.98] transition-transform relative cursor-pointer" onclick="openDocViewer(\'' + doc.id + '\')">'
                + (isSystem ? '<div class="absolute top-2 left-2 bg-indigo-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-md z-10">СИС</div>' : '')
                + '<div class="h-24 border-b border-[var(--card-border)] bg-slate-50 dark:bg-slate-900 flex items-center justify-center relative">'
                + '<div class="w-10 h-12 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between p-1.5 relative overflow-hidden"><div class="absolute top-0 left-0 right-0 h-3.5 bg-red-500 flex items-center justify-center"><span class="text-[6px] text-white font-black tracking-widest">DOC</span></div><div class="space-y-1 mt-4"><div class="h-0.5 bg-slate-200 dark:bg-slate-700 rounded w-full"></div><div class="h-0.5 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div><div class="h-0.5 bg-slate-200 dark:bg-slate-700 rounded w-4/6"></div></div></div>'
                + (!isSystem ? '<button onclick="event.stopPropagation(); openUniversalActionSheet(\'' + doc.id + '\', \'doc\', \'' + doc.code.replace(/'/g, "\\'") + '\', ' + isOwner + ')" class="absolute top-2 right-2 w-8 h-8 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shadow-md border border-white/20 hover:bg-black/50"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg></button>' : '')
                + '</div>'
                + '<div class="p-3 flex flex-col flex-1">'
                + '<div class="text-[8px] font-black px-1.5 py-0.5 rounded w-fit mb-1.5 uppercase border ' + tagColor + ' truncate max-w-full">' + doc.type + '</div>'
                + '<div class="text-[12px] font-black text-slate-800 dark:text-white leading-tight mb-1 truncate">' + doc.code + '</div>'
                + '<div class="text-[10px] font-medium text-[var(--text-muted)] leading-snug line-clamp-2 mb-2">' + doc.title + '</div>'
                + '<div class="mt-auto border-t border-[var(--card-border)] pt-2 flex justify-between items-center">'
                + '<div class="text-[9px] font-bold text-[var(--text-muted)] truncate pr-2"><svg class="w-3 h-3 inline-block mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>'
                + (isSystem ? 'Система' : (doc.owner ? doc.owner.split(' ')[0] : 'Инженер')) + '</div>'
                + '<div class="text-[9px] font-black text-slate-400">' + infoText + '</div>'
                + '</div></div></div>';
        }).join('');

        return '<details class="mb-4 bg-transparent group [&_summary::-webkit-details-marker]:hidden">'
            + '<summary class="py-2.5 px-2 font-black text-slate-800 dark:text-white text-[12px] uppercase tracking-wider mb-1 border-b border-slate-200 dark:border-slate-700 cursor-pointer flex justify-between items-center select-none rounded-lg hover:bg-[var(--hover-bg)] transition-colors active:opacity-70">'
            + '<span class="truncate pr-4">' + type + ' <span class="text-[10px] text-slate-400 ml-1">(' + docs.length + ')</span></span>'
            + '<span class="text-slate-400 shrink-0 transition-transform duration-300 group-open:rotate-180"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg></span>'
            + '</summary>'
            + '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 py-2">' + docsHtml + '</div>'
            + '</details>';
    },

    /**
     * Вспомогательный метод — рендер группы узлов.
     */
    _buildNodesGroup(cat, nodes, currentEngineer) {
        var customIds = KnowledgeState.customNodes.map(function (n) { return n.id; });

        var nodesHtml = nodes.map(function (node) {
            var isSystem = customIds.indexOf(node.id) === -1;
            var isOwner  = !node.owner || node.owner === currentEngineer;

            var previewHtml = '';
            var hasPdfAttachment = node.attachments && node.attachments.length > 0 && node.attachments[0].type === 'pdf';
            var isOldPdf = node.img && node.img.includes('application/pdf');

            if (hasPdfAttachment || isOldPdf) {
                previewHtml = '<div class="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 relative p-2"><div class="w-12 h-16 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-red-200 dark:border-red-800 flex flex-col justify-between p-1.5 relative overflow-hidden"><div class="absolute top-0 left-0 right-0 h-4 bg-red-500 flex items-center justify-center"><span class="text-[7px] text-white font-black tracking-widest">PDF</span></div><div class="space-y-1.5 mt-5"><div class="h-1 bg-slate-200 dark:bg-slate-700 rounded w-full"></div><div class="h-1 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div><div class="h-1 bg-slate-200 dark:bg-slate-700 rounded w-4/6"></div></div></div></div>';
            } else if (node.attachments && node.attachments.length > 0 && node.attachments[0].type === 'image') {
                previewHtml = '<img ' + ((typeof window.rbiBuildPhotoImgAttrs === 'function')
                    ? window.rbiBuildPhotoImgAttrs(node.attachments[0].url, { preferThumb: true })
                    : ('src="' + window.getPhotoSrc(node.attachments[0].url) + '"')) + ' class="w-full h-full object-contain p-2">';
            } else if (node.img) {
                previewHtml = '<img ' + ((typeof window.rbiBuildPhotoImgAttrs === 'function')
                    ? window.rbiBuildPhotoImgAttrs(node.img, { preferThumb: true })
                    : ('src="' + window.getPhotoSrc(node.img) + '"')) + ' class="w-full h-full object-contain p-2">';
            } else {
                previewHtml = '<div class="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100 dark:bg-slate-900"><svg class="w-8 h-8 opacity-40 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"></path></svg></div>';
            }

            var nodeTitle = node.title || node.name || 'Узел';

            return '<div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden flex flex-col active:scale-[0.98] transition-transform relative cursor-pointer" onclick="openNodeViewer(\'' + node.id + '\')">'
                + (isSystem ? '<div class="absolute top-2 left-2 bg-indigo-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-md z-10">СИС</div>' : '')
                + '<div class="h-28 sm:h-32 border-b border-[var(--card-border)] bg-slate-50 dark:bg-slate-900 relative">'
                + previewHtml
                + (!isSystem ? '<button onclick="event.stopPropagation(); openUniversalActionSheet(\'' + node.id + '\', \'node\', \'' + nodeTitle.replace(/'/g, "\\'") + '\', ' + isOwner + ')" class="absolute top-2 right-2 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white active:scale-90 transition-transform shadow-md border border-white/20"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path></svg></button>' : '')
                + '</div>'
                + '<div class="p-3 flex flex-col flex-1">'
                + '<div class="text-[8px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 px-1.5 py-0.5 rounded w-fit mb-1.5 uppercase truncate max-w-full">' + (node.category || '') + '</div>'
                + '<div class="text-[12px] font-bold text-slate-800 dark:text-white leading-tight line-clamp-2 mb-2">' + nodeTitle + '</div>'
                + '<div class="mt-auto border-t border-[var(--card-border)] pt-2 flex justify-between items-center">'
                + '<div class="text-[9px] font-bold text-[var(--text-muted)] truncate pr-2"><svg class="w-3 h-3 inline-block mr-0.5 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>'
                + (isSystem ? 'Система' : (node.owner ? node.owner.split(' ')[0] : 'Инженер')) + '</div>'
                + '</div></div></div>';
        }).join('');

        return '<details class="mb-4 bg-transparent group [&_summary::-webkit-details-marker]:hidden">'
            + '<summary class="py-2.5 px-2 font-black text-slate-800 dark:text-white text-[12px] uppercase tracking-wider mb-1 border-b border-slate-200 dark:border-slate-700 cursor-pointer flex justify-between items-center select-none rounded-lg hover:bg-[var(--hover-bg)] transition-colors active:opacity-70">'
            + '<span class="truncate pr-4">' + cat + ' <span class="text-[10px] text-slate-400 ml-1">(' + nodes.length + ')</span></span>'
            + '<span class="text-slate-400 shrink-0 transition-transform duration-300 group-open:rotate-180"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg></span>'
            + '</summary>'
            + '<div class="grid grid-cols-2 md:grid-cols-3 gap-3 py-2">' + nodesHtml + '</div>'
            + '</details>';
    },

    /**
     * Вспомогательный метод — блок Магия TWI.
     */
    _buildMagicBlock(candidates) {
        var cardsHtml = candidates.map(function (m) {
            return '<div class="bg-white/10 border border-white/20 p-2.5 rounded-xl shrink-0 w-48 flex flex-col justify-between">'
                + '<div class="text-[10px] font-bold leading-tight line-clamp-2 mb-3" title="' + m.title + '">' + m.title + '</div>'
                + '<button onclick="window.createMagicTwi(\'' + m.tmplKey + '\', \'' + m.itemId + '\', \'' + m.ok + '\', \'' + m.fail + '\', \'' + m.title.replace(/'/g, "\\'") + '\')" class="w-full bg-white text-indigo-600 py-2 rounded-lg text-[10px] font-black uppercase active:scale-95 shadow-sm transition-transform">Создать (+100 XP)</button>'
                + '</div>';
        }).join('');

        return '<div id="twi-magic-block" class="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl shadow-sm mb-4 text-white overflow-hidden relative magic-collapsed" style="transition: padding 0.3s ease;">'
            + '<div onclick="document.getElementById(\'twi-magic-block\').classList.toggle(\'magic-collapsed\')" class="cursor-pointer p-3">'
            + '<button class="absolute top-3 right-3 text-white/50 hover:text-white/100 transition-colors pointer-events-none"><svg class="w-5 h-5 magic-arrow transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></button>'
            + '<div class="flex items-center gap-2 font-black uppercase tracking-widest text-[11px] drop-shadow-md"><span class="text-lg animate-pulse">✨</span> Магия TWI (Найдено: ' + candidates.length + ')</div>'
            + '</div>'
            + '<div class="magic-content-wrapper px-3"><div class="magic-content">'
            + '<div class="text-[11px] font-medium text-indigo-100 mb-3 leading-snug">Система нашла эталоны (OK) и брак (FAIL) для одних и тех же пунктов. За создание TWI-карты начислен <b class="text-yellow-300">Бонус XP!</b></div>'
            + '<div class="flex gap-2 overflow-x-auto no-scrollbar pb-3">' + cardsHtml + '</div>'
            + '</div></div></div>'
            + '<style>#twi-magic-block.magic-collapsed{padding-bottom:0px}#twi-magic-block.magic-collapsed .magic-arrow{transform:rotate(0deg)}#twi-magic-block:not(.magic-collapsed) .magic-arrow{transform:rotate(180deg)}.magic-content-wrapper{display:grid;grid-template-rows:1fr;transition:grid-template-rows 0.3s ease-out}#twi-magic-block.magic-collapsed .magic-content-wrapper{grid-template-rows:0fr}.magic-content{overflow:hidden}</style>';
    },

    /**
     * Точка входа для mount — рендерит нужную вкладку.
     */
    render(tab) {
        switch (tab) {
            case 'twi':   return KnowledgeRender.renderTwiList();
            case 'docs':  return KnowledgeRender.renderDocsList();
            case 'nodes': return KnowledgeRender.renderNodesList();
            default:      return KnowledgeRender.renderTwiList();
        }
    }
};

// Публикация в window для доступа из legacy-кода
if (typeof window !== 'undefined') {
    window.KnowledgeRender = KnowledgeRender;
}

console.log('[KnowledgeRender] knowledge.render.js loaded');
