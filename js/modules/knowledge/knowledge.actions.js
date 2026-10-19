/**
 * knowledge.actions.js
 * Бизнес-действия модуля Knowledge.
 *
 * Вызывают knowledge.service.js, обновляют KnowledgeState и эмитят события.
 * Экспортируют объект KnowledgeActions.
 */

import { KnowledgeState } from './knowledge.state.js';

function getService() {
    return KnowledgeActions._ctx && KnowledgeActions._ctx.knowledge;
}

function emitEvent(name, payload) {
    var events = KnowledgeActions._ctx && KnowledgeActions._ctx.events;
    if (events && typeof events.emit === 'function') {
        events.emit(name, payload);
    }
}

export const KnowledgeActions = {

    _ctx: null,
    bindCtx(ctx) { this._ctx = ctx; },

    /* ── TWI-карточки ─────────────────────────────────────────────── */

    async saveTwiCard(data) {
        var svc = getService();
        if (!svc) { console.error('[KnowledgeActions] knowledge service недоступен'); return null; }

        var saved = await svc.saveTwiCard(data);

        var idx = KnowledgeState.twiCards.findIndex(function (c) { return c.id === saved.id; });
        if (idx !== -1) {
            KnowledgeState.twiCards[idx] = saved;
        } else {
            KnowledgeState.twiCards.push(saved);
        }
        window.customTwiCards = KnowledgeState.twiCards;

        emitEvent('twi:saved', { id: saved.id, card: saved });
        console.log('[knowledge:saved twi]', saved.id);
        return saved;
    },

    async deleteTwiCard(id) {
        var svc = getService();
        if (!svc) { console.error('[KnowledgeActions] knowledge service недоступен'); return null; }

        var deleted = await svc.deleteTwiCard(id);

        KnowledgeState.setTwiCards(
            KnowledgeState.twiCards.filter(function (c) { return c.id !== id; })
        );

        emitEvent('twi:deleted', { id: id });
        console.log('[knowledge:deleted twi]', id);
        return deleted;
    },

    /* ── Документы ────────────────────────────────────────────────── */

    async saveCustomDoc(data) {
        var svc = getService();
        if (!svc) { console.error('[KnowledgeActions] knowledge service недоступен'); return null; }

        var saved = await svc.saveCustomDoc(data);

        var idx = KnowledgeState.customDocs.findIndex(function (d) { return d.id === saved.id; });
        if (idx !== -1) {
            KnowledgeState.customDocs[idx] = saved;
        } else {
            KnowledgeState.customDocs.push(saved);
        }
        window.customDocs = KnowledgeState.customDocs;

        emitEvent('doc:saved', { id: saved.id, doc: saved });
        console.log('[knowledge:saved doc]', saved.id);
        return saved;
    },

    async deleteCustomDoc(id) {
        var svc = getService();
        if (!svc) { console.error('[KnowledgeActions] knowledge service недоступен'); return null; }

        var deleted = await svc.deleteCustomDoc(id);

        KnowledgeState.setDocs(
            KnowledgeState.customDocs.filter(function (d) { return d.id !== id; })
        );

        emitEvent('doc:deleted', { id: id });
        console.log('[knowledge:deleted doc]', id);
        return deleted;
    },

    /* ── Узлы конструктива ────────────────────────────────────────── */

    async saveCustomNode(data) {
        var svc = getService();
        if (!svc) { console.error('[KnowledgeActions] knowledge service недоступен'); return null; }

        var saved = await svc.saveCustomNode(data);

        var idx = KnowledgeState.customNodes.findIndex(function (n) { return n.id === saved.id; });
        if (idx !== -1) {
            KnowledgeState.customNodes[idx] = saved;
        } else {
            KnowledgeState.customNodes.push(saved);
        }
        window.customNodes = KnowledgeState.customNodes;

        emitEvent('node:saved', { id: saved.id, node: saved });
        console.log('[knowledge:saved node]', saved.id);
        return saved;
    },

    async deleteCustomNode(id) {
        var svc = getService();
        if (!svc) { console.error('[KnowledgeActions] knowledge service недоступен'); return null; }

        var deleted = await svc.deleteCustomNode(id);

        KnowledgeState.setNodes(
            KnowledgeState.customNodes.filter(function (n) { return n.id !== id; })
        );

        emitEvent('node:deleted', { id: id });
        console.log('[knowledge:deleted node]', id);
        return deleted;
    }
};

// Публикация в window для доступа из legacy-кода
if (typeof window !== 'undefined') {
    window.KnowledgeActions = KnowledgeActions;
}

console.log('[KnowledgeActions] knowledge.actions.js loaded');
