-- ============================================
-- SCRIPT PARA CORREGIR SALDOS NEGATIVOS DE TÉCNICOS
-- ============================================
-- Este script identifica técnicos con saldo negativo y proporciona
-- opciones para corregirlos ajustando las liquidaciones o creando ajustes de descuento
-- ============================================

-- PASO 1: IDENTIFICAR TÉCNICOS CON SALDO NEGATIVO
-- ============================================
-- Este query muestra todos los técnicos que tienen saldo negativo
-- (se les pagó más de lo que ganaron en alguna semana)

WITH weekly_balances AS (
  SELECT 
    ss.technician_id,
    u.name as technician_name,
    ss.week_start,
    -- Calcular total ganado (comisiones de órdenes pagadas de esa semana)
    COALESCE((
      SELECT SUM(o.commission_amount)
      FROM orders o
      WHERE o.technician_id = ss.technician_id
        AND o.status = 'paid'
        AND (
          (o.payout_week IS NOT NULL AND o.payout_year IS NOT NULL AND
           DATE_TRUNC('week', (ss.week_start::date + INTERVAL '1 day')::date - INTERVAL '1 day')::date = 
           DATE_TRUNC('week', (DATE '2000-01-01' + (o.payout_week || ' weeks')::interval + (o.payout_year - 2000 || ' years')::interval)::date)::date)
          OR
          (o.paid_at IS NOT NULL AND 
           DATE_TRUNC('week', o.paid_at::date) = DATE_TRUNC('week', ss.week_start::date))
        )
    ), 0) as total_earned,
    -- Total de ajustes aplicados (descuentos y adelantos, NO préstamos)
    COALESCE((
      SELECT SUM(saa.applied_amount)
      FROM salary_adjustment_applications saa
      WHERE saa.technician_id = ss.technician_id
        AND saa.week_start = ss.week_start
        AND EXISTS (
          SELECT 1 FROM salary_adjustments sa
          WHERE sa.id = saa.adjustment_id
            AND sa.type != 'loan'
        )
    ), 0) as adjustments_applied,
    -- Total de abonos de préstamos (desde details de settlements)
    COALESCE((
      SELECT SUM((details->>'loan_payments_total')::numeric)
      FROM salary_settlements ss2
      WHERE ss2.technician_id = ss.technician_id
        AND ss2.week_start = ss.week_start
        AND ss2.details IS NOT NULL
        AND ss2.details->>'loan_payments_total' IS NOT NULL
    ), 0) as loan_payments,
    -- Total pagado (suma de todas las liquidaciones de esa semana)
    SUM(ss.amount) as total_paid
  FROM salary_settlements ss
  JOIN users u ON u.id = ss.technician_id
  WHERE u.role = 'technician'
  GROUP BY ss.technician_id, u.name, ss.week_start
)
SELECT 
  technician_id,
  technician_name,
  week_start,
  total_earned,
  adjustments_applied,
  loan_payments,
  total_paid,
  -- Calcular saldo disponible
  (total_earned - adjustments_applied - loan_payments) as net_available,
  -- Calcular saldo después de pagos
  (total_earned - adjustments_applied - loan_payments - total_paid) as final_balance,
  -- Indicar si hay saldo negativo
  CASE 
    WHEN (total_earned - adjustments_applied - loan_payments - total_paid) < 0 
    THEN 'SALDO NEGATIVO'
    ELSE 'OK'
  END as status
FROM weekly_balances
WHERE (total_earned - adjustments_applied - loan_payments - total_paid) < 0
ORDER BY final_balance ASC, technician_name, week_start;

-- ============================================
-- PASO 2: OPCIONES DE CORRECCIÓN
-- ============================================

-- OPCIÓN A: Crear ajustes de descuento para compensar el exceso pagado
-- ============================================
-- Esta opción crea un ajuste de descuento por el monto que se pagó de más
-- Ejemplo para un técnico específico:

/*
DO $$
DECLARE
  v_technician_id UUID := 'REEMPLAZA_CON_EL_ID_DEL_TECNICO';
  v_week_start DATE := '2026-01-XX'; -- Reemplaza con la fecha de la semana problemática
  v_excess_amount NUMERIC;
  v_technician_name TEXT;
BEGIN
  -- Calcular el exceso pagado
  SELECT 
    (total_earned - adjustments_applied - loan_payments - total_paid) * -1,
    u.name
  INTO v_excess_amount, v_technician_name
  FROM (
    SELECT 
      ss.technician_id,
      COALESCE((
        SELECT SUM(o.commission_amount)
        FROM orders o
        WHERE o.technician_id = ss.technician_id
          AND o.status = 'paid'
          AND (
            (o.payout_week IS NOT NULL AND o.payout_year IS NOT NULL AND
             DATE_TRUNC('week', (ss.week_start::date + INTERVAL '1 day')::date - INTERVAL '1 day')::date = 
             DATE_TRUNC('week', (DATE '2000-01-01' + (o.payout_week || ' weeks')::interval + (o.payout_year - 2000 || ' years')::interval)::date)::date)
            OR
            (o.paid_at IS NOT NULL AND 
             DATE_TRUNC('week', o.paid_at::date) = DATE_TRUNC('week', ss.week_start::date))
          )
      ), 0) as total_earned,
      COALESCE((
        SELECT SUM(saa.applied_amount)
        FROM salary_adjustment_applications saa
        WHERE saa.technician_id = ss.technician_id
          AND saa.week_start = ss.week_start
          AND EXISTS (
            SELECT 1 FROM salary_adjustments sa
            WHERE sa.id = saa.adjustment_id
              AND sa.type != 'loan'
          )
      ), 0) as adjustments_applied,
      COALESCE((
        SELECT SUM((details->>'loan_payments_total')::numeric)
        FROM salary_settlements ss2
        WHERE ss2.technician_id = ss.technician_id
          AND ss2.week_start = ss.week_start
          AND ss2.details IS NOT NULL
          AND ss2.details->>'loan_payments_total' IS NOT NULL
      ), 0) as loan_payments,
      SUM(ss.amount) as total_paid
    FROM salary_settlements ss
    WHERE ss.technician_id = v_technician_id
      AND ss.week_start = v_week_start
    GROUP BY ss.technician_id, ss.week_start
  ) balance
  JOIN users u ON u.id = balance.technician_id
  WHERE (total_earned - adjustments_applied - loan_payments - total_paid) < 0;
  
  IF v_excess_amount IS NULL OR v_excess_amount <= 0 THEN
    RAISE NOTICE 'No se encontró saldo negativo para este técnico en esta semana';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Técnico: %', v_technician_name;
  RAISE NOTICE 'Exceso pagado: CLP $%', v_excess_amount;
  RAISE NOTICE 'Creando ajuste de descuento...';
  
  -- Crear ajuste de descuento
  INSERT INTO salary_adjustments (
    technician_id,
    type,
    amount,
    note,
    created_at
  ) VALUES (
    v_technician_id,
    'discount',
    v_excess_amount,
    'Ajuste de corrección: Se pagó de más en la semana ' || v_week_start || '. Este descuento compensa el exceso pagado.',
    NOW()
  );
  
  RAISE NOTICE '✓ Ajuste de descuento creado correctamente';
  RAISE NOTICE 'El técnico ahora deberá este monto en futuras liquidaciones';
  
END $$;
*/

-- ============================================
-- OPCIÓN B: Ajustar el monto de la liquidación (si es posible)
-- ============================================
-- Esta opción reduce el monto de la liquidación para que coincida con el saldo disponible
-- ⚠️ CUIDADO: Esto modifica registros históricos, úsalo solo si es necesario

/*
DO $$
DECLARE
  v_technician_id UUID := 'REEMPLAZA_CON_EL_ID_DEL_TECNICO';
  v_week_start DATE := '2026-01-XX'; -- Reemplaza con la fecha de la semana problemática
  v_correct_amount NUMERIC;
  v_settlement_id UUID;
BEGIN
  -- Calcular el monto correcto que debería haberse pagado
  SELECT 
    GREATEST(0, total_earned - adjustments_applied - loan_payments)
  INTO v_correct_amount
  FROM (
    SELECT 
      COALESCE((
        SELECT SUM(o.commission_amount)
        FROM orders o
        WHERE o.technician_id = v_technician_id
          AND o.status = 'paid'
          AND (
            (o.payout_week IS NOT NULL AND o.payout_year IS NOT NULL AND
             DATE_TRUNC('week', (v_week_start::date + INTERVAL '1 day')::date - INTERVAL '1 day')::date = 
             DATE_TRUNC('week', (DATE '2000-01-01' + (o.payout_week || ' weeks')::interval + (o.payout_year - 2000 || ' years')::interval)::date)::date)
            OR
            (o.paid_at IS NOT NULL AND 
             DATE_TRUNC('week', o.paid_at::date) = DATE_TRUNC('week', v_week_start::date))
          )
      ), 0) as total_earned,
      COALESCE((
        SELECT SUM(saa.applied_amount)
        FROM salary_adjustment_applications saa
        WHERE saa.technician_id = v_technician_id
          AND saa.week_start = v_week_start
          AND EXISTS (
            SELECT 1 FROM salary_adjustments sa
            WHERE sa.id = saa.adjustment_id
              AND sa.type != 'loan'
          )
      ), 0) as adjustments_applied,
      COALESCE((
        SELECT SUM((details->>'loan_payments_total')::numeric)
        FROM salary_settlements ss2
        WHERE ss2.technician_id = v_technician_id
          AND ss2.week_start = v_week_start
          AND ss2.details IS NOT NULL
          AND ss2.details->>'loan_payments_total' IS NOT NULL
      ), 0) as loan_payments
  ) balance;
  
  -- Obtener el ID de la liquidación más reciente de esa semana
  SELECT id INTO v_settlement_id
  FROM salary_settlements
  WHERE technician_id = v_technician_id
    AND week_start = v_week_start
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_settlement_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró liquidación para este técnico en esta semana';
  END IF;
  
  RAISE NOTICE 'Ajustando liquidación ID: %', v_settlement_id;
  RAISE NOTICE 'Monto original: (consultar manualmente)';
  RAISE NOTICE 'Monto correcto: CLP $%', v_correct_amount;
  
  -- Actualizar el monto de la liquidación
  UPDATE salary_settlements
  SET 
    amount = v_correct_amount,
    details = jsonb_set(
      details::jsonb,
      '{settled_amount}',
      to_jsonb(v_correct_amount)
    )::jsonb
  WHERE id = v_settlement_id;
  
  RAISE NOTICE '✓ Liquidación ajustada correctamente';
  RAISE NOTICE '⚠️ NOTA: Esto modifica el registro histórico. Verifica que sea correcto.';
  
END $$;
*/

-- ============================================
-- PASO 3: VERIFICAR CORRECCIÓN
-- ============================================
-- Ejecuta el query del PASO 1 nuevamente para verificar que los saldos se corrigieron

-- ============================================
-- INSTRUCCIONES DE USO:
-- ============================================
-- 1. Ejecuta el PASO 1 para identificar técnicos con saldo negativo
-- 2. Para cada técnico con saldo negativo, decide qué opción usar:
--    - OPCIÓN A: Crear un ajuste de descuento (recomendado, no modifica historial)
--    - OPCIÓN B: Ajustar la liquidación (modifica historial, úsalo con cuidado)
-- 3. Reemplaza v_technician_id y v_week_start con los valores correctos
-- 4. Ejecuta la opción elegida
-- 5. Ejecuta el PASO 1 nuevamente para verificar
-- ============================================
