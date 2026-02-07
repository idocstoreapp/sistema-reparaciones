-- ============================================
-- SCRIPT SIMPLE PARA CORREGIR SALDOS NEGATIVOS
-- ============================================
-- Este script crea ajustes de descuento para compensar los excesos pagados
-- ============================================

-- PASO 1: VER TÉCNICOS CON SALDO NEGATIVO
-- ============================================
-- Ejecuta esto primero para ver qué técnicos tienen saldo negativo

SELECT 
  ss.technician_id,
  u.name as technician_name,
  ss.week_start,
  ss.amount as total_paid,
  ss.details->>'base_amount' as base_amount_from_settlement,
  ss.details->>'selected_adjustments_total' as adjustments_from_settlement,
  ss.details->>'loan_payments_total' as loan_payments_from_settlement,
  ss.id as settlement_id,
  ss.created_at as settlement_date
FROM salary_settlements ss
JOIN users u ON u.id = ss.technician_id
WHERE u.role = 'technician'
ORDER BY ss.created_at DESC;

-- ============================================
-- PASO 2: CORREGIR SALDO NEGATIVO MANUALMENTE
-- ============================================
-- Para cada técnico con saldo negativo, crea un ajuste de descuento
-- Reemplaza los valores entre comillas con los datos del técnico

DO $$
DECLARE
  v_technician_id UUID := 'e44d680a-f803-43dc-848d-0d77723da2f3
  v_excess_amount NUMERIC := 27000; -- ⚠️ CAMBIA ESTE MONTO (el exceso pagado, ejemplo: 27000)
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

-- ============================================
-- PASO 3: CORREGIR MÚLTIPLES TÉCNICOS AUTOMÁTICAMENTE
-- ============================================
-- Este script identifica y corrige automáticamente todos los saldos negativos
-- ⚠️ ÚSALO CON CUIDADO: Revisa los resultados antes de ejecutarlo

/*
DO $$
DECLARE
  v_settlement RECORD;
  v_excess_amount NUMERIC;
  v_base_amount NUMERIC;
  v_adjustments_total NUMERIC;
  v_loan_payments_total NUMERIC;
  v_net_available NUMERIC;
  v_note TEXT;
  v_corrections_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CORRIGIENDO TODOS LOS SALDOS NEGATIVOS';
  RAISE NOTICE '========================================';
  
  -- Iterar sobre todas las liquidaciones
  FOR v_settlement IN 
    SELECT 
      ss.id,
      ss.technician_id,
      ss.week_start,
      ss.amount as total_paid,
      ss.details,
      u.name as technician_name
    FROM salary_settlements ss
    JOIN users u ON u.id = ss.technician_id
    WHERE u.role = 'technician'
    ORDER BY ss.created_at DESC
  LOOP
    -- Extraer valores del details JSON
    v_base_amount := COALESCE((v_settlement.details->>'base_amount')::numeric, 0);
    v_adjustments_total := COALESCE((v_settlement.details->>'selected_adjustments_total')::numeric, 0);
    v_loan_payments_total := COALESCE((v_settlement.details->>'loan_payments_total')::numeric, 0);
    
    -- Calcular saldo disponible
    v_net_available := v_base_amount - v_adjustments_total - v_loan_payments_total;
    
    -- Calcular exceso pagado (si hay saldo negativo)
    v_excess_amount := v_settlement.total_paid - v_net_available;
    
    -- Si hay exceso pagado, crear ajuste de descuento
    IF v_excess_amount > 0 THEN
      v_note := 'Ajuste de corrección: Se pagó de más en la semana ' || v_settlement.week_start || 
                '. Este descuento compensa el exceso de CLP $' || v_excess_amount || 
                ' que se pagó de más. Liquidación ID: ' || v_settlement.id;
      
      INSERT INTO salary_adjustments (
        technician_id,
        type,
        amount,
        note,
        created_at
      ) VALUES (
        v_settlement.technician_id,
        'discount',
        v_excess_amount,
        v_note,
        NOW()
      );
      
      v_corrections_count := v_corrections_count + 1;
      
      RAISE NOTICE 'Técnico: % | Semana: % | Exceso: CLP $%', 
        v_settlement.technician_name, 
        v_settlement.week_start, 
        v_excess_amount;
    END IF;
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓ Correcciones completadas: %', v_corrections_count;
  RAISE NOTICE '========================================';
  
END $$;
*/

-- ============================================
-- INSTRUCCIONES DE USO:
-- ============================================
-- 1. Ejecuta el PASO 1 para ver todas las liquidaciones y identificar problemas
-- 2. Para cada técnico con saldo negativo:
--    a. Usa el PASO 2 para corregir manualmente (más seguro)
--    b. O usa el PASO 3 para corregir todos automáticamente (más rápido pero revisa primero)
-- 3. Después de corregir, verifica que los saldos se hayan corregido
-- ============================================
