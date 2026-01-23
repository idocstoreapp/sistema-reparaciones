-- ============================================
-- ELIMINAR AJUSTES DE PRUEBA
-- ============================================
-- Este script elimina ajustes específicos y sus aplicaciones asociadas
-- ⚠️ IMPORTANTE: Cambia los IDs en el WHERE antes de ejecutar
-- ============================================

-- PASO 1: Verificar qué se va a eliminar (EJECUTA ESTO PRIMERO)
SELECT 
  '=== AJUSTES QUE SE VAN A ELIMINAR ===' as seccion;

SELECT 
  sa.id as adjustment_id,
  sa.technician_id,
  u.name as technician_name,
  sa.type,
  sa.amount,
  sa.note,
  sa.created_at,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  COUNT(saa.id) as num_aplicaciones_asociadas
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
-- ⚠️ CAMBIA ESTOS IDs POR LOS QUE QUIERES ELIMINAR
WHERE sa.id IN (
  'REEMPLAZA-CON-ID-1',  -- ⚠️ ID del primer ajuste de prueba
  'REEMPLAZA-CON-ID-2'   -- ⚠️ ID del segundo ajuste de prueba
)
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount, sa.note, sa.created_at;

-- PASO 2: Verificar aplicaciones que se van a eliminar
SELECT 
  '=== APLICACIONES QUE SE VAN A ELIMINAR ===' as seccion;

SELECT 
  saa.id as application_id,
  saa.adjustment_id,
  sa.type as adjustment_type,
  saa.applied_amount,
  saa.week_start,
  u.name as technician_name
FROM salary_adjustment_applications saa
LEFT JOIN salary_adjustments sa ON saa.adjustment_id = sa.id
LEFT JOIN users u ON saa.technician_id = u.id
-- ⚠️ CAMBIA ESTOS IDs POR LOS QUE QUIERES ELIMINAR
WHERE saa.adjustment_id IN (
  'REEMPLAZA-CON-ID-1',  -- ⚠️ ID del primer ajuste de prueba
  'REEMPLAZA-CON-ID-2'   -- ⚠️ ID del segundo ajuste de prueba
);

-- ============================================
-- PASO 3: ELIMINAR (EJECUTA SOLO DESPUÉS DE VERIFICAR)
-- ============================================
-- ⚠️ DESCOMENTA LAS SIGUIENTES LÍNEAS CUANDO ESTÉS SEGURO
-- ⚠️ Y CAMBIA LOS IDs EN EL WHERE

/*
-- 1. Eliminar aplicaciones asociadas primero (por foreign key)
DELETE FROM salary_adjustment_applications
WHERE adjustment_id IN (
  'REEMPLAZA-CON-ID-1',  -- ⚠️ ID del primer ajuste de prueba
  'REEMPLAZA-CON-ID-2'   -- ⚠️ ID del segundo ajuste de prueba
);

-- 2. Eliminar los ajustes
DELETE FROM salary_adjustments
WHERE id IN (
  'REEMPLAZA-CON-ID-1',  -- ⚠️ ID del primer ajuste de prueba
  'REEMPLAZA-CON-ID-2'   -- ⚠️ ID del segundo ajuste de prueba
);

-- 3. Verificar que se eliminaron
SELECT 
  '=== VERIFICACIÓN: AJUSTES RESTANTES ===' as seccion;

SELECT 
  sa.id,
  u.name as technician_name,
  sa.type,
  sa.amount,
  sa.created_at
FROM salary_adjustments sa
LEFT JOIN users u ON sa.technician_id = u.id
WHERE u.name = 'Yohannys'  -- ⚠️ CAMBIA EL NOMBRE DEL TÉCNICO
ORDER BY sa.created_at DESC;
*/

-- ============================================
-- VERSIÓN ALTERNATIVA: ELIMINAR POR FECHA
-- ============================================
-- Si prefieres eliminar todos los ajustes creados en un rango de fechas:
/*
DELETE FROM salary_adjustment_applications
WHERE adjustment_id IN (
  SELECT id FROM salary_adjustments
  WHERE technician_id = 'REEMPLAZA-CON-ID-TECNICO'
    AND created_at >= '2025-01-20 00:00:00'  -- ⚠️ Fecha de inicio
    AND created_at <= '2025-01-20 23:59:59'  -- ⚠️ Fecha de fin
);

DELETE FROM salary_adjustments
WHERE technician_id = 'REEMPLAZA-CON-ID-TECNICO'
  AND created_at >= '2025-01-20 00:00:00'  -- ⚠️ Fecha de inicio
  AND created_at <= '2025-01-20 23:59:59';  -- ⚠️ Fecha de fin
*/
