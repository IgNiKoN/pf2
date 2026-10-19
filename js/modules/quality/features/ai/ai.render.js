// === AI Render — Фаза 19 ===
// Тонкий рендер-диспетчер для AI-модуля.
// ai.js не содержит отдельных render-функций — UI встроен в async-функции
// через DOM-манипуляции. Этот файл предоставляет минимальный публичный API.
// Экспортируется через ES export; публикацию в window.AIRender для legacy-кода
// делает ai.module.js (entry).

import { AIActions } from './ai.actions.js';

const AIRender = {
  openDocChat() {
    return AIActions && AIActions.openDocChat();
  },
  closeDocChat() {
    return AIActions && AIActions.closeDocChat();
  }
};

export { AIRender };
