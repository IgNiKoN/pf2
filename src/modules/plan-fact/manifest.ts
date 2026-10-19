/**
 * Манифест модуля plan-fact (План/Факт СМР).
 * Источник метаданных для TS-части. Декларативная копия для ядра —
 * js/modules/plan-fact/plan-fact.manifest.js (якорь modules.manifest.js).
 * Поля манифеста ядро пока не читает, кроме id/entry (см. бриф ПФ-1, §1).
 */

export const PlanFactManifest = {
  id: 'plan-fact',
  role: 'module' as const,
  title: 'План/Факт',
  icon: 'plan-fact',
  version: '0.1.0',
  status: 'active' as const,
  entry: './index.js',
  menu: { section: 'main', label: 'План/Факт', order: 12 },
  company: { enabledByDefault: true },
  routes: ['/plan-fact', '/plan-fact/:subTab'],
  defaultRoute: '/plan-fact'
};
