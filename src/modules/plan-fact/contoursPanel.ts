/**
 * Раздел «Контуры» (ТЗ VOR-016): объёмы по РД, договору, предложению, утверждению и приёмке.
 *
 * Ввод — **прямо в таблице**: click-to-edit по ячейке контура, Enter сохраняет и переходит
 * к следующей строке той же колонки, Tab — к следующему контуру, Esc отменяет. Так ПТО вводит
 * объёмы столбиком, как в Excel, а не выбирает позицию в отдельном поле.
 *
 * Две вещи, которые панель обязана показывать честно:
 *   1. Незаполненный контур — это «не заполнено», а не ноль. Пустая ячейка так и подписана,
 *      а пустой ввод при сохранении снимает контур.
 *   2. Признак незаполненности виден у позиции: считать такую позицию проверенной нельзя.
 *
 * Контур FACT здесь не редактируется: факт вносит прораб в разделе «Прораб», второго
 * источника истины для факта быть не должно.
 */

import {
  buildContourRows, canManageContours, clearContour, CONTOURS, contourCompletion, listContours, setContour,
  type ContourKind, type ContourRecord, type ContourRow
} from './domain/contours';
import { formatDecimal } from './domain/decimal';
import {
  aggregateReconciliation, reconcileRows, reconciliationSummary,
  type ReconciliationRow, type ThresholdRule, type WorkAggregate
} from './domain/reconcile';
import { defaultRules, loadThresholds, parseThresholdInput, ruleTitle, saveThresholds } from './domain/thresholds';
import { listWorks } from './domain/works';
import { NO_SORT, sortRows, type SortState, type SortValue } from './domain/sort';
import {
  baselineDiff, canApproveContours, currentBaseline, decideChangeRequest, decideProposal, listAudit,
  listBaselines, listChangeRequests, listProposalRows, listProposals, proposeContours, requestChange,
  type AuditRecord, type BaselineRecord, type ChangeRequestRecord, type ProposalRecord
} from './domain/approval';
import { listWorRows } from './domain/store';
import { bindSortableTable, sortableHeaderClass } from './sortableTable';

interface EditingCell {
  worItemId: string;
  kind: ContourKind;
}

interface PanelState {
  objectId: string;
  rows: ContourRow[];
  sort: SortState;
  canEdit: boolean;
  /** Утверждение: предложения, baseline, запросы на изменение и лента аудита. */
  canApprove: boolean;
  proposals: ProposalRecord[];
  proposalRows: { proposalId: string; count: number }[];
  baselines: BaselineRecord[];
  changes: ChangeRequestRecord[];
  audit: AuditRecord[];
  decisionReason: string;
  changeReason: string;
  /** Сверка контуров: правила, расхождения и агрегаты. */
  thresholds: ThresholdRule[];
  reconciliation: ReconciliationRow[];
  aggregates: WorkAggregate[];
  works: { id: string; name: string }[];
  thresholdDraft: { percent: string; absolute: string } | null;
  newRuleWorkId: string;
  newRulePercent: string;
  /** Какая ячейка сейчас открыта на правку. */
  editing: EditingCell | null;
  /** Значение в открытой ячейке (черновик до сохранения). */
  draft: string;
  note: string;
  error: string;
  busy: boolean;
}

const state: PanelState = {
  objectId: '',
  rows: [],
  sort: { ...NO_SORT },
  canEdit: false,
  canApprove: false,
  proposals: [],
  proposalRows: [],
  baselines: [],
  changes: [],
  audit: [],
  decisionReason: '',
  changeReason: '',
  thresholds: [],
  reconciliation: [],
  aggregates: [],
  works: [],
  thresholdDraft: null,
  newRuleWorkId: '',
  newRulePercent: '',
  editing: null,
  draft: '',
  note: '',
  error: '',
  busy: false
};

/**
 * Ячейка, которую пользователь открывает прямо сейчас.
 *
 * Порядок событий браузера: mousedown → blur прежнего поля → mouseup → click. Без этого флага
 * blur успевал сохранить прежнюю ячейку и перерисовать таблицу — клик по новой ячейке терялся
 * (это и был реальный дефект: ввод «через клик» не срабатывал со второго раза).
 */
let pendingOpen: EditingCell | null = null;

function root(): HTMLElement | null {
  return document.getElementById('pf-contours-root');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function mountContoursPanel(objectId: string): Promise<void> {
  if (!root()) return;
  if (state.objectId !== objectId) {
    state.objectId = objectId;
    state.note = '';
    state.error = '';
    state.editing = null;
    state.draft = '';
  }
  state.canEdit = canManageContours();
  try {
    const worRows = objectId ? await listWorRows(objectId) : [];
    const contours: ContourRecord[] = objectId ? await listContours(objectId) : [];
    state.rows = buildContourRows(worRows, contours);
    state.canApprove = canApproveContours();
    state.thresholds = objectId ? await loadThresholds(objectId) : defaultRules();
    state.reconciliation = reconcileRows(state.rows, state.thresholds);
    state.aggregates = aggregateReconciliation(state.rows, state.thresholds);
    state.works = (await listWorks()).map((work) => ({ id: work.id, name: work.name }));
    state.thresholdDraft = {
      percent: state.thresholds.find((rule) => rule.workId === null && rule.unit === null)?.percent ?? '5',
      absolute: state.thresholds.find((rule) => rule.workId === null && rule.unit === null)?.absolute ?? '0'
    };
    state.proposals = objectId ? await listProposals(objectId) : [];
    state.baselines = objectId ? await listBaselines(objectId) : [];
    state.changes = objectId ? await listChangeRequests(objectId) : [];
    state.audit = await listAudit(8);
    const counts = new Map<string, number>();
    for (const proposal of state.proposals) {
      counts.set(proposal.id, (await listProposalRows(proposal.id)).length);
    }
    state.proposalRows = [...counts.entries()].map(([proposalId, count]) => ({ proposalId, count }));
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.rows = [];
  }
  render();
}

/** Колонки таблицы: одна точка правды и для заголовка, и для сортировки. */
const COLUMNS: { key: string; title: string; value: (row: ContourRow) => SortValue }[] = [
  { key: 'place', title: 'Этаж · помещение', value: (row) => row.place },
  { key: 'work', title: 'Работа', value: (row) => row.workRaw },
  { key: 'unit', title: 'ЕИ', value: (row) => row.unit },
  { key: 'plan', title: 'План', value: (row) => row.plan },
  ...CONTOURS.map((contour) => ({
    key: `contour:${contour.kind}`,
    title: contour.short,
    value: (row: ContourRow): SortValue => row.values[contour.kind]
  })),
  { key: 'diff', title: 'Предложено − договор', value: (row) => row.proposedMinusContract },
  { key: 'state', title: 'Состояние', value: (row) => row.filled }
];

function columnValue(row: ContourRow, key: string): SortValue {
  const column = COLUMNS.find((item) => item.key === key);
  return column ? column.value(row) : '';
}

function orderedRows(): ContourRow[] {
  return sortRows(state.rows, state.sort, columnValue);
}

function summaryHtml(): string {
  const completion = contourCompletion(state.rows);
  const card = (label: string, value: string, tone = 'text-ink'): string => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml(value)}</div>
    </div>`;
  return `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${card('Позиций ВОР', String(completion.total))}
      ${card('Заполнено полностью', String(completion.complete))}
      ${card('Не заполнено', String(completion.incomplete), completion.incomplete > 0 ? 'text-danger' : 'text-ink')}
      ${card('Контуров на позицию', String(CONTOURS.length))}
    </div>`;
}

function cellHtml(row: ContourRow, kind: ContourKind): string {
  const value = row.values[kind];
  const isEditing = state.editing?.worItemId === row.worItemId && state.editing?.kind === kind;
  const contour = CONTOURS.find((item) => item.kind === kind);
  const label = `${contour?.short ?? kind}: ${row.workRaw}, ${row.place}`;

  if (isEditing) {
    return `<td class="py-1 pr-3">
      <input id="pf-cell-input" type="text" inputmode="decimal" value="${escapeHtml(state.draft)}"
        aria-label="${escapeHtml(label)}" data-pf-cell-input
        class="w-24 bg-surface border border-brand text-ink text-rbi-caption rounded-lg px-2 py-1" />
    </td>`;
  }

  const shown = value === null
    ? '<span class="text-muted">не заполнено</span>'
    : escapeHtml(formatDecimal(value));

  if (!state.canEdit) {
    return `<td class="py-1 pr-3 text-rbi-caption text-ink" title="${escapeHtml(label)}">${shown}</td>`;
  }

  return `<td data-pf-cell="${escapeHtml(`${row.worItemId}|${kind}`)}" data-pf-kind="${escapeHtml(kind)}"
    tabindex="0" role="button"
    title="${escapeHtml(`${label} — нажмите, чтобы ввести объём`)}"
    class="py-1 pr-3 text-rbi-caption text-ink cursor-pointer hover:text-brand focus:text-brand focus:outline-none">${shown}</td>`;
}

function tableHtml(): string {
  if (state.rows.length === 0) {
    return `<div class="bg-surface border border-surface rounded-xl p-3">
      <div class="text-rbi-caption text-muted">В объекте нет сохранённой ВОР: сначала разберите форму
      заказчика в разделе «ВОР» — контуры вводятся по позициям плана.</div>
    </div>`;
  }

  const head = COLUMNS.map((column) => {
    const active = state.sort.key === column.key;
    return `<th data-sort-key="${escapeHtml(column.key)}"
      class="${sortableHeaderClass(active, 'py-1 pr-3 font-normal whitespace-nowrap')}">${escapeHtml(column.title)}</th>`;
  }).join('');

  const rows = orderedRows().slice(0, 300).map((row) => {
    const values = CONTOURS.map((contour) => cellHtml(row, contour.kind)).join('');
    const diff = row.proposedMinusContract === null
      ? '<span class="text-muted">—</span>'
      : `<span class="${row.proposedMinusContract.startsWith('-') ? 'text-brand' : 'text-danger'}">${escapeHtml(formatDecimal(row.proposedMinusContract))}</span>`;
    const plan = row.plan === null
      ? '<span class="text-muted">не заполнено</span>'
      : escapeHtml(formatDecimal(row.plan));
    return `
      <tr class="border-b border-surface" data-pf-row="${escapeHtml(row.worItemId)}">
        <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${escapeHtml(row.place)}</td>
        <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml(row.workRaw)}</td>
        <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml(row.unit)}</td>
        <td class="py-1 pr-3 text-rbi-caption text-ink">${plan}</td>
        ${values}
        <td class="py-1 pr-3 text-rbi-caption">${diff}</td>
        <td class="py-1 text-rbi-caption ${row.incomplete ? 'text-danger' : 'text-muted'}">
          ${row.incomplete ? `${row.filled} из ${CONTOURS.length}` : 'заполнено'}</td>
      </tr>`;
  }).join('');

  const more = state.rows.length > 300
    ? `<div class="text-rbi-caption text-muted mt-2">Показаны первые 300 позиций из ${state.rows.length}
       по текущей сортировке.</div>`
    : '';

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-2">Контуры объёмов по позициям</div>
      <table id="pf-contours-table" class="w-full min-w-[900px]">
        <thead><tr class="text-rbi-caption text-muted text-left">${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${more}
    </div>`;
}

function hintHtml(): string {
  if (!state.canEdit) {
    return `<div class="bg-surface border border-surface rounded-xl px-3 py-2 mb-3">
      <span class="text-rbi-caption text-muted">Объёмы по контурам ведёт ПТО: у вашей роли права на правку
      нет, таблица ниже — для чтения. Факт вносится в разделе «Прораб».</span>
    </div>`;
  }
  return `<div class="bg-surface border border-surface rounded-xl px-3 py-2 mb-3">
    <span class="text-rbi-caption text-muted">
      Нажмите на ячейку контура и введите объём: <b>Enter</b> — сохранить и перейти к следующей строке,
      <b>Tab</b> — к следующему контуру, <b>Esc</b> — отменить. Пустая ячейка — это «не заполнено»,
      а не ноль: очистить контур можно, стерев значение и нажав Enter.
    </span>
  </div>`;
}

/**
 * Блок утверждения (ТЗ-2б): что предлагаем, что уже утверждено, что просим изменить.
 *
 * Показывается прямо над таблицей контуров, потому что живёт теми же объёмами: «Предложено ПТО»
 * уходит на утверждение, а «Утверждено РП» приходит **из baseline**, а не набирается руками.
 */
function approvalHtml(): string {
  const proposalRowsToSend = state.rows.filter((row) => row.values.PROPOSED !== null);
  const pending = state.proposals.find((proposal) => proposal.status === 'submitted') ?? null;
  const baseline = currentBaseline(state.baselines);
  const diff = baselineDiff(baseline, state.rows.map((row) => ({ worItemId: row.worItemId, values: row.values })));
  const openChanges = state.changes.filter((change) => change.status === 'created' || change.status === 'checked');

  const pendingBlock = pending
    ? `<div class="border-t border-surface pt-2 mt-2">
        <div class="text-rbi-body text-ink">На утверждении: «${escapeHtml(pending.title)}»
          · строк: ${state.proposalRows.find((item) => item.proposalId === pending.id)?.count ?? 0}
          · предложил ${escapeHtml(pending.submittedBy || '—')}</div>
        ${state.canApprove ? `
          <div class="flex flex-wrap items-end gap-2 mt-2">
            <label class="flex flex-col gap-1 flex-1 min-w-[220px]">
              <span class="text-rbi-label text-muted">Причина решения (для отказа обязательна)</span>
              <input id="pf-decision-reason" type="text" value="${escapeHtml(state.decisionReason)}"
                class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
            </label>
            <button type="button" id="pf-approve"
              class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl">Утвердить</button>
            <button type="button" id="pf-reject"
              class="text-rbi-body font-bold text-danger border border-surface px-3 py-1.5 rounded-xl">Отклонить</button>
          </div>`
          : `<div class="text-rbi-caption text-muted mt-1">Решение принимает РП: у вашей роли права утверждать нет.</div>`}
      </div>`
    : '';

  const baselineBlock = baseline
    ? `<div class="text-rbi-caption text-muted mt-2">
        Действующий baseline: принят ${escapeHtml(String(baseline.approvedAt).slice(0, 16).replace('T', ' '))}
        · ${escapeHtml(baseline.approvedBy || '—')} · ревизия ${baseline.snapshot.revision ?? 1}
        · строк ${baseline.snapshot.rows.length}
        ${diff.length ? ` · <span class="text-danger">расходится с контурами в ${diff.length} строках</span>` : ' · совпадает с контурами'}
      </div>`
    : `<div class="text-rbi-caption text-muted mt-2">Утверждённого baseline нет: «Утверждено РП» заполняется после утверждения.</div>`;

  const diffBlock = diff.length && state.canEdit
    ? `<div class="mt-2">
        <div class="text-rbi-caption text-danger mb-1">Расхождения с утверждённым (изменение — только через запрос):</div>
        <ul class="list-none p-0 m-0">
          ${diff.slice(0, 6).map((item) => `
            <li class="flex flex-wrap items-center gap-2 py-1 border-b border-surface">
              <span class="text-rbi-caption text-ink">${escapeHtml(item.worItemId)}</span>
              <span class="text-rbi-caption text-muted">утверждено ${escapeHtml(item.approved)} → сейчас
                ${item.current === null ? 'не заполнено' : escapeHtml(item.current)}</span>
              <button type="button" data-pf-change-request="${escapeHtml(item.worItemId)}"
                class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Запросить изменение</button>
            </li>`).join('')}
        </ul>
        <label class="flex flex-col gap-1 mt-2">
          <span class="text-rbi-label text-muted">Причина изменения (обязательна)</span>
          <input id="pf-change-reason" type="text" value="${escapeHtml(state.changeReason)}"
            class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
      </div>`
    : '';

  const changesBlock = state.changes.length
    ? `<div class="mt-2">
        <div class="text-rbi-caption text-muted mb-1">Запросы на изменение (${state.changes.length}):</div>
        <ul class="list-none p-0 m-0">
          ${state.changes.slice(0, 5).map((change) => `
            <li class="flex flex-wrap items-center gap-2 py-1 border-b border-surface">
              <span class="text-rbi-caption text-ink">${escapeHtml(change.worItemId)}</span>
              <span class="text-rbi-caption text-muted">${change.qtyBefore === null ? '—' : escapeHtml(change.qtyBefore)} → ${escapeHtml(change.qtyAfter)}</span>
              <span class="text-rbi-caption ${change.status === 'effective' ? 'text-brand' : 'text-danger'}">${escapeHtml(change.status)}</span>
              <span class="text-rbi-caption text-muted">${escapeHtml(change.reason)}</span>
              ${state.canApprove && (change.status === 'created' || change.status === 'checked')
                ? `<button type="button" data-pf-change-approve="${escapeHtml(change.id)}"
                    class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Утвердить изменение</button>
                   <button type="button" data-pf-change-reject="${escapeHtml(change.id)}"
                    class="text-rbi-caption font-bold text-muted border border-surface px-2 py-1 rounded-lg">Отклонить</button>`
                : ''}
            </li>`).join('')}
        </ul>
      </div>`
    : '';

  const auditBlock = state.audit.length
    ? `<div class="text-rbi-caption text-muted mt-2">Журнал: ${state.audit.map((record) =>
        `${escapeHtml(record.action)} ${escapeHtml(record.entity)} (${escapeHtml(record.actor || '—')}, ${escapeHtml(String(record.createdAt).slice(5, 16).replace('T', ' '))})`
      ).join(' · ')}</div>`
    : '';

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Утверждение объёмов
        <span class="text-rbi-caption text-muted font-normal">· ПТО предлагает, РП утверждает, baseline неизменяем</span></div>
      ${state.canEdit ? `
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" id="pf-propose" ${proposalRowsToSend.length && !pending ? '' : 'disabled'}
            class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl disabled:opacity-50">
            Предложить утверждение</button>
          <span class="text-rbi-caption text-muted">
            ${pending ? 'Предложение уже на утверждении — дождитесь решения РП.'
              : proposalRowsToSend.length
                ? `Уйдёт строк: ${proposalRowsToSend.length} — объёмы из контура «Предложено ПТО».`
                : 'Сначала заполните контур «Предложено ПТО».'}
          </span>
        </div>` : `<div class="text-rbi-caption text-muted">Предложение готовит ПТО, решение принимает РП.</div>`}
      ${pendingBlock}
      ${baselineBlock}
      ${diffBlock}
      ${changesBlock}
      ${auditBlock}
    </div>`;
}

/** Действия утверждения: предложить, решить, запросить изменение, решить по изменению. */
function bindApproval(container: HTMLElement): void {
  /**
   * Кнопка действия в другом блоке — это уход из ячейки, а не «сохранить ячейку».
   *
   * Порядок событий: mousedown по кнопке → blur поля ввода → click. Если дать blur сохранить
   * ячейку, её сохранение (асинхронное) приходит ПОСЛЕ действия и перетирает его результат —
   * человек видит не то, что сделал. Поэтому на mousedown забываем незавершённую правку.
   */
  const buttons = ['#pf-propose', '#pf-approve', '#pf-reject', '[data-pf-change-request]',
    '[data-pf-change-approve]', '[data-pf-change-reject]'];
  for (const selector of buttons) {
    container.querySelectorAll<HTMLElement>(selector).forEach((button) => {
      button.addEventListener('mousedown', () => {
        state.editing = null;
        state.draft = '';
      });
    });
  }

  container.querySelector<HTMLInputElement>('#pf-decision-reason')?.addEventListener('input', (event) => {
    state.decisionReason = (event.target as HTMLInputElement).value;
  });
  container.querySelector<HTMLInputElement>('#pf-change-reason')?.addEventListener('input', (event) => {
    state.changeReason = (event.target as HTMLInputElement).value;
  });

  container.querySelector<HTMLButtonElement>('#pf-propose')?.addEventListener('click', () => {
    void runPropose();
  });
  container.querySelector<HTMLButtonElement>('#pf-approve')?.addEventListener('click', () => {
    void runDecision('approved');
  });
  container.querySelector<HTMLButtonElement>('#pf-reject')?.addEventListener('click', () => {
    void runDecision('rejected');
  });
  container.querySelectorAll<HTMLButtonElement>('[data-pf-change-request]').forEach((button) => {
    button.addEventListener('click', () => {
      void runChangeRequest(button.getAttribute('data-pf-change-request') ?? '');
    });
  });
  container.querySelectorAll<HTMLButtonElement>('[data-pf-change-approve]').forEach((button) => {
    button.addEventListener('click', () => {
      void runChangeDecision(button.getAttribute('data-pf-change-approve') ?? '', 'approved');
    });
  });
  container.querySelectorAll<HTMLButtonElement>('[data-pf-change-reject]').forEach((button) => {
    button.addEventListener('click', () => {
      void runChangeDecision(button.getAttribute('data-pf-change-reject') ?? '', 'rejected');
    });
  });
}

/** Действие в блоке утверждения отменяет незавершённую правку ячейки: у неё свой сценарий. */
function cancelCellEdit(): void {
  state.editing = null;
  state.draft = '';
}

async function runPropose(): Promise<void> {
  cancelCellEdit();
  state.error = '';
  state.note = '';
  const rows = state.rows
    .filter((row) => row.values.PROPOSED !== null)
    .map((row) => ({
      worItemId: row.worItemId,
      quantity: String(row.values.PROPOSED),
      workRaw: row.workRaw,
      place: row.place
    }));
  const result = await proposeContours({ objectId: state.objectId, rows });
  const message = result.ok
    ? `Предложение отправлено на утверждение РП: строк ${rows.length}.`
    : (result.error ?? 'Не удалось отправить предложение');
  await mountContoursPanel(state.objectId);
  // Пояснение ставим после перерисовки: перерисовка — последнее слово в панели.
  if (result.ok) state.note = message; else state.error = message;
  render();
}

async function runDecision(decision: 'approved' | 'rejected'): Promise<void> {
  cancelCellEdit();
  const pending = state.proposals.find((proposal) => proposal.status === 'submitted');
  if (!pending) return;
  state.error = '';
  state.note = '';
  const result = await decideProposal({ proposalId: pending.id, decision, reason: state.decisionReason });
  const message = !result.ok
    ? (result.error ?? 'Не удалось принять решение')
    : decision === 'approved'
      ? `Утверждено: baseline ревизии ${result.baseline?.snapshot.revision ?? 1}, `
        + `строк ${result.baseline?.snapshot.rows.length ?? 0}. Контур «Утверждено РП» заполнен из baseline.`
      : 'Предложение отклонено — причина записана в журнал.';
  state.decisionReason = '';
  await mountContoursPanel(state.objectId);
  if (result.ok) state.note = message; else state.error = message;
  render();
}

async function runChangeRequest(worItemId: string): Promise<void> {
  cancelCellEdit();
  const row = state.rows.find((item) => item.worItemId === worItemId);
  if (!row) return;
  // Значение для запроса берём из контура «Утверждено»: именно его и просим изменить.
  const target = row.values.APPROVED;
  if (target === null) {
    state.error = 'В контуре «Утверждено РП» нет значения: сначала утвердите объём';
    render();
    return;
  }
  state.error = '';
  state.note = '';
  const result = await requestChange({
    objectId: state.objectId,
    worItemId,
    kind: 'APPROVED',
    qtyAfter: target,
    reason: state.changeReason,
    workRaw: row.workRaw,
    place: row.place
  });
  const message = result.ok
    ? `Запрос на изменение создан: ${result.record?.qtyBefore ?? '—'} → ${result.record?.qtyAfter}. Ждёт решения РП.`
    : (result.error ?? 'Не удалось создать запрос на изменение');
  state.changeReason = '';
  await mountContoursPanel(state.objectId);
  if (result.ok) state.note = message; else state.error = message;
  render();
}

async function runChangeDecision(id: string, decision: 'approved' | 'rejected'): Promise<void> {
  cancelCellEdit();
  state.error = '';
  state.note = '';
  const result = await decideChangeRequest({
    id, decision,
    reason: decision === 'rejected' ? (state.changeReason || 'отклонено без пояснения') : state.changeReason
  });
  const message = !result.ok
    ? (result.error ?? 'Не удалось принять решение по изменению')
    : decision === 'approved'
      ? `Изменение утверждено: новый baseline ревизии ${result.baseline?.snapshot.revision ?? '—'}. `
        + 'Прежний baseline остался неизменным.'
      : 'Изменение отклонено: утверждённый объём остался прежним.';
  state.changeReason = '';
  await mountContoursPanel(state.objectId);
  if (result.ok) state.note = message; else state.error = message;
  render();
}

/**
 * Сверка контуров (ТЗ VOR-024): что разошлось, насколько и по какому порогу.
 *
 * Показываем три вещи, которые нельзя смешивать: расхождения **выше порога**, строки **в пределах
 * порога** и строки, где **сравнивать нечего** (пустой контур — это не ноль). Пороги настраиваются
 * по видам работ и живут по объекту.
 */
function reconcileHtml(): string {
  const summary = reconciliationSummary(state.reconciliation);
  const warnings = state.reconciliation
    .filter((row) => row.status === 'warning')
    .sort((left, right) => Math.abs(Number(right.percent ?? 0)) - Math.abs(Number(left.percent ?? 0)));
  const workName = (workId: string): string => state.works.find((work) => work.id === workId)?.name ?? workId;

  const card = (label: string, value: string, tone = 'text-ink'): string => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml(value)}</div>
    </div>`;

  const rules = state.thresholds.map((rule, index) => {
    const isDefault = rule.workId === null && rule.unit === null;
    return `
      <li class="flex flex-wrap items-center gap-2 py-1 border-b border-surface">
        <span class="text-rbi-caption text-ink">${escapeHtml(ruleTitle(rule, workName))}</span>
        <span class="text-rbi-caption text-muted">порог: ${escapeHtml(rule.percent)}% и ${escapeHtml(rule.absolute)} ед.
          ${isDefault ? '· общее правило' : ''}</span>
        ${state.canEdit && !isDefault ? `<button type="button" data-pf-rule-remove="${index}"
          class="text-rbi-caption font-bold text-muted border border-surface px-2 py-1 rounded-lg">Убрать</button>` : ''}
      </li>`;
  }).join('');

  const editor = state.canEdit
    ? `<div class="flex flex-wrap items-end gap-2 mt-2">
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Общий порог, %</span>
          <input id="pf-threshold-percent" type="text" inputmode="decimal" value="${escapeHtml(state.thresholdDraft?.percent ?? '5')}"
            class="w-24 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Общий порог, единицы</span>
          <input id="pf-threshold-absolute" type="text" inputmode="decimal" value="${escapeHtml(state.thresholdDraft?.absolute ?? '0')}"
            class="w-28 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Вид работ для своего порога</span>
          <select id="pf-threshold-work"
            class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5 max-w-[260px]">
            <option value="">— выберите вид работ —</option>
            ${state.works.map((work) => `<option value="${escapeHtml(work.id)}"${work.id === state.newRuleWorkId ? ' selected' : ''}>${escapeHtml(work.name)}</option>`).join('')}
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Порог, %</span>
          <input id="pf-threshold-work-percent" type="text" inputmode="decimal" value="${escapeHtml(state.newRulePercent)}"
            class="w-24 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <button type="button" id="pf-threshold-add"
          class="text-rbi-body font-bold text-brand border border-brand-soft px-3 py-1.5 rounded-xl">Добавить правило</button>
        <button type="button" id="pf-thresholds-save"
          class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl">Сохранить пороги</button>
      </div>`
    : `<div class="text-rbi-caption text-muted mt-2">Пороги настраивает ПТО: у вашей роли права на правку нет.</div>`;

  const warningRows = warnings.slice(0, 12).map((row) => `
    <tr class="border-b border-surface">
      <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${escapeHtml(row.place)}</td>
      <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml(row.workRaw)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${escapeHtml(row.pair)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-ink whitespace-nowrap">${escapeHtml(formatDecimal(String(row.left)))} → ${escapeHtml(formatDecimal(String(row.right)))}</td>
      <td class="py-1 pr-3 text-rbi-caption text-danger whitespace-nowrap">${escapeHtml(String(row.absolute))} · ${escapeHtml(String(row.percent))}%</td>
      <td class="py-1 text-rbi-caption text-muted whitespace-nowrap">${escapeHtml(row.threshold.percent)}% / ${escapeHtml(row.threshold.absolute)} ед.</td>
    </tr>`).join('');

  const aggregateRows = state.aggregates.slice(0, 10).map((item) => `
    <tr class="border-b border-surface">
      <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml(item.workRaw)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted whitespace-nowrap">${escapeHtml(item.pair)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-ink whitespace-nowrap">${escapeHtml(item.leftSum)} → ${escapeHtml(item.rightSum)}</td>
      <td class="py-1 text-rbi-caption ${item.status === 'warning' ? 'text-danger' : 'text-muted'} whitespace-nowrap">${escapeHtml(item.absolute)} · ${escapeHtml(item.percent)}%</td>
    </tr>`).join('');

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Сверка контуров
        <span class="text-rbi-caption text-muted font-normal">· РД ↔ договор ↔ предложено, пороги по видам работ</span></div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        ${card('Выше порога', String(summary.warnings), summary.warnings ? 'text-danger' : 'text-ink')}
        ${card('В пределах порога', String(summary.ok))}
        ${card('Не с чем сравнивать', String(summary.incomplete))}
        ${card('Всего сравнений', String(summary.total))}
      </div>
      ${summary.incomplete > 0 ? `<div class="text-rbi-caption text-muted mb-2">
        «Не с чем сравнивать» — это пустые контуры: пустое значение не считается нулём.</div>` : ''}
      <ul class="list-none p-0 m-0">${rules}</ul>
      ${editor}
      ${warnings.length ? `
        <div class="text-rbi-caption text-danger mt-3 mb-1">Расхождения выше порога (${warnings.length}):</div>
        <div class="overflow-x-auto">
          <table id="pf-reconcile-table" class="w-full min-w-[720px]">
            <thead><tr class="text-rbi-caption text-muted text-left">
              <th class="py-1 pr-3 font-normal">Помещение</th><th class="py-1 pr-3 font-normal">Работа</th>
              <th class="py-1 pr-3 font-normal">Пара</th><th class="py-1 pr-3 font-normal">Было → стало</th>
              <th class="py-1 pr-3 font-normal">Разница</th><th class="py-1 font-normal">Порог</th>
            </tr></thead>
            <tbody>${warningRows}</tbody>
          </table>
        </div>
        ${warnings.length > 12 ? `<div class="text-rbi-caption text-muted mt-1">Показаны первые 12 из ${warnings.length}.</div>` : ''}` : ''}
      ${state.aggregates.length ? `
        <div class="text-rbi-caption text-muted mt-3 mb-1">По видам работ (агрегаты):</div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[600px]">
            <thead><tr class="text-rbi-caption text-muted text-left">
              <th class="py-1 pr-3 font-normal">Вид работ</th><th class="py-1 pr-3 font-normal">Пара</th>
              <th class="py-1 pr-3 font-normal">Суммы</th><th class="py-1 font-normal">Разница</th>
            </tr></thead>
            <tbody>${aggregateRows}</tbody>
          </table>
        </div>` : ''}
    </div>`;
}

/** Настройка порогов сверки: общий порог, правило по виду работ, сохранение. */
function bindReconcile(container: HTMLElement): void {
  container.querySelector<HTMLInputElement>('#pf-threshold-percent')?.addEventListener('input', (event) => {
    state.thresholdDraft = { ...(state.thresholdDraft ?? { percent: '5', absolute: '0' }), percent: (event.target as HTMLInputElement).value };
  });
  container.querySelector<HTMLInputElement>('#pf-threshold-absolute')?.addEventListener('input', (event) => {
    state.thresholdDraft = { ...(state.thresholdDraft ?? { percent: '5', absolute: '0' }), absolute: (event.target as HTMLInputElement).value };
  });
  container.querySelector<HTMLSelectElement>('#pf-threshold-work')?.addEventListener('change', (event) => {
    state.newRuleWorkId = (event.target as HTMLSelectElement).value;
  });
  container.querySelector<HTMLInputElement>('#pf-threshold-work-percent')?.addEventListener('input', (event) => {
    state.newRulePercent = (event.target as HTMLInputElement).value;
  });

  container.querySelector<HTMLButtonElement>('#pf-thresholds-save')?.addEventListener('click', () => {
    void runSaveThresholds();
  });
  container.querySelector<HTMLButtonElement>('#pf-threshold-add')?.addEventListener('click', () => {
    void runAddRule();
  });
  container.querySelectorAll<HTMLButtonElement>('[data-pf-rule-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.getAttribute('data-pf-rule-remove'));
      void runRemoveRule(index);
    });
  });
}

/** Пороги: проверить ввод, собрать правила и сохранить — с пересчётом сверки. */
async function runSaveThresholds(): Promise<void> {
  cancelCellEdit();
  const percent = parseThresholdInput(state.thresholdDraft?.percent, 'percent');
  const absolute = parseThresholdInput(state.thresholdDraft?.absolute, 'absolute');
  if (!percent.ok || !absolute.ok) {
    state.error = percent.error ?? absolute.error ?? 'Порог введён неверно';
    render();
    return;
  }

  const others = state.thresholds.filter((rule) => !(rule.workId === null && rule.unit === null));
  const rules: ThresholdRule[] = [
    { workId: null, unit: null, percent: percent.value as string, absolute: absolute.value as string },
    ...others
  ];
  const saved = await saveThresholds(state.objectId, rules);
  if (!saved.ok) {
    state.error = saved.error ?? 'Не удалось сохранить пороги';
    render();
    return;
  }
  await mountContoursPanel(state.objectId);
  state.note = `Пороги сохранены: общий ${percent.value}% и ${absolute.value} ед. `
    + `Расхождений выше порога: ${reconciliationSummary(state.reconciliation).warnings}.`;
  render();
}

async function runAddRule(): Promise<void> {
  cancelCellEdit();
  if (!state.newRuleWorkId) {
    state.error = 'Выберите вид работ для своего порога';
    render();
    return;
  }
  const value = parseThresholdInput(state.newRulePercent, 'percent');
  if (!value.ok) {
    state.error = value.error ?? 'Порог введён неверно';
    render();
    return;
  }
  const rules = [
    ...state.thresholds.filter((rule) => rule.workId !== state.newRuleWorkId),
    { workId: state.newRuleWorkId, unit: null, percent: value.value as string, absolute: '0' }
  ];
  const saved = await saveThresholds(state.objectId, rules);
  if (!saved.ok) {
    state.error = saved.error ?? 'Не удалось сохранить правило';
    render();
    return;
  }
  const workName = state.works.find((work) => work.id === state.newRuleWorkId)?.name ?? state.newRuleWorkId;
  state.newRuleWorkId = '';
  state.newRulePercent = '';
  await mountContoursPanel(state.objectId);
  state.note = `Свой порог для «${workName}»: ${value.value}%.`;
  render();
}

async function runRemoveRule(index: number): Promise<void> {
  cancelCellEdit();
  const rules = state.thresholds.filter((_rule, position) => position !== index);
  const saved = await saveThresholds(state.objectId, rules);
  if (!saved.ok) {
    state.error = saved.error ?? 'Не удалось убрать правило';
    render();
    return;
  }
  await mountContoursPanel(state.objectId);
  state.note = 'Правило убрано: к этому виду работ применяется общий порог.';
  render();
}

function render(): void {
  const container = root();
  if (!container) return;
  container.innerHTML = `
    ${hintHtml()}
    ${state.note ? `<div class="text-rbi-caption text-brand mb-3">${escapeHtml(state.note)}</div>` : ''}
    ${state.error ? `<div class="text-rbi-body text-danger mb-3">${escapeHtml(state.error)}</div>` : ''}
    ${summaryHtml()}
    ${reconcileHtml()}
    ${approvalHtml()}
    ${tableHtml()}
  `;
  bind();
}

function bind(): void {
  const container = root();
  if (!container) return;

  // Сортировка по нажатию на заголовок; выбранная колонка сохраняется при перерисовке.
  bindSortableTable(container.querySelector<HTMLElement>('#pf-contours-table'), state.sort, (next) => {
    state.sort = next;
    state.editing = null;
    render();
  });

  bindReconcile(container);
  bindApproval(container);

  // Ввод прямо в ячейке.
  container.querySelectorAll<HTMLElement>('[data-pf-cell]').forEach((cell) => {
    const target = (): EditingCell | null => {
      const [worItemId, kind] = String(cell.getAttribute('data-pf-cell') || '').split('|');
      return worItemId && kind ? { worItemId, kind: kind as ContourKind } : null;
    };
    cell.addEventListener('mousedown', (event) => {
      // Не даём фокусу уйти раньше времени: цель запоминаем до blur прежнего поля.
      event.preventDefault();
      pendingOpen = target();
    });
    cell.addEventListener('click', () => {
      void openCell(target());
    });
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        pendingOpen = target();
        void openCell(target());
      }
    });
  });

  const input = container.querySelector<HTMLInputElement>('[data-pf-cell-input]');
  if (input) {
    input.focus();
    input.select();
    input.addEventListener('input', () => {
      state.draft = input.value;
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void commit('down');
      } else if (event.key === 'Tab') {
        event.preventDefault();
        void commit(event.shiftKey ? 'left' : 'right');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        state.editing = null;
        state.draft = '';
        render();
      }
    });
    input.addEventListener('blur', () => {
      // Уход из ячейки сохраняет введённое — но не тогда, когда открывается другая ячейка
      // (её сохранение сделает openCell) и не во время уже идущего сохранения.
      if (state.busy || pendingOpen) return;
      const cell = state.editing;
      if (!cell) return;
      // Сохранение откладываем на такт: если человек нажал кнопку действия в другом блоке,
      // она успеет отменить правку, и позднее сохранение не перетрёт её результат.
      setTimeout(() => {
        if (state.editing === cell && !state.busy) void commit(null);
      }, 0);
    });
  }
}

/** Открыть ячейку: прежнюю сначала сохраняем, потом открываем новую. */
async function openCell(target: EditingCell | null): Promise<void> {
  pendingOpen = null;
  if (!target || state.busy) return;
  const sameCell = state.editing?.worItemId === target.worItemId && state.editing?.kind === target.kind;
  if (state.editing && !sameCell) {
    await commit(null);
  }
  startEdit(target.worItemId, target.kind);
}

function startEdit(worItemId: string, kind: ContourKind): void {
  if (!state.canEdit) return;
  const row = state.rows.find((item) => item.worItemId === worItemId);
  if (!row) return;
  state.editing = { worItemId, kind };
  state.draft = row.values[kind] ?? '';
  state.note = '';
  state.error = '';
  render();
}

/** Куда перейти после сохранения: вниз (та же колонка), вправо/влево (соседний контур). */
function nextCell(direction: 'down' | 'left' | 'right' | null): EditingCell | null {
  if (!state.editing || !direction) return null;
  const editing = state.editing;
  const rows = orderedRows();
  const rowIndex = rows.findIndex((row) => row.worItemId === editing.worItemId);
  if (rowIndex < 0) return null;
  const kindIndex = CONTOURS.findIndex((contour) => contour.kind === editing.kind);

  if (direction === 'down') {
    const next = rows[rowIndex + 1];
    return next ? { worItemId: next.worItemId, kind: editing.kind } : null;
  }

  const step = direction === 'right' ? 1 : -1;
  const neighbour = CONTOURS[kindIndex + step];
  if (neighbour) return { worItemId: editing.worItemId, kind: neighbour.kind };

  const nextRow = rows[rowIndex + step];
  if (!nextRow) return null;
  const edge = step > 0 ? CONTOURS[0] : CONTOURS[CONTOURS.length - 1];
  return { worItemId: nextRow.worItemId, kind: edge.kind };
}

async function commit(direction: 'down' | 'left' | 'right' | null): Promise<void> {
  const editing = state.editing;
  if (!editing || state.busy) return;
  const value = state.draft;
  const wasEmpty = value.trim() === '';
  const target = nextCell(direction);

  state.busy = true;
  state.editing = null;
  state.error = '';
  state.note = '';

  try {
    const result = wasEmpty
      ? await clearContour(editing.worItemId, editing.kind)
      : await setContour({
        worItemId: editing.worItemId,
        objectId: state.objectId,
        kind: editing.kind,
        quantity: value
      });

    if (!result.ok) {
      state.error = result.error ?? 'Не удалось сохранить контур';
    } else {
      const contour = CONTOURS.find((item) => item.kind === editing.kind);
      const row = state.rows.find((item) => item.worItemId === editing.worItemId);
      state.note = wasEmpty
        ? `${contour?.short ?? editing.kind}: «${row?.workRaw ?? ''}» — пусто, контур снят (это не ноль)`
        : `${contour?.short ?? editing.kind}: ${value.trim().replace('.', ',')} — ${row?.workRaw ?? ''}`;
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }

  state.busy = false;
  state.draft = '';
  await mountContoursPanel(state.objectId);

  if (target && !state.error) {
    const row = state.rows.find((item) => item.worItemId === target.worItemId);
    if (row) {
      state.editing = target;
      state.draft = row.values[target.kind] ?? '';
      render();
    }
  }
}
