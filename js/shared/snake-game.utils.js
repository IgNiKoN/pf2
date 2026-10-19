// snake-game.utils.js — мини-игра «Змейка» на экране-заглушке модулей
// (#tab-mode-placeholder, см. js/core/views.js#showModePlaceholder).
// Чистый canvas, без зависимостей. Рекорд — localStorage (rbi_snake_best).
//
// Публичная граница: window.rbi_startSnakeGame() / window.rbi_snakeDirection(dir),
// привязаны через data-settings-action (тот же резолвер, что кнопки заглушки).

(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    var BEST_KEY = 'rbi_snake_best';
    var GRID = 12;           // клеток по стороне (canvas 240x240 → 20px/клетка)
    var CELL = 240 / GRID;
    var TICK_MS = 160;

    var snake, food, dir, nextDir, score, timer, running, waitingForFirstMove;

    function _canvas() { return document.getElementById('snake-canvas'); }
    function _ctx() { var c = _canvas(); return c ? c.getContext('2d') : null; }

    function _getBest() {
        return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
    }
    function _setBest(v) {
        localStorage.setItem(BEST_KEY, String(v));
        var el = document.getElementById('snake-best');
        if (el) el.innerText = v;
    }
    function _setScore(v) {
        score = v;
        var el = document.getElementById('snake-score');
        if (el) el.innerText = v;
    }

    function _randomFood() {
        var cell;
        do {
            cell = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
        } while (snake.some(function (s) { return s.x === cell.x && s.y === cell.y; }));
        return cell;
    }

    function _draw() {
        var ctx = _ctx();
        if (!ctx) return;
        var isDark = document.documentElement.classList.contains('dark');
        ctx.clearRect(0, 0, 240, 240);
        ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
        ctx.fillRect(0, 0, 240, 240);

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2.6, 0, Math.PI * 2);
        ctx.fill();

        snake.forEach(function (seg, i) {
            ctx.fillStyle = i === 0 ? '#4f46e5' : '#818cf8';
            ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
        });
    }

    function _step() {
        dir = nextDir;
        var head = snake[0];
        var next = { x: head.x + dir.x, y: head.y + dir.y };

        var hitsWall = next.x < 0 || next.y < 0 || next.x >= GRID || next.y >= GRID;
        var hitsSelf = snake.some(function (s) { return s.x === next.x && s.y === next.y; });
        if (hitsWall || hitsSelf) return _gameOver();

        snake.unshift(next);
        if (next.x === food.x && next.y === food.y) {
            _setScore(score + 1);
            food = _randomFood();
        } else {
            snake.pop();
        }
        _draw();
    }

    function _gameOver() {
        running = false;
        clearInterval(timer);
        if (score > _getBest()) _setBest(score);

        var overlay = document.getElementById('snake-overlay');
        if (overlay) {
            overlay.innerHTML = '<div class="bg-white/95 dark:bg-slate-900/95 rounded-xl px-4 py-3 text-center shadow-md border border-slate-200 dark:border-slate-700">' +
                '<div class="text-[11px] font-black text-slate-700 dark:text-white uppercase mb-1">Игра окончена</div>' +
                '<button data-settings-action="rbi_startSnakeGame" class="bg-indigo-600 text-white px-4 py-2 rounded-lg font-black text-[10px] uppercase active:scale-95">↻ Ещё раз</button>' +
                '</div>';
            overlay.classList.remove('hidden');
        }
    }

    window.rbi_startSnakeGame = function () {
        var overlay = document.getElementById('snake-overlay');
        if (overlay) overlay.classList.add('hidden');
        var mid = Math.floor(GRID / 2);
        snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
        dir = nextDir = { x: 1, y: 0 };
        food = _randomFood();
        _setScore(0);
        _setBest(_getBest());
        running = true;
        // Змейка стоит на месте до первого нажатия стрелки/свайпа/D-pad —
        // таймер тика запускается только из rbi_snakeDirection() (см. ниже).
        waitingForFirstMove = true;
        clearInterval(timer);
        _draw();
    };

    var DIR_VECTORS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
    window.rbi_snakeDirection = function (name) {
        if (!running) return;
        var v = DIR_VECTORS[name];
        if (!v) return;
        // Запрет разворота на 180° (моментальное самопоглощение) — не применим
        // к самому первому ходу, пока змейка ещё не начала двигаться.
        if (!waitingForFirstMove && v.x === -dir.x && v.y === -dir.y) return;
        nextDir = v;
        if (waitingForFirstMove) {
            waitingForFirstMove = false;
            clearInterval(timer);
            timer = setInterval(_step, TICK_MS);
        }
    };

    // Клавиатура (десктоп) — активна только когда открыт экран-заглушка.
    document.addEventListener('keydown', function (e) {
        var placeholder = document.getElementById('tab-mode-placeholder');
        if (!placeholder || !placeholder.classList.contains('active')) return;
        var map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
        if (map[e.key]) { e.preventDefault(); window.rbi_snakeDirection(map[e.key]); }
    });

    // Свайпы на canvas (мобильные экраны).
    (function bindSwipe() {
        var startX = 0, startY = 0;
        document.addEventListener('touchstart', function (e) {
            if (e.target && e.target.id === 'snake-canvas') {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }
        }, { passive: true });
        document.addEventListener('touchend', function (e) {
            if (!(e.target && e.target.id === 'snake-canvas')) return;
            var dx = (e.changedTouches[0].clientX - startX);
            var dy = (e.changedTouches[0].clientY - startY);
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
            window.rbi_snakeDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        }, { passive: true });
    }());

    // Останавливаем таймер при уходе с заглушки — не тратим CPU/батарею в фоне.
    document.addEventListener('click', function (e) {
        if (!running) return;
        var backBtn = e.target.closest && e.target.closest('[data-settings-action="rbi_backFromModePlaceholder"]');
        if (backBtn) { running = false; clearInterval(timer); }
    }, true);
}());
