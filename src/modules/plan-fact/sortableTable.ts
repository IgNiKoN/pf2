/**
 * Привязка сортировки к таблице: клик по заголовку (и Enter/Space с клавиатуры) меняет порядок.
 *
 * Разметку строит панель, поэтому состояние сортировки живёт у неё: перерисовка не должна
 * терять выбранную колонку. Здесь — только поведение и доступность: `aria-sort`, подсказка
 * и указатель направления.
 */

import { cycleSort, type SortState } from './domain/sort';

/** Поставить указатель сортировки в заголовке и повесить обработчики. */
export function bindSortableTable(
  table: HTMLElement | null,
  state: SortState,
  onSort: (next: SortState) => void
): void {
  if (!table) return;

  table.querySelectorAll<HTMLTableCellElement>('th[data-sort-key]').forEach((cell) => {
    const key = cell.getAttribute('data-sort-key') || '';
    if (!key) return;
    const active = state.key === key;

    cell.classList.add('cursor-pointer', 'select-none');
    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('aria-sort', active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    cell.setAttribute('title', active
      ? 'Нажмите, чтобы изменить направление сортировки'
      : 'Нажмите, чтобы отсортировать по этой колонке');

    const indicator = document.createElement('span');
    indicator.setAttribute('data-sort-indicator', key);
    indicator.className = active ? 'text-brand ml-1' : 'text-muted ml-1 opacity-60';
    indicator.textContent = active ? (state.dir === 'asc' ? '▲' : '▼') : '↕';
    cell.appendChild(indicator);

    const apply = (): void => onSort(cycleSort(state, key));
    cell.addEventListener('click', apply);
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        apply();
      }
    });
  });
}

/** Классы заголовка: активная колонка выделяется, чтобы было видно, по чему отсортировано. */
export function sortableHeaderClass(active: boolean, extra = ''): string {
  return [extra, active ? 'text-brand' : '', 'cursor-pointer select-none'].filter(Boolean).join(' ');
}
