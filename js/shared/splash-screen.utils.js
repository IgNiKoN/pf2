/* Файл: js/shared/splash-screen.utils.js */

const MIN_SPLASH_TIME = 1400;
const MAX_SPLASH_TIME = 3500; // ЖЕСТКИЙ ТАЙМАУТ: Прячем сплэш максимум через 3.5 секунды

const splashDelay = new Promise(resolve => {
    setTimeout(resolve, MIN_SPLASH_TIME);
});

const appReady = new Promise(resolve => {
    // 1. Если приложение загрузилось из кэша мгновенно (событие load уже прошло)
    if (document.readyState === 'complete') {
        resolve();
    } else {
        // 2. Ждем штатной загрузки
        window.addEventListener('load', () => {
            requestAnimationFrame(() => resolve());
        });
        
        // 3. Защита от зависания: если нет сети или сервер не отвечает, форсируем запуск
        setTimeout(resolve, MAX_SPLASH_TIME);
    }
});

// Функция скрытия
function hideSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (!splash) return;
    splash.classList.add('hidden');
    setTimeout(() => {
        splash.remove();
    }, 600);
}

// Запускаем гонку: что произойдет быстрее (штатная загрузка или жесткий таймаут)
Promise.all([
    splashDelay,
    Promise.race([appReady, new Promise(res => setTimeout(res, MAX_SPLASH_TIME))])
]).then(() => {
    hideSplashScreen();
}).catch(err => {
    // На случай непредвиденного сбоя в JS — всё равно открываем приложение
    console.warn("Сбой загрузки сплэш-экрана, принудительный запуск:", err);
    hideSplashScreen();
});

// Ультимативный предохранитель (гарантия 100%, что экран исчезнет)
setTimeout(hideSplashScreen, MAX_SPLASH_TIME + MIN_SPLASH_TIME);
