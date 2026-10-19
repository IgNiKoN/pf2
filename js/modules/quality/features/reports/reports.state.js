/**
 * reports.state.js — Фаза 16: изолированное состояние модуля Reports.
 *
 * Инкапсулирует:
 * - window.reportsArray (массив сохранённых отчётов)
 * - activeReportType (текущий тип: 'onepager' | 'global' | 'full' | 'poster' | 'tender' | null)
 * - isGenerating (флаг генерации PDF)
 * - pdfTemplates (шаблоны PDF)
 *
 * getReports() возвращает живую ссылку на window.reportsArray (не копию).
 * syncFromLegacy() копирует снимок из window.reportsArray → _reports.
 */

export const ReportsState = {

    activeReportType: null,
    isGenerating:     false,
    pdfTemplates:     [],

    _reports: [],

    /* ── Геттеры ─────────────────────────────────────────────────────── */

    /**
     * Живая ссылка на window.reportsArray — не копия.
     * Аналогично паттерну ConstructionState (Фаза 15).
     */
    getReports() {
        return (typeof window !== 'undefined' && window.reportsArray) || this._reports;
    },

    /* ── Сеттеры ─────────────────────────────────────────────────────── */

    setActiveReportType(type) {
        this.activeReportType = type || null;
    },

    setGenerating(bool) {
        this.isGenerating = !!bool;
        if (typeof window !== 'undefined' && 'isPdfGenerating' in window) {
            window.isPdfGenerating = this.isGenerating;
        }
    },

    setPdfTemplates(arr) {
        this.pdfTemplates = arr || [];
    },

    /* ── syncFromLegacy — копирует снимок для реактивных подписчиков ─── */

    syncFromLegacy() {
        if (typeof window !== 'undefined' && Array.isArray(window.reportsArray)) {
            this._reports = window.reportsArray.slice();
        }
        if (typeof window !== 'undefined' && Array.isArray(window.pdfTemplates)) {
            this.pdfTemplates = window.pdfTemplates.slice();
        }
    }
};

if (typeof window !== 'undefined') {
    window.ReportsState = ReportsState;
}

console.log('[ReportsState] reports.state.js loaded');
