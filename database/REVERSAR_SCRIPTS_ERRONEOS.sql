-- ============================================
-- REVERSAR CAMBIOS DE SCRIPTS ERRONEOS
-- ============================================
-- Este script revierte cualquier cambio accidental que los scripts erróneos
-- pudieran haber causado. Los scripts intentaban modificar tablas que NO
-- existen en este sistema, así que probablemente no causaron daño.
-- ============================================

-- 1. Verificar si se crearon tablas incorrectas (NO deberían existir)
SELECT 
  '=== VERIFICACIÓN: Tablas que NO deberían existir ===' as seccion;

SELECT 
  table_name,
  '⚠️ Esta tabla NO pertenece al sistema de reparaciones' as advertencia
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('work_orders', 'profiles')
ORDER BY table_name;

-- Si la consulta anterior NO devuelve resultados = ✅ Todo está bien

-- 2. Si por alguna razón se creó la tabla 'profiles' (NO debería existir), eliminarla
-- ⚠️ SOLO EJECUTAR SI LA CONSULTA ANTERIOR MOSTRÓ QUE EXISTE 'profiles'
/*
DROP TABLE IF EXISTS public.profiles CASCADE;
*/

-- 3. Si por alguna razón se creó la tabla 'work_orders' (NO debería existir), eliminarla
-- ⚠️ SOLO EJECUTAR SI LA CONSULTA ANTERIOR MOSTRÓ QUE EXISTE 'work_orders'
/*
DROP TABLE IF EXISTS public.work_orders CASCADE;
*/

-- 4. Verificar que las foreign keys de las tablas CORRECTAS estén intactas
SELECT 
  '=== VERIFICACIÓN: Foreign Keys de ORDERS (tabla correcta) ===' as seccion;

SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'orders'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY kcu.column_name;

-- 5. Verificar que las tablas del sistema estén intactas
SELECT 
  '=== VERIFICACIÓN: Tablas del Sistema de Reparaciones ===' as seccion;

SELECT 
  table_name,
  '✅ Correcta' as estado
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'orders', 'suppliers', 'salary_adjustments', 
                     'salary_settlements', 'salary_adjustment_applications',
                     'branches', 'small_expenses', 'general_expenses', 
                     'order_notes')
ORDER BY table_name;

-- 6. Contar registros para verificar integridad de datos
SELECT 
  '=== CONTEO DE REGISTROS (para verificar integridad) ===' as seccion;

SELECT 
  'users' as tabla,
  COUNT(*) as total
FROM users
UNION ALL
SELECT 
  'orders' as tabla,
  COUNT(*) as total
FROM orders
UNION ALL
SELECT 
  'salary_adjustments' as tabla,
  COUNT(*) as total
FROM salary_adjustments
UNION ALL
SELECT 
  'salary_settlements' as tabla,
  COUNT(*) as total
FROM salary_settlements;

-- ============================================
-- CONCLUSIÓN:
-- ============================================
-- Si NO ves tablas 'work_orders' o 'profiles' en los resultados:
-- ✅ NO hay daño - Los scripts no pudieron ejecutarse porque las tablas no existen
-- 
-- Si SÍ ves esas tablas (muy poco probable):
-- ⚠️ Ejecuta los DROP TABLE comentados arriba para eliminarlas
-- ============================================
