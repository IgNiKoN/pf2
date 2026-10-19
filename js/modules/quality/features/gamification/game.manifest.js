/**
 * game.manifest.js
 * Декларативный манифест модуля «Геймификация» (профиль инженера,
 * достижения, FMEA). Метаданные для будущего modules.manifest.js +
 * module-loader. Не подключается никуда — см.
 * js/modules/gamification/game.module.js для реального контракта платформы.
 *
 * Примечание: точное русское название вкладки не найдено дословно в
 * index.html (UI показывает «Профиль Инженера» / достижения как часть
 * вкладки «Инженер»). title/menu.label — по лучшему приближению, требуют
 * подтверждения архитектора/пользователя.
 */

export const GameManifest = {
    id: 'game',
    role: 'feature-of',
    parentModule: 'quality',
    title: 'Геймификация',
    icon: 'trophy',
    version: '1.0.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'engineer', label: 'Достижения', order: 11 },
    company: { enabledByDefault: true },
    routes: ['/game', '/game/:subTab', '/fmea', '/fmea/:id'],
    defaultRoute: '/game'
};
