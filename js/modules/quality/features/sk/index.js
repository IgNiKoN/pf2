/**
 * index.js — публичная точка входа модуля sk.
 * Единственный файл, через который Core и module-loader обращаются к модулю.
 * Бизнес-логика — в sk.module.js.
 */

import { SKModule } from './sk.module.js';

export async function init(ctx) {
  if (typeof SKModule.init === 'function') {
    return SKModule.init(ctx);
  }
}

export async function mount(ctx, target) {
  if (typeof SKModule.mount === 'function') {
    return SKModule.mount(ctx, target);
  }
}

export async function unmount(ctx) {
  if (typeof SKModule.unmount === 'function') {
    return SKModule.unmount(ctx);
  }
}

export default {
  init,
  mount,
  unmount
};
