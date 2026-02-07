-- ============================================
-- VERIFICAR Y CORREGIR APLICACIÓN DEL ADELANTO DE 100,000
-- ============================================
-- El adelanto fue aplicado en una liquidación pero puede que
-- no exista el registro en salary_adjustment_applications
-- ============================================

-- 1. Ver el settlement que aplicó el adelanto
SELECT 
  '=== SETTLEMENT QUE APLICÓ EL ADELANTO ===' as seccion;

SELECT 
  ss.id,
  ss.technician_id,
  u.name as technician_name,
  ss.amount as settlement_amount,
  ss.week_start,
  ss.created_at,
  ss.details->'adjustments' as adjustments_in_settlement
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
WHERE ss.id = '3f689f61-f120-40ca-a083-3ec7012a4c65'
ORDER BY ss.created_at DESC;

-- 2. Verificar si existe el registro en salary_adjustment_applications
SELECT 
  '=== VERIFICAR APLICACIONES REGISTRADAS ===' as seccion;

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

-- 3. Ver el estado actual del ajuste
SELECT 
  '=== ESTADO ACTUAL DEL AJUSTE ===' as seccion;

SELECT 
  sa.id,
  sa.technician_id,
  u.name as technician_name,
  sa.type,
  sa.amount,
  sa.note,
  sa.created_at,
  sa.available_from,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining,
  COUNT(saa.id) as num_aplicaciones,
  CASE 
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) <= 0 THEN '✅ SALDADO'
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) > 0 THEN '⚠️ PENDIENTE'
    ELSE '❓ DESCONOCIDO'
  END as estado
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
WHERE sa.id = '14600391-83b9-4337-9777-118174d4696f'
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount, sa.note, sa.created_at, sa.available_from;

-- 4. Si NO existe el registro en salary_adjustment_applications, crearlo
-- ⚠️ DESCOMENTA ESTO SI NO EXISTE EL REGISTRO:
/*
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
  );
*/

-- 5. Verificar después de crear el registro
SELECT 
  '=== VERIFICACIÓN DESPUÉS DE CREAR ===' as seccion;

SELECT 
  sa.id,
  sa.amount,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining,
  CASE 
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) <= 0 THEN '✅ SALDADO'
    ELSE '⚠️ PENDIENTE'
  END as estado
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
WHERE sa.id = '14600391-83b9-4337-9777-118174d4696f'
GROUP BY sa.id, sa.amount;
