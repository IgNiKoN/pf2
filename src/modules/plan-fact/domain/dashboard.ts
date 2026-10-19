/**
 * Сводка для руководителя.
 *
 * Собирается из того, что уже есть в модуле: ВОР, контуры, факт, нормы, импорты, утверждение, сверка.
 * Никаких собственных хранилищ и никаких «красивых» чисел:
 *
 *   * **пусто — это не ноль.** Если объёмы не заполнены, в сводке стоит «—», а не 0: ноль означал бы
 *     «ничего не делаем», а пустое означает «не считали». Для сумм отдельно видно, сколько позиций
 *     не заполнено (`filled` из `total`), чтобы сумма не выглядела полной;
 *   * **процент выполнения** считается только когда есть план: без плана процента нет, а не 0 %;
 *   * **проценты усекаются** (как и в сверке) — в свою пользу не округляем;
 *   * данные берутся **по видимым объектам** (dataScope уже применён в `listVisibleObjects`).
 */

import { addDecimal, divideDecimal, formatDecimal, scaleByPowerOfTen, sumDecimal, compareDecimal } from './decimal.ts';
import type { Decimal } from './types.ts';

export interface ObjectDigest {
  objectId: string;
  objectName: string;
  /** Позиций ВОР в объекте. */
  positions: number;
  plan: string | null;
  contract: string | null;
  proposed: string | null;
  approved: string | null;
  accepted: string | null;
  fact: string | null;
  /** Процент выполнения: факт к плану из формы. Без плана — null. */
  factPercent: string | null;
  /** Строк, требующих решения ПТО (работа не сопоставлена, локация не разобрана и т.п.). */
  needsDecision: number;
  /** Позиций, где контуры заполнены не полностью. */
  contoursIncomplete: number;
  /** Пар сверки выше порога; null, когда сравнивать было нечего. */
  aboveThreshold: number | null;
  incomparable: number;
  /** Норм, не подтверждённых ПТО. */
  unconfirmedNorms: number;
  lastImportAt: string | null;
  /** Ждёт решения РП. */
  proposalPending: boolean;
  baselines: number;
  openChanges: number;
  /** Сколько позиций дали объём, а сколько его не имеют — для честности сумм. */
  filledPositions: number;
  /** Объёмы по единицам измерения: м² и м.п. нельзя складывать в одно число. */
  units: UnitDigest[];
  /** Объёмы по видам работ — для диаграммы «что горит» (ограничиваем, чтобы не тащить всё). */
  works: WorkDigest[];
}

export interface UnitDigest {
  unit: string;
  plan: string | null;
  fact: string | null;
  positions: number;
}

export interface WorkDigest {
  workId: string | null;
  workRaw: string;
  unit: string;
  plan: string | null;
  fact: string | null;
}

export interface SummedValue {
  /** Сумма известных значений; null — заполненных не было вовсе. */
  value: string | null;
  /** Сколько позиций дали значение. */
  filled: number;
  /** Сколько позиций его не имеют. */
  missing: number;
  /** Сумма неполная: часть позиций не заполнена. */
  partial: boolean;
}

export interface DashboardTotals {
  objects: number;
  positions: number;
  plan: SummedValue;
  fact: SummedValue;
  factPercent: string | null;
  aboveThreshold: number;
  needsDecision: number;
  pendingProposals: number;
  openChanges: number;
}

export interface Dashboard {
  objects: ObjectDigest[];
  totals: DashboardTotals;
  /** Объёмы по единицам измерения по всему проекту — честная замена «общей сумме». */
  byUnit: { unit: string; plan: SummedValue; fact: SummedValue; positions: number }[];
  /** Виды работ по проекту: для диаграммы, где больше всего объёма и как идёт факт. */
  topWorks: WorkDigest[];
  /** Пояснения словами: что пусто и почему — чтобы «—» не выглядело поломкой. */
  notes: string[];
}

/** Сумма с честной отметкой неполноты: «все пустые» — это не 0. */
export function sumWithGaps(values: (string | null)[]): SummedValue {
  const known = values.filter((value): value is string => value !== null && value !== '');
  if (known.length === 0) {
    return { value: null, filled: 0, missing: values.length, partial: values.length > 0 };
  }
  return {
    value: sumDecimal(known),
    filled: known.length,
    missing: values.length - known.length,
    partial: known.length !== values.length
  };
}

/** Процент выполнения: только при плане больше нуля; усечение до одного знака. */
export function completionPercent(fact: string | null, plan: string | null): string | null {
  if (fact === null || plan === null) return null;
  if (compareDecimal(plan, '0') <= 0) return null;
  const raw = divideDecimal(scaleByPowerOfTen(fact, 2), plan, 6);
  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const [integer, fraction = ''] = body.split('.');
  return `${negative ? '-' : ''}${integer === '' ? '0' : integer}.${fraction.slice(0, 1).padEnd(1, '0')}`;
}

/** Текст для интерфейса: пустое показывается прочерком, а не нулём. */
export function showDecimal(value: string | null, digits = 2): string {
  if (value === null || value === '') return '—';
  return formatDecimal(value as Decimal, digits);
}

export function showPercent(value: string | null): string {
  if (value === null || value === '') return '—';
  return `${value.replace('.', ',')} %`;
}

/** Свод по объектам: сами объекты уже отфильтрованы правами (dataScope). */
export function buildDashboard(objects: ObjectDigest[], maxNotes = 4): Dashboard {
  const plan = sumWithGaps(objects.map((object) => object.plan));
  const fact = sumWithGaps(objects.map((object) => object.fact));

  const totals: DashboardTotals = {
    objects: objects.length,
    positions: objects.reduce((sum, object) => sum + object.positions, 0),
    plan,
    fact,
    // Процент по проекту считаем из сумм: иначе «средний процент» по объектам вводил бы в заблуждение.
    factPercent: completionPercent(fact.value, plan.value),
    aboveThreshold: objects.reduce((sum, object) => sum + (object.aboveThreshold ?? 0), 0),
    needsDecision: objects.reduce((sum, object) => sum + object.needsDecision, 0),
    pendingProposals: objects.filter((object) => object.proposalPending).length,
    openChanges: objects.reduce((sum, object) => sum + object.openChanges, 0)
  };

  const notes: string[] = [];
  if (objects.length === 0) {
    notes.push('Объектов не видно: проверьте доступы роли — пустой список здесь означает «нет прав», а не «нет работ».');
  }
  if (plan.value === null && objects.length > 0) {
    notes.push('План не заполнен ни по одному объекту: сначала разберите формы заказчика в разделе «ВОР».');
  } else if (plan.partial) {
    notes.push(`План неполный: заполнено ${plan.filled} из ${plan.filled + plan.missing} объектов.`);
  }
  if (fact.value === null && objects.length > 0) {
    notes.push('Факт не внесён ни по одному объекту: раздел «Прораб» — там факт вносят прорабы.');
  } else if (fact.partial) {
    notes.push(`Факт неполный: заполнено ${fact.filled} из ${fact.filled + fact.missing} объектов.`);
  }
  const incomparable = objects.reduce((sum, object) => sum + object.incomparable, 0);
  if (incomparable > 0) {
    notes.push(`Пар сверки «не с чем сравнивать»: ${incomparable} — контуры заполнены не везде, это не «ноль расхождений».`);
  }
  const unconfirmed = objects.reduce((sum, object) => sum + object.unconfirmedNorms, 0);
  if (unconfirmed > 0) {
    notes.push(`Норм без подтверждения ПТО: ${unconfirmed}.`);
  }
  if (totals.pendingProposals > 0) {
    notes.push(`Ждут решения РП: предложений — ${totals.pendingProposals}, изменений — ${totals.openChanges}.`);
  }

  // Единицы измерения: складывать м² с м.п. нельзя, поэтому свод идёт отдельными дорожками.
  const unitNames = [...new Set(objects.flatMap((object) => object.units.map((entry) => entry.unit)))]
    .filter((unit) => unit !== '')
    .sort((left, right) => left.localeCompare(right, 'ru'));

  const byUnit = unitNames.map((unit) => {
    const plans: (string | null)[] = [];
    const facts: (string | null)[] = [];
    let positions = 0;
    for (const object of objects) {
      const entry = object.units.find((item) => item.unit === unit);
      if (!entry) continue;
      plans.push(entry.plan);
      facts.push(entry.fact);
      positions += entry.positions;
    }
    return { unit, plan: sumWithGaps(plans), fact: sumWithGaps(facts), positions };
  });

  // Виды работ по проекту: одноимённые работы из разных объектов складываем, но только внутри единицы.
  const workGroups = new Map<string, { workId: string | null; workRaw: string; unit: string; plans: string[]; facts: string[] }>();
  for (const object of objects) {
    for (const work of object.works) {
      const key = `${work.workId ?? work.workRaw}|${work.unit}`;
      const group = workGroups.get(key) ?? {
        workId: work.workId, workRaw: work.workRaw, unit: work.unit, plans: [], facts: []
      };
      if (work.plan !== null) group.plans.push(work.plan);
      if (work.fact !== null) group.facts.push(work.fact);
      workGroups.set(key, group);
    }
  }
  const topWorks: WorkDigest[] = [...workGroups.values()]
    .map((group) => ({
      workId: group.workId,
      workRaw: group.workRaw,
      unit: group.unit,
      plan: group.plans.length ? sumDecimal(group.plans) : null,
      fact: group.facts.length ? sumDecimal(group.facts) : null
    }))
    .sort((left, right) => compareDecimal(right.plan ?? '0', left.plan ?? '0'))
    .slice(0, 12);

  if (byUnit.length > 1) {
    notes.push(`Объёмы показаны раздельно по единицам измерения (${byUnit.map((entry) => entry.unit).join(', ')}): `
      + 'складывать м² с м.п. и штуками в одно число нельзя.');
  }

  return { objects, totals, byUnit, topWorks, notes: notes.slice(0, maxNotes + 1) };
}

/** Ширина полосы в процентах: 0…100. Без плана ширины нет — вызывающий обязан показать «—». */
export function barWidth(part: string | null, whole: string | null): number | null {
  if (part === null || whole === null) return null;
  if (compareDecimal(whole, '0') <= 0) return null;
  const raw = divideDecimal(scaleByPowerOfTen(part, 2), whole, 2);
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

/** Отрезки для диаграммы сверки: сколько расхождений и как они делятся. */
export function reconcileSegments(summary: { warnings: number; ok: number; incomplete: number }): {
  label: string;
  value: number;
  share: number;
  tone: 'danger' | 'brand' | 'muted';
}[] {
  const total = summary.warnings + summary.ok + summary.incomplete;
  const share = (value: number): number => (total > 0 ? Math.round((value / total) * 100) : 0);
  return [
    { label: 'Выше порога', value: summary.warnings, share: share(summary.warnings), tone: 'danger' },
    { label: 'В пределах порога', value: summary.ok, share: share(summary.ok), tone: 'brand' },
    { label: 'Не с чем сравнивать', value: summary.incomplete, share: share(summary.incomplete), tone: 'muted' }
  ];
}

/** Разница суммы плана и факта: положительная — факт меньше плана (отставание). */
export function planFactGap(plan: string | null, fact: string | null): string | null {
  if (plan === null || fact === null) return null;
  return addDecimal(plan, fact.startsWith('-') ? fact.slice(1) : `-${fact}`);
}
