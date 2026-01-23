-- ============================================
-- VER AJUSTES DE UN TÉCNICO ESPECÍFICO
-- ============================================
-- Este script te permite ver todos los ajustes de un técnico
-- para identificar cuáles eliminar
-- ============================================

-- 1. Reemplaza el ID del técnico aquí (o el nombre si lo prefieres)
-- Por ejemplo: WHERE u.name = 'Yohannys'
-- O: WHERE sa.technician_id = '45eb95e8-c34c-4e61-a8f7-ee42017ef948'

-- Ver todos los ajustes con sus aplicaciones
SELECT 
  '=== TODOS LOS AJUSTES ===' as seccion;

SELECT 
  sa.id as adjustment_id,
  sa.technician_id,
  u.name as technician_name,
  sa.type,
  sa.amount,
  sa.note,
  sa.created_at,
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
-- Cambia esto por el técnico que necesitas
WHERE u.name = 'tecnico'  -- ⚠️ CAMBIA EL NOMBRE AQUÍ
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount, sa.note, sa.created_at
ORDER BY sa.created_at DESC;

-- 2. Ver las aplicaciones asociadas a cada ajuste
SELECT 
  '=== APLICACIONES DE AJUSTES ===' as seccion;

SELECT 
  saa.id as application_id,
  saa.adjustment_id,
  sa.type as adjustment_type,
  sa.amount as adjustment_amount,
  saa.applied_amount,
  saa.week_start,
  u.name as technician_name,
  saa.created_at
FROM salary_adjustment_applications saa
LEFT JOIN salary_adjustments sa ON saa.adjustment_id = sa.id
LEFT JOIN users u ON saa.technician_id = u.id
-- Cambia esto por el técnico que necesitas
WHERE u.name = 'tecnico'  -- ⚠️ CAMBIA EL NOMBRE AQUÍ
ORDER BY saa.created_at DESC;

-- 3. Ver liquidaciones relacionadas (para referencia)
SELECT 
  '=== LIQUIDACIONES RELACIONADAS ===' as seccion;

SELECT 
  ss.id as settlement_id,
  ss.technician_id,
  u.name as technician_name,
  ss.amount as settlement_amount,
  ss.week_start,
  ss.created_at,
  ss.details->'adjustments' as adjustments_in_settlement
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
-- Cambia esto por el técnico que necesitas
WHERE u.name = 'tecnico'  -- ⚠️ CAMBIA EL NOMBRE AQUÍ
ORDER BY ss.created_at DESC;

-- ============================================
-- INSTRUCCIONES:
-- ============================================
-- 1. Ejecuta este script y encuentra los ajustes de prueba
-- 2. Anota los IDs de los ajustes que quieres eliminar
-- 3. Ejecuta el script ELIMINAR_AJUSTES_PRUEBRA.sql con esos IDs
-- ============================================
