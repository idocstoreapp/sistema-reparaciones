-- ============================================
-- CORREGIR APLICACIONES FALTANTES DE AJUSTES
-- ============================================
-- Este script extrae la información de ajustes aplicados desde los detalles
-- de las liquidaciones y crea las aplicaciones faltantes en 
-- salary_adjustment_applications
-- ============================================

-- PASO 1: Ver qué liquidaciones tienen ajustes aplicados pero sin aplicaciones guardadas
SELECT 
  '=== LIQUIDACIONES CON AJUSTES PERO SIN APLICACIONES ===' as seccion;

SELECT 
  ss.id as settlement_id,
  ss.technician_id,
  u.name as technician_name,
  ss.week_start,
  ss.amount as settlement_amount,
  ss.created_at,
  ss.details->'adjustments' as adjustments_in_details,
  (
    SELECT COUNT(*) 
    FROM salary_adjustment_applications saa 
    WHERE saa.technician_id = ss.technician_id 
    AND saa.week_start = ss.week_start
  ) as applications_count
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
WHERE ss.details->'adjustments' IS NOT NULL
  AND jsonb_array_length(ss.details->'adjustments') > 0
ORDER BY ss.created_at DESC
LIMIT 20;

-- PASO 2: Extraer ajustes de los detalles y mostrar qué aplicaciones deberían existir
SELECT 
  '=== AJUSTES QUE DEBERÍAN TENER APLICACIONES ===' as seccion;

WITH settlement_adjustments AS (
  SELECT 
    ss.id as settlement_id,
    ss.technician_id,
    ss.week_start,
    ss.created_at as settlement_date,
    jsonb_array_elements(ss.details->'adjustments') as adj_data
  FROM salary_settlements ss
  WHERE ss.details->'adjustments' IS NOT NULL
    AND jsonb_array_length(ss.details->'adjustments') > 0
)
SELECT 
  sa.settlement_id,
  sa.technician_id,
  u.name as technician_name,
  sa.week_start,
  (sa.adj_data->>'id')::uuid as adjustment_id,
  (sa.adj_data->>'applied')::numeric as applied_amount,
  sa.settlement_date,
  -- Verificar si la aplicación ya existe
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM salary_adjustment_applications saa
      WHERE saa.adjustment_id = (sa.adj_data->>'id')::uuid
      AND saa.week_start = sa.week_start
    ) THEN '✅ Ya existe'
    ELSE '❌ FALTA'
  END as estado
FROM settlement_adjustments sa
LEFT JOIN users u ON sa.technician_id = u.id
WHERE (sa.adj_data->>'applied')::numeric > 0
ORDER BY sa.settlement_date DESC;

-- PASO 3: IDENTIFICAR AJUSTES ELIMINADOS
-- Verificar si hay ajustes referenciados en liquidaciones que ya no existen
SELECT 
  '=== ADVERTENCIA: Ajustes eliminados pero referenciados en liquidaciones ===' as seccion;

WITH settlement_adjustments AS (
  SELECT 
    ss.id as settlement_id,
    ss.technician_id,
    ss.week_start,
    ss.created_at,
    (jsonb_array_elements(ss.details->'adjustments')->>'id')::uuid as adjustment_id,
    (jsonb_array_elements(ss.details->'adjustments')->>'applied')::numeric as applied_amount
  FROM salary_settlements ss
  WHERE ss.details->'adjustments' IS NOT NULL
    AND jsonb_array_length(ss.details->'adjustments') > 0
)
SELECT 
  sa.settlement_id,
  sa.adjustment_id,
  sa.applied_amount,
  sa.week_start,
  sa.created_at,
  CASE 
    WHEN EXISTS (SELECT 1 FROM salary_adjustments WHERE id = sa.adjustment_id) 
    THEN '✅ Existe' 
    ELSE '❌ ELIMINADO - No se puede crear aplicación' 
  END as estado_ajuste
FROM settlement_adjustments sa
WHERE sa.applied_amount > 0
ORDER BY sa.created_at DESC;

-- PASO 4: INSERTAR APLICACIONES FALTANTES (solo para ajustes que existen)
-- ⚠️ EJECUTA ESTO SOLO DESPUÉS DE VERIFICAR QUE LOS DATOS SON CORRECTOS EN EL PASO 2 y 3
DO $$
DECLARE
  inserted_count INTEGER := 0;
  skipped_count INTEGER := 0;
  settlement_record RECORD;
  adj_record JSONB;
  adjustment_uuid UUID;
  applied_amt NUMERIC;
BEGIN
  -- Iterar sobre cada liquidación con ajustes
  FOR settlement_record IN 
    SELECT 
      ss.id as settlement_id,
      ss.technician_id,
      ss.week_start,
      ss.created_by,
      ss.details->'adjustments' as adjustments_array
    FROM salary_settlements ss
    WHERE ss.details->'adjustments' IS NOT NULL
      AND jsonb_array_length(ss.details->'adjustments') > 0
  LOOP
    -- Iterar sobre cada ajuste en la liquidación
    FOR adj_record IN 
      SELECT * FROM jsonb_array_elements(settlement_record.adjustments_array)
      WHERE (value->>'applied')::numeric > 0
    LOOP
      adjustment_uuid := (adj_record->>'id')::uuid;
      applied_amt := (adj_record->>'applied')::numeric;
      
      -- Verificar que el ajuste existe en la tabla salary_adjustments
      IF NOT EXISTS (
        SELECT 1 FROM salary_adjustments WHERE id = adjustment_uuid
      ) THEN
        skipped_count := skipped_count + 1;
        RAISE NOTICE 'Saltando ajuste % - El ajuste no existe en salary_adjustments (fue eliminado)', adjustment_uuid;
        CONTINUE;
      END IF;
      
      -- Verificar si la aplicación ya existe
      IF NOT EXISTS (
        SELECT 1 FROM salary_adjustment_applications saa
        WHERE saa.adjustment_id = adjustment_uuid
        AND saa.week_start = settlement_record.week_start
      ) THEN
        -- Insertar la aplicación faltante
        BEGIN
          INSERT INTO salary_adjustment_applications (
            adjustment_id,
            technician_id,
            applied_amount,
            week_start,
            created_by
          )
          VALUES (
            adjustment_uuid,
            settlement_record.technician_id,
            applied_amt,
            settlement_record.week_start,
            settlement_record.created_by
          );
          
          inserted_count := inserted_count + 1;
        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE 'Error insertando aplicación para ajuste %: %', adjustment_uuid, SQLERRM;
          skipped_count := skipped_count + 1;
        END;
      END IF;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Proceso completado:';
  RAISE NOTICE '  - Aplicaciones insertadas: %', inserted_count;
  RAISE NOTICE '  - Aplicaciones omitidas (ajuste no existe o error): %', skipped_count;
END $$;

-- PASO 5: VERIFICAR RESULTADO - Ver ajustes después de la corrección
SELECT 
  '=== VERIFICACIÓN: Ajustes después de la corrección ===' as seccion;

SELECT 
  sa.id as adjustment_id,
  sa.technician_id,
  u.name as technician_name,
  sa.type,
  sa.amount as adjustment_amount,
  sa.created_at as adjustment_created_at,
  COALESCE(SUM(saa.applied_amount), 0) as total_applied,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining,
  COUNT(saa.id) as num_applications
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount, sa.created_at
HAVING sa.amount - COALESCE(SUM(saa.applied_amount), 0) > 0
ORDER BY sa.created_at DESC
LIMIT 20;

-- PASO 6: Mostrar estadísticas
SELECT 
  '=== ESTADÍSTICAS ===' as seccion;

SELECT 
  COUNT(DISTINCT sa.id) as total_ajustes,
  COUNT(DISTINCT saa.adjustment_id) as ajustes_con_aplicaciones,
  COUNT(DISTINCT sa.id) - COUNT(DISTINCT saa.adjustment_id) as ajustes_sin_aplicaciones,
  COUNT(saa.id) as total_aplicaciones,
  SUM(CASE WHEN sa.amount - COALESCE((
    SELECT SUM(saa2.applied_amount) 
    FROM salary_adjustment_applications saa2 
    WHERE saa2.adjustment_id = sa.id
  ), 0) > 0 THEN 1 ELSE 0 END) as ajustes_pendientes
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id;

-- ============================================
-- NOTAS:
-- ============================================
-- 1. Ejecuta primero el PASO 1 y 2 para VER qué va a corregirse
-- 2. Ejecuta el PASO 3 para identificar ajustes eliminados
-- 3. Si los datos se ven correctos, ejecuta el PASO 4 (el DO $$ block)
-- 4. Ejecuta el PASO 5 y 6 para verificar que quedó bien
-- 5. Los ajustes eliminados no causarán error, simplemente se omitirán
-- 6. Después de esto, los ajustes saldados deberían desaparecer automáticamente
-- ============================================
