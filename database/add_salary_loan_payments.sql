-- ============================================
-- SUPABASE SQL EDITOR: pega el archivo RAW. NO pegues un diff de GitHub.
-- LEDGER FORMAL DE ABONOS DE PRÉSTAMOS
-- ============================================
-- Ejecutar en Supabase antes de usar el botón "Guardar abono del préstamo".
-- Los préstamos siguen naciendo en salary_adjustments con type = 'loan', pero
-- el saldo ya no debe obtenerse editando amount. El saldo pendiente es:
--   salary_adjustments.amount - SUM(salary_loan_payments.amount)
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

-- Estado explícito para adelantos/descuentos y préstamos sin borrar historial.
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
