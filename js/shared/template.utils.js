// Функция подсветки нормативных актов и допусков
function formatNorms(text) {
    if(!text) return "";
    let html = text.replace(/(СП\s?\d+(\.\d+)*(\.\d+)?|ГОСТ\s?(Р\s)?\d+(-\d+)?|Проект|Тех\.\s?карта|Техническое\s?задание)/g, '<span class="norm-ref text-indigo-600 font-bold">$1</span>');
    html = html.replace(/([±<>≤≥]?\s?\d+([\.,]\d+)?\s*(мм|см|м|%|шт))/gi, '<span style="color:#b91c1c; font-weight:900;">$1</span>');
    return html.replace(/\n/g, '<br>');
}
if (typeof window !== 'undefined') {
    window.formatNorms = formatNorms;
}

(function () {
    'use strict';
    if (typeof window === 'undefined') { return; }
    window.RBI = window.RBI || {};
    window.RBI.utils = window.RBI.utils || {};

    window.RBI.utils.templates = {
        getSystemTemplates: function () {
            if (window.RBI && window.RBI.services && window.RBI.services.masterData) {
                return window.RBI.services.masterData.getSystemTemplates();
            }
            return (typeof window.SYSTEM_TEMPLATES !== 'undefined') ? window.SYSTEM_TEMPLATES : {};
        },
        getUserTemplates: function () {
            if (window.RBI && window.RBI.services && window.RBI.services.masterData) {
                return window.RBI.services.masterData.getUserTemplates();
            }
            return (window.userTemplates && typeof window.userTemplates === 'object') ? window.userTemplates : {};
        },
        getByKey: function (key) {
            if (window.RBI && window.RBI.services && window.RBI.services.masterData) {
                return window.RBI.services.masterData.getTemplateByKey(key);
            }
            var sys = (typeof window.SYSTEM_TEMPLATES !== 'undefined') ? window.SYSTEM_TEMPLATES : {};
            if (sys[key] !== undefined) { return sys[key]; }
            var user = (window.userTemplates && typeof window.userTemplates === 'object') ? window.userTemplates : {};
            return user[key] !== undefined ? user[key] : null;
        },
        getAllKeys: function () {
            var sys = (typeof window.SYSTEM_TEMPLATES !== 'undefined') ? window.SYSTEM_TEMPLATES : {};
            var sysKeys = Object.keys(sys);
            var user = (window.userTemplates && typeof window.userTemplates === 'object') ? window.userTemplates : {};
            var userKeys = Object.keys(user);
            return sysKeys.concat(userKeys.filter(function (k) { return sysKeys.indexOf(k) === -1; }));
        },
        isSystemTemplate: function (key) {
            var sys = (typeof window.SYSTEM_TEMPLATES !== 'undefined') ? window.SYSTEM_TEMPLATES : {};
            return Object.prototype.hasOwnProperty.call(sys, key);
        },
        formatNorms: function (text) {
            return formatNorms(text);
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('utils.templates', window.RBI.utils.templates);
    }
    console.log('[RBI Utils] templates loaded');
}());
