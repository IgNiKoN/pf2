/* Файл: js/services/config.service.js */
/* Config Service v0.1 — платформенный доступ к window.APP_CONFIG (перенесён из js/config.js) */

window.APP_CONFIG = {
    SUPABASE_URL: 'https://api.rbi-q.ru',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3NTA3MjAwLCJleHAiOjE5MzUyNzM2MDB9.f2s_pInfJu74ptaavpJx7J3I6Arwavcjnkzl1z39wPk'
};

(function () {
    'use strict';

    window.RBI = window.RBI || {};
    window.RBI.services = window.RBI.services || {};

    window.RBI.services.config = {

        getSupabaseUrl: function () {
            return window.APP_CONFIG.SUPABASE_URL;
        },

        getSupabaseKey: function () {
            return window.APP_CONFIG.SUPABASE_KEY;
        },

        getConfig: function () {
            return window.APP_CONFIG;
        }
    };

    if (window.RBI.registry) {
        window.RBI.registry.register('service.config', window.RBI.services.config);
    }

    console.log('[RBI Service] config loaded');
}());
