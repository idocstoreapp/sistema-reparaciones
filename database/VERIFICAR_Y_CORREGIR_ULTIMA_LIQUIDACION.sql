-- ============================================
-- SCRIPT PARA VERIFICAR Y CORREGIR LA ÚLTIMA LIQUIDACIÓN
-- ============================================
-- Este script verifica si las aplicaciones de ajustes se registraron correctamente
-- y las crea si faltan
-- ============================================

-- PASO 1: VER LA ÚLTIMA LIQUIDACIÓN DEL TÉCNICO
-- ============================================
-- Reemplaza el ID del técnico con el correcto

SELECT 
  ss.id as settlement_id,
  ss.technician_id,
  u.name as technician_name,
  ss.week_start,
  ss.amount as total_paid,
  ss.created_at,
  ss.details->>'base_amount' as base_amount,
  ss.details->>'selected_adjustments_total' as adjustments_total,
  ss.details->>'loan_payments_total' as loan_payments_total,
  ss.details->>'settled_amount' as settled_amount,
  (ss.amount::numeric + COALESCE((ss.details->>'loan_payments_total')::numeric, 0)) as total_paid_including_loans,
  ss.details->'adjustments' as adjustments_array
FROM salary_settlements ss
JOIN users u ON u.id = ss.technician_id
WHERE ss.technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3' -- ⚠️ CAMBIA ESTE ID
ORDER BY ss.created_at DESC
LIMIT 5;

-- ============================================
-- PASO 2: VERIFICAR APLICACIONES REGISTRADAS
-- ============================================
-- Ver si las aplicaciones de ajustes se registraron

SELECT 
  saa.id,
  saa.adjustment_id,
  sa.type as adjustment_type,
  sa.amount as adjustment_amount,
  saa.applied_amount,
  saa.week_start,
  saa.created_at
FROM salary_adjustment_applications saa
JOIN salary_adjustments sa ON sa.id = saa.adjustment_id
WHERE saa.technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3' -- ⚠️ CAMBIA ESTE ID
ORDER BY saa.created_at DESC
LIMIT 10;

-- ============================================
-- PASO 3: CREAR APLICACIONES FALTANTES
-- ============================================
-- Este script crea las aplicaciones de ajustes que faltan
-- basándose en los detalles de la liquidación

DO $$
DECLARE
  v_settlement RECORD;
  v_adj_record JSONB;
  v_adjustment_id UUID;
  v_applied_amount NUMERIC;
  v_created_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
  v_technician_id UUID := 'e44d680a-f803-43dc-848d-0d77723da2f3'; -- ⚠️ CAMBIA ESTE ID
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CREANDO APLICACIONES FALTANTES';
  RAISE NOTICE '========================================';
  
  -- Obtener la liquidación más reciente del técnico
  SELECT 
    ss.id,
    ss.technician_id,
    ss.week_start,
    ss.created_by,
    ss.details->'adjustments' as adjustments_array
  INTO v_settlement
  FROM salary_settlements ss
  WHERE ss.technician_id = v_technician_id
  ORDER BY ss.created_at DESC
  LIMIT 1;
  
  IF v_settlement.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró liquidación para el técnico %', v_technician_id;
  END IF;
  
  RAISE NOTICE 'Liquidación encontrada: ID = %, Semana = %', v_settlement.id, v_settlement.week_start;
  
  -- Iterar sobre los ajustes en el details
  IF v_settlement.adjustments_array IS NOT NULL THEN
    FOR v_adj_record IN SELECT * FROM jsonb_array_elements(v_settlement.adjustments_array)
    LOOP
      v_adjustment_id := (v_adj_record->>'id')::UUID;
      v_applied_amount := (v_adj_record->>'applied')::NUMERIC;
      
      -- Solo procesar si hay un monto aplicado
      IF v_applied_amount > 0 THEN
        -- Verificar si la aplicación ya existe
        IF NOT EXISTS (
          SELECT 1 
          FROM salary_adjustment_applications saa
          WHERE saa.adjustment_id = v_adjustment_id
            AND saa.week_start = v_settlement.week_start
            AND ABS(saa.applied_amount - v_applied_amount) < 0.01
        ) THEN
          -- Verificar que el ajuste existe
          IF EXISTS (
            SELECT 1 
            FROM salary_adjustments sa
            WHERE sa.id = v_adjustment_id
          ) THEN
            -- Crear la aplicación
            INSERT INTO salary_adjustment_applications (
              adjustment_id,
              technician_id,
              applied_amount,
              week_start,
              created_by
            )
            VALUES (
              v_adjustment_id,
              v_settlement.technician_id,
              v_applied_amount,
              v_settlement.week_start,
              v_settlement.created_by
            )
            ON CONFLICT DO NOTHING;
            
            v_created_count := v_created_count + 1;
            RAISE NOTICE '✓ Aplicación creada: Ajuste % = CLP $%', v_adjustment_id, v_applied_amount;
          ELSE
            RAISE NOTICE '⚠️ Ajuste no encontrado: %', v_adjustment_id;
          END IF;
        ELSE
          v_skipped_count := v_skipped_count + 1;
          RAISE NOTICE 'ℹ️ Aplicación ya existe: Ajuste % = CLP $%', v_adjustment_id, v_applied_amount;
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✓ Aplicaciones creadas: %', v_created_count;
  RAISE NOTICE 'ℹ️ Aplicaciones que ya existían: %', v_skipped_count;
  RAISE NOTICE '========================================';
  
END $$;

-- ============================================
-- PASO 4: VERIFICAR RESULTADO
-- ============================================
-- Ejecuta esto después para verificar que las aplicaciones se crearon

SELECT 
  saa.id,
  saa.adjustment_id,
  sa.type as adjustment_type,
  sa.amount as adjustment_amount,
  saa.applied_amount,
  saa.week_start,
  saa.created_at
FROM salary_adjustment_applications saa
JOIN salary_adjustments sa ON sa.id = saa.adjustment_id
WHERE saa.technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3' -- ⚠️ CAMBIA ESTE ID
ORDER BY saa.created_at DESC
LIMIT 10;
