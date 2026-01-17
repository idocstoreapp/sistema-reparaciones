-- ============================================
-- DIAGNÓSTICO: Verificar políticas RLS y permisos
-- ============================================

-- 1. Verificar que la función is_admin existe
SELECT 
  '=== FUNCIÓN is_admin ===' as seccion;

SELECT 
  proname as function_name,
  prosecdef as is_security_definer,
  prosrc as function_body
FROM pg_proc
WHERE proname = 'is_admin';

-- 2. Verificar políticas actuales de salary_settlements
SELECT 
  '=== POLÍTICAS ACTUALES DE salary_settlements ===' as seccion;

SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual as using_clause,
  with_check as with_check_clause
FROM pg_policies
WHERE tablename = 'salary_settlements'
ORDER BY policyname;

-- 3. Verificar el usuario actual y su rol
SELECT 
  '=== USUARIO ACTUAL ===' as seccion;

SELECT 
  auth.uid() as current_user_id,
  (SELECT email FROM auth.users WHERE id = auth.uid()) as current_user_email;

-- 4. Verificar si el usuario actual es admin en la tabla users
SELECT 
  '=== VERIFICAR ROL DEL USUARIO ACTUAL ===' as seccion;

SELECT 
  id,
  name,
  email,
  role,
  sucursal_id
FROM users
WHERE id = auth.uid();

-- 5. Probar la función is_admin() directamente
SELECT 
  '=== PRUEBA DE is_admin() ===' as seccion;

SELECT 
  is_admin() as es_admin,
  auth.uid() as user_id;

-- 6. Verificar si hay otras políticas que puedan estar interfiriendo
SELECT 
  '=== TODAS LAS POLÍTICAS DE salary_settlements ===' as seccion;

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
WHERE tablename = 'salary_settlements'
ORDER BY policyname;

-- ============================================
-- RESULTADO ESPERADO:
-- ============================================
-- 1. La función is_admin() debe existir y tener SECURITY DEFINER = true
-- 2. Debe haber una política de INSERT que use is_admin()
-- 3. El usuario actual debe tener role = 'admin' en la tabla users
-- 4. is_admin() debe retornar true para el usuario actual
-- ============================================
