/**
 * settings.manifest.js
 * Декларативный манифест модуля «Настройки». Метаданные для будущего
 * modules.manifest.js + module-loader. Не подключается никуда — см.
 * js/modules/settings/settings.module.js для реального контракта платформы.
 */

export const SettingsManifest = {
    id: 'settings',
    role: 'service',
    title: 'Настройки',
    icon: 'settings',
    version: '1.0.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'main', label: 'Настройки', order: 8 },
    company: { enabledByDefault: true },
    routes: ['/settings'],
    defaultRoute: '/settings'
};
