/**
 * Раздел «Сводка» — дашборд руководителя.
 *
 * Показывает состояние **по всем видимым объектам** (права роли уже применены): сколько позиций,
 * объёмы по контурам, план и факт, процент выполнения, расхождения выше порога, что ждёт решения
 * и что не подтверждено. Никаких «красивых» чисел: пустое — это «—», а не ноль, а неполные суммы
 * честно подписаны (см. `domain/dashboard.ts`).
 *
 * Раздел только для чтения: он ничего не меняет, поэтому доступен любой роли, у которой есть объекты.
 */

import { listAudit, listBaselines, listChangeRequests, listProposals } from './domain/approval';
import { buildContourRows, contourCompletion, listContours, type ContourRecord } from './domain/contours';
import {
  barWidth, buildDashboard, completionPercent, reconcileSegments, showDecimal, showPercent, planFactGap,
  type ObjectDigest, type WorkDigest
} from './domain/dashboard';
import { sumDecimal } from './domain/decimal';
import { activeFacts, listFacts } from './domain/fact';
import { listNorms } from './domain/norms';
import { reconcileRows, reconciliationSummary } from './domain/reconcile';
import { seedDemo } from './domain/demo';
import { listImports, listWorRows } from './domain/store';
import { loadThresholds } from './domain/thresholds';
import { listVisibleObjects, objectDisplayName } from './objects';
import { NO_SORT, sortRows, type SortState, type SortValue } from './domain/sort';
import { bindSortableTable, sortableHeaderClass } from './sortableTable';
import type { RbiObject } from './types';

/** Сколько объектов разбираем подробно: дальше показываем честно, что список урезан. */
const OBJECT_LIMIT = 20;

interface PanelState {
  digest: ReturnType<typeof buildDashboard> | null;
  objectsSeen: number;
  audit: { action: string; entity: string; actor: string; createdAt: string; reason: string }[];
  sort: SortState;
  loading: boolean;
  error: string;
  note: string;
  seeding: boolean;
  /** Единица измерения, выбранная для диаграммы работ. */
  unit: string;
  /** Показывать таблицу вместо карточек — по умолчанию нет: руководителю нужны картинки. */
  showTable: boolean;
}

const state: PanelState = {
  digest: null,
  objectsSeen: 0,
  audit: [],
  sort: { ...NO_SORT },
  loading: false,
  error: '',
  note: '',
  seeding: false,
  unit: '',
  showTable: false
};

function root(): HTMLElement | null {
  return document.getElementById('pf-dashboard-root');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Свод по одному объекту: читаем то, что уже есть, и ничего не выдумываем. */
async function digestOf(object: RbiObject): Promise<ObjectDigest> {
  const objectId = object.id;
  const [worRows, contours, facts, imports, proposals, baselines, changes, norms, thresholds] = await Promise.all([
    listWorRows(objectId),
    listContours(objectId) as Promise<ContourRecord[]>,
    listFacts(objectId),
    listImports(objectId),
    listProposals(objectId),
    listBaselines(objectId),
    listChangeRequests(objectId),
    listNorms(),
    loadThresholds(objectId)
  ]);

  const contourRows = buildContourRows(worRows, contours);
  const completion = contourCompletion(contourRows);
  const reconciliation = reconciliationSummary(reconcileRows(contourRows, thresholds));

  // Суммы считает домен (точно, на строках); панель только собирает значения. Пустой список — это
  // «не заполнено» (null), а не ноль.
  const sumValues = (values: string[]): string | null => (values.length > 0 ? sumDecimal(values) : null);
  const sumByKind = (kind: 'CONTRACT' | 'PROPOSED' | 'APPROVED' | 'CUSTOMER_ACCEPTED'): string | null =>
    sumValues(contours.filter((row) => row.kind === kind && !row.isDeleted).map((row) => row.quantity));

  const plan = sumValues(worRows.map((row) => String(row.quantity)).filter((value) => value !== ''));
  const fact = sumValues(
    activeFacts(facts)
      .filter((record) => record.quantity !== null && record.quantity !== undefined)
      .map((record) => String(record.quantity))
  );

  // Объёмы по единицам измерения: м² и м.п. нельзя сложить в одно число, поэтому считаем раздельно.
  const liveFacts = activeFacts(facts);
  // Единица сравнения — КАНОНИЧЕСКАЯ: в ВОР хранится ещё и сырая («S, м2»), а факт приходит
  // канонической. Сравнение по сырой единице разводило план и факт по разным дорожкам.
  const unitOf = (row: { unit?: string | null; unitRaw?: string | null }): string =>
    String(row.unit || row.unitRaw || '');
  const unitNames = [...new Set([
    ...worRows.map((row) => unitOf(row)),
    ...liveFacts.map((record) => String(record.unit || ''))
  ].filter((unit) => unit !== ''))];
  const units = unitNames.map((unit) => {
    const rowsForUnit = worRows.filter((row) => unitOf(row) === unit);
    const factsForUnit = liveFacts.filter((record) => String(record.unit || '') === unit);
    return {
      unit,
      plan: sumValues(rowsForUnit.map((row) => String(row.quantity)).filter((value) => value !== '')),
      fact: sumValues(factsForUnit.map((record) => String(record.quantity))),
      positions: rowsForUnit.length
    };
  }).sort((left, right) => right.positions - left.positions);

  // Работы для диаграммы: план из ВОР, факт — из внесённого факта по тем же позициям.
  const workGroups = new Map<string, { workId: string | null; workRaw: string; unit: string; plans: string[]; facts: string[] }>();
  for (const row of worRows) {
    const unit = unitOf(row);
    const key = `${row.workId ?? row.workRaw}|${unit}`;
    const group = workGroups.get(key) ?? { workId: row.workId, workRaw: row.workRaw, unit, plans: [], facts: [] };
    group.plans.push(String(row.quantity));
    workGroups.set(key, group);
  }
  // Факт приходит со своими работой и единицей, поэтому ищем ту же дорожку, а не строку ВОР.
  for (const record of liveFacts) {
    const unit = String(record.unit || '');
    const key = `${record.workKey ?? record.workRaw}|${unit}`;
    const group = workGroups.get(key);
    if (group) group.facts.push(String(record.quantity));
  }
  const works = [...workGroups.values()]
    .map((group) => ({
      workId: group.workId, workRaw: group.workRaw, unit: group.unit,
      plan: group.plans.length ? sumDecimal(group.plans) : null,
      fact: group.facts.length ? sumDecimal(group.facts) : null
    }))
    .sort((left, right) => Number(right.plan ?? 0) - Number(left.plan ?? 0))
    .slice(0, 20);

  const lastImportAt = imports
    .map((record) => String(record.createdAt ?? ''))
    .filter((value) => value !== '')
    .sort()
    .reverse()[0] ?? null;

  return {
    objectId,
    objectName: objectDisplayName(object) || objectId,
    positions: worRows.length,
    plan,
    contract: sumByKind('CONTRACT'),
    proposed: sumByKind('PROPOSED'),
    approved: sumByKind('APPROVED'),
    accepted: sumByKind('CUSTOMER_ACCEPTED'),
    fact,
    // Процент есть только когда есть и план, и факт: без плана процента не бывает.
    factPercent: completionPercent(fact, plan),
    needsDecision: worRows.filter((row) => row.workId === null).length,
    contoursIncomplete: completion.incomplete,
    aboveThreshold: reconciliation.total > 0 ? reconciliation.warnings : null,
    incomparable: reconciliation.incomplete,
    // Подтверждение нормы — это её автор: `confirmedBy` пуст, пока ПТО норму не подтвердил.
    unconfirmedNorms: norms.filter((norm) => !norm.confirmedBy).length,
    lastImportAt,
    proposalPending: proposals.some((proposal) => proposal.status === 'submitted'),
    baselines: baselines.length,
    openChanges: changes.filter((change) => change.status === 'created' || change.status === 'checked').length,
    filledPositions: contourRows.filter((row) => row.filled > 0).length,
    units,
    works
  };
}

export async function mountDashboardPanel(): Promise<void> {
  if (!root()) return;
  state.loading = true;
  state.error = '';
  render();

  try {
    const objects = listVisibleObjects();
    state.objectsSeen = objects.length;
    const digests: ObjectDigest[] = [];
    for (const object of objects.slice(0, OBJECT_LIMIT)) {
      digests.push(await digestOf(object));
    }
    state.digest = buildDashboard(digests);
    state.audit = (await listAudit(8)).map((record) => ({
      action: record.action, entity: record.entity, actor: record.actor,
      createdAt: record.createdAt, reason: record.reason
    }));
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.digest = null;
  }
  state.loading = false;
  render();
}

const COLUMNS: { key: string; title: string; value: (row: ObjectDigest) => SortValue }[] = [
  { key: 'object', title: 'Объект', value: (row) => row.objectName },
  { key: 'positions', title: 'Позиций', value: (row) => row.positions },
  { key: 'plan', title: 'План', value: (row) => row.plan },
  { key: 'contract', title: 'Договор', value: (row) => row.contract },
  { key: 'proposed', title: 'Предложено', value: (row) => row.proposed },
  { key: 'approved', title: 'Утверждено', value: (row) => row.approved },
  { key: 'fact', title: 'Факт', value: (row) => row.fact },
  { key: 'percent', title: 'Выполнение', value: (row) => row.factPercent },
  { key: 'above', title: 'Выше порога', value: (row) => row.aboveThreshold },
  { key: 'decision', title: 'Требует решения', value: (row) => row.needsDecision },
  { key: 'norms', title: 'Нормы без подтверждения', value: (row) => row.unconfirmedNorms },
  { key: 'approval', title: 'Утверждение', value: (row) => (row.proposalPending ? 'ждёт РП' : row.baselines ? `baseline ${row.baselines}` : '—') }
];

function card(label: string, value: string, hint = '', tone = 'text-ink'): string {
  return `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml(value)}</div>
      ${hint ? `<div class="text-rbi-caption text-muted">${escapeHtml(hint)}</div>` : ''}
    </div>`;
}

function digestTable(): string {
  const digest = state.digest;
  if (!digest) return '';
  const rows = sortRows(digest.objects, state.sort, (row, key) => {
    const column = COLUMNS.find((item) => item.key === key);
    return column ? column.value(row) : '';
  });

  if (rows.length === 0) return emptyObjectsHtml();

  const head = COLUMNS.map((column) => {
    const active = state.sort.key === column.key;
    return `<th data-sort-key="${escapeHtml(column.key)}"
      class="${sortableHeaderClass(active, 'py-1 pr-3 font-normal whitespace-nowrap')}">${escapeHtml(column.title)}</th>`;
  }).join('');

  const body = rows.map((row) => {
    const gap = planFactGap(row.plan, row.fact);
    return `
      <tr class="border-b border-surface">
        <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml(row.objectName)}
          ${row.lastImportAt ? `<div class="text-rbi-caption text-muted">импорт: ${escapeHtml(row.lastImportAt.slice(0, 10))}</div>` : ''}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${row.positions}</td>
        <td class="py-1 pr-3 text-rbi-caption text-ink">${escapeHtml(showDecimal(row.plan))}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml(showDecimal(row.contract))}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml(showDecimal(row.proposed))}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml(showDecimal(row.approved))}</td>
        <td class="py-1 pr-3 text-rbi-caption text-ink">${escapeHtml(showDecimal(row.fact))}
          ${gap === null ? '' : `<div class="text-rbi-caption ${String(gap).startsWith('-') ? 'text-brand' : 'text-muted'}">отставание ${escapeHtml(showDecimal(gap))}</div>`}</td>
        <td class="py-1 pr-3 text-rbi-caption ${row.factPercent === null ? 'text-muted' : 'text-ink'}">${escapeHtml(showPercent(row.factPercent))}</td>
        <td class="py-1 pr-3 text-rbi-caption ${row.aboveThreshold ? 'text-danger' : 'text-muted'}">${row.aboveThreshold === null ? '—' : row.aboveThreshold}</td>
        <td class="py-1 pr-3 text-rbi-caption ${row.needsDecision ? 'text-danger' : 'text-muted'}">${row.needsDecision}</td>
        <td class="py-1 pr-3 text-rbi-caption ${row.unconfirmedNorms ? 'text-danger' : 'text-muted'}">${row.unconfirmedNorms}</td>
        <td class="py-1 text-rbi-caption ${row.proposalPending ? 'text-brand' : 'text-muted'}">
          ${row.proposalPending ? 'ждёт РП' : row.baselines ? `baseline ${row.baselines}` : '—'}</td>
      </tr>`;
  }).join('');

  const limited = state.objectsSeen > OBJECT_LIMIT
    ? `<div class="text-rbi-caption text-muted mt-2">Показаны первые ${OBJECT_LIMIT} объектов из ${state.objectsSeen}.</div>`
    : '';

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-2">Объекты</div>
      <table id="pf-dashboard-table" class="w-full min-w-[1100px]">
        <thead><tr class="text-rbi-caption text-muted text-left">${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
      ${limited}
    </div>`;
}

/** Полоса: дорожка + заливка. Без данных полосы нет — показываем прочерк, а не пустую полосу. */
function bar(percent: number | null, options: { tone?: 'brand' | 'danger' | 'success'; key: string; height?: string } = { key: '' }): string {
  const tone = options.tone === 'danger' ? 'bg-danger' : options.tone === 'success' ? 'bg-success' : 'bg-brand';
  const height = options.height ?? 'h-2';
  if (percent === null) {
    return `<div class="${height} w-full rounded-full border border-dashed border-surface bg-surface"></div>`;
  }
  return `<div class="${height} w-full bg-surface border border-surface rounded-full overflow-hidden">
    <div class="${height} ${tone} rounded-full transition-all" data-pf-bar="${escapeHtml(options.key)}"
      style="width:${Math.round(percent)}%"></div>
  </div>`;
}

/** Крупная цифра с подписью: то, что видно с другого конца кабинета. */
function bigNumber(label: string, value: string, hint = '', tone = 'text-ink'): string {
  return `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml(label)}</div>
      <div class="text-2xl font-bold ${tone} leading-tight">${escapeHtml(value)}</div>
      ${hint ? `<div class="text-rbi-caption text-muted">${escapeHtml(hint)}</div>` : ''}
    </div>`;
}

/** Диаграмма сверки: одна полоса из трёх отрезков — видно соотношение, а не только числа. */
function reconcileChart(): string {
  const incomplete = state.digest?.objects.reduce((sum, object) => sum + object.incomparable, 0) ?? 0;
  const segments = reconcileSegments({
    warnings: state.digest?.totals.aboveThreshold ?? 0,
    ok: state.digest?.objects.reduce((sum, object) => sum + Math.max(0, (object.positions > 0 ? 1 : 0)), 0) ?? 0,
    incomplete
  });
  const tone = (value: string): string =>
    value === 'danger' ? 'bg-danger' : value === 'brand' ? 'bg-brand' : 'bg-muted';

  return `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted mb-1">Сверка контуров: соотношение</div>
      <div class="flex w-full h-3 rounded-full overflow-hidden border border-surface" data-pf-segments>
        ${segments.map((segment) => segment.share > 0
          ? `<div class="${tone(segment.tone)} h-3" data-pf-segment="${escapeHtml(segment.label)}"
              style="width:${segment.share}%" title="${escapeHtml(`${segment.label}: ${segment.value}`)}"></div>`
          : '').join('') || '<div class="bg-surface h-3 w-full"></div>'}
      </div>
      <div class="flex flex-wrap gap-3 mt-1">
        ${segments.map((segment) => `<span class="text-rbi-caption text-muted">
          <span class="inline-block w-2 h-2 rounded-full ${tone(segment.tone)} mr-1"></span>
          ${escapeHtml(segment.label)}: ${segment.value}</span>`).join('')}
      </div>
    </div>`;
}

/** Объёмы по единицам измерения: у каждой единицы своя дорожка — м² и м.п. не складываем. */
function unitsChart(): string {
  const byUnit = state.digest?.byUnit ?? [];
  if (byUnit.length === 0) {
    return `<div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Объёмы по единицам измерения</div>
      <div class="text-rbi-caption text-muted">Данных нет: сначала разберите формы заказчика в разделе «ВОР».</div>
    </div>`;
  }

  const rows = byUnit.map((entry) => {
    const percent = barWidth(entry.fact.value, entry.plan.value);
    return `
      <li class="py-2 border-b border-surface">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-rbi-body text-ink font-bold">${escapeHtml(entry.unit || 'без единицы')}
            <span class="text-rbi-caption text-muted font-normal">· позиций ${entry.positions}</span></span>
          <span class="text-rbi-caption text-muted">
            план ${escapeHtml(showDecimal(entry.plan.value))} · факт ${escapeHtml(showDecimal(entry.fact.value))}
            · ${escapeHtml(showPercent(percent === null ? null : percent.toFixed(1)))}
            ${entry.plan.partial ? '· план неполный' : ''}${entry.fact.partial ? ' · факт неполный' : ''}</span>
        </div>
        ${bar(percent, { key: `unit:${entry.unit}`, height: 'h-3' })}
      </li>`;
  }).join('');

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Объёмы по единицам измерения
        <span class="text-rbi-caption text-muted font-normal">· полоса — выполнение факта к плану</span></div>
      <ul class="list-none p-0 m-0">${rows}</ul>
    </div>`;
}

/** Диаграмма работ: где больше всего объёма и как идёт факт. Единица выбирается кнопками. */
function worksChart(): string {
  const byUnit = state.digest?.byUnit ?? [];
  if (byUnit.length === 0) return '';

  // По умолчанию показываем единицу с наибольшим планом: именно там руководителю важно,
  // как идёт факт. Переключатель остаётся рядом.
  const byPlan = [...byUnit].sort((left, right) => Number((right.plan.value ?? '0').replace(',', '.'))
    - Number((left.plan.value ?? '0').replace(',', '.')));
  const unit = state.unit || (byPlan[0]?.unit ?? byUnit[0].unit);
  const works: WorkDigest[] = (state.digest?.topWorks ?? []).filter((work) => work.unit === unit).slice(0, 8);
  if (works.length === 0) return '';

  const max = works.reduce((acc, work) => Math.max(acc, Number(work.plan ?? 0)), 0);
  const switcher = byUnit.map((entry) => `
    <button type="button" data-pf-unit="${escapeHtml(entry.unit)}"
      class="text-rbi-caption font-bold px-2 py-1 rounded-lg border ${entry.unit === unit
        ? 'bg-brand text-white border-brand' : 'text-muted border-surface'}">${escapeHtml(entry.unit || 'без единицы')}</button>`).join('');

  const rows = works.map((work) => {
    const percent = barWidth(work.fact, work.plan);
    const share = max > 0 ? Math.round((Number(work.plan ?? 0) / max) * 100) : 0;
    return `
      <li class="py-2 border-b border-surface">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-rbi-body text-ink">${escapeHtml(work.workRaw)}</span>
          <span class="text-rbi-caption text-muted">план ${escapeHtml(showDecimal(work.plan))} ·
            факт ${escapeHtml(showDecimal(work.fact))} · ${escapeHtml(showPercent(percent === null ? null : percent.toFixed(1)))}</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex-1">
            <!-- Верхняя полоса — объём работы (она видна всегда), нижняя — выполнение факта. -->
            <div class="h-3 w-full bg-surface border border-surface rounded-full overflow-hidden">
              <div class="h-3 bg-brand-soft rounded-full" data-pf-bar="workvolume:${escapeHtml(work.workRaw)}"
                style="width:${share}%"></div>
            </div>
            <div class="mt-1">${bar(percent, { key: `work:${work.workRaw}`, tone: percent !== null && percent < 50 ? 'danger' : 'brand' })}</div>
          </div>
          <span class="text-rbi-caption text-muted w-10 text-right" data-pf-share="${escapeHtml(work.workRaw)}">${share}%</span>
        </div>
      </li>`;
  }).join('');

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div class="text-rbi-body font-bold text-ink">Работы: объём и выполнение
          <span class="text-rbi-caption text-muted font-normal">· ${works.length} крупнейших</span></div>
        <div class="flex gap-1">${switcher}</div>
      </div>
      <ul class="list-none p-0 m-0">${rows}</ul>
      <div class="text-rbi-caption text-muted mt-2">Светлая полоса — объём работы в своей единице,
        тёмная под ней — выполнение факта к плану (если факт внесён). Справа — доля в объёме.</div>
    </div>`;
}

/** Пустой экран: подсказка про права + кнопка демо-данных. Один и тот же в обеих ветках. */
function emptyObjectsHtml(): string {
  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Объектов не видно</div>
      <div class="text-rbi-caption text-muted mb-2">Это про права роли, а не про отсутствие работ.
        Проверьте доступы в «Роли и права» — либо посмотрите модуль на демо-данных:
        они создаются только в этом браузере и никуда не отправляются.</div>
      <button type="button" id="pf-seed-demo" ${state.seeding ? 'disabled' : ''}
        class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl disabled:opacity-50">
        ${state.seeding ? 'Создаю демо-данные…' : 'Загрузить демо-данные (объект + пробная ВОР)'}</button>
      ${state.note ? `<div class="text-rbi-caption text-brand mt-2">${escapeHtml(state.note)}</div>` : ''}
      ${state.error ? `<div class="text-rbi-body text-danger mt-2">${escapeHtml(state.error)}</div>` : ''}
    </div>`;
}

/** Карточки объектов: вместо таблицы — то, что видно глазами. */
function objectCards(): string {
  const digest = state.digest;
  if (!digest) return '';
  if (digest.objects.length === 0) return emptyObjectsHtml();

  const cards = digest.objects.map((object) => {
    const percent = barWidth(object.fact, object.plan);
    const gap = planFactGap(object.plan, object.fact);
    const badges = [
      object.proposalPending ? '<span class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-0.5 rounded-lg">ждёт РП</span>' : '',
      object.baselines ? `<span class="text-rbi-caption text-muted border border-surface px-2 py-0.5 rounded-lg">baseline ${object.baselines}</span>` : '',
      object.openChanges ? `<span class="text-rbi-caption font-bold text-danger border border-danger-soft px-2 py-0.5 rounded-lg">изменений ${object.openChanges}</span>` : '',
      object.aboveThreshold ? `<span class="text-rbi-caption font-bold text-danger border border-danger-soft px-2 py-0.5 rounded-lg">сверка ${object.aboveThreshold}</span>` : '',
      object.needsDecision ? `<span class="text-rbi-caption text-danger border border-surface px-2 py-0.5 rounded-lg">решений ${object.needsDecision}</span>` : '',
      object.unconfirmedNorms ? `<span class="text-rbi-caption text-muted border border-surface px-2 py-0.5 rounded-lg">норм без подтверждения ${object.unconfirmedNorms}</span>` : ''
    ].filter(Boolean).join(' ');

    return `
      <li class="bg-surface border border-surface rounded-xl p-3 mb-2" data-pf-object="${escapeHtml(object.objectId)}">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-rbi-body font-bold text-ink">${escapeHtml(object.objectName)}</span>
          <span class="text-rbi-caption text-muted">позиций ${object.positions}
            ${object.lastImportAt ? `· импорт ${escapeHtml(object.lastImportAt.slice(0, 10))}` : ''}</span>
        </div>
        <div class="mt-1">${bar(percent, { key: `object:${object.objectId}`, height: 'h-3' })}</div>
        <div class="flex flex-wrap items-baseline justify-between gap-2 mt-1">
          <span class="text-rbi-caption text-muted">план ${escapeHtml(showDecimal(object.plan))} ·
            факт ${escapeHtml(showDecimal(object.fact))} ·
            выполнение ${escapeHtml(showPercent(object.factPercent))}</span>
          <span class="text-rbi-caption ${gap !== null && String(gap).startsWith('-') ? 'text-brand' : 'text-muted'}">
            ${gap === null ? '' : `отставание ${escapeHtml(showDecimal(gap))}`}</span>
        </div>
        ${badges ? `<div class="flex flex-wrap gap-1 mt-2">${badges}</div>` : ''}
        <div class="text-rbi-caption text-muted mt-1">контуры: договор ${escapeHtml(showDecimal(object.contract))} ·
          предложено ${escapeHtml(showDecimal(object.proposed))} · утверждено ${escapeHtml(showDecimal(object.approved))} ·
          принято ${escapeHtml(showDecimal(object.accepted))} · не заполнено позиций ${object.contoursIncomplete}</div>
      </li>`;
  }).join('');

  return `<ul class="list-none p-0 m-0 mb-3">${cards}</ul>`;
}

/** Переключатель «карточками / таблицей»: таблица нужна реже, но иногда нужна. */
function viewToggle(): string {
  return `
    <div class="flex justify-end mb-2">
      <button type="button" id="pf-dashboard-view"
        class="text-rbi-caption font-bold text-muted border border-surface px-3 py-1 rounded-lg">
        ${state.showTable ? 'Показать карточками' : 'Показать таблицей'}</button>
    </div>`;
}

function render(): void {
  const container = root();
  if (!container) return;

  if (state.loading) {
    container.innerHTML = `<div class="text-rbi-caption text-muted">Собираю сводку…</div>`;
    return;
  }
  if (state.error) {
    container.innerHTML = `<div class="text-rbi-body text-danger">${escapeHtml(state.error)}</div>`;
    return;
  }

  const digest = state.digest;
  if (!digest) {
    container.innerHTML = `<div class="text-rbi-caption text-muted">Сводка пуста.</div>`;
    return;
  }

  const totals = digest.totals;
  const audience = digest.objects.reduce((sum, object) => sum + object.positions, 0);
  const audit = state.audit.map((record) => `
    <li class="text-rbi-caption text-muted">${escapeHtml(record.action)} · ${escapeHtml(record.entity)}
      · ${escapeHtml(record.actor || '—')} · ${escapeHtml(String(record.createdAt).slice(5, 16).replace('T', ' '))}
      ${record.reason ? `· ${escapeHtml(record.reason)}` : ''}</li>`).join('');

  container.innerHTML = `
    ${state.note ? `<div class="text-rbi-caption text-brand mb-2">${escapeHtml(state.note)}</div>` : ''}
    ${state.error ? `<div class="text-rbi-body text-danger mb-2">${escapeHtml(state.error)}</div>` : ''}
    <div class="bg-surface border border-surface rounded-xl p-4 mb-3">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div class="text-rbi-caption text-muted">Выполнение по проекту (факт к плану)</div>
          <div class="text-4xl font-bold ${totals.factPercent === null ? 'text-muted' : 'text-ink'} leading-tight"
            data-pf-total-percent>${escapeHtml(showPercent(totals.factPercent))}</div>
          <div class="text-rbi-caption text-muted">${totals.factPercent === null
            ? 'процента нет: без плана или без факта он не считается'
            : 'считается из сумм плана и факта, а не как среднее по объектам'}</div>
        </div>
        <div class="text-right">
          <div class="text-rbi-caption text-muted">План</div>
          <div class="text-xl font-bold text-ink">${escapeHtml(showDecimal(totals.plan.value))}</div>
          <div class="text-rbi-caption text-muted">Факт</div>
          <div class="text-xl font-bold text-ink">${escapeHtml(showDecimal(totals.fact.value))}</div>
        </div>
      </div>
      <div class="mt-2">${bar(barWidth(totals.fact.value, totals.plan.value), { key: 'project', height: 'h-4' })}</div>
      <div class="text-rbi-caption text-muted mt-1">${totals.plan.partial
        ? `План неполный: не заполнено объектов — ${totals.plan.missing}.`
        : ''} ${totals.fact.partial ? `Факт неполный: не заполнено объектов — ${totals.fact.missing}.` : ''}</div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${bigNumber('Объектов', String(totals.objects))}
      ${bigNumber('Позиций ВОР', String(totals.positions))}
      ${bigNumber('Требует решения ПТО', String(totals.needsDecision), 'работы без вида работ',
        totals.needsDecision ? 'text-danger' : 'text-ink')}
      ${bigNumber('Ждут РП', `${totals.pendingProposals} / ${totals.openChanges}`, 'предложений / изменений')}
    </div>
    <div class="mb-3">${reconcileChart()}</div>
    ${unitsChart()}
    ${worksChart()}
    ${viewToggle()}
    ${state.showTable ? digestTable() : objectCards()}
    ${digest.notes.length ? `<div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Что важно знать про эти числа</div>
      <ul class="list-none p-0 m-0">${digest.notes.map((note) => `<li class="text-rbi-caption text-muted">• ${escapeHtml(note)}</li>`).join('')}</ul>
    </div>` : ''}
    ${state.audit.length ? `<div class="bg-surface border border-surface rounded-xl p-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Последние действия (журнал)</div>
      <ul class="list-none p-0 m-0">${audit}</ul>
    </div>` : ''}
  `;
  bind();
}

/**
 * Демо-данные для показа: объект + пробная ВОР + контуры + факт.
 *
 * Опубликованная страница работает локально, и у нового человека нет ни объекта, ни ВОР —
 * он видит пустые разделы. Кнопка создаёт их тем же путём, что настоящий импорт, и подписана
 * как демо: только этот браузер, ничего в облако, данные синтетические.
 */
async function runSeedDemo(): Promise<void> {
  if (state.seeding) return;
  state.seeding = true;
  state.error = '';
  state.note = '';
  render();
  try {
    const result = await seedDemo();
    state.note = `Готово: «${result.objectName}», позиций ${result.positions}. `
      + 'Данные только в этом браузере — их можно удалить очисткой данных сайта.';
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  state.seeding = false;
  await mountDashboardPanel();
}

function bind(): void {
  const container = root();
  if (!container) return;

  bindSortableTable(container.querySelector<HTMLElement>('#pf-dashboard-table'), state.sort, (next) => {
    state.sort = next;
    render();
  });

  container.querySelector<HTMLButtonElement>('#pf-dashboard-view')?.addEventListener('click', () => {
    state.showTable = !state.showTable;
    render();
  });
  container.querySelector<HTMLButtonElement>('#pf-seed-demo')?.addEventListener('click', () => {
    void runSeedDemo();
  });

  container.querySelectorAll<HTMLButtonElement>('[data-pf-unit]').forEach((button) => {
    button.addEventListener('click', () => {
      state.unit = button.getAttribute('data-pf-unit') ?? '';
      render();
    });
  });
}
