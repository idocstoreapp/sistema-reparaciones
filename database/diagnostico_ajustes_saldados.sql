-- ============================================
-- Script de diagnóstico: Verificar ajustes saldados
-- ============================================
-- Este script verifica que los ajustes se estén marcando como saldados
-- cuando se realiza un pago
-- ============================================

-- 1. Verificar que la tabla de aplicaciones existe
SELECT 
  '=== VERIFICACIÓN DE TABLA DE APLICACIONES ===' as seccion,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'salary_adjustment_applications'
  ) as tabla_existe;

-- 2. Mostrar todos los ajustes con sus aplicaciones
SELECT 
  '=== AJUSTES CON SUS APLICACIONES ===' as seccion;

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
ORDER BY sa.created_at DESC
LIMIT 20;

-- 3. Mostrar ajustes que deberían estar saldados (remaining = 0)
SELECT 
  '=== AJUSTES QUE DEBERÍAN ESTAR SALDADOS (remaining = 0) ===' as seccion;

SELECT 
  sa.id as adjustment_id,
  sa.technician_id,
  u.name as technician_name,
  sa.type,
  sa.amount as adjustment_amount,
  COALESCE(SUM(saa.applied_amount), 0) as total_applied,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount
HAVING sa.amount - COALESCE(SUM(saa.applied_amount), 0) = 0
ORDER BY sa.created_at DESC;

-- 4. Mostrar aplicaciones recientes
SELECT 
  '=== APLICACIONES RECIENTES ===' as seccion;

SELECT 
  saa.id,
  saa.adjustment_id,
  saa.technician_id,
  u.name as technician_name,
  saa.applied_amount,
  saa.week_start,
  saa.created_at,
  sa.type as adjustment_type,
  sa.amount as adjustment_amount
FROM salary_adjustment_applications saa
LEFT JOIN salary_adjustments sa ON saa.adjustment_id = sa.id
LEFT JOIN users u ON saa.technician_id = u.id
ORDER BY saa.created_at DESC
LIMIT 20;

-- 5. Verificar liquidaciones recientes
SELECT 
  '=== LIQUIDACIONES RECIENTES ===' as seccion;

SELECT 
  ss.id,
  ss.technician_id,
  u.name as technician_name,
  ss.week_start,
  ss.amount,
  ss.payment_method,
  ss.created_at,
  ss.details
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
ORDER BY ss.created_at DESC
LIMIT 10;

-- 6. Verificar si hay ajustes sin aplicaciones pero con liquidaciones
SELECT 
  '=== POSIBLE PROBLEMA: Ajustes sin aplicaciones pero con liquidaciones ===' as seccion;

SELECT 
  sa.id as adjustment_id,
  sa.technician_id,
  u.name as technician_name,
  sa.amount,
  sa.created_at as adjustment_date,
  COUNT(saa.id) as num_applications,
  COUNT(DISTINCT ss.id) as num_settlements
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
LEFT JOIN salary_settlements ss ON sa.technician_id = ss.technician_id
  AND DATE(sa.created_at) <= ss.week_start
GROUP BY sa.id, sa.technician_id, u.name, sa.amount, sa.created_at
HAVING COUNT(saa.id) = 0 AND COUNT(DISTINCT ss.id) > 0
ORDER BY sa.created_at DESC;

-- ============================================
-- DIAGNÓSTICO:
-- ============================================
-- Si ves ajustes con remaining > 0 pero que deberían estar saldados:
-- 1. Verifica que las aplicaciones se estén guardando (tabla 4)
-- 2. Verifica que las liquidaciones se estén guardando (tabla 5)
-- 3. Si hay ajustes sin aplicaciones pero con liquidaciones (tabla 6),
--    significa que las aplicaciones no se están guardando correctamente
-- ============================================
