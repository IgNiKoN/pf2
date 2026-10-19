/**
 * tasks.state.js
 * Изолированное состояние модуля Tasks.
 *
 * Единый источник правды для данных задач.
 * Глобальные переменные window.rbi_tasksData, window.rbi_scheduleData,
 * window.isPlanGenerating остаются для обратной совместимости,
 * но заполняются через этот объект.
 */

export const TasksState = {

    tasks:           [],
    schedule:        [],
    currentTask:     null,
    isPlanGenerating: false,

    filters: {
        status: 'ALL',
        type:   'ALL',
        date:   null
    },

    /* ── Сеттеры ─────────────────────────────────────────────────────── */

    setTasks(arr) {
        this.tasks = arr || [];
        // Обратная совместимость
        window.rbi_tasksData = this.tasks;
    },

    setSchedule(arr) {
        this.schedule = arr || [];
        // Обратная совместимость
        window.rbi_scheduleData = this.schedule;
    },

    setCurrentTask(task) {
        this.currentTask = task || null;
    },

    setPlanGenerating(bool) {
        this.isPlanGenerating = !!bool;
        // Обратная совместимость
        window.isPlanGenerating = this.isPlanGenerating;
    },

    /* ── Геттеры ─────────────────────────────────────────────────────── */

    getTaskById(id) {
        return this.tasks.find(function (t) { return t.id === id; }) || null;
    },

    getFilteredTasks(filters) {
        var f = filters || this.filters;
        return this.tasks.filter(function (t) {
            if (t._deleted || t.is_deleted) return false;

            var matchStatus = !f.status || f.status === 'ALL' || t.status === f.status;
            var matchType   = !f.type   || f.type   === 'ALL' || t.type   === f.type;

            var matchDate = true;
            if (f.date) {
                var taskDate = t.dueDate || t.due_date || t.date || '';
                matchDate = taskDate && taskDate.startsWith(f.date);
            }

            return matchStatus && matchType && matchDate;
        });
    }
};

// Публикация в window для доступа из консоли и legacy-кода
if (typeof window !== 'undefined') {
    window.TasksState = TasksState;
}

console.log('[TasksState] tasks.state.js loaded');
