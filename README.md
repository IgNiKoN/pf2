# RBI Quality Pro → RBI Platform — рефакторинг

Пошаговый перевод текущего приложения RBI Quality Pro на целевую
платформенную архитектуру RBI Platform. Правила и контекст — в `_ai/`.

## Рабочий цикл (2 роли)

1. **Архитектор** (`_ai/agents/architect.rule.md`, запрос — `_ai/agents/architect.prompt.md`) —
   читает ежедневный контекст, выбирает один следующий крупный блок,
   записывает план в `_ai/current_plan.md` и краткую версию в
   `_ai/agent-reports/LATEST_ARCHITECT_PLAN.md`. Код не меняет.
2. **Исполнитель** (`_ai/agents/implementer.rule.md`, запрос — `_ai/agents/implementer.prompt.md`) —
   выполняет строго план Архитектора, ничего сверх списка «Можно
   изменить»/«Можно создать», проводит проверки, дописывает
   `_ai/CURRENT_STEP.md` и `_ai/agent-reports/LATEST_EXECUTOR_REPORT.md`.

Для отдельно сложных/рискованных блоков (critical шаги — App Shell,
Auth Gate, Module Loader, sync/storage, миграция данных) можно
дополнительно привлечь роли **Тестер** (`_ai/agents/tester.rule.md`)
и **Документер** (`_ai/agents/documenter.rule.md`) — не обязательная
часть обычного цикла, вызываются вручную при необходимости.

## Как использовать

1. Открыть проект в Cursor.
2. Скопировать промпт из `_ai/agents/architect.prompt.md` в чат — получить план следующего блока.
3. Подтвердить план (или обсудить/скорректировать).
4. Скопировать промпт из `_ai/agents/implementer.prompt.md` — выполнить план.
5. Проверить отчёт исполнителя, при критичных шагах — подтвердить после smoke-check перед следующим блоком.

## Главное правило

Не просить реализовать весь рефакторинг одним запросом. Один блок —
один законченный крупный результат (см. `_ai/PROJECT_RULES.md`,
раздел «Размер блока»).

## Документация приложения

- [`docs/APP_GUIDE.md`](docs/APP_GUIDE.md) — что это за продукт, модули, как пользоваться картой `_ai/`.
- [`_ai/supabase/LIVE_INVENTORY.md`](_ai/supabase/LIVE_INVENTORY.md) — живой снимок Supabase (таблицы / RLS / buckets / counts). Как обновить: [`_ai/supabase/README.md`](_ai/supabase/README.md).

## Ключевые файлы контекста

- `_ai/ARCHITECTURE_BRIEF.md` — ежедневный контекст, читать первым.
- `_ai/current_plan.md` — план текущего блока.
- `_ai/CURRENT_STEP.md` — история выполненных шагов.
- `_ai/PLATFORM_TARGET_ARCHITECTURE.md` — полная целевая архитектура (читать не каждый блок).
- `_ai/SERVICES_API.md` — справочник сервисов.
- `_ai/PROJECT_RULES.md` — общие правила для всех ролей.
- `_ai/PROJECT_CARD.md` — карточка проекта: организационные вехи, риски, команда, права на платформу, этапы 2–6 (после Platform Foundation). Бизнес-документ, не технический контекст для рефакторинга.
