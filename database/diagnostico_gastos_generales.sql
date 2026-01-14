-- ============================================
-- Script de diagnóstico: KPI de Gastos Generales no muestra datos
-- ============================================
-- Ejecutar este script en el SQL Editor de Supabase para diagnosticar el problema

-- ============================================
-- PASO 1: Verificar que la tabla existe
-- ============================================
SELECT 
  'Verificando existencia de tabla general_expenses:' as diagnostico,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'general_expenses'
  ) as tabla_existe;

-- ============================================
-- PASO 2: Verificar datos en la tabla
-- ============================================
SELECT 
  'Total de registros en general_expenses:' as diagnostico,
  COUNT(*) as total_registros
FROM general_expenses;

-- Mostrar algunos registros de ejemplo
SELECT 
  id,
  sucursal_id,
  user_id,
  tipo,
  monto,
  fecha,
  created_at
FROM general_expenses
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- PASO 3: Verificar suma total de montos
-- ============================================
SELECT 
  'Suma total de montos en general_expenses:' as diagnostico,
  COALESCE(SUM(monto), 0) as total_montos
FROM general_expenses;

-- ============================================
-- PASO 4: Verificar políticas RLS
-- ============================================
SELECT 
  'Políticas RLS para general_expenses:' as diagnostico,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'general_expenses'
ORDER BY policyname;

-- ============================================
-- PASO 5: Verificar funciones helper
-- ============================================
SELECT 
  'Funciones helper existentes:' as diagnostico,
  proname as function_name,
  prosrc as function_source
FROM pg_proc
WHERE proname IN ('is_admin', 'is_encargado', 'get_current_user_sucursal_id')
ORDER BY proname;

-- ============================================
-- PASO 6: Verificar RLS está habilitado
-- ============================================
SELECT 
  'RLS habilitado en general_expenses:' as diagnostico,
  relname as tabla,
  relrowsecurity as rls_habilitado
FROM pg_class
WHERE relname = 'general_expenses';

-- ============================================
-- PASO 7: Probar función is_admin() con usuario actual
-- ============================================
-- NOTA: Esto solo funciona si estás autenticado
SELECT 
  'Usuario actual es admin:' as diagnostico,
  is_admin() as es_admin,
  auth.uid() as user_id;

-- ============================================
-- PASO 8: Verificar permisos del usuario actual
-- ============================================
SELECT 
  'Información del usuario actual:' as diagnostico,
  u.id,
  u.name,
  u.email,
  u.role,
  u.sucursal_id
FROM users u
WHERE u.id = auth.uid();

-- ============================================
-- PASO 9: Intentar consulta directa (simulando lo que hace la app)
-- ============================================
-- Esta consulta debería funcionar si las políticas RLS están correctas
SELECT 
  'Consulta de prueba (debería mostrar datos si RLS permite):' as diagnostico,
  COUNT(*) as total_registros_visibles,
  COALESCE(SUM(monto), 0) as total_montos_visibles
FROM general_expenses;

-- ============================================
-- PASO 10: Verificar si hay registros por sucursal
-- ============================================
SELECT 
  b.name as sucursal,
  COUNT(ge.id) as cantidad_gastos,
  COALESCE(SUM(ge.monto), 0) as total_montos
FROM branches b
LEFT JOIN general_expenses ge ON b.id = ge.sucursal_id
GROUP BY b.id, b.name
ORDER BY b.name;

-- ============================================
-- PASO 11: Verificar estructura de la tabla
-- ============================================
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'general_expenses'
ORDER BY ordinal_position;
