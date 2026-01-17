-- ============================================
-- RECUPERAR APLICACIONES DESDE SETTLEMENTS
-- ============================================
-- Este script extrae las aplicaciones desde salary_settlements.details
-- y las guarda en salary_adjustment_applications
-- ============================================

-- 1. Ver qué detalles tienen los settlements
SELECT 
  '=== DETALLES DE SETTLEMENTS ===' as seccion;

SELECT 
  id as settlement_id,
  technician_id,
  week_start,
  amount as settlement_amount,
  details,
  details->'adjustments' as adjustments_array,
  jsonb_array_length(details->'adjustments') as num_adjustments_in_details
FROM salary_settlements
WHERE details IS NOT NULL
  AND details->'adjustments' IS NOT NULL
  AND jsonb_array_length(details->'adjustments') > 0
ORDER BY created_at DESC
LIMIT 10;

-- 2. Extraer y mostrar las aplicaciones que se pueden recuperar
SELECT 
  '=== APLICACIONES QUE SE PUEDEN RECUPERAR ===' as seccion;

SELECT 
  ss.id as settlement_id,
  ss.technician_id,
  u.name as technician_name,
  ss.week_start,
  adj->>'id' as adjustment_id,
  adj->>'applied' as applied_amount,
  adj->>'type' as adjustment_type
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
CROSS JOIN jsonb_array_elements(ss.details->'adjustments') as adj
WHERE ss.details IS NOT NULL
  AND ss.details->'adjustments' IS NOT NULL
  AND jsonb_array_length(ss.details->'adjustments') > 0
  AND (adj->>'applied')::numeric > 0
ORDER BY ss.created_at DESC;

-- 3. INSERTAR APLICACIONES FALTANTES (solo si el adjustment existe)
-- ============================================
DO $$
DECLARE
  inserted_count INTEGER := 0;
  omitted_count INTEGER := 0;
  skipped_count INTEGER := 0;
  settlement_record RECORD;
  adj_record JSONB;
  adj_id UUID;
  applied_amt NUMERIC;
BEGIN
  FOR settlement_record IN
    SELECT
      ss.id as settlement_id,
      ss.technician_id,
      ss.week_start,
      ss.created_by,
      ss.details->'adjustments' as adjustments_array
    FROM salary_settlements ss
    WHERE ss.details IS NOT NULL
      AND ss.details->'adjustments' IS NOT NULL
      AND jsonb_array_length(ss.details->'adjustments') > 0
  LOOP
    FOR adj_record IN
      SELECT * FROM jsonb_array_elements(settlement_record.adjustments_array)
      WHERE (value->>'applied')::numeric > 0
    LOOP
      adj_id := (adj_record->>'id')::uuid;
      applied_amt := (adj_record->>'applied')::numeric;
      
      -- Verificar si el adjustment_id existe en salary_adjustments
      IF EXISTS (SELECT 1 FROM salary_adjustments WHERE id = adj_id) THEN
        -- Verificar si la aplicación ya existe
        IF NOT EXISTS (
          SELECT 1 FROM salary_adjustment_applications saa
          WHERE saa.adjustment_id = adj_id
          AND saa.week_start = settlement_record.week_start
          AND saa.applied_amount = applied_amt
        ) THEN
          INSERT INTO salary_adjustment_applications (
            adjustment_id,
            technician_id,
            applied_amount,
            week_start,
            created_by
          )
          VALUES (
            adj_id,
            settlement_record.technician_id,
            applied_amt,
            settlement_record.week_start,
            settlement_record.created_by
          )
          ON CONFLICT DO NOTHING;
          inserted_count := inserted_count + 1;
        ELSE
          skipped_count := skipped_count + 1;
        END IF;
      ELSE
        omitted_count := omitted_count + 1;
        RAISE NOTICE 'Ajuste omitido (no existe en salary_adjustments): %', adj_id;
      END IF;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE '✅ Se insertaron % aplicaciones faltantes.', inserted_count;
  RAISE NOTICE '⚠️ Se omitieron % ajustes que no existen en salary_adjustments.', omitted_count;
  RAISE NOTICE 'ℹ️ Se saltaron % aplicaciones que ya existían.', skipped_count;
END $$;

-- 4. Verificar las aplicaciones recuperadas
SELECT 
  '=== APLICACIONES DESPUÉS DE LA RECUPERACIÓN ===' as seccion;

SELECT 
  saa.id,
  saa.adjustment_id,
  sa.type,
  sa.amount as ajuste_total,
  saa.applied_amount as aplicado,
  saa.technician_id,
  u.name as technician_name,
  saa.week_start,
  saa.created_at
FROM salary_adjustment_applications saa
LEFT JOIN salary_adjustments sa ON saa.adjustment_id = sa.id
LEFT JOIN users u ON saa.technician_id = u.id
ORDER BY saa.created_at DESC
LIMIT 20;

-- 5. Verificar ajustes pendientes después de la recuperación
SELECT 
  '=== AJUSTES PENDIENTES DESPUÉS DE LA RECUPERACIÓN ===' as seccion;

WITH ajustes_con_remaining AS (
  SELECT 
    sa.id as adjustment_id,
    sa.technician_id,
    u.name as technician_name,
    sa.type,
    sa.amount as ajuste_total,
    COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
    sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining,
    sa.created_at
  FROM salary_adjustments sa
  LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
  LEFT JOIN users u ON sa.technician_id = u.id
  GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount, sa.created_at
)
SELECT 
  adjustment_id,
  technician_name,
  type,
  ajuste_total,
  total_aplicado,
  remaining,
  created_at
FROM ajustes_con_remaining
WHERE remaining > 0
ORDER BY created_at DESC;

-- ============================================
-- RESULTADO ESPERADO:
-- ============================================
-- 1. Debe mostrar los detalles de los settlements con ajustes
-- 2. Debe mostrar las aplicaciones que se pueden recuperar
-- 3. Debe insertar las aplicaciones faltantes en salary_adjustment_applications
-- 4. Después de la recuperación, los ajustes saldados deberían tener remaining = 0
-- ============================================
