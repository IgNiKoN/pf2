/**
 * tasks.actions.js
 * Бизнес-действия модуля Tasks: CRUD задач, управление статусами.
 *
 * Использует ctx.tasks (после bindCtx),
 * с fallback на window.RBI.services.tasks для обратной совместимости.
 * Обновляет TasksState и эмитит события через ctx.events || window.RBI.events.
 */

import { TasksState } from './tasks.state.js';

function getService() {
    return window.TasksActions && window.TasksActions._ctx && window.TasksActions._ctx.tasks;
}

function emitEvent(name, payload) {
    var events = window.TasksActions && window.TasksActions._ctx && window.TasksActions._ctx.events;
    if (events && typeof events.emit === 'function') {
        events.emit(name, payload || {});
    }
}

export const TasksActions = {

    _ctx: null,

    bindCtx(ctx) {
        this._ctx = ctx;
    },

    /**
     * Загружает все задачи (не удалённые) → TasksState.setTasks()
     */
    async loadTasks() {
        var svc = getService();
        if (!svc) {
            console.warn('[TasksActions] task service недоступен');
            return;
        }
        try {
            var all = await svc.getAllTasks();
            var active = (all || []).filter(function (t) { return !t._deleted && !t.is_deleted; });
            TasksState.setTasks(active);
        } catch (e) {
            console.error('[TasksActions] ошибка загрузки задач:', e);
        }
    },

    /**
     * Сохраняет задачу → обновляет TasksState → эмит task:saved
     */
    async saveTask(data) {
        var svc = getService();
        if (!svc) {
            console.warn('[TasksActions] task service недоступен');
            return null;
        }
        try {
            var saved = await svc.saveTask(data);
            // Обновить или добавить в локальный массив
            var idx = TasksState.tasks.findIndex(function (t) { return t.id === saved.id; });
            if (idx >= 0) {
                TasksState.tasks[idx] = saved;
            } else {
                TasksState.tasks.push(saved);
            }
            TasksState.setTasks(TasksState.tasks);
            emitEvent('task:saved', { task: saved });
            return saved;
        } catch (e) {
            console.error('[TasksActions] ошибка сохранения задачи:', e);
            return null;
        }
    },

    /**
     * Soft-delete задачи → обновляет TasksState → эмит task:deleted
     */
    async deleteTask(id) {
        var svc = getService();
        if (!svc) {
            console.warn('[TasksActions] task service недоступен');
            return false;
        }
        try {
            var deleted = await svc.deleteTask(id);
            if (deleted) {
                TasksState.setTasks(TasksState.tasks.filter(function (t) { return t.id !== id; }));
                emitEvent('task:deleted', { id: id });
            }
            return !!deleted;
        } catch (e) {
            console.error('[TasksActions] ошибка удаления задачи:', e);
            return false;
        }
    },

    /**
     * Устанавливает статус задачи 'done' → эмит task:completed
     */
    async completeTask(id) {
        var task = TasksState.getTaskById(id);
        if (!task) {
            console.warn('[TasksActions] задача не найдена:', id);
            return null;
        }
        var updated = Object.assign({}, task, { status: 'done' });
        var result = await TasksActions.saveTask(updated);
        if (result) {
            emitEvent('task:completed', { id: id, task: result });
        }
        return result;
    },

    /**
     * Загружает этапы расписания → TasksState.setSchedule()
     */
    async loadSchedule() {
        var svc = getService();
        if (!svc) {
            console.warn('[TasksActions] task service недоступен');
            return;
        }
        try {
            var all = await svc.getAllSchedule();
            TasksState.setSchedule(all || []);
        } catch (e) {
            console.error('[TasksActions] ошибка загрузки расписания:', e);
        }
    }
};

// Публикация в window для доступа из консоли и legacy-кода
if (typeof window !== 'undefined') {
    window.TasksActions = TasksActions;
}

console.log('[TasksActions] tasks.actions.js loaded');
