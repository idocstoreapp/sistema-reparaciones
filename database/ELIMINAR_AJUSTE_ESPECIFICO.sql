-- ============================================
-- ELIMINAR AJUSTE ESPECÍFICO DE PRUEBA
-- ============================================
-- Este script elimina un ajuste específico y sus aplicaciones
-- ⚠️ Basado en el ajuste encontrado en el settlement
-- ============================================

-- AJUSTE A ELIMINAR:
-- ID: 14600391-83b9-4337-9777-118174d4696f
-- Técnico: tecnico (e44d680a-f803-43dc-848d-0d77723da2f3)
-- Monto: 100,000
-- Tipo: advance (adelanto)

-- PASO 1: Verificar qué se va a eliminar
SELECT 
  '=== AJUSTE QUE SE VA A ELIMINAR ===' as seccion;

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
WHERE sa.id = '14600391-83b9-4337-9777-118174d4696f'
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount, sa.note, sa.created_at;

-- PASO 2: Verificar aplicaciones asociadas
SELECT 
  '=== APLICACIONES ASOCIADAS ===' as seccion;

SELECT 
  saa.id as application_id,
  saa.adjustment_id,
  saa.applied_amount,
  saa.week_start,
  saa.created_at
FROM salary_adjustment_applications saa
WHERE saa.adjustment_id = '14600391-83b9-4337-9777-118174d4696f';

-- PASO 3: ELIMINAR (EJECUTA ESTO DESPUÉS DE VERIFICAR)
-- ============================================
-- ⚠️ DESCOMENTA LAS SIGUIENTES LÍNEAS CUANDO ESTÉS SEGURO

-- 1. Eliminar aplicaciones asociadas primero (por foreign key)
DELETE FROM salary_adjustment_applications
WHERE adjustment_id = '14600391-83b9-4337-9777-118174d4696f';

-- 2. Eliminar el ajuste
DELETE FROM salary_adjustments
WHERE id = '14600391-83b9-4337-9777-118174d4696f';

-- 3. Verificar que se eliminó
SELECT 
  '=== VERIFICACIÓN: AJUSTE ELIMINADO ===' as seccion;

SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM salary_adjustments WHERE id = '14600391-83b9-4337-9777-118174d4696f')
    THEN '❌ ERROR: El ajuste aún existe'
    ELSE '✅ ÉXITO: El ajuste fue eliminado correctamente'
  END as resultado;

-- 4. Ver ajustes restantes del técnico
SELECT 
  '=== AJUSTES RESTANTES DEL TÉCNICO ===' as seccion;

SELECT 
  sa.id,
  u.name as technician_name,
  sa.type,
  sa.amount,
  sa.note,
  sa.created_at,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
WHERE u.name = 'tecnico'
GROUP BY sa.id, u.name, sa.type, sa.amount, sa.note, sa.created_at
ORDER BY sa.created_at DESC;

-- ============================================
-- NOTA SOBRE EL SETTLEMENT:
-- ============================================
-- El settlement (liquidación) aún tendrá referencia a este ajuste en el campo
-- details->'adjustments', pero como el ajuste ya no existe en salary_adjustments,
-- no afectará los cálculos ni aparecerá en el historial.
-- ============================================
