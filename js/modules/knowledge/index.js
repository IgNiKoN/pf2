/**
 * index.js — публичная точка входа модуля knowledge.
 * Единственный файл, через который Core и module-loader обращаются к модулю.
 * Бизнес-логика — в knowledge.module.js.
 */

import { KnowledgeModule } from './knowledge.module.js';

export async function init(ctx) {
  if (typeof KnowledgeModule.init === 'function') {
    return KnowledgeModule.init(ctx);
  }
}

export async function mount(ctx, target) {
  if (typeof KnowledgeModule.mount === 'function') {
    return KnowledgeModule.mount(ctx, target);
  }
}

export async function unmount(ctx) {
  if (typeof KnowledgeModule.unmount === 'function') {
    return KnowledgeModule.unmount(ctx);
  }
}

export default {
  init,
  mount,
  unmount
};
