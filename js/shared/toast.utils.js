/* js/shared/toast.utils.js — Toast Utils v0.1 */
/* Обёртка над showToast из app.js */
/* IIFE-паттерн */

(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    window.RBI = window.RBI || {};
    window.RBI.utils = window.RBI.utils || {};

    window.RBI.utils.toast = {

        /* Показать уведомление: делегирует в window.showToast */
        show: function (message) {
            if (typeof window.showToast === 'function') {
                window.showToast(message);
                return;
            }
            /* Fallback: минимальный inline-тост без зависимости от app.js */
            var container = document.getElementById('toast-container');
            if (!container) return;
            var toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerText = String(message);
            container.appendChild(toast);
            setTimeout(function () {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 3000);
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('utils.toast', window.RBI.utils.toast);
    }

    console.log('[RBI Utils] toast loaded');
}());
