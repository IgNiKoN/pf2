/**
 * Чтение объектов RBI для модуля plan-fact.
 *
 * Никакого своего хранилища и никаких прямых обращений к IndexedDB/Supabase:
 * только service.objects (проекция locations.object) + dataScope из permission.service.js.
 * Роль guest (`dataScope: 'none'`) не видит ни одного объекта — это и есть проверка прав,
 * а не скрытие кнопок.
 */

import type { PlanFactServices, RbiObject } from './types';

export function planFactServices(): PlanFactServices {
  const rbi = window.RBI as unknown as { services?: PlanFactServices } | undefined;
  return (rbi && rbi.services) || {};
}

export function objectDisplayName(object: RbiObject | null | undefined): string {
  if (!object) return '';
  return String(object.display_name || object.displayName || object.canonical_key || '');
}

function currentScope(): string {
  const permissions = planFactServices().permissions;
  if (!permissions || typeof permissions.getDataScope !== 'function') return 'all';
  const role = typeof permissions.getCurrentRole === 'function' ? permissions.getCurrentRole() : undefined;
  return String(permissions.getDataScope(role) || 'all');
}

/** Объекты, видимые текущей роли: 'none' → пусто, 'all' → все, own-* → только назначенные. */
export function listVisibleObjects(): RbiObject[] {
  const services = planFactServices();
  const objects = services.objects;
  if (!objects || typeof objects.list !== 'function') return [];

  const all = (objects.list() || []).filter((item): item is RbiObject => !!item && typeof item.id === 'string');
  const scope = currentScope();
  if (scope === 'none') return [];
  if (scope === 'all') return all;

  const permissions = services.permissions;
  const assigned = permissions && typeof permissions.getAssignedProjects === 'function'
    ? (permissions.getAssignedProjects() || [])
    : [];
  if (!assigned.length) return [];

  return all.filter((item) => {
    if (permissions && typeof permissions.isRecordInAssignedProjects === 'function') {
      return !!permissions.isRecordInAssignedProjects(item, assigned);
    }
    return assigned.indexOf(item.id) !== -1;
  });
}

/** Человекочитаемое описание объектной области — чтобы пустой список не выглядел поломкой. */
export function scopeLabel(): string {
  switch (currentScope()) {
    case 'none':
      return 'доступ к объектам не выдан';
    case 'all':
      return 'все объекты компании';
    case 'ownProject':
      return 'только назначенные вам объекты';
    case 'ownContractor':
      return 'только объекты вашего подрядчика';
    case 'ownProjectOrOwnRecords':
      return 'назначенные вам объекты';
    default:
      return 'доступные вам объекты';
  }
}

/** Ленивая попытка пересобрать проекцию объектов из локаций (если справочник ещё пуст). */
export async function rebuildObjects(): Promise<void> {
  const objects = planFactServices().objects;
  if (objects && typeof objects.rebuildFromLocations === 'function') {
    await objects.rebuildFromLocations();
  }
}
