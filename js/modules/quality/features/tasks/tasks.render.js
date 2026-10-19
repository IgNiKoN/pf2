/**
 * tasks.render.js
 * Рендер-функции модуля Tasks.
 *
 * Читают данные из TasksState (не из window.rbi_tasksData напрямую).
 * Делегируют рендер соответствующим функциям tasks.legacy.js через window-прокси
 * для сохранения обратной совместимости.
 */

import { TasksState } from './tasks.state.js';

export const TasksRender = {

    /**
     * Основной список задач — делегирует в legacy window.executeRenderTasks
     */
    renderTasksList() {
        if (typeof window.executeRenderTasks === 'function') {
            window.executeRenderTasks();
        } else {
            console.warn('[TasksRender] executeRenderTasks недоступен');
        }
    },

    /**
     * Календарный вид — делегирует в legacy window.rbi_renderCalendarGrid
     */
    renderTasksCalendar() {
        if (typeof window.rbi_renderCalendarGrid === 'function') {
            window.rbi_renderCalendarGrid();
        } else {
            console.warn('[TasksRender] rbi_renderCalendarGrid недоступен');
        }
    },

    /**
     * Карточка одной задачи — возвращает HTML-строку через TasksState
     * (для будущего использования; в данной фазе legacy генерирует карточки внутри renderTasksList)
     */
    renderTaskCard(task) {
        if (!task) return '';
        var status = task.status || 'new';
        var title  = task.title || task.name || 'Задача';
        var type   = task.type  || '';
        return '<div class="task-card" data-id="' + (task.id || '') + '">'
             + '<span class="task-type">' + type + '</span> '
             + '<span class="task-title">' + title + '</span> '
             + '<span class="task-status">' + status + '</span>'
             + '</div>';
    },

    /**
     * Диспетчер рендера — выбирает нужный метод по вкладке
     * @param {string} tab — 'list' | 'calendar' | 'schedule'
     */
    render(tab) {
        switch (tab) {
            case 'calendar':
                TasksRender.renderTasksCalendar();
                break;
            case 'list':
            default:
                TasksRender.renderTasksList();
                break;
        }
    }
};

// Публикация в window для доступа из консоли и legacy-кода
if (typeof window !== 'undefined') {
    window.TasksRender = TasksRender;
}

console.log('[TasksRender] tasks.render.js loaded');
