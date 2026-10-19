/**
 * Platform entry wrapper: подключает собранный Vite-бандл plan-fact.
 * Исходники — src/modules/plan-fact/** (TypeScript).
 * Ядро импортирует этот файл через manifest.entry и вызывает init(ctx).
 */

export { init, showTab, PlanFactManifest } from '../../dist/plan-fact.js';
export { default } from '../../dist/plan-fact.js';
