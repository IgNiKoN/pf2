-- =========================================================================
-- 017: ТЗ-2 — контуры объёмов, предложение ПТО, утверждение РП, baseline,
--      change request и аудит решений (ТЗ VOR-016, VOR-026…VOR-029, VOR-031).
-- =========================================================================
-- Зачем: сейчас у позиции ВОР один объём (из формы заказчика) и факт. ТЗ требует
--   пять независимых контуров — V_RD, V_CONTRACT, V_PROPOSED, V_APPROVED, V_FACT —
--   плюс отдельно V_CUSTOMER_ACCEPTED, и запрет считать незаполненное нулём.
--   Утверждать (VOR-026…VOR-028) и аудитировать (VOR-029) нечего, пока контуров нет.
--
-- ВЫПОЛНЯТЬ ВРУЧНУЮ в Supabase SQL Editor: DDL недоступен anon-ключу (как sql/014, sql/015).
-- Создаёт ВСЮ модель ТЗ-2 сразу, чтобы владельцу не применять схему дважды: блок ТЗ-2
-- сначала использует только контуры, предложения/утверждение/baseline — следующим шагом.
--
-- Принципы (как в sql/015):
--   1. Идемпотентно: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS.
--   2. Доступ только authenticated, строки ограничены проектом и подтверждённым доступом.
--   3. anon не получает ничего.
--   4. Числа — numeric, не float.
--   5. Происхождение и решения фиксируются: аудит append-only, baseline неизменяем
--      (это гарантируется триггерами, а не только клиентом — ТЗ VOR-028/029).
-- =========================================================================

-- ───────────────────── контуры объёмов: один объём на вид ───────────────────

CREATE TABLE IF NOT EXISTS plan_fact_wor_quantities (
    id            text PRIMARY KEY,
    project_code  text NOT NULL,
    object_id     text NOT NULL DEFAULT '',
    wor_item_id   text NOT NULL,
    quantity_kind text NOT NULL CHECK (quantity_kind IN (
                      'RD', 'CONTRACT', 'PROPOSED', 'APPROVED', 'FACT', 'CUSTOMER_ACCEPTED')),
    quantity      numeric(20,6) NOT NULL,
    source        text NOT NULL DEFAULT '',
    method        text NOT NULL DEFAULT '',
    note          text NOT NULL DEFAULT '',
    updated_by    text NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE plan_fact_wor_quantities IS
    'Контуры объёмов ТЗ VOR-016: RD, CONTRACT, PROPOSED, APPROVED, FACT, CUSTOMER_ACCEPTED. Отсутствие строки = объём не заполнен (не 0)';
COMMENT ON COLUMN plan_fact_wor_quantities.object_id IS
    'Объект позиции: нужен, чтобы читать контуры по объекту без соединения с ВОР';
COMMENT ON COLUMN plan_fact_wor_quantities.quantity IS
    'Объём в единице позиции. Отрицательное значение допустимо только как отдельная корректировка (ТЗ VOR-023)';

-- Один объём на пару «позиция + вид»: история изменений уходит в аудит.
CREATE UNIQUE INDEX IF NOT EXISTS plan_fact_wor_quantities_unique
    ON plan_fact_wor_quantities (project_code, wor_item_id, quantity_kind)
    WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS plan_fact_wor_quantities_item_idx
    ON plan_fact_wor_quantities (project_code, wor_item_id);

-- ───────────── предложение ПТО и решение РП (ТЗ VOR-026…VOR-028) ────────────

CREATE TABLE IF NOT EXISTS plan_fact_proposals (
    id              text PRIMARY KEY,
    project_code    text NOT NULL,
    object_id       text NOT NULL,
    title           text NOT NULL DEFAULT '',
    status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'returned', 'rejected', 'approved')),
    submitted_by    text NOT NULL DEFAULT '',
    submitted_at    timestamptz,
    decided_by      text NOT NULL DEFAULT '',
    decided_at      timestamptz,
    decision_reason text NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    is_deleted      boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE plan_fact_proposals IS
    'Пакет ПТО на утверждение РП (ТЗ VOR-026): черновик → направлен → утверждён/возвращён/отклонён';

CREATE TABLE IF NOT EXISTS plan_fact_proposal_rows (
    id            text PRIMARY KEY,
    project_code  text NOT NULL,
    proposal_id   text NOT NULL REFERENCES plan_fact_proposals(id),
    wor_item_id   text NOT NULL,
    quantity      numeric(20,6) NOT NULL,
    note          text NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE plan_fact_proposal_rows IS
    'Позиции пакета ПТО с предлагаемым объёмом (контур PROPOSED)';

-- ────────────── baseline и корректировки (ТЗ VOR-028, VOR-031) ──────────────

CREATE TABLE IF NOT EXISTS plan_fact_baselines (
    id           text PRIMARY KEY,
    project_code text NOT NULL,
    object_id    text NOT NULL,
    proposal_id  text,
    approved_by  text NOT NULL DEFAULT '',
    approved_at  timestamptz NOT NULL DEFAULT now(),
    snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE plan_fact_baselines IS
    'Неизменяемый снимок утверждённого производственного плана. UPDATE/DELETE запрещены триггером (ТЗ VOR-028)';

CREATE TABLE IF NOT EXISTS plan_fact_change_requests (
    id            text PRIMARY KEY,
    project_code  text NOT NULL,
    baseline_id   text,
    wor_item_id   text NOT NULL,
    quantity_kind text NOT NULL,
    qty_before    numeric(20,6),
    qty_after     numeric(20,6) NOT NULL,
    reason        text NOT NULL DEFAULT '',
    status        text NOT NULL DEFAULT 'created'
                  CHECK (status IN ('created', 'checked', 'approved', 'rejected', 'effective')),
    created_by    text NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    checked_by    text NOT NULL DEFAULT '',
    decided_by    text NOT NULL DEFAULT '',
    decided_at    timestamptz,
    effective_at  timestamptz,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    is_deleted    boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE plan_fact_change_requests IS
    'Корректировка утверждённого объёма (ТЗ VOR-028): причина, было/стало, проверка ПТО, решение РП';

-- ───────────────────────── аудит решений (ТЗ VOR-029) ───────────────────────

CREATE TABLE IF NOT EXISTS plan_fact_audit (
    id           bigserial PRIMARY KEY,
    project_code text NOT NULL,
    entity       text NOT NULL,
    entity_id    text NOT NULL,
    action       text NOT NULL,
    actor        text NOT NULL DEFAULT '',
    reason       text NOT NULL DEFAULT '',
    before_value jsonb,
    after_value  jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE plan_fact_audit IS
    'Аудит решений и изменений: кто, когда, почему, до/после. Append-only — UPDATE/DELETE запрещены триггером (ТЗ VOR-029)';

CREATE INDEX IF NOT EXISTS plan_fact_audit_entity_idx ON plan_fact_audit (project_code, entity, entity_id);

-- Индексы под RLS: политика фильтрует по project_code, без индекса это скан.
CREATE INDEX IF NOT EXISTS plan_fact_proposals_project_idx        ON plan_fact_proposals (project_code, object_id);
CREATE INDEX IF NOT EXISTS plan_fact_proposal_rows_project_idx    ON plan_fact_proposal_rows (project_code, proposal_id);
CREATE INDEX IF NOT EXISTS plan_fact_baselines_project_idx        ON plan_fact_baselines (project_code, object_id);
CREATE INDEX IF NOT EXISTS plan_fact_change_requests_project_idx  ON plan_fact_change_requests (project_code, wor_item_id);

-- ─────────── неизменяемость: baseline и аудит (а не только клиент) ──────────

CREATE OR REPLACE FUNCTION plan_fact_block_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Запись неизменяема (ТЗ VOR-028/VOR-029): % в % запрещено', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_fact_baselines_immutable ON plan_fact_baselines;
CREATE TRIGGER plan_fact_baselines_immutable
    BEFORE UPDATE OR DELETE ON plan_fact_baselines
    FOR EACH ROW EXECUTE FUNCTION plan_fact_block_mutation();

DROP TRIGGER IF EXISTS plan_fact_audit_immutable ON plan_fact_audit;
CREATE TRIGGER plan_fact_audit_immutable
    BEFORE UPDATE OR DELETE ON plan_fact_audit
    FOR EACH ROW EXECUTE FUNCTION plan_fact_block_mutation();

-- ───────────────────────── доступ: RLS по проекту ───────────────────────────

DO $$
DECLARE
    tbl  text;
    list text[] := ARRAY[
        'plan_fact_wor_quantities', 'plan_fact_proposals', 'plan_fact_proposal_rows',
        'plan_fact_baselines', 'plan_fact_change_requests', 'plan_fact_audit'
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

        -- Аудит и baseline: только вставка и чтение — UPDATE/DELETE закрыты триггером и политикой.
        IF tbl IN ('plan_fact_audit', 'plan_fact_baselines') THEN
            EXECUTE format('DROP POLICY IF EXISTS "%s_insert_project" ON %I;', tbl, tbl);
            EXECUTE format(
                'CREATE POLICY "%s_insert_project" ON %I FOR INSERT TO authenticated '
                || 'WITH CHECK (project_code = rbi_current_project_code() AND rbi_is_approved());',
                tbl, tbl
            );
        ELSE
            EXECUTE format('DROP POLICY IF EXISTS "%s_write_project" ON %I;', tbl, tbl);
            EXECUTE format(
                'CREATE POLICY "%s_write_project" ON %I FOR ALL TO authenticated '
                || 'USING (project_code = rbi_current_project_code() AND rbi_is_approved()) '
                || 'WITH CHECK (project_code = rbi_current_project_code() AND rbi_is_approved());',
                tbl, tbl
            );
        END IF;

        EXECUTE format('REVOKE ALL ON %I FROM anon;', tbl);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', tbl);
    END LOOP;

    -- bigserial в аудите требует прав на последовательность.
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE plan_fact_audit_id_seq TO authenticated;';
END $$;

-- =========================================================================
-- После применения: блок ТЗ-2 «контуры объёмов» начнёт сохранять RD, договор,
-- предложено, утверждено и принято заказчиком; интерфейс покажет расхождения
-- между контурами. Пустое значение остаётся пустым — нулём оно не считается.
-- =========================================================================
