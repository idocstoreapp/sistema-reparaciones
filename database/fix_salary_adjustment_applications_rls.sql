-- ============================================
-- CORREGIR POLÍTICAS RLS DE salary_adjustment_applications
-- ============================================
-- Este script actualiza las políticas de seguridad usando funciones helper
-- con SECURITY DEFINER para evitar recursión en RLS
-- ============================================

-- 1. Crear función helper para verificar si el usuario es admin (si no existe)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM users 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Eliminar políticas existentes para recrearlas
DROP POLICY IF EXISTS "salary_adj_app_select_own_or_admin" ON salary_adjustment_applications;
DROP POLICY IF EXISTS "salary_adj_app_insert_admin_or_self" ON salary_adjustment_applications;

-- 3. Crear política de SELECT usando la función helper
CREATE POLICY "salary_adj_app_select_own_or_admin"
  ON salary_adjustment_applications FOR SELECT
  USING (
    technician_id = auth.uid()
    OR is_admin()
  );

-- 4. Crear política de INSERT usando la función helper
CREATE POLICY "salary_adj_app_insert_admin_or_self"
  ON salary_adjustment_applications FOR INSERT
  WITH CHECK (
    technician_id = auth.uid()
    OR is_admin()
  );

-- ============================================
-- VERIFICACIÓN
-- ============================================
-- Ejecuta esto después para verificar las políticas:
SELECT 
  '=== POLÍTICAS DE salary_adjustment_applications ===' as seccion;

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
WHERE tablename = 'salary_adjustment_applications'
ORDER BY policyname;

-- ============================================
-- NOTA IMPORTANTE
-- ============================================
-- Si aún no funciona después de ejecutar este script:
-- 1. Verifica que tu usuario en Supabase tenga el rol 'admin' en la tabla users
-- 2. Verifica que estés autenticado correctamente
-- 3. Revisa si hay otras políticas que puedan estar interfiriendo
-- ============================================
