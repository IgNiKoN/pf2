/* Файл: js/services/file.service.js */
/* File Service v0.1 — legacy wrapper над PhotoManager, rbiHydrateLocalImages, rbiPhotoPlaceholder */

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    window.RBI.services.files = {

        getPhotoUrl: async function (src) {
            if (typeof window.PhotoManager === 'undefined' ||
                typeof window.PhotoManager.getAsyncUrl !== 'function') {
                return src || '';
            }
            return window.PhotoManager.getAsyncUrl(src);
        },

        hydrateLocalImages: async function (root) {
            if (typeof window.rbiHydrateLocalImages === 'function') {
                return window.rbiHydrateLocalImages(root || document);
            }
        },

        placeholder: function () {
            return window.rbiPhotoPlaceholder || '';
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.files', window.RBI.services.files);
    }

    console.log('[RBI Service] files loaded');
}());
