-- ============================================
-- VERIFICAR PAGOS RECIENTES A TÉCNICOS
-- ============================================
-- Este script muestra los pagos más recientes para verificar qué fechas tienen
-- ============================================

-- 1. Ver los últimos pagos a técnicos con todas sus fechas
SELECT 
  '=== ÚLTIMOS PAGOS A TÉCNICOS ===' as seccion;

SELECT 
  ss.id,
  ss.technician_id,
  u.name as technician_name,
  u.sucursal_id,
  b.name as sucursal_name,
  ss.amount,
  ss.week_start,
  ss.created_at,
  -- Extraer solo la fecha (sin hora) para comparar
  DATE(ss.created_at) as fecha_pago,
  -- Ver si está en enero 2026
  CASE 
    WHEN DATE(ss.created_at) >= '2026-01-01' AND DATE(ss.created_at) <= '2026-01-31' 
    THEN '✅ ESTÁ EN ENERO 2026'
    ELSE '❌ NO está en enero 2026'
  END as en_enero_2026,
  ss.payment_method,
  ss.context
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
LEFT JOIN branches b ON u.sucursal_id = b.id
WHERE u.role = 'technician'
ORDER BY ss.created_at DESC
LIMIT 20;

-- 2. Contar pagos por mes
SELECT 
  '=== RESUMEN POR MES ===' as seccion;

SELECT 
  DATE_TRUNC('month', ss.created_at)::DATE as mes,
  COUNT(*) as cantidad_pagos,
  SUM(ss.amount) as total_pagos,
  STRING_AGG(DISTINCT u.name, ', ') as tecnicos
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
WHERE u.role = 'technician'
GROUP BY DATE_TRUNC('month', ss.created_at)
ORDER BY mes DESC
LIMIT 12;

-- 3. Pagos específicos de enero 2026
SELECT 
  '=== PAGOS EN ENERO 2026 ===' as seccion;

SELECT 
  ss.id,
  u.name as technician_name,
  ss.amount,
  ss.created_at,
  DATE(ss.created_at) as fecha_pago,
  u.sucursal_id,
  b.name as sucursal_name
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
LEFT JOIN branches b ON u.sucursal_id = b.id
WHERE u.role = 'technician'
  AND DATE(ss.created_at) >= '2026-01-01'
  AND DATE(ss.created_at) <= '2026-01-31'
ORDER BY ss.created_at DESC;

-- 4. Total de pagos en enero 2026
SELECT 
  '=== TOTAL ENERO 2026 ===' as seccion;

SELECT 
  COUNT(*) as cantidad_pagos,
  SUM(ss.amount) as total_pagos_enero_2026,
  COUNT(DISTINCT ss.technician_id) as tecnicos_pagados
FROM salary_settlements ss
LEFT JOIN users u ON ss.technician_id = u.id
WHERE u.role = 'technician'
  AND DATE(ss.created_at) >= '2026-01-01'
  AND DATE(ss.created_at) <= '2026-01-31';

-- ============================================
-- RESULTADO ESPERADO:
-- ============================================
-- Si hay pagos del 16/01/2026, deberían aparecer en la sección 3 y 4
-- Si no aparecen, puede ser que la fecha en created_at sea diferente
-- ============================================
