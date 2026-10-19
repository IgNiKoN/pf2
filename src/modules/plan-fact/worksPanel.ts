/**
 * Раздел «Справочник» (ТЗ VOR-012): виды работ как данные.
 *
 * Справочник **корпоративный**, а не по объекту: правка влияет на все объекты компании,
 * и это прямо написано в интерфейсе, чтобы никто не удивился. Ведёт его ПТО (право
 * `canManageWorks`), у остальных — чтение.
 *
 * Здесь же видны связки названий из форм: их создаёт ручное сопоставление в разделе «ВОР»,
 * а ПТО может снять лишнюю.
 */

import { UNITS } from './domain/reference';
import { NO_SORT, sortRows, type SortState, type SortValue } from './domain/sort';
import {
  archiveWork, canManageWorks, listAliases, listWorks, removeAlias, saveWork,
  type WorkAliasRecord, type WorkItem
} from './domain/works';
import { bindSortableTable, sortableHeaderClass } from './sortableTable';

interface PanelState {
  works: WorkItem[];
  aliases: WorkAliasRecord[];
  canEdit: boolean;
  /** id вида работ, который сейчас правим; '' — добавление нового. */
  editingId: string;
  search: string;
  sort: SortState;
  aliasSort: SortState;
  note: string;
  error: string;
  busy: boolean;
}

const state: PanelState = {
  works: [],
  aliases: [],
  canEdit: false,
  editingId: '',
  search: '',
  sort: { ...NO_SORT },
  aliasSort: { ...NO_SORT },
  note: '',
  error: '',
  busy: false
};

function root(): HTMLElement | null {
  return document.getElementById('pf-works-root');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function mountWorksPanel(): Promise<void> {
  if (!root()) return;
  state.canEdit = canManageWorks();
  try {
    state.works = await listWorks();
    state.aliases = await listAliases();
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.works = [];
    state.aliases = [];
  }
  render();
}

const WORK_COLUMNS: { key: string; title: string; value: (row: WorkItem) => SortValue }[] = [
  { key: 'name', title: 'Вид работ', value: (row) => row.name },
  { key: 'unit', title: 'ЕИ', value: (row) => row.unit },
  { key: 'group', title: 'Группа', value: (row) => row.groupName },
  { key: 'stage', title: 'Этап', value: (row) => row.stage },
  { key: 'source', title: 'Источник', value: (row) => (row.source === 'pto' ? 'задал ПТО' : 'начальное наполнение') },
  { key: 'revision', title: 'Версия', value: (row) => row.revision }
];

const ALIAS_COLUMNS: { key: string; title: string; value: (row: WorkAliasRecord) => SortValue }[] = [
  { key: 'alias', title: 'Название в форме', value: (row) => row.alias },
  { key: 'work', title: 'Вид работ', value: (row) => workName(row.workId) },
  { key: 'source', title: 'Откуда', value: (row) => (row.source === 'form' ? 'из формы' : 'связал ПТО') }
];

function workName(workId: string): string {
  return state.works.find((work) => work.id === workId)?.name ?? workId;
}

function filteredWorks(): WorkItem[] {
  const needle = state.search.trim().toLowerCase();
  const base = needle
    ? state.works.filter((work) => `${work.name} ${work.groupName} ${work.code}`.toLowerCase().includes(needle))
    : state.works;
  return sortRows(base, state.sort, (row, key) => {
    const column = WORK_COLUMNS.find((item) => item.key === key);
    return column ? column.value(row) : '';
  });
}

function summaryHtml(): string {
  const pto = state.works.filter((work) => work.source === 'pto').length;
  const card = (label: string, value: string, tone = 'text-ink'): string => `
    <div class="bg-surface border border-surface rounded-xl px-3 py-2">
      <div class="text-rbi-caption text-muted">${escapeHtml(label)}</div>
      <div class="text-rbi-title font-bold ${tone}">${escapeHtml(value)}</div>
    </div>`;
  return `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      ${card('Видов работ', String(state.works.length))}
      ${card('Заведено ПТО', String(pto))}
      ${card('Связок названий', String(state.aliases.length))}
      ${card('Справочник', 'компании')}
    </div>`;
}

function editorHtml(): string {
  if (!state.canEdit) {
    return `<div class="bg-surface border border-surface rounded-xl px-3 py-2 mb-3">
      <span class="text-rbi-caption text-muted">Справочник ведёт ПТО: у вашей роли права на правку нет,
      таблица ниже — для чтения.</span>
    </div>`;
  }
  const editing = state.works.find((work) => work.id === state.editingId) ?? null;
  const unitOptions = UNITS.map((unit) =>
    `<option value="${escapeHtml(unit.code)}"${editing?.unit === unit.code ? ' selected' : ''}>${escapeHtml(`${unit.title} (${unit.code})`)}</option>`).join('');

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3">
      <div class="text-rbi-body font-bold text-ink mb-2">
        ${editing ? `Правка вида работ: ${escapeHtml(editing.name)}` : 'Новый вид работ'}
        <span class="text-rbi-caption text-muted font-normal">· справочник компании, влияет на все объекты</span>
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <label class="flex flex-col gap-1 flex-1 min-w-[220px]">
          <span class="text-rbi-label text-muted">Название</span>
          <input id="pf-work-name" type="text" value="${escapeHtml(editing?.name ?? '')}"
            class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Единица</span>
          <select id="pf-work-unit"
            class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5">${unitOptions}</select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Группа</span>
          <input id="pf-work-group" type="text" value="${escapeHtml(editing?.groupName ?? '')}"
            class="w-32 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-rbi-label text-muted">Этап</span>
          <input id="pf-work-stage" type="text" value="${escapeHtml(editing?.stage ?? '')}"
            class="w-32 bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <label class="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span class="text-rbi-label text-muted">Правило расчёта</span>
          <input id="pf-work-rule" type="text" value="${escapeHtml(editing?.calcRule ?? '')}"
            placeholder="например: периметр × высота − проёмы"
            class="w-full bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5" />
        </label>
        <button type="button" id="pf-work-save" ${state.busy ? 'disabled' : ''}
          class="text-rbi-body font-bold text-white bg-brand px-3 py-1.5 rounded-xl disabled:opacity-50">
          ${editing ? 'Сохранить' : 'Добавить'}</button>
        ${editing ? `<button type="button" id="pf-work-cancel"
          class="text-rbi-body font-bold text-muted border border-surface px-3 py-1.5 rounded-xl">Отмена</button>` : ''}
      </div>
      <div class="text-rbi-caption text-muted mt-2">
        Правка увеличивает версию записи — видно, что методика менялась. Убрать вид работ можно в архив:
        запись останется в истории, но из списка уйдёт.
      </div>
    </div>`;
}

function tableHtml(): string {
  const rows = filteredWorks();
  if (rows.length === 0) {
    return `<div class="bg-surface border border-surface rounded-xl p-3">
      <div class="text-rbi-caption text-muted">Ничего не найдено${state.search ? ` по запросу «${escapeHtml(state.search)}»` : ''}.</div>
    </div>`;
  }

  const head = WORK_COLUMNS.map((column) => {
    const active = state.sort.key === column.key;
    return `<th data-sort-key="${escapeHtml(column.key)}"
      class="${sortableHeaderClass(active, 'py-1 pr-3 font-normal whitespace-nowrap')}">${escapeHtml(column.title)}</th>`;
  }).join('');

  const body = rows.slice(0, 400).map((work) => `
    <tr class="border-b border-surface" data-pf-work="${escapeHtml(work.id)}">
      <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml(work.name)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml(work.unit)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml(work.groupName)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml(work.stage)}</td>
      <td class="py-1 pr-3 text-rbi-caption ${work.source === 'pto' ? 'text-brand' : 'text-muted'}">
        ${work.source === 'pto' ? 'задал ПТО' : 'начальное наполнение'}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${work.revision}</td>
      <td class="py-1 whitespace-nowrap">
        ${state.canEdit ? `
          <button type="button" data-pf-work-edit="${escapeHtml(work.id)}"
            class="text-rbi-caption font-bold text-brand border border-brand-soft px-2 py-1 rounded-lg">Изменить</button>
          <button type="button" data-pf-work-archive="${escapeHtml(work.id)}"
            class="text-rbi-caption font-bold text-muted border border-surface px-2 py-1 rounded-lg">В архив</button>` : ''}
      </td>
    </tr>`).join('');

  const more = rows.length > 400
    ? `<div class="text-rbi-caption text-muted mt-2">Показаны первые 400 из ${rows.length}.</div>`
    : '';

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div class="text-rbi-body font-bold text-ink">Виды работ (${rows.length})</div>
        <input id="pf-work-search" type="text" value="${escapeHtml(state.search)}" placeholder="поиск по названию, группе, коду"
          class="bg-surface border border-surface text-ink text-rbi-body rounded-lg px-2 py-1.5 w-64" />
      </div>
      <table id="pf-works-table" class="w-full min-w-[820px]">
        <thead><tr class="text-rbi-caption text-muted text-left">${head}
          <th class="py-1 font-normal"></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      ${more}
    </div>`;
}

function aliasesHtml(): string {
  if (state.aliases.length === 0) {
    return `<div class="bg-surface border border-surface rounded-xl p-3">
      <div class="text-rbi-body font-bold text-ink mb-1">Связки названий</div>
      <div class="text-rbi-caption text-muted">Связок пока нет. Они появляются, когда в разделе «ВОР»
      формулировку из формы связывают с видом работ.</div>
    </div>`;
  }

  const sorted = sortRows(state.aliases, state.aliasSort, (row, key) => {
    const column = ALIAS_COLUMNS.find((item) => item.key === key);
    return column ? column.value(row) : '';
  });

  const head = ALIAS_COLUMNS.map((column) => {
    const active = state.aliasSort.key === column.key;
    return `<th data-sort-key="${escapeHtml(column.key)}"
      class="${sortableHeaderClass(active, 'py-1 pr-3 font-normal')}">${escapeHtml(column.title)}</th>`;
  }).join('');

  const body = sorted.map((alias) => `
    <tr class="border-b border-surface">
      <td class="py-1 pr-3 text-rbi-body text-ink">${escapeHtml(alias.alias)}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${escapeHtml(workName(alias.workId))}</td>
      <td class="py-1 pr-3 text-rbi-caption text-muted">${alias.source === 'form' ? 'из формы' : 'связал ПТО'}</td>
      <td class="py-1">${state.canEdit ? `<button type="button" data-pf-alias-remove="${escapeHtml(alias.id)}"
        class="text-rbi-caption font-bold text-muted border border-surface px-2 py-1 rounded-lg">Снять</button>` : ''}</td>
    </tr>`).join('');

  return `
    <div class="bg-surface border border-surface rounded-xl p-3 mb-3 overflow-x-auto">
      <div class="text-rbi-body font-bold text-ink mb-2">Связки названий (${state.aliases.length})</div>
      <table id="pf-aliases-table" class="w-full min-w-[640px]">
        <thead><tr class="text-rbi-caption text-muted text-left">${head}
          <th class="py-1 font-normal"></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function render(): void {
  const container = root();
  if (!container) return;
  container.innerHTML = `
    ${state.note ? `<div class="text-rbi-caption text-brand mb-3">${escapeHtml(state.note)}</div>` : ''}
    ${state.error ? `<div class="text-rbi-body text-danger mb-3">${escapeHtml(state.error)}</div>` : ''}
    ${summaryHtml()}
    ${editorHtml()}
    ${tableHtml()}
    ${aliasesHtml()}
  `;
  bind();
}

function field(id: string): string {
  return root()?.querySelector<HTMLInputElement>(id)?.value ?? '';
}

function bind(): void {
  const container = root();
  if (!container) return;

  bindSortableTable(container.querySelector<HTMLElement>('#pf-works-table'), state.sort, (next) => {
    state.sort = next;
    render();
  });
  bindSortableTable(container.querySelector<HTMLElement>('#pf-aliases-table'), state.aliasSort, (next) => {
    state.aliasSort = next;
    render();
  });

  container.querySelector<HTMLInputElement>('#pf-work-search')?.addEventListener('input', (event) => {
    state.search = (event.target as HTMLInputElement).value;
    render();
  });

  const unitSelect = container.querySelector<HTMLSelectElement>('#pf-work-unit');
  container.querySelector<HTMLButtonElement>('#pf-work-save')?.addEventListener('click', () => {
    void runSaveWork(unitSelect?.value ?? '');
  });
  container.querySelector<HTMLButtonElement>('#pf-work-cancel')?.addEventListener('click', () => {
    state.editingId = '';
    state.note = '';
    state.error = '';
    render();
  });

  container.querySelectorAll<HTMLButtonElement>('[data-pf-work-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editingId = button.getAttribute('data-pf-work-edit') ?? '';
      state.note = '';
      state.error = '';
      render();
    });
  });
  container.querySelectorAll<HTMLButtonElement>('[data-pf-work-archive]').forEach((button) => {
    button.addEventListener('click', () => {
      void runArchive(button.getAttribute('data-pf-work-archive') ?? '');
    });
  });
  container.querySelectorAll<HTMLButtonElement>('[data-pf-alias-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      void runRemoveAlias(button.getAttribute('data-pf-alias-remove') ?? '');
    });
  });
}

async function runSaveWork(unit: string): Promise<void> {
  // Значения читаем ДО перерисовки: render() пересобирает форму из состояния и затёрла бы ввод.
  const input = {
    name: field('#pf-work-name'),
    unit,
    groupName: field('#pf-work-group'),
    stage: field('#pf-work-stage'),
    calcRule: field('#pf-work-rule')
  };

  state.busy = true;
  state.error = '';
  state.note = '';
  render();
  try {
    const result = await saveWork({
      id: state.editingId || undefined,
      name: input.name,
      unit: input.unit,
      groupName: input.groupName,
      stage: input.stage,
      calcRule: input.calcRule
    });
    if (!result.ok) {
      state.error = result.error ?? 'Не удалось сохранить вид работ';
    } else {
      state.note = `Сохранено: «${result.record?.name}», версия ${result.record?.revision}.`
        + (result.record?.source === 'pto' ? ' Теперь это запись ПТО, а не начальное наполнение.' : '');
      state.editingId = '';
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  state.busy = false;
  await mountWorksPanel();
}

async function runArchive(id: string): Promise<void> {
  state.busy = true;
  state.error = '';
  state.note = '';
  try {
    const result = await archiveWork(id);
    if (!result.ok) state.error = result.error ?? 'Не удалось убрать вид работ';
    else state.note = 'Вид работ убран в архив: из списка он уйдёт, история останется.';
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  state.busy = false;
  await mountWorksPanel();
}

async function runRemoveAlias(id: string): Promise<void> {
  state.busy = true;
  state.error = '';
  state.note = '';
  try {
    const result = await removeAlias(id);
    if (!result.ok) state.error = result.error ?? 'Не удалось снять связку';
    else state.note = 'Связка снята: формулировка снова будет требовать решения.';
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  state.busy = false;
  await mountWorksPanel();
}
