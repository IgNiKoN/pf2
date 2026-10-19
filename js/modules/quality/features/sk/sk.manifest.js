/**
 * sk.manifest.js
 * Декларативный манифест модуля «ПК Стройконтроль» (СК). Метаданные для
 * будущего modules.manifest.js + module-loader. Не подключается никуда — см.
 * js/modules/sk/sk.module.js для реального контракта платформы.
 */

export const SKManifest = {
    id: 'sk',
    role: 'feature-of',
    parentModule: 'quality',
    title: 'Стройконтроль (ПК СК)',
    icon: 'clipboard-check',
    version: '1.0.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'quality', label: 'ПК СК', order: 5 },
    company: { enabledByDefault: true },
    routes: ['/sk', '/sk/:subTab'],
    defaultRoute: '/sk'
};
