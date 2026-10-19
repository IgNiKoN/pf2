/**
 * construction.manifest.js
 * Декларативный манифест модуля «Стройконтроль» (Construction — дефекты на
 * плане, шахматка, передача квартир, приёмка работ). Метаданные для будущего
 * modules.manifest.js + module-loader. Не подключается никуда — см.
 * js/modules/construction/construction.module.js для реального контракта платформы.
 */

export const ConstructionManifest = {
    id: 'construction',
    role: 'module',
    title: 'Стройконтроль',
    icon: 'hard-hat',
    version: '1.0.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'construction', label: 'Стройконтроль', order: 10 },
    company: { enabledByDefault: true },
    routes: ['/construction', '/construction/:subTab'],
    defaultRoute: '/construction'
};
