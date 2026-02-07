-- ============================================
-- DIAGNÓSTICO: Ajustes que no aparecen al admin
-- ============================================
-- Este script ayuda a identificar por qué un ajuste no aparece
-- ============================================

-- 1. Ver TODOS los ajustes de un técnico específico
-- Reemplaza 'TECHNICIAN_ID' con el ID del técnico problemático
SELECT 
  '=== TODOS LOS AJUSTES DEL TÉCNICO ===' as seccion;

SELECT 
  sa.id,
  sa.technician_id,
  u.name as technician_name,
  sa.type,
  sa.amount,
  sa.note,
  sa.created_at,
  sa.available_from,
  -- Calcular aplicaciones totales
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  -- Calcular saldo restante
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
-- ⚠️ CAMBIA ESTO: Reemplaza con el ID o nombre del técnico
WHERE u.name = 'NOMBRE_DEL_TECNICO'  -- O: sa.technician_id = 'UUID_DEL_TECNICO'
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount, sa.note, sa.created_at, sa.available_from
ORDER BY sa.created_at DESC;

-- 2. Verificar aplicaciones de cada ajuste
SELECT 
  '=== APLICACIONES DE AJUSTES ===' as seccion;

SELECT 
  saa.id as application_id,
  saa.adjustment_id,
  sa.type as adjustment_type,
  sa.amount as adjustment_amount,
  saa.applied_amount,
  saa.week_start,
  saa.created_at,
  u.name as technician_name
FROM salary_adjustment_applications saa
LEFT JOIN salary_adjustments sa ON saa.adjustment_id = sa.id
LEFT JOIN users u ON saa.technician_id = u.id
-- ⚠️ CAMBIA ESTO: Reemplaza con el ID o nombre del técnico
WHERE u.name = 'NOMBRE_DEL_TECNICO'  -- O: saa.technician_id = 'UUID_DEL_TECNICO'
ORDER BY saa.created_at DESC;

-- 3. Verificar políticas RLS
SELECT 
  '=== POLÍTICAS RLS DE salary_adjustments ===' as seccion;

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'salary_adjustments'
ORDER BY cmd, policyname;

-- 4. Verificar si el usuario actual es admin
SELECT 
  '=== VERIFICAR USUARIO ACTUAL ===' as seccion;

SELECT 
  auth.uid() as current_user_id,
  u.id,
  u.name,
  u.role,
  CASE 
    WHEN u.role = 'admin' THEN '✅ ES ADMIN'
    ELSE '❌ NO ES ADMIN'
  END as es_admin
FROM users u
WHERE u.id = auth.uid();

-- 5. Probar si el admin puede ver el ajuste
SELECT 
  '=== PRUEBA DE VISIBILIDAD (como admin) ===' as seccion;

-- Esto debería mostrar todos los ajustes si eres admin
SELECT 
  sa.id,
  sa.technician_id,
  u.name as technician_name,
  sa.type,
  sa.amount,
  sa.note,
  sa.created_at
FROM salary_adjustments sa
LEFT JOIN users u ON sa.technician_id = u.id
-- ⚠️ CAMBIA ESTO: Reemplaza con el ID o nombre del técnico
WHERE u.name = 'NOMBRE_DEL_TECNICO'  -- O: sa.technician_id = 'UUID_DEL_TECNICO'
ORDER BY sa.created_at DESC;

-- 6. Verificar si hay problemas con aplicaciones
SELECT 
  '=== VERIFICAR INTEGRIDAD DE APLICACIONES ===' as seccion;

SELECT 
  sa.id as adjustment_id,
  sa.amount as adjustment_amount,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining,
  CASE 
    WHEN COALESCE(SUM(saa.applied_amount), 0) > sa.amount THEN '❌ ERROR: Aplicaciones exceden el monto'
    WHEN COALESCE(SUM(saa.applied_amount), 0) = sa.amount THEN '✅ Completamente aplicado'
    WHEN COALESCE(SUM(saa.applied_amount), 0) < sa.amount THEN '⚠️ Parcialmente aplicado'
    ELSE '❓ Sin aplicaciones'
  END as estado
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
-- ⚠️ CAMBIA ESTO: Reemplaza con el ID o nombre del técnico
WHERE u.name = 'NOMBRE_DEL_TECNICO'  -- O: sa.technician_id = 'UUID_DEL_TECNICO'
GROUP BY sa.id, sa.amount
HAVING COALESCE(SUM(saa.applied_amount), 0) > sa.amount  -- Solo mostrar problemas
   OR COALESCE(SUM(saa.applied_amount), 0) = sa.amount;  -- O completamente aplicados
