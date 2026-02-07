-- ============================================
-- VERIFICAR Y CORREGIR ADELANTO DE 100,000
-- ============================================
-- Este script verifica si existe el registro de aplicación
-- y lo crea si no existe
-- ============================================

-- PASO 1: Verificar estado actual
SELECT 
  '=== ESTADO ACTUAL ===' as seccion;

SELECT 
  sa.id,
  sa.amount,
  sa.type,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining,
  COUNT(saa.id) as num_aplicaciones,
  CASE 
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) <= 0 THEN '✅ SALDADO'
    ELSE '⚠️ PENDIENTE'
  END as estado
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
WHERE sa.id = '14600391-83b9-4337-9777-118174d4696f'
GROUP BY sa.id, sa.amount, sa.type;

-- PASO 2: Verificar si existe el registro de aplicación
SELECT 
  '=== VERIFICAR APLICACIÓN ===' as seccion;

SELECT 
  COUNT(*) as existe_aplicacion,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Ya existe'
    ELSE '❌ NO EXISTE - Se debe crear'
  END as accion
FROM salary_adjustment_applications
WHERE adjustment_id = '14600391-83b9-4337-9777-118174d4696f'
  AND week_start = '2026-01-17';

-- PASO 3: Crear el registro si no existe
-- ⚠️ EJECUTA ESTO SI EL COUNT ARRIBA ES 0:

DO $$
BEGIN
  -- Verificar si ya existe
  IF NOT EXISTS (
    SELECT 1 
    FROM salary_adjustment_applications
    WHERE adjustment_id = '14600391-83b9-4337-9777-118174d4696f'
      AND week_start = '2026-01-17'
  ) THEN
    -- Crear el registro
    INSERT INTO salary_adjustment_applications (
      adjustment_id,
      technician_id,
      applied_amount,
      week_start,
      created_by
    )
    SELECT 
      '14600391-83b9-4337-9777-118174d4696f'::UUID,
      'e44d680a-f803-43dc-848d-0d77723da2f3'::UUID,
      100000::NUMERIC,
      '2026-01-17'::DATE,
      ss.created_by
    FROM salary_settlements ss
    WHERE ss.id = '3f689f61-f120-40ca-a083-3ec7012a4c65'
    LIMIT 1;
    
    RAISE NOTICE '✅ Registro de aplicación creado exitosamente';
  ELSE
    RAISE NOTICE 'ℹ️ El registro ya existe, no se necesita crear';
  END IF;
END $$;

-- PASO 4: Verificar después de crear
SELECT 
  '=== VERIFICACIÓN FINAL ===' as seccion;

SELECT 
  sa.id,
  sa.amount,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining,
  COUNT(saa.id) as num_aplicaciones,
  CASE 
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) <= 0 THEN '✅ SALDADO (NO aparecerá en la lista)'
    ELSE '⚠️ PENDIENTE (aparecerá en la lista)'
  END as estado
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
WHERE sa.id = '14600391-83b9-4337-9777-118174d4696f'
GROUP BY sa.id, sa.amount;

-- PASO 5: Ver todas las aplicaciones de este ajuste
SELECT 
  '=== TODAS LAS APLICACIONES ===' as seccion;

SELECT 
  saa.id,
  saa.adjustment_id,
  saa.applied_amount,
  saa.week_start,
  saa.created_at
FROM salary_adjustment_applications saa
WHERE saa.adjustment_id = '14600391-83b9-4337-9777-118174d4696f'
ORDER BY saa.created_at DESC;
