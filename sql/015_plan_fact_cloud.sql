-- =========================================================================
-- 015: модуль plan-fact (План/Факт СМР) — облачные таблицы ВОР, факта,
--      реестра норм и рабочего календаря.
-- =========================================================================
-- Зачем: ВОР, факт прораба, нормы ПТО и календарь компании существуют только
--   на устройстве (стораджи plan_fact_* в IndexedDB). Пока их нет в облаке,
--   факт одного прораба не увидит другой, а потеря устройства = потеря данных:
--   для пилота это блокирующее ограничение.
--
-- ВЫПОЛНЯТЬ ВРУЧНУЮ в Supabase SQL Editor: DDL недоступен anon-ключу
--   (так же, как sql/014). Приложение таблицы не создаёт.
--
-- Принципы (как в остальных sql/0xx):
--   1. Идемпотентно: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS.
--   2. Область доступа: только authenticated; строки ограничены проектом
--      (`rbi_current_project_code()`) и подтверждённым доступом (`rbi_is_approved()`),
--      функции уже живут на проде (см. _ai/supabase/LIVE_INVENTORY.md).
--   3. anon доступа НЕ получает: черновики ВОР и факт — рабочие данные компании.
--      Это строже текущей схемы sql/002 (там anon читает всё) и не ломает
--      существующие приложения: таблицы новые.
--   4. Числа — numeric, не float: правило проекта «числа только decimal».
--   5. Факт не перезаписывается: `corrects_id` + `superseded_by` + `revision`
--      описаны в схеме, а не только в клиенте.
-- =========================================================================

-- ─────────────────────────── импорты форм заказчика ─────────────────────────

CREATE TABLE IF NOT EXISTS plan_fact_imports (
    id            text PRIMARY KEY,
    project_code  text NOT NULL,
    object_id     text NOT NULL,
    filename      text NOT NULL DEFAULT '',
    sheet         text NOT NULL DEFAULT '',
    profile_id    text NOT NULL DEFAULT '',
    profile_title text NOT NULL DEFAULT '',
    stats         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE plan_fact_imports IS
    'Разобранная форма заказчика: файл, лист, профиль раскладки и статистика разбора (plan-fact, ПФ-2)';
COMMENT ON COLUMN plan_fact_imports.object_id IS
    'Идентификатор объекта локаций (location_nodes, nodeType=object) в строках приложения';

-- ────────────────────────────── позиции ВОР ─────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_fact_wor (
    id            text PRIMARY KEY,
    project_code  text NOT NULL,
    object_id     text NOT NULL,
    import_id     text,
    section       text NOT NULL DEFAULT '',
    floor         text NOT NULL DEFAULT '',
    place         text NOT NULL DEFAULT '',
    work_raw      text NOT NULL DEFAULT '',
    work_id       text,
    work_match    text NOT NULL DEFAULT 'auto',
    match_reason  text NOT NULL DEFAULT '',
    unit_raw      text NOT NULL DEFAULT '',
    unit          text,
    quantity      numeric(20,6) NOT NULL,
    sheet         text NOT NULL DEFAULT '',
    row_number    integer,
    column_number integer,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE plan_fact_wor IS
    'Позиция ВОР: место, вид работ, единица и объём. Объём — numeric, потому что decimal';
COMMENT ON COLUMN plan_fact_wor.row_number IS
    'Строка исходного файла — происхождение позиции проверяемо (правило проекта)';

-- ────────────────────────── факт выполнения (сторно) ────────────────────────

CREATE TABLE IF NOT EXISTS plan_fact_facts (
    id            text PRIMARY KEY,
    project_code  text NOT NULL,
    object_id     text NOT NULL,
    section       text NOT NULL DEFAULT '',
    floor         text NOT NULL DEFAULT '',
    place         text NOT NULL DEFAULT '',
    work_key      text,
    work_raw      text NOT NULL DEFAULT '',
    unit          text NOT NULL DEFAULT '',
    quantity      numeric(20,6) NOT NULL,
    fact_date     date NOT NULL,
    comment       text NOT NULL DEFAULT '',
    author        text NOT NULL DEFAULT '',
    status        text NOT NULL DEFAULT 'pending',
    corrects_id   text REFERENCES plan_fact_facts(id),
    superseded_by text,
    revision      integer NOT NULL DEFAULT 1,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE plan_fact_facts IS
    'Факт выполнения работ. Записи не перезаписываются: исправление — новая запись corrects_id, исходная получает superseded_by (сторно)';
COMMENT ON COLUMN plan_fact_facts.status IS
    'pending — ждёт отправки в облако; handed_over — передано';

-- ───────────────────────── реестр норм (ведёт ПТО) ──────────────────────────

CREATE TABLE IF NOT EXISTS plan_fact_norms (
    id            text PRIMARY KEY,
    project_code  text NOT NULL,
    work_key      text NOT NULL,
    name          text NOT NULL DEFAULT '',
    unit          text NOT NULL DEFAULT '',
    norm          numeric(20,6) NOT NULL,
    crew          integer NOT NULL DEFAULT 1,
    lag           numeric(10,3) NOT NULL DEFAULT 0,
    rank          integer NOT NULL DEFAULT 0,
    source        text NOT NULL DEFAULT 'customer_form',
    confirmed_by  text,
    confirmed_at  timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE plan_fact_norms IS
    'Нормы выработки. source=customer_form — агрегатная норма заказчика (черновик), source=pto — норму задал ПТО (подтверждена)';

-- ───────────────────────── рабочий календарь компании ───────────────────────

CREATE TABLE IF NOT EXISTS plan_fact_calendar (
    id               text PRIMARY KEY DEFAULT 'company',
    project_code     text NOT NULL,
    work_week        integer NOT NULL DEFAULT 5,
    non_working_days text[] NOT NULL DEFAULT '{}',
    updated_by       text NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    is_deleted       boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE plan_fact_calendar IS
    'Рабочая неделя и нерабочие даты (праздники, переносы) — данные компании, влияют на календарную дату окончания';

-- ──────────────────────────────── индексы ───────────────────────────────────

CREATE INDEX IF NOT EXISTS plan_fact_imports_object_idx ON plan_fact_imports (project_code, object_id);
CREATE INDEX IF NOT EXISTS plan_fact_wor_object_idx     ON plan_fact_wor (project_code, object_id);
CREATE INDEX IF NOT EXISTS plan_fact_wor_import_idx     ON plan_fact_wor (import_id);
CREATE INDEX IF NOT EXISTS plan_fact_facts_object_idx   ON plan_fact_facts (project_code, object_id);
CREATE INDEX IF NOT EXISTS plan_fact_facts_active_idx   ON plan_fact_facts (object_id, work_key) WHERE superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS plan_fact_norms_project_idx   ON plan_fact_norms (project_code, work_key);
-- Календарь — одна строка на проект; отдельного индекса не требует.

-- ───────────────────────── доступ: RLS по проекту ───────────────────────────
-- Строки видны и правятся только в своём проекте и только подтверждённым
-- пользователям. anon не получает ни строки и ни одного гранта.

DO $$
DECLARE
    tbl  text;
    list text[] := ARRAY[
        'plan_fact_imports', 'plan_fact_wor', 'plan_fact_facts',
        'plan_fact_norms', 'plan_fact_calendar'
    ];
BEGIN
    FOREACH tbl IN ARRAY list LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);

        EXECUTE format('DROP POLICY IF EXISTS "%s_select_project" ON %I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY "%s_select_project" ON %I FOR SELECT TO authenticated '
            || 'USING (project_code = rbi_current_project_code() AND rbi_is_approved());',
            tbl, tbl
        );

        EXECUTE format('DROP POLICY IF EXISTS "%s_write_project" ON %I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY "%s_write_project" ON %I FOR ALL TO authenticated '
            || 'USING (project_code = rbi_current_project_code() AND rbi_is_approved()) '
            || 'WITH CHECK (project_code = rbi_current_project_code() AND rbi_is_approved());',
            tbl, tbl
        );

        -- anon не получает ничего: это рабочие данные компании.
        EXECUTE format('REVOKE ALL ON %I FROM anon;', tbl);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', tbl);
    END LOOP;
END $$;

-- =========================================================================
-- После применения: проверить, что таблицы видны приложению —
--   node _ai/scripts/... (проверка синхронизации plan-fact)
-- или в приложении: раздел «ПРОРАБ» → внести факт → «Отправить» (появится
-- после блока push/pull). До применения миграции кнопка отправки недоступна.
-- =========================================================================
