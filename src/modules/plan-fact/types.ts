/**
 * Локальные типы модуля plan-fact (ПФ-1).
 *
 * Модуль читает только публичные сервисы платформы (ctx.* / window.RBI.services.*).
 * Своих представлений о правах, объектах и хранилище модуль не заводит: право на модуль —
 * это роль ∩ enabledModules компании, объектная область — dataScope из permission.service.js.
 */

/** Карточка объекта RBI (проекция locations.object через service.objects). */
export interface RbiObject {
  id: string;
  display_name?: string;
  displayName?: string;
  canonical_key?: string;
  synonyms?: unknown;
}

export interface RbiObjectsService {
  list?: () => RbiObject[];
  getObjectById?: (id: string) => RbiObject | null;
  rebuildFromLocations?: () => Promise<boolean>;
}

export interface RbiPermissionsService {
  getCurrentRole?: () => string;
  getDataScope?: (role?: string, companyId?: string) => string;
  getAssignedProjects?: () => string[];
  isRecordInAssignedProjects?: (record: unknown, assigned?: string[]) => boolean;
}

export interface RbiUserContextService {
  getUserContext?: () => { role?: string; availableModules?: string[] };
}

export interface RbiShellService {
  getContentRoot?: () => HTMLElement | null;
}

/** Публичные сервисы платформы, которые использует модуль. */
export interface PlanFactServices {
  objects?: RbiObjectsService;
  permissions?: RbiPermissionsService;
  userContext?: RbiUserContextService;
  shell?: RbiShellService;
}

export type PlanFactTab = 'vor' | 'schedule' | 'foreman' | 'fact' | 'contours' | 'works' | 'summary';

export interface PlanFactState {
  objectId: string;
  tab: PlanFactTab;
}
