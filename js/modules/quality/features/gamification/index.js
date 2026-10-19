/**
 * index.js — публичная точка входа модуля gamification.
 * Единственный файл, через который Core и module-loader обращаются к модулю.
 * Бизнес-логика — в game.module.js.
 */

import { GameModule } from './game.module.js';

export async function init(ctx) {
  if (typeof GameModule.init === 'function') {
    return GameModule.init(ctx);
  }
}

export async function mount(ctx, target) {
  if (typeof GameModule.mount === 'function') {
    return GameModule.mount(ctx, target);
  }
}

export async function unmount(ctx) {
  if (typeof GameModule.unmount === 'function') {
    return GameModule.unmount(ctx);
  }
}

export default {
  init,
  mount,
  unmount
};
