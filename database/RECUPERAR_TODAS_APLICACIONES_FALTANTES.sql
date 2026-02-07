-- ============================================
-- RECUPERAR TODAS LAS APLICACIONES FALTANTES
-- ============================================
-- Este script recupera TODAS las aplicaciones de ajustes que están
-- registradas en salary_settlements.details pero faltan en
-- salary_adjustment_applications
-- ============================================
-- IMPORTANTE: Ejecuta este script periódicamente o después de
-- crear liquidaciones para asegurar que no falten aplicaciones
-- ============================================

-- 1. Ver qué aplicaciones faltan
SELECT 
  '=== APLICACIONES QUE FALTAN ===' as seccion;

WITH settlements_with_adjustments AS (
  SELECT 
    ss.id as settlement_id,
    ss.technician_id,
    ss.week_start,
    ss.created_at,
    ss.created_by,
    adj->>'id' as adjustment_id,
    (adj->>'applied')::numeric as applied_amount,
    adj->>'type' as adjustment_type
  FROM salary_settlements ss
  CROSS JOIN jsonb_array_elements(ss.details->'adjustments') as adj
  WHERE ss.details IS NOT NULL
    AND ss.details->'adjustments' IS NOT NULL
    AND jsonb_array_length(ss.details->'adjustments') > 0
    AND (adj->>'applied')::numeric > 0
),
existing_applications AS (
  SELECT 
    saa.adjustment_id,
    saa.week_start,
    saa.applied_amount
  FROM salary_adjustment_applications saa
)
SELECT 
  swa.settlement_id,
  swa.technician_id,
  u.name as technician_name,
  swa.week_start,
  swa.adjustment_id,
  swa.applied_amount,
  swa.adjustment_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 
      FROM existing_applications ea
      WHERE ea.adjustment_id::text = swa.adjustment_id
        AND ea.week_start = swa.week_start
        AND ABS(ea.applied_amount - swa.applied_amount) < 0.01
    ) THEN '✅ Ya existe'
    ELSE '❌ FALTA'
  END as estado
FROM settlements_with_adjustments swa
LEFT JOIN users u ON swa.technician_id = u.id
WHERE NOT EXISTS (
  SELECT 1 
  FROM existing_applications ea
  WHERE ea.adjustment_id::text = swa.adjustment_id
    AND ea.week_start = swa.week_start
    AND ABS(ea.applied_amount - swa.applied_amount) < 0.01
)
ORDER BY swa.created_at DESC;

-- 2. Crear las aplicaciones faltantes
-- ⚠️ EJECUTA ESTO PARA CREAR TODAS LAS APLICACIONES FALTANTES:

DO $$
DECLARE
  rec RECORD;
  created_count INTEGER := 0;
  skipped_count INTEGER := 0;
BEGIN
  -- Iterar sobre todos los settlements con ajustes aplicados
  FOR rec IN 
    SELECT 
      ss.id as settlement_id,
      ss.technician_id,
      ss.week_start,
      ss.created_at,
      ss.created_by,
      adj->>'id' as adjustment_id,
      (adj->>'applied')::numeric as applied_amount
    FROM salary_settlements ss
    CROSS JOIN jsonb_array_elements(ss.details->'adjustments') as adj
    WHERE ss.details IS NOT NULL
      AND ss.details->'adjustments' IS NOT NULL
      AND jsonb_array_length(ss.details->'adjustments') > 0
      AND (adj->>'applied')::numeric > 0
      AND (adj->>'id') IS NOT NULL
      AND (adj->>'id') != ''
  LOOP
    -- Verificar si ya existe
    IF NOT EXISTS (
      SELECT 1 
      FROM salary_adjustment_applications saa
      WHERE saa.adjustment_id::text = rec.adjustment_id
        AND saa.week_start = rec.week_start
        AND ABS(saa.applied_amount - rec.applied_amount) < 0.01
    ) THEN
      -- Verificar que el ajuste existe
      IF EXISTS (
        SELECT 1 
        FROM salary_adjustments sa
        WHERE sa.id::text = rec.adjustment_id
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
          rec.adjustment_id::UUID,
          rec.technician_id,
          rec.applied_amount,
          rec.week_start,
          rec.created_by
        )
        ON CONFLICT DO NOTHING; -- Evitar duplicados si hay algún conflicto
        
        created_count := created_count + 1;
      ELSE
        RAISE NOTICE '⚠️ Ajuste no encontrado: %', rec.adjustment_id;
      END IF;
    ELSE
      skipped_count := skipped_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE '✅ Aplicaciones creadas: %', created_count;
  RAISE NOTICE 'ℹ️ Aplicaciones que ya existían: %', skipped_count;
END $$;

-- 3. Verificar el resultado
SELECT 
  '=== VERIFICACIÓN FINAL ===' as seccion;

WITH settlements_with_adjustments AS (
  SELECT 
    ss.id as settlement_id,
    ss.technician_id,
    ss.week_start,
    adj->>'id' as adjustment_id,
    (adj->>'applied')::numeric as applied_amount
  FROM salary_settlements ss
  CROSS JOIN jsonb_array_elements(ss.details->'adjustments') as adj
  WHERE ss.details IS NOT NULL
    AND ss.details->'adjustments' IS NOT NULL
    AND jsonb_array_length(ss.details->'adjustments') > 0
    AND (adj->>'applied')::numeric > 0
)
SELECT 
  COUNT(*) as total_aplicaciones_en_settlements,
  COUNT(DISTINCT swa.adjustment_id) as total_ajustes_unicos,
  (
    SELECT COUNT(*) 
    FROM salary_adjustment_applications saa
    WHERE EXISTS (
      SELECT 1 
      FROM settlements_with_adjustments swa2
      WHERE swa2.adjustment_id = saa.adjustment_id::text
        AND swa2.week_start = saa.week_start
    )
  ) as aplicaciones_registradas,
  COUNT(*) - (
    SELECT COUNT(*) 
    FROM salary_adjustment_applications saa
    WHERE EXISTS (
      SELECT 1 
      FROM settlements_with_adjustments swa2
      WHERE swa2.adjustment_id = saa.adjustment_id::text
        AND swa2.week_start = saa.week_start
    )
  ) as aplicaciones_faltantes
FROM settlements_with_adjustments swa;

-- 4. Verificar que todos los ajustes tienen su remaining correcto
SELECT 
  '=== VERIFICAR REMAINING DE AJUSTES ===' as seccion;

SELECT 
  sa.id,
  sa.technician_id,
  u.name as technician_name,
  sa.type,
  sa.amount,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining,
  CASE 
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) < 0 THEN '❌ ERROR: Aplicaciones exceden el monto'
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) = 0 THEN '✅ SALDADO'
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) > 0 THEN '⚠️ PENDIENTE'
    ELSE '❓ DESCONOCIDO'
  END as estado
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount
HAVING sa.amount - COALESCE(SUM(saa.applied_amount), 0) < 0  -- Solo mostrar errores
   OR (sa.amount - COALESCE(SUM(saa.applied_amount), 0) > 0 AND sa.amount >= 100000 AND sa.type = 'advance')  -- O adelantos grandes pendientes
ORDER BY sa.created_at DESC;

-- ============================================
-- INSTRUCCIONES:
-- ============================================
-- 1. Ejecuta este script periódicamente (semanal o mensual)
-- 2. O ejecútalo después de crear liquidaciones manualmente
-- 3. El script creará automáticamente todas las aplicaciones faltantes
-- 4. Verifica que no haya errores en el remaining de ajustes
-- ============================================
