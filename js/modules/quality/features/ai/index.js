/**
 * index.js — публичная точка входа модуля ai.
 * Единственный файл, через который Core и module-loader обращаются к модулю.
 * Бизнес-логика — в ai.module.js.
 */

import { AIModule } from './ai.module.js';

export async function init(ctx) {
  if (typeof AIModule.init === 'function') {
    return AIModule.init(ctx);
  }
}

export async function mount(ctx, target) {
  if (typeof AIModule.mount === 'function') {
    return AIModule.mount(ctx, target);
  }
}

export async function unmount(ctx) {
  if (typeof AIModule.unmount === 'function') {
    return AIModule.unmount(ctx);
  }
}

export default {
  init,
  mount,
  unmount
};
