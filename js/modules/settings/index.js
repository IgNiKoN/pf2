/**
 * index.js — публичная точка входа модуля settings.
 * Единственный файл, через который Core и module-loader обращаются к модулю.
 * Бизнес-логика — в settings.module.js.
 */

import { SettingsModule } from './settings.module.js';

export async function init(ctx) {
  if (typeof SettingsModule.init === 'function') {
    return SettingsModule.init(ctx);
  }
}

export async function mount(ctx, target) {
  if (typeof SettingsModule.mount === 'function') {
    return SettingsModule.mount(ctx, target);
  }
}

export async function unmount(ctx) {
  if (typeof SettingsModule.unmount === 'function') {
    return SettingsModule.unmount(ctx);
  }
}

export default {
  init,
  mount,
  unmount
};
