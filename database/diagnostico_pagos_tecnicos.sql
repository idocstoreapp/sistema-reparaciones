-- ============================================
-- DIAGNÓSTICO: Verificar por qué no se muestran pagos a técnicos
-- ============================================

-- 1. Verificar la semana actual (formato esperado)
SELECT 
  '=== SEMANA ACTUAL ===' as seccion,
  DATE_TRUNC('week', CURRENT_DATE)::DATE as semana_actual;

-- 2. Ver todos los pagos (salary_settlements) existentes
SELECT 
  '=== TODOS LOS PAGOS EN salary_settlements ===' as seccion;

SELECT 
  ss.id,
  ss.technician_id,
  u.name as technician_name,
  u.role,
  u.sucursal_id,
  b.name as sucursal_name,
  ss.week_start,
  ss.amount,
  ss.created_at,
  DATE_TRUNC('week', ss.created_at)::DATE as semana_del_pago
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
LEFT JOIN branches b ON u.sucursal_id = b.id
ORDER BY ss.created_at DESC
LIMIT 20;

-- 3. Verificar técnicos y sus sucursales
SELECT 
  '=== TÉCNICOS Y SUS SUCURSALES ===' as seccion;

SELECT 
  u.id,
  u.name,
  u.role,
  u.sucursal_id,
  b.name as sucursal_name
FROM users u
LEFT JOIN branches b ON u.sucursal_id = b.id
WHERE u.role = 'technician'
ORDER BY b.name, u.name;

-- 4. Ver pagos de la semana actual usando el mismo cálculo que el código
WITH semana_actual AS (
  SELECT DATE_TRUNC('week', CURRENT_DATE)::DATE as week_start
)
SELECT 
  '=== PAGOS DE LA SEMANA ACTUAL (usando DATE_TRUNC) ===' as seccion,
  ss.id,
  ss.technician_id,
  u.name as technician_name,
  u.sucursal_id,
  b.name as sucursal_name,
  ss.week_start,
  ss.amount,
  ss.created_at
FROM salary_settlements ss
CROSS JOIN semana_actual sa
LEFT JOIN users u ON ss.technician_id = u.id
LEFT JOIN branches b ON u.sucursal_id = b.id
WHERE ss.week_start = sa.week_start
  AND u.role = 'technician'
ORDER BY ss.created_at DESC;

-- 5. Ver pagos de técnicos de todas las sucursales (sin filtro de semana)
SELECT 
  '=== PAGOS A TÉCNICOS (TODAS LAS SUCURSALES, SIN FILTRO DE SEMANA) ===' as seccion;

SELECT 
  b.name as sucursal_name,
  COUNT(ss.id) as num_pagos,
  SUM(ss.amount) as total_pagos
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
LEFT JOIN branches b ON u.sucursal_id = b.id
WHERE u.role = 'technician'
GROUP BY b.name
ORDER BY b.name;

-- 6. Verificar el formato de week_start en los pagos
SELECT 
  '=== FORMATO DE week_start EN LOS PAGOS ===' as seccion;

SELECT 
  week_start,
  COUNT(*) as cantidad,
  SUM(amount) as total
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
WHERE u.role = 'technician'
GROUP BY week_start
ORDER BY week_start DESC
LIMIT 10;

-- 7. Comparar fechas: week_start vs semana calculada desde created_at
SELECT 
  '=== COMPARACIÓN: week_start vs semana calculada desde created_at ===' as seccion;

SELECT 
  ss.id,
  ss.week_start,
  DATE_TRUNC('week', ss.created_at)::DATE as semana_desde_created_at,
  ss.week_start = DATE_TRUNC('week', ss.created_at)::DATE as coinciden,
  ss.created_at,
  u.name as technician_name
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
WHERE u.role = 'technician'
ORDER BY ss.created_at DESC
LIMIT 10;

-- ============================================
-- RESULTADO ESPERADO:
-- ============================================
-- Si ves pagos en las consultas pero no aparecen en la app:
-- 1. Verifica que week_start coincida con la semana actual
-- 2. Verifica que los técnicos tengan sucursal_id asignado
-- 3. Verifica que el formato de fecha sea correcto
-- ============================================
