-- ============================================
-- EJEMPLO: CORREGIR SALDO NEGATIVO DE UN TÉCNICO
-- ============================================
-- Reemplaza los valores marcados con ⚠️ con los datos correctos
-- ============================================

DO $$
DECLARE
  v_technician_id UUID := 'e44d680a-f803-43dc-848d-0d77723da2f3'; -- ⚠️ CAMBIA ESTE UID
  v_excess_amount NUMERIC := 27000; -- ⚠️ CAMBIA ESTE MONTO (el exceso pagado)
  v_week_start DATE := '2026-01-17'; -- ⚠️ CAMBIA ESTA FECHA (fecha de la semana problemática)
  v_technician_name TEXT;
  v_note TEXT;
BEGIN
  -- Obtener nombre del técnico
  SELECT name INTO v_technician_name
  FROM users
  WHERE id = v_technician_id;
  
  IF v_technician_name IS NULL THEN
    RAISE EXCEPTION 'No se encontró el técnico con ID: %', v_technician_id;
  END IF;
  
  IF v_excess_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del exceso debe ser mayor a 0';
  END IF;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CORRIGIENDO SALDO NEGATIVO';
  RAISE NOTICE 'Técnico: %', v_technician_name;
  RAISE NOTICE 'ID: %', v_technician_id;
  RAISE NOTICE 'Exceso pagado: CLP $%', v_excess_amount;
  RAISE NOTICE 'Semana: %', v_week_start;
  RAISE NOTICE '========================================';
  
  -- Crear nota descriptiva
  v_note := 'Ajuste de corrección: Se pagó de más en la semana ' || v_week_start::text || 
            '. Este descuento compensa el exceso de CLP $' || v_excess_amount::text || 
            ' que se pagó de más.';
  
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
    v_note,
    NOW()
  );
  
  RAISE NOTICE '✓ Ajuste de descuento creado correctamente';
  RAISE NOTICE 'El técnico ahora deberá este monto en futuras liquidaciones';
  RAISE NOTICE '========================================';
  
END $$;
