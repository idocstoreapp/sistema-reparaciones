-- ============================================
-- Script de verificación: Comprobar si los scripts erróneos afectaron algo
-- ============================================
-- Este script verifica que las tablas del sistema de reparaciones estén intactas
-- ============================================

-- 1. Verificar que las tablas correctas existen
SELECT 
  '=== TABLAS DEL SISTEMA DE REPARACIONES ===' as seccion;

SELECT 
  table_name,
  '✅ Existe' as estado
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'orders', 'suppliers', 'salary_adjustments', 
                     'salary_settlements', 'branches', 'small_expenses', 
                     'general_expenses', 'order_notes')
ORDER BY table_name;

-- 2. Verificar que NO existen tablas de otro proyecto
SELECT 
  '=== VERIFICACIÓN: Tablas que NO deberían existir ===' as seccion;

SELECT 
  table_name,
  '⚠️ ATENCIÓN: Esta tabla NO pertenece a este sistema' as advertencia
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('work_orders', 'profiles')
ORDER BY table_name;

-- Si la consulta anterior NO devuelve resultados, significa que no hay problema

-- 3. Verificar estructura de la tabla users (la correcta)
SELECT 
  '=== ESTRUCTURA DE USERS (TABLA CORRECTA) ===' as seccion;

SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- 4. Verificar estructura de la tabla orders (la correcta)
SELECT 
  '=== ESTRUCTURA DE ORDERS (TABLA CORRECTA) ===' as seccion;

SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
ORDER BY ordinal_position
LIMIT 20;

-- 5. Verificar constraints de foreign keys en orders
SELECT 
  '=== FOREIGN KEYS EN ORDERS ===' as seccion;

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

-- 6. Contar registros en tablas principales (para verificar integridad)
SELECT 
  '=== CONTEO DE REGISTROS ===' as seccion;

SELECT 
  'users' as tabla,
  COUNT(*) as total_registros
FROM users
UNION ALL
SELECT 
  'orders' as tabla,
  COUNT(*) as total_registros
FROM orders
UNION ALL
SELECT 
  'salary_adjustments' as tabla,
  COUNT(*) as total_registros
FROM salary_adjustments
UNION ALL
SELECT 
  'salary_settlements' as tabla,
  COUNT(*) as total_registros
FROM salary_settlements;

-- ============================================
-- RESULTADO ESPERADO:
-- ============================================
-- ✅ Las tablas del sistema de reparaciones deben existir
-- ✅ NO deben existir tablas 'work_orders' o 'profiles'
-- ✅ Si no existen esas tablas, los scripts no causaron daño
-- ============================================
