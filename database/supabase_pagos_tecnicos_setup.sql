-- ============================================
-- SETUP COMPLETO PARA SUPABASE SQL EDITOR
-- Sistema de pagos técnicos: abonos de préstamos + liquidaciones transaccionales
-- ============================================
-- IMPORTANTE:
-- 1. Pega en Supabase SQL Editor este archivo RAW, no un diff de GitHub.
-- 2. Si el texto empieza con "diff --git", "+++", "---" o líneas con "+",
--    NO es SQL válido y Supabase fallará con syntax error at or near "diff".
-- 3. Este script incluye, en orden:
--    - Tabla salary_loan_payments
--    - Campos de estado en salary_adjustments
--    - Funciones refresh_salary_adjustment_status y register_loan_payment
--    - RLS de salary_loan_payments
--    - Función register_settlement_with_applications actualizada
-- ============================================

CREATE TABLE IF NOT EXISTS salary_loan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES salary_adjustments(id) ON DELETE RESTRICT,
  technician_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  settlement_id UUID REFERENCES salary_settlements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_loan_payments_loan_id
  ON salary_loan_payments(loan_id);

CREATE INDEX IF NOT EXISTS idx_salary_loan_payments_technician_id
  ON salary_loan_payments(technician_id);

CREATE INDEX IF NOT EXISTS idx_salary_loan_payments_settlement_id
  ON salary_loan_payments(settlement_id);

ALTER TABLE salary_adjustments
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE salary_adjustments
  DROP CONSTRAINT IF EXISTS salary_adjustments_status_check;

ALTER TABLE salary_adjustments
  ADD CONSTRAINT salary_adjustments_status_check
  CHECK (status IN ('pending', 'partial', 'settled'));

COMMENT ON TABLE salary_loan_payments IS
'Ledger formal de abonos de préstamos. No editar salary_adjustments.amount para registrar abonos.';

COMMENT ON COLUMN salary_adjustments.status IS
'Estado del ajuste: pending, partial o settled. Los registros se conservan como historial.';

CREATE OR REPLACE FUNCTION refresh_salary_adjustment_status(
  p_adjustment_id UUID,
  p_actor UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_type TEXT;
  v_amount NUMERIC;
  v_paid NUMERIC;
  v_new_status TEXT;
BEGIN
  v_type := (
    SELECT "type"
    FROM salary_adjustments
    WHERE id = p_adjustment_id
  );

  v_amount := (
    SELECT amount
    FROM salary_adjustments
    WHERE id = p_adjustment_id
  );

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Ajuste % no existe', p_adjustment_id;
  END IF;

  IF v_type = 'loan' THEN
    v_paid := (
      SELECT COALESCE(SUM(amount), 0)
      FROM salary_loan_payments
      WHERE loan_id = p_adjustment_id
    );
  ELSE
    v_paid := (
      SELECT COALESCE(SUM(applied_amount), 0)
      FROM salary_adjustment_applications
      WHERE adjustment_id = p_adjustment_id
    );
  END IF;

  IF v_paid <= 0 THEN
    v_new_status := 'pending';
  ELSIF v_paid >= v_amount THEN
    v_new_status := 'settled';
  ELSE
    v_new_status := 'partial';
  END IF;

  UPDATE salary_adjustments
  SET status = v_new_status,
      settled_at = CASE WHEN v_new_status = 'settled' THEN COALESCE(settled_at, NOW()) ELSE NULL END,
      settled_by = CASE WHEN v_new_status = 'settled' THEN COALESCE(settled_by, p_actor) ELSE NULL END
  WHERE id = p_adjustment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP FUNCTION IF EXISTS register_loan_payment(UUID, UUID, NUMERIC, DATE, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION register_loan_payment(
  p_loan_id UUID,
  p_technician_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_note TEXT DEFAULT NULL,
  p_settlement_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_loan_total NUMERIC;
  v_current_paid NUMERIC;
  v_payment_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El abono debe ser mayor a 0';
  END IF;

  v_loan_total := (
    SELECT amount
    FROM salary_adjustments
    WHERE id = p_loan_id
      AND technician_id = p_technician_id
      AND "type" = 'loan'
  );

  IF v_loan_total IS NULL THEN
    RAISE EXCEPTION 'Préstamo % no existe o no pertenece al técnico %', p_loan_id, p_technician_id;
  END IF;

  v_current_paid := (
    SELECT COALESCE(SUM(amount), 0)
    FROM salary_loan_payments
    WHERE loan_id = p_loan_id
  );

  IF (v_current_paid + p_amount) > v_loan_total THEN
    RAISE EXCEPTION 'El abono excede el saldo del préstamo. Pagado: %, Nuevo: %, Total: %',
      v_current_paid, p_amount, v_loan_total;
  END IF;

  INSERT INTO salary_loan_payments (
    loan_id,
    technician_id,
    amount,
    payment_date,
    note,
    settlement_id,
    created_by
  ) VALUES (
    p_loan_id,
    p_technician_id,
    p_amount,
    COALESCE(p_payment_date, CURRENT_DATE),
    p_note,
    p_settlement_id,
    p_created_by
  ) RETURNING id INTO v_payment_id;

  PERFORM refresh_salary_adjustment_status(p_loan_id, p_created_by);

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE salary_loan_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salary_loan_payments_select_own_or_admin" ON salary_loan_payments;
DROP POLICY IF EXISTS "salary_loan_payments_insert_admin_or_self" ON salary_loan_payments;

CREATE POLICY "salary_loan_payments_select_own_or_admin"
  ON salary_loan_payments FOR SELECT
  USING (
    auth.uid() = technician_id
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "salary_loan_payments_insert_admin_or_self"
  ON salary_loan_payments FOR INSERT
  WITH CHECK (
    auth.uid() = technician_id
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

DROP FUNCTION IF EXISTS register_settlement_with_applications(
  UUID,
  DATE,
  NUMERIC,
  TEXT,
  JSONB,
  JSONB,
  UUID
);

DROP FUNCTION IF EXISTS register_settlement_with_applications(
  UUID,
  DATE,
  NUMERIC,
  TEXT,
  JSONB,
  JSONB,
  JSONB,
  UUID
);

CREATE OR REPLACE FUNCTION register_settlement_with_applications(
  p_technician_id UUID,
  p_week_start DATE,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_details JSONB,
  p_applications JSONB,
  p_loan_payments JSONB,
  p_created_by UUID
) RETURNS UUID AS $$
DECLARE
  v_settlement_id UUID;
  app JSONB;
  loan_payment JSONB;
  v_applied_amount NUMERIC;
  v_adjustment_id UUID;
  v_current_applied NUMERIC;
  v_adjustment_total NUMERIC;
  v_adjustment_type TEXT;
  v_loan_id UUID;
  v_loan_payment_amount NUMERIC;
  v_loan_total NUMERIC;
  v_loan_paid NUMERIC;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'El monto de la liquidación no puede ser negativo: %', p_amount;
  END IF;

  IF p_applications IS NOT NULL AND jsonb_array_length(p_applications) > 0 THEN
    FOR app IN SELECT * FROM jsonb_array_elements(p_applications)
    LOOP
      v_adjustment_id := (app->>'adjustment_id')::UUID;
      v_applied_amount := (app->>'applied_amount')::NUMERIC;

      v_adjustment_total := (
        SELECT amount
        FROM salary_adjustments
        WHERE id = v_adjustment_id
          AND technician_id = p_technician_id
      );

      v_adjustment_type := (
        SELECT "type"
        FROM salary_adjustments
        WHERE id = v_adjustment_id
          AND technician_id = p_technician_id
      );

      IF v_adjustment_total IS NULL THEN
        RAISE EXCEPTION 'Ajuste % no existe o no pertenece al técnico %', v_adjustment_id, p_technician_id;
      END IF;

      IF v_adjustment_type = 'loan' THEN
        RAISE EXCEPTION 'El préstamo % no puede registrarse como aplicación de adelanto/descuento', v_adjustment_id;
      END IF;

      v_current_applied := (
        SELECT COALESCE(SUM(applied_amount), 0)
        FROM salary_adjustment_applications
        WHERE adjustment_id = v_adjustment_id
      );

      IF (v_current_applied + v_applied_amount) > v_adjustment_total THEN
        RAISE EXCEPTION 'Aplicación excede el monto del ajuste. Ajuste: %, Aplicado: %, Nuevo: %, Total: %',
          v_adjustment_id, v_current_applied, v_applied_amount, v_adjustment_total;
      END IF;

      IF v_applied_amount <= 0 THEN
        RAISE EXCEPTION 'El monto aplicado debe ser mayor a 0. Ajuste: %, Monto: %', v_adjustment_id, v_applied_amount;
      END IF;
    END LOOP;
  END IF;

  IF p_loan_payments IS NOT NULL AND jsonb_array_length(p_loan_payments) > 0 THEN
    FOR loan_payment IN SELECT * FROM jsonb_array_elements(p_loan_payments)
    LOOP
      v_loan_id := (loan_payment->>'loan_id')::UUID;
      v_loan_payment_amount := (loan_payment->>'amount')::NUMERIC;

      IF v_loan_payment_amount <= 0 THEN
        RAISE EXCEPTION 'El abono del préstamo debe ser mayor a 0. Préstamo: %, Monto: %',
          v_loan_id, v_loan_payment_amount;
      END IF;

      v_loan_total := (
        SELECT amount
        FROM salary_adjustments
        WHERE id = v_loan_id
          AND technician_id = p_technician_id
          AND "type" = 'loan'
      );

      IF v_loan_total IS NULL THEN
        RAISE EXCEPTION 'Préstamo % no existe o no pertenece al técnico %', v_loan_id, p_technician_id;
      END IF;

      v_loan_paid := (
        SELECT COALESCE(SUM(amount), 0)
        FROM salary_loan_payments
        WHERE loan_id = v_loan_id
      );

      IF (v_loan_paid + v_loan_payment_amount) > v_loan_total THEN
        RAISE EXCEPTION 'El abono excede el saldo del préstamo. Préstamo: %, Pagado: %, Nuevo: %, Total: %',
          v_loan_id, v_loan_paid, v_loan_payment_amount, v_loan_total;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO salary_settlements (
    technician_id,
    week_start,
    amount,
    payment_method,
    details,
    created_by
  ) VALUES (
    p_technician_id,
    p_week_start,
    p_amount,
    p_payment_method,
    p_details,
    p_created_by
  ) RETURNING id INTO v_settlement_id;

  IF p_applications IS NOT NULL AND jsonb_array_length(p_applications) > 0 THEN
    FOR app IN SELECT * FROM jsonb_array_elements(p_applications)
    LOOP
      v_adjustment_id := (app->>'adjustment_id')::UUID;

      INSERT INTO salary_adjustment_applications (
        adjustment_id,
        technician_id,
        applied_amount,
        week_start,
        created_by
      ) VALUES (
        v_adjustment_id,
        p_technician_id,
        (app->>'applied_amount')::NUMERIC,
        p_week_start,
        p_created_by
      );

      PERFORM refresh_salary_adjustment_status(v_adjustment_id, p_created_by);
    END LOOP;
  END IF;

  IF p_loan_payments IS NOT NULL AND jsonb_array_length(p_loan_payments) > 0 THEN
    FOR loan_payment IN SELECT * FROM jsonb_array_elements(p_loan_payments)
    LOOP
      PERFORM register_loan_payment(
        (loan_payment->>'loan_id')::UUID,
        p_technician_id,
        (loan_payment->>'amount')::NUMERIC,
        COALESCE((loan_payment->>'payment_date')::DATE, CURRENT_DATE),
        NULLIF(loan_payment->>'note', ''),
        v_settlement_id,
        p_created_by
      );
    END LOOP;
  END IF;

  RETURN v_settlement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION register_settlement_with_applications(UUID, DATE, NUMERIC, TEXT, JSONB, JSONB, JSONB, UUID) IS
'Registra una liquidación, aplicaciones de ajustes y abonos de préstamos de forma transaccional. Si falla cualquier parte, se hace rollback completo.';
