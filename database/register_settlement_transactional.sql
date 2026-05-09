-- ============================================
-- SUPABASE SQL EDITOR: pega el archivo RAW. NO pegues un diff de GitHub.
-- FUNCIÓN TRANSACCIONAL PARA REGISTRAR LIQUIDACIONES
-- ============================================
-- Garantiza que la liquidación, las aplicaciones de adelantos/descuentos
-- y los abonos de préstamos se guarden de forma atómica (todo o nada).
-- Requiere ejecutar database/add_salary_loan_payments.sql para el ledger
-- formal de préstamos y la función register_loan_payment().
-- ============================================

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
  p_applications JSONB, -- Array de {adjustment_id, applied_amount}
  p_loan_payments JSONB, -- Array de {loan_id, amount, payment_date, note}
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

  -- Validar cada aplicación de adelantos/descuentos antes de insertar.
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

  -- Validar abonos de préstamos antes de insertar la liquidación.
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

  -- Insertar liquidación. p_amount puede ser 0 si la operación solo aplica
  -- descuentos/abonos y no hay sueldo en efectivo/transferencia para pagar.
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

  -- Insertar aplicaciones si existen.
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

  -- Insertar abonos formales de préstamos si existen.
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
