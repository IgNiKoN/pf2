-- =========================================================================
-- 019: ТЗ-4 — справочник видов работ и связки названий как ДАННЫЕ
--      (VOR-012, VOR-013). Ведёт ПТО; утверждения новых видов РП нет — решение владельца.
-- =========================================================================
-- Зачем: сейчас 15 видов работ лежат в коде (`domain/reference.ts`), и на реальной форме
--   всё, что не совпало, навсегда остаётся «не сопоставлено». Справочник переезжает в данные:
--   ПТО правит его сам, без релиза, а связка «название в форме → вид работ» запоминается и
--   применяется в следующих импортах той же формы.
--
-- Уровень: справочник **корпоративный**, а не по объекту (ТЗ §14, вопрос 1). RBI одтеночный,
--   поэтому используется `company_id = 'rbi'` — как в `rbi_company_settings`. Отклонение от
--   инструкций construction-platform п.7 (tenant + FORCE RLS) зафиксировано в ADR-016.
--
-- ВЫПОЛНЯТЬ ВРУЧНУЮ в Supabase SQL Editor. Идемпотентно.
-- Время записи ставит триггер `plan_fact_touch_updated_at()` из sql/018 — повторно не создаём,
--   только вешаем на новые таблицы.
-- =========================================================================

-- ───────────────────────────── справочник работ ─────────────────────────────

CREATE TABLE IF NOT EXISTS plan_fact_works (
    id          text PRIMARY KEY,
    company_id  text NOT NULL DEFAULT 'rbi',
    code        text NOT NULL DEFAULT '',
    name        text NOT NULL,
    unit        text NOT NULL DEFAULT '',
    stage       text NOT NULL DEFAULT '',
    group_name  text NOT NULL DEFAULT '',
    calc_rule   text NOT NULL DEFAULT '',
    revision    integer NOT NULL DEFAULT 1,
    is_active   boolean NOT NULL DEFAULT true,
    source      text NOT NULL DEFAULT 'pto',
    created_by  text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    is_deleted  boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE plan_fact_works IS
    'Справочник видов работ (ТЗ VOR-012): код, название, единица, этап, правило расчёта, версия. Ведёт ПТО';
COMMENT ON COLUMN plan_fact_works.source IS
    'builtin — начальное наполнение из кода, pto — заведено или изменено ПТО';
COMMENT ON COLUMN plan_fact_works.revision IS
    'Версия записи: увеличивается при правке, чтобы видеть, что методика менялась';

-- Один и тот же вид работ не должен дублироваться в разном регистре.
CREATE UNIQUE INDEX IF NOT EXISTS plan_fact_works_name_unique
    ON plan_fact_works (company_id, lower(name)) WHERE is_deleted = false;

-- ─────────────── связки «название в форме → вид работ» (VOR-013) ────────────

CREATE TABLE IF NOT EXISTS plan_fact_work_aliases (
    id               text PRIMARY KEY,
    company_id       text NOT NULL DEFAULT 'rbi',
    work_id          text NOT NULL,
    alias            text NOT NULL,
    normalized_alias text NOT NULL,
    source           text NOT NULL DEFAULT 'pto',
    created_by       text NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    is_deleted       boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE plan_fact_work_aliases IS
    'Связки названий: как работа названа в форме заказчика → вид работ справочника. Заполняются ПТО вручную или из подтверждённых совпадений';
COMMENT ON COLUMN plan_fact_work_aliases.normalized_alias IS
    'Нормализованное название для поиска: регистр, пробелы и ё/е приведены к одному виду';

CREATE UNIQUE INDEX IF NOT EXISTS plan_fact_work_aliases_unique
    ON plan_fact_work_aliases (company_id, normalized_alias) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS plan_fact_work_aliases_work_idx
    ON plan_fact_work_aliases (company_id, work_id);

-- ─────────────── индексы под постраничный приём из облака ───────────────────

CREATE INDEX IF NOT EXISTS plan_fact_works_pull_idx
    ON plan_fact_works (company_id, updated_at, id);
CREATE INDEX IF NOT EXISTS plan_fact_work_aliases_pull_idx
    ON plan_fact_work_aliases (company_id, updated_at, id);

-- ───────────────── время записи (тот же триггер, что в sql/018) ─────────────

DO $$
DECLARE
    tbl  text;
    list text[] := ARRAY['plan_fact_works', 'plan_fact_work_aliases'];
BEGIN
    FOREACH tbl IN ARRAY list LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I;', tbl || '_touch_updated_at', tbl);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW '
            || 'EXECUTE FUNCTION plan_fact_touch_updated_at();',
            tbl || '_touch_updated_at', tbl
        );
    END LOOP;
END $$;

-- ───────────── доступ: справочник компании, только authenticated ────────────

DO $$
DECLARE
    tbl  text;
    list text[] := ARRAY['plan_fact_works', 'plan_fact_work_aliases'];
BEGIN
    FOREACH tbl IN ARRAY list LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);

        EXECUTE format('DROP POLICY IF EXISTS "%s_select_company" ON %I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY "%s_select_company" ON %I FOR SELECT TO authenticated '
            || 'USING (company_id = ''rbi'' AND rbi_is_approved());',
            tbl, tbl
        );

        EXECUTE format('DROP POLICY IF EXISTS "%s_write_company" ON %I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY "%s_write_company" ON %I FOR ALL TO authenticated '
            || 'USING (company_id = ''rbi'' AND rbi_is_approved()) '
            || 'WITH CHECK (company_id = ''rbi'' AND rbi_is_approved());',
            tbl, tbl
        );

        EXECUTE format('REVOKE ALL ON %I FROM anon;', tbl);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', tbl);
    END LOOP;
END $$;

-- =========================================================================
-- После применения: справочник и связки живут в облаке и доступны всем
--   участникам (в отличие от объекта — справочник корпоративный).
--   Тонкие права «кто ПТО» остаются клиентскими (`canManageWorks`) — ADR-016.
-- =========================================================================
