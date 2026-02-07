-- ============================================
-- DIAGNÓSTICO: Adelanto de 100 mil que no aparece
-- ============================================
-- Este script ayuda a identificar por qué un adelanto específico
-- no aparece en el panel del admin
-- ============================================

-- 1. Buscar todos los adelantos de 100,000
SELECT 
  '=== ADELANTOS DE 100,000 ===' as seccion;

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
WHERE sa.amount = 100000
  AND sa.type = 'advance'
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount, sa.note, sa.created_at, sa.available_from
ORDER BY sa.created_at DESC;

-- 2. Verificar si hay aplicaciones que suman más del monto
SELECT 
  '=== VERIFICAR INTEGRIDAD (aplicaciones > monto) ===' as seccion;

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
WHERE sa.amount = 100000
  AND sa.type = 'advance'
GROUP BY sa.id, sa.amount
HAVING COALESCE(SUM(saa.applied_amount), 0) > sa.amount  -- Solo mostrar problemas
   OR COALESCE(SUM(saa.applied_amount), 0) = sa.amount;  -- O completamente aplicados

-- 3. Ver todas las aplicaciones de estos adelantos
SELECT 
  '=== APLICACIONES DE ADELANTOS DE 100,000 ===' as seccion;

SELECT 
  saa.id as application_id,
  saa.adjustment_id,
  sa.amount as adjustment_amount,
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

-- 4. Verificar si el ajuste está disponible esta semana
SELECT 
  '=== DISPONIBILIDAD ESTA SEMANA ===' as seccion;

SELECT 
  sa.id,
  sa.amount,
  sa.created_at,
  sa.available_from,
  CASE 
    WHEN sa.available_from IS NULL THEN sa.created_at::date
    ELSE sa.available_from
  END as fecha_disponible,
  CURRENT_DATE as fecha_actual,
  CASE 
    WHEN sa.available_from IS NULL THEN 
      CASE 
        WHEN sa.created_at::date <= CURRENT_DATE THEN '✅ Disponible'
        ELSE '❌ No disponible aún'
      END
    ELSE 
      CASE 
        WHEN sa.available_from <= CURRENT_DATE THEN '✅ Disponible'
        ELSE '❌ No disponible hasta ' || sa.available_from::text
      END
  END as estado_disponibilidad,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
WHERE sa.amount = 100000
  AND sa.type = 'advance'
GROUP BY sa.id, sa.amount, sa.created_at, sa.available_from
ORDER BY sa.created_at DESC;

-- 5. Verificar políticas RLS para este ajuste
SELECT 
  '=== VERIFICAR POLÍTICAS RLS ===' as seccion;

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

-- 6. Probar si un admin puede ver el ajuste
-- (Ejecuta esto como admin en Supabase)
SELECT 
  '=== PRUEBA DE VISIBILIDAD (como admin) ===' as seccion;

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
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
WHERE sa.amount = 100000
  AND sa.type = 'advance'
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount, sa.note, sa.created_at, sa.available_from
ORDER BY sa.created_at DESC;

-- 7. Verificar si hay liquidaciones que aplicaron este adelanto
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
