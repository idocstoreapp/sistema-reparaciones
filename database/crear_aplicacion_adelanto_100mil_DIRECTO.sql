-- ============================================
-- CREAR APLICACIÓN DEL ADELANTO DE 100,000 (DIRECTO)
-- ============================================
-- El adelanto fue aplicado en el settlement pero falta el registro
-- en salary_adjustment_applications. Este script lo crea.
-- ============================================

-- 1. Verificar si ya existe
SELECT 
  '=== VERIFICAR SI YA EXISTE ===' as seccion;

SELECT 
  COUNT(*) as existe_aplicacion,
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ Ya existe, no es necesario crear'
    ELSE '❌ No existe, se debe crear'
  END as accion
FROM salary_adjustment_applications
WHERE adjustment_id = '14600391-83b9-4337-9777-118174d4696f'
  AND week_start = '2026-01-17';

-- 2. Crear el registro si no existe
-- ⚠️ EJECUTA ESTO SOLO SI EL COUNT ARRIBA ES 0:

INSERT INTO salary_adjustment_applications (
  adjustment_id,
  technician_id,
  applied_amount,
  week_start,
  created_by
)
SELECT 
  '14600391-83b9-4337-9777-118174d4696f'::UUID as adjustment_id,
  'e44d680a-f803-43dc-848d-0d77723da2f3'::UUID as technician_id,  -- Del settlement
  100000::NUMERIC as applied_amount,  -- Monto aplicado según el settlement
  '2026-01-17'::DATE as week_start,  -- Del settlement
  ss.created_by
FROM salary_settlements ss
WHERE ss.id = '3f689f61-f120-40ca-a083-3ec7012a4c65'
  AND NOT EXISTS (
    SELECT 1 
    FROM salary_adjustment_applications saa
    WHERE saa.adjustment_id = '14600391-83b9-4337-9777-118174d4696f'
      AND saa.week_start = '2026-01-17'
  )
RETURNING *;

-- 3. Verificar que se creó correctamente
SELECT 
  '=== VERIFICACIÓN DESPUÉS DE CREAR ===' as seccion;

SELECT 
  saa.id,
  saa.adjustment_id,
  saa.technician_id,
  u.name as technician_name,
  saa.applied_amount,
  saa.week_start,
  saa.created_at,
  sa.amount as adjustment_amount,
  sa.type as adjustment_type
FROM salary_adjustment_applications saa
LEFT JOIN salary_adjustments sa ON saa.adjustment_id = sa.id
LEFT JOIN users u ON saa.technician_id = u.id
WHERE saa.adjustment_id = '14600391-83b9-4337-9777-118174d4696f'
ORDER BY saa.created_at DESC;

-- 4. Ver el estado final del ajuste
SELECT 
  '=== ESTADO FINAL DEL AJUSTE ===' as seccion;

SELECT 
  sa.id,
  sa.amount,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining,
  CASE 
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) <= 0 THEN '✅ SALDADO (aparecerá en "Ajustes Saldados")'
    ELSE '⚠️ PENDIENTE (aparecerá en "Pendientes")'
  END as estado,
  COUNT(saa.id) as num_aplicaciones
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
WHERE sa.id = '14600391-83b9-4337-9777-118174d4696f'
GROUP BY sa.id, sa.amount;

-- ============================================
-- RESULTADO ESPERADO:
-- ============================================
-- Después de ejecutar este script:
-- - remaining debería ser 0 (100000 - 100000 = 0)
-- - El ajuste aparecerá en la sección "Ajustes Saldados"
-- - Podrás eliminarlo si quieres
-- ============================================
