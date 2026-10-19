/* Файл: js/shared/plan-panzoom.utils.js */
/* Общий зум/пан для планов этажа (стройконтроль + интерактивный план).
 * Panzoom для HTML считает focal под transform-origin 50% 50% — не ставить origin 0 0.
 * Wheel/trackpad и pinch имеют разную чувствительность. */

(function (w) {
    'use strict';

    /** Чувствительность pinch (Panzoom: Δscale ≈ deltaPx * step / 80). */
    var PINCH_STEP = 0.5;
    /** Шаг кнопок ±. */
    var BTN_STEP = 0.28;

    /**
     * Центрирует stage в wrap через pan (после init / reset).
     * dx/scale — как в Panzoom pan при drag.
     */
    function center(pz, wrap, stage) {
        if (!pz || !wrap || !stage || typeof pz.getPan !== 'function') return;
        var wr = wrap.getBoundingClientRect();
        var er = stage.getBoundingClientRect();
        if (wr.width < 2 || er.width < 2) return;
        var dx = wr.left + wr.width / 2 - (er.left + er.width / 2);
        var dy = wr.top + wr.height / 2 - (er.top + er.height / 2);
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        var s = pz.getScale() || 1;
        var pan = pz.getPan();
        pz.pan(pan.x + dx / s, pan.y + dy / s, { animate: false, force: true });
    }

    /**
     * Плавный зум колёсиком / трекпадом Mac к курсору.
     * Не используем zoomWithWheel(step) — на трекпаде step≥0.5 даёт «улетает».
     */
    function wheelZoom(pz, e, minScale, maxScale) {
        if (!pz || !e) return;
        e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        var cur = pz.getScale() || 1;
        var dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;
        if (e.deltaMode === 2) dy *= 48;
        // Мелкие тики трекпада Mac — чуть усиливаем, иначе зум «ватный»
        if (dy !== 0 && Math.abs(dy) < 10) {
            dy = dy < 0 ? -14 : 14;
        }
        // Один жест не должен прыгать на ×2, но и не быть еле заметным
        if (dy > 90) dy = 90;
        if (dy < -90) dy = -90;
        var next = cur * Math.exp(-dy * 0.004);
        if (next < minScale) next = minScale;
        if (next > maxScale) next = maxScale;
        if (typeof pz.zoomToPoint === 'function') {
            pz.zoomToPoint(next, { clientX: e.clientX, clientY: e.clientY });
        } else if (typeof pz.zoom === 'function') {
            pz.zoom(next, { animate: false });
        }
    }

    function baseOptions(extra) {
        var o = {
            step: PINCH_STEP,
            pinchAndPan: true,
            touchAction: 'none',
            cursor: 'grab',
            excludeClass: 'panzoom-exclude'
            // origin не задаём → 50% 50% для HTML (иначе wheel уезжает)
        };
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
            }
        }
        return o;
    }

    w.RbiPlanPanzoom = {
        PINCH_STEP: PINCH_STEP,
        BTN_STEP: BTN_STEP,
        center: center,
        wheelZoom: wheelZoom,
        baseOptions: baseOptions
    };
})(window);
