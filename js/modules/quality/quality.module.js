/**
 * quality.module.js
 * Агрегирующий модуль platform module «quality» (Compact Module Restructure).
 *
 * НЕ содержит бизнес-логики. Координация: ES import 9 sub-modules + side-effect
 * features/desktop; init() по локальному массиву (порядок = бывший SUB_MODULE_KEYS).
 * Загрузка только через loadModule('quality') → index.js (без static <script>).
 *
 * interventions — без ключа в MODULE_KEYS; bindCtx через window.InterventionsShared.
 */

import { HistoryModule } from './features/history/history.module.js';
import { AuditModule } from './features/audit/audit.module.js';
import './features/audit/audit.desktop.render.js';
import { AnalyticsModule } from './features/analytics/analytics.module.js';
import './features/analytics/analytics.desktop.render.js';
import { TasksModule } from './features/tasks/tasks.module.js';
import { EtalonModule } from './features/etalon/etalon.module.js';
import { ReportsModule } from './features/reports/reports.module.js';
import { EngineerModule } from './features/engineer/engineer.module.js';
import './features/engineer/engineer.desktop.render.js';
import { ScheduleModule } from './features/schedule/schedule.module.js';
import { MeetingsModule } from './features/meetings/meetings.module.js';
import './features/interventions.js';
import './features/shared/multi-filter.js';

/** Порядок init = бывший SUB_MODULE_KEYS (registry.get-цикл). */
var SUB_MODULES = [
    HistoryModule,
    AuditModule,
    AnalyticsModule,
    TasksModule,
    EtalonModule,
    ReportsModule,
    EngineerModule,
    ScheduleModule,
    MeetingsModule
];

export const QualityModule = {
    id: 'quality',

    init: async function (ctx) {
        for (var i = 0; i < SUB_MODULES.length; i++) {
            var sub = SUB_MODULES[i];
            var label = (sub && sub.id) ? sub.id : ('index:' + i);
            if (!sub) {
                console.warn('[quality.module] Под-модуль отсутствует: ' + label);
                continue;
            }
            if (typeof sub.init !== 'function') {
                console.warn('[quality.module] У под-модуля нет метода init(): ' + label);
                continue;
            }
            try {
                await sub.init(ctx);
            } catch (e) {
                console.error('[quality.module] Ошибка init() для ' + label + ':', e);
            }
        }
        // Под-модули часто перезаписывают ctx.templates на RBI.utils.templates
        // (read-only). Для CRUD чек-листов нужен services.templates.
        if (window.RBI && window.RBI.services && window.RBI.services.templates) {
            ctx.templates = window.RBI.services.templates;
        }
        // ReferenceShared.bindCtx — ownership у knowledge.module (peer), не здесь.
        if (window.InterventionsShared) window.InterventionsShared.bindCtx(ctx);
    }
};

window.RBI = window.RBI || {};
if (window.RBI.registry && typeof window.RBI.registry.register === 'function') {
    window.RBI.registry.register('module.quality', QualityModule);
}
