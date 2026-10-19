/* Файл: js/shared/ui-motion.utils.js */
/* Sticky shadow-on-scroll, skeleton, flash ok/err, флаг uiMotionEnabled */

(function rbiUiMotion() {
    'use strict';

    function isMotionEnabled() {
        try {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                return false;
            }
            var s = window.appSettings;
            if (s && s.uiMotionEnabled === false) return false;
        } catch (_) { /* ignore */ }
        return true;
    }

    function applyUiMotionSetting() {
        var on = true;
        try {
            if (window.appSettings && window.appSettings.uiMotionEnabled === false) on = false;
        } catch (_) { /* ignore */ }
        document.body.classList.toggle('ui-motion-off', !on);
    }

    function updateStickyScrolled() {
        var scrolled = (window.scrollY || document.documentElement.scrollTop || 0) > 8;
        var nodes = document.querySelectorAll(
            '.header-fixed, .sticky-top-panel, #analytics-filters-block, #hist-sticky-panel'
        );
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].classList.toggle('is-scrolled', scrolled);
        }
    }

    function showContentSkeleton(el, opts) {
        if (!el) return;
        opts = opts || {};
        var cards = opts.cards != null ? opts.cards : 4;
        var label = opts.label || 'Загрузка…';
        var motion = isMotionEnabled();
        var html = '<div class="rbi-skeleton-wrap py-4" role="status" aria-live="polite">';
        html += '<div class="text-center text-[12px] font-black text-slate-500 dark:text-slate-400 mb-3 tracking-wide">' + label + '</div>';
        if (motion) {
            for (var i = 0; i < cards; i++) {
                html += '<div class="rbi-skeleton-card"></div>';
            }
            html += '<div class="rbi-skeleton-line" style="width:72%"></div>';
            html += '<div class="rbi-skeleton-line" style="width:48%"></div>';
        } else {
            html += '<div class="flex justify-center py-6"><div class="w-7 h-7 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin"></div></div>';
        }
        html += '</div>';
        el.innerHTML = html;
    }

    function flashFeedback(el, kind) {
        if (!el || !isMotionEnabled()) return;
        var cls = kind === 'error' || kind === 'err' ? 'rbi-flash-err' : 'rbi-flash-ok';
        el.classList.remove('rbi-flash-ok', 'rbi-flash-err');
        void el.offsetWidth;
        el.classList.add(cls);
        setTimeout(function () {
            el.classList.remove(cls);
        }, 480);
    }

    function classifyToastMessage(message) {
        var m = String(message || '');
        if (/[❌⚠️]|ошибк|неверн|нет прав|не удалось/i.test(m)) return 'err';
        if (/[✅💾]|сохран|готов|успеш|синхрониз/i.test(m)) return 'ok';
        return '';
    }

    window.rbiIsUiMotionEnabled = isMotionEnabled;
    window.rbiApplyUiMotionSetting = applyUiMotionSetting;
    window.rbiUpdateStickyScrolled = updateStickyScrolled;
    window.rbiShowContentSkeleton = showContentSkeleton;
    window.rbiFlashFeedback = flashFeedback;
    window.rbiClassifyToastMessage = classifyToastMessage;

    if (!window.__rbiUiMotionBound) {
        window.__rbiUiMotionBound = true;
        window.addEventListener('scroll', updateStickyScrolled, { passive: true });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                applyUiMotionSetting();
                updateStickyScrolled();
            });
        } else {
            applyUiMotionSetting();
            updateStickyScrolled();
        }
    }
})();
