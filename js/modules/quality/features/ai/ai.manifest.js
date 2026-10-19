/**
 * ai.manifest.js
 * Декларативный манифест модуля «ИИ-помощник». У модуля нет собственных
 * маршрутов и собственного UI-раздела в меню (routes: [] в ai.module.js) —
 * он работает как сквозной сервис (FAQ-помощник, генерация черновиков,
 * улучшение текста), встроенный в другие вкладки. Метаданные для будущего
 * modules.manifest.js + module-loader. Не подключается никуда — см.
 * js/modules/ai/ai.module.js для реального контракта платформы.
 *
 * Примечание: title/icon — по лучшему приближению (в index.html нет
 * отдельной подписи вкладки «ИИ», только контекстные кнопки «Спросить ИИ» /
 * «Сгенерировать (ИИ)»), требуют подтверждения архитектора/пользователя.
 */

export const AIManifest = {
    id: 'ai',
    role: 'service',
    title: 'ИИ-помощник',
    icon: 'sparkles',
    version: '1.0.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'main', label: 'ИИ', order: 13 },
    company: { enabledByDefault: true },
    routes: [],
    defaultRoute: null
};
