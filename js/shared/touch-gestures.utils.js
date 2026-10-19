/* Файл: js/shared/touch-gestures.utils.js */
/* По умолчанию: overscroll contain (пружина, без PTR).
   Опция hardOverscrollLock: жёсткий край + preventDefault у верха (для Android). */

(function rbiOverscrollPolicy() {
    'use strict';

    if (window.__rbiPullToRefreshBlockReady) return;
    window.__rbiPullToRefreshBlockReady = true;

    var _touchStartY = 0;
    var _hardBound = false;

    function isHardLockOn() {
        try {
            return !!(window.appSettings && window.appSettings.hardOverscrollLock === true);
        } catch (_) {
            return false;
        }
    }

    function onTouchStart(e) {
        if (!e.touches || !e.touches.length) return;
        _touchStartY = e.touches[0].clientY;
    }

    function onTouchMove(e) {
        if (!isHardLockOn()) return;
        if (!e.touches || !e.touches.length) return;
        var y = window.scrollY || document.documentElement.scrollTop || 0;
        var dy = e.touches[0].clientY - _touchStartY;
        // Тянут вниз у самого верха страницы — режем жест (PTR Android Chrome)
        if (y <= 0 && dy > 0) {
            e.preventDefault();
        }
    }

    function bindHardTouch() {
        if (_hardBound) return;
        document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
        document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
        _hardBound = true;
    }

    function unbindHardTouch() {
        if (!_hardBound) return;
        document.removeEventListener('touchstart', onTouchStart, true);
        document.removeEventListener('touchmove', onTouchMove, true);
        _hardBound = false;
    }

    function applyHardOverscrollLock() {
        var on = isHardLockOn();
        document.documentElement.classList.toggle('hard-overscroll-lock', on);
        document.body.classList.toggle('hard-overscroll-lock', on);
        if (on) bindHardTouch();
        else unbindHardTouch();
        window.__rbiOverscrollPolicy = on ? 'hard-lock' : 'css-contain';
    }

    window.rbiApplyHardOverscrollLock = applyHardOverscrollLock;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyHardOverscrollLock);
    } else {
        applyHardOverscrollLock();
    }
})();
