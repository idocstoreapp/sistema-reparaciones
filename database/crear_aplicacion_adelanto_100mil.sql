-- ============================================
-- CREAR APLICACIÓN DEL ADELANTO DE 100,000
-- ============================================
-- Este script crea el registro en salary_adjustment_applications
-- basándose en el settlement que ya aplicó el adelanto
-- ============================================

-- Verificar primero si ya existe
SELECT 
  '=== VERIFICAR SI YA EXISTE ===' as seccion;

SELECT 
  COUNT(*) as existe_aplicacion
FROM salary_adjustment_applications
WHERE adjustment_id = '14600391-83b9-4337-9777-118174d4696f'
  AND week_start = '2026-01-17';

-- Si no existe (COUNT = 0), crear el registro
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
  ss.technician_id,
  100000::NUMERIC as applied_amount,  -- Monto aplicado según el settlement
  ss.week_start,
  ss.created_by
FROM salary_settlements ss
WHERE ss.id = '3f689f61-f120-40ca-a083-3ec7012a4c65'
  AND NOT EXISTS (
    SELECT 1 
    FROM salary_adjustment_applications saa
    WHERE saa.adjustment_id = '14600391-83b9-4337-9777-118174d4696f'
      AND saa.week_start = ss.week_start
  )
RETURNING *;

-- Verificar que se creó correctamente
SELECT 
  '=== VERIFICACIÓN DESPUÉS DE CREAR ===' as seccion;

SELECT 
  saa.id,
  saa.adjustment_id,
  saa.technician_id,
  saa.applied_amount,
  saa.week_start,
  saa.created_at,
  sa.amount as adjustment_amount,
  sa.type as adjustment_type
FROM salary_adjustment_applications saa
LEFT JOIN salary_adjustments sa ON saa.adjustment_id = sa.id
WHERE saa.adjustment_id = '14600391-83b9-4337-9777-118174d4696f'
ORDER BY saa.created_at DESC;

-- Ver el estado final del ajuste
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
  END as estado
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
WHERE sa.id = '14600391-83b9-4337-9777-118174d4696f'
GROUP BY sa.id, sa.amount;
