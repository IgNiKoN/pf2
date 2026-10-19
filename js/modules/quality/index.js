/**
 * index.js — публичная точка входа platform module «quality».
 * Единственный файл, через который Core и module-loader обращаются к модулю.
 * Координация — в quality.module.js (агрегатор 9 существующих под-модулей).
 * mount/unmount не добавлены: ни один из 9 текущих под-модулей не вызывается
 * через общий mount/unmount на уровне агрегатора в этом блоке (см.
 * _ai/current_plan.md, «Compact Module Restructure — Шаг 1»).
 */

import { QualityModule } from './quality.module.js';

export async function init(ctx) {
  if (typeof QualityModule.init === 'function') {
    return QualityModule.init(ctx);
  }
}

export default {
  init
};
