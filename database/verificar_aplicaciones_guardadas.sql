-- ============================================
-- VERIFICAR SI LAS APLICACIONES SE ESTÁN GUARDANDO
-- ============================================
-- Este script verifica si las aplicaciones de ajustes se guardaron correctamente
-- ============================================

-- 1. Ver todas las aplicaciones guardadas
SELECT 
  '=== TODAS LAS APLICACIONES GUARDADAS ===' as seccion;

SELECT 
  saa.id,
  saa.adjustment_id,
  sa.type,
  sa.amount as ajuste_total,
  saa.applied_amount as aplicado,
  saa.technician_id,
  u.name as technician_name,
  saa.week_start,
  saa.created_at,
  sa.amount - (
    SELECT COALESCE(SUM(saa2.applied_amount), 0)
    FROM salary_adjustment_applications saa2
    WHERE saa2.adjustment_id = sa.id
  ) as remaining
FROM salary_adjustment_applications saa
LEFT JOIN salary_adjustments sa ON saa.adjustment_id = sa.id
LEFT JOIN users u ON saa.technician_id = u.id
ORDER BY saa.created_at DESC
LIMIT 20;

-- 2. Ver ajustes y sus aplicaciones totales
SELECT 
  '=== AJUSTES Y APLICACIONES TOTALES ===' as seccion;

SELECT 
  sa.id as adjustment_id,
  sa.technician_id,
  u.name as technician_name,
  sa.type,
  sa.amount as ajuste_total,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining,
  COUNT(saa.id) as num_aplicaciones,
  CASE 
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) <= 0 THEN '✅ SALDADO'
    ELSE '⚠️ PENDIENTE'
  END as estado
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount
ORDER BY sa.created_at DESC
LIMIT 20;

-- 3. Ver ajustes pendientes (remaining > 0)
SELECT 
  '=== AJUSTES PENDIENTES (remaining > 0) ===' as seccion;

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

-- 4. Verificar liquidaciones recientes y sus aplicaciones asociadas
SELECT 
  '=== LIQUIDACIONES Y SUS APLICACIONES ===' as seccion;

SELECT 
  ss.id as settlement_id,
  ss.technician_id,
  u.name as technician_name,
  ss.amount as settlement_amount,
  ss.week_start,
  ss.created_at as settlement_created_at,
  COUNT(DISTINCT saa.id) as num_aplicaciones_guardadas,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado_en_settlement
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
LEFT JOIN salary_adjustment_applications saa ON saa.technician_id = ss.technician_id 
  AND saa.week_start = ss.week_start
GROUP BY ss.id, ss.technician_id, u.name, ss.amount, ss.week_start, ss.created_at
ORDER BY ss.created_at DESC
LIMIT 10;

-- ============================================
-- RESULTADO ESPERADO:
-- ============================================
-- 1. Si hay aplicaciones guardadas, deberían aparecer en la sección 1
-- 2. Si un ajuste está saldado, remaining debe ser 0 o negativo
-- 3. Solo deberían aparecer en "Pendientes" los ajustes con remaining > 0
-- ============================================
