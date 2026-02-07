-- ============================================
-- CORREGIR ADELANTO DE 100,000 QUE NO APARECE
-- ============================================
-- Este script ayuda a corregir el adelanto de 100 mil
-- que no aparece en el panel del admin
-- ============================================

-- PASO 1: Verificar el estado actual del adelanto
SELECT 
  '=== ESTADO ACTUAL DEL ADELANTO DE 100,000 ===' as seccion;

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
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) <= 0 THEN '✅ SALDADO (por eso no aparece)'
    WHEN sa.amount - COALESCE(SUM(saa.applied_amount), 0) > 0 THEN '⚠️ PENDIENTE (debería aparecer)'
    ELSE '❓ DESCONOCIDO'
  END as estado
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
WHERE sa.amount = 100000
  AND sa.type = 'advance'
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount, sa.note, sa.created_at, sa.available_from
ORDER BY sa.created_at DESC;

-- PASO 2: Ver todas las aplicaciones de este adelanto
SELECT 
  '=== APLICACIONES DEL ADELANTO ===' as seccion;

SELECT 
  saa.id,
  saa.adjustment_id,
  saa.applied_amount,
  saa.week_start,
  saa.created_at,
  u.name as technician_name
FROM salary_adjustment_applications saa
LEFT JOIN salary_adjustments sa ON saa.adjustment_id = sa.id
LEFT JOIN users u ON saa.technician_id = u.id
WHERE sa.amount = 100000
  AND sa.type = 'advance'
ORDER BY saa.created_at DESC;

-- PASO 3: OPCIÓN A - Si el adelanto está completamente aplicado pero NO debería estarlo
-- Eliminar las aplicaciones incorrectas (CUIDADO: solo si estás seguro)
-- ⚠️ DESCOMENTA Y AJUSTA EL ID DEL ADELANTO SI NECESITAS ELIMINAR APLICACIONES

/*
-- Primero, verifica qué aplicaciones eliminar:
SELECT 
  saa.id,
  saa.adjustment_id,
  saa.applied_amount,
  saa.week_start,
  saa.created_at
FROM salary_adjustment_applications saa
LEFT JOIN salary_adjustments sa ON saa.adjustment_id = sa.id
WHERE sa.amount = 100000
  AND sa.type = 'advance'
ORDER BY saa.created_at DESC;

-- Si quieres eliminar TODAS las aplicaciones de este adelanto:
DELETE FROM salary_adjustment_applications
WHERE adjustment_id IN (
  SELECT id FROM salary_adjustments 
  WHERE amount = 100000 AND type = 'advance'
);
*/

-- PASO 4: OPCIÓN B - Si el adelanto está completamente aplicado y ES CORRECTO
-- Entonces el adelanto NO debería aparecer en "pendientes" pero SÍ en "saldados"
-- Verificar que aparezca en la sección de "Ajustes Saldados"

-- PASO 5: OPCIÓN C - Si hay un problema con available_from
-- Resetear available_from para que esté disponible esta semana
-- ⚠️ DESCOMENTA Y AJUSTA EL ID DEL ADELANTO SI NECESITAS RESETEAR available_from

/*
UPDATE salary_adjustments
SET available_from = NULL
WHERE amount = 100000
  AND type = 'advance'
  AND available_from IS NOT NULL;
*/

-- PASO 6: Verificar liquidaciones que aplicaron este adelanto
SELECT 
  '=== LIQUIDACIONES QUE APLICARON ESTE ADELANTO ===' as seccion;

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
WHERE ss.details->'adjustments' IS NOT NULL
  AND EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(ss.details->'adjustments') as adj
    WHERE (adj->>'id')::text IN (
      SELECT id::text 
      FROM salary_adjustments 
      WHERE amount = 100000 AND type = 'advance'
    )
  )
ORDER BY ss.created_at DESC;

-- ============================================
-- INSTRUCCIONES:
-- ============================================
-- 1. Ejecuta este script para ver el estado del adelanto
-- 2. Si el adelanto está "SALDADO", aparecerá en la sección "Ajustes Saldados"
-- 3. Si quieres que aparezca en "Pendientes", necesitas eliminar las aplicaciones
-- 4. Si el problema es available_from, resetea ese campo
-- ============================================
