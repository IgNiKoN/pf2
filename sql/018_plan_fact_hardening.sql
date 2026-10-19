-- =========================================================================
-- 018: hardening plan-fact — неизменяемость для ролей приложения, updated_at
--      на стороне базы и индексы под инкрементальный приём.
-- =========================================================================
-- Зачем:
--   1. Триггеры неизменяемости (sql/017) блокировали UPDATE и DELETE **всем**,
--      включая владельца: ошибочную запись аудита нельзя было удалить без
--      ALTER TABLE ... DISABLE TRIGGER. Защита приложения при этом не нужна —
--      она уже обеспечена политиками RLS (у аудита и baseline нет UPDATE/DELETE
--      политик). Эта миграция оставляет триггер как второй слой именно для ролей
--      приложения и возвращает владельцу/service_role возможность исправить ошибку.
--   2. `updated_at` проставлял клиент (и на вставке тоже). Если строку создают или правят
--      вне приложения, время не
--      двигалось, и инкрементальный приём мог такую правку не заметить. Теперь время
--      ставит база триггером.
--   3. Индексы (project_code, updated_at, id) — под постраничный приём из облака.
--
-- ВЫПОЛНЯТЬ ВРУЧНУЮ в Supabase SQL Editor (DDL недоступен anon-ключу).
-- Идемпотентно: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS, CREATE INDEX IF NOT EXISTS.
--
-- Сознательно НЕ делаем: FORCE ROW LEVEL SECURITY. Владелец схемы должен сохранять
--   возможность починить ошибку; изоляция приложения уже обеспечена политиками.
--   Это отклонение от инструкций construction-platform п.7 зафиксировано в ADR-016.
-- =========================================================================

-- ─────────── неизменяемость: только для ролей приложения, не для владельца ───────────

CREATE OR REPLACE FUNCTION plan_fact_block_mutation() RETURNS trigger AS $$
BEGIN
    -- Приложение (authenticated/anon) историю не переписывает.
    IF current_user IN ('authenticated', 'anon') THEN
        RAISE EXCEPTION 'Запись неизменяема (ТЗ VOR-028/VOR-029): % в % запрещено', TG_OP, TG_TABLE_NAME
            USING ERRCODE = 'restrict_violation';
    END IF;
    -- Владелец схемы и сервисная роль могут исправить ошибку: пропускаем операцию.
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────── updated_at ставит база ───────────────────────────

CREATE OR REPLACE FUNCTION plan_fact_touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl  text;
    list text[] := ARRAY[
        'plan_fact_imports', 'plan_fact_wor', 'plan_fact_facts', 'plan_fact_norms',
        'plan_fact_calendar', 'plan_fact_wor_quantities', 'plan_fact_proposals',
        'plan_fact_proposal_rows', 'plan_fact_change_requests'
    ];
BEGIN
    FOREACH tbl IN ARRAY list LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I;', tbl || '_touch_updated_at', tbl);
        -- BEFORE INSERT OR UPDATE: иначе клиент мог прислать старое время при вставке,
        -- и инкрементальный приём (updated_at > since) такую строку просто не заметил бы.
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW '
            || 'EXECUTE FUNCTION plan_fact_touch_updated_at();',
            tbl || '_touch_updated_at', tbl
        );
    END LOOP;
END $$;

-- ─────────────── индексы под постраничный приём из облака ───────────────────

CREATE INDEX IF NOT EXISTS plan_fact_imports_pull_idx  ON plan_fact_imports (project_code, updated_at, id);
CREATE INDEX IF NOT EXISTS plan_fact_wor_pull_idx      ON plan_fact_wor (project_code, updated_at, id);
CREATE INDEX IF NOT EXISTS plan_fact_facts_pull_idx    ON plan_fact_facts (project_code, updated_at, id);
CREATE INDEX IF NOT EXISTS plan_fact_norms_pull_idx    ON plan_fact_norms (project_code, updated_at, id);
CREATE INDEX IF NOT EXISTS plan_fact_calendar_pull_idx ON plan_fact_calendar (project_code, updated_at, id);
CREATE INDEX IF NOT EXISTS plan_fact_quantities_pull_idx ON plan_fact_wor_quantities (project_code, updated_at, id);

-- =========================================================================
-- После применения:
--   * приложение по-прежнему не может переписать или удалить аудит и baseline
--     (политики RLS), а владелец — может, если понадобится исправить ошибку;
--   * время записи теперь ставит база и при вставке, и при правке, поэтому
--     инкрементальный приём видит все изменения, включая сделанные вне приложения;
--   * приём из облака ходит страницами, а не «первые 4000 строк».
--
-- Уборка тестовых строк, оставшихся от проверок (теперь это возможно):
--   delete from plan_fact_audit where entity_id like '__SMOKE_TEST__%';
--   delete from plan_fact_baselines where id like '__SMOKE_TEST__%';
-- =========================================================================
