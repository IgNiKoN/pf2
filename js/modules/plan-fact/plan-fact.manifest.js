/**
 * plan-fact.manifest.js
 * Декларативный манифест top-level бизнес-модуля «План/Факт СМР» (План/Факт).
 * Путь: js/modules/plan-fact/ — peer business-модуль ядра RBI Platform.
 * Реализация — TS-бандл js/dist/plan-fact.js из src/modules/plan-fact/**.
 * Домен (нормализация форм заказчика, график) переносится из platform-2.0 (ADR-015).
 */

export const PlanFactManifest = {
    id: 'plan-fact',
    role: 'module',
    title: 'План/Факт',
    icon: 'plan-fact',
    version: '0.1.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'main', label: 'План/Факт', order: 12 },
    company: { enabledByDefault: true },
    routes: ['/plan-fact', '/plan-fact/:subTab'],
    defaultRoute: '/plan-fact'
};
