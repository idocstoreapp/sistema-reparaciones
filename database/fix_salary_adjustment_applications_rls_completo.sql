-- ============================================
-- FIX COMPLETO: Políticas RLS de salary_adjustment_applications
-- ============================================
-- Este script elimina TODAS las políticas existentes y las recrea
-- usando funciones helper con SECURITY DEFINER
-- ============================================

-- PASO 1: Crear/actualizar función helper is_admin() (si no existe)
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

-- PASO 2: Eliminar TODAS las políticas existentes (evitar conflictos)
DROP POLICY IF EXISTS "salary_adj_app_select_own_or_admin" ON salary_adjustment_applications;
DROP POLICY IF EXISTS "salary_adj_app_insert_admin_or_self" ON salary_adjustment_applications;
DROP POLICY IF EXISTS "salary_adj_app_update_admin" ON salary_adjustment_applications;
DROP POLICY IF EXISTS "salary_adj_app_delete_admin" ON salary_adjustment_applications;

-- PASO 3: Crear política de SELECT
CREATE POLICY "salary_adj_app_select_own_or_admin"
  ON salary_adjustment_applications FOR SELECT
  USING (
    technician_id = auth.uid()
    OR is_admin()
  );

-- PASO 4: Crear política de INSERT (CRÍTICA - debe permitir a admins)
CREATE POLICY "salary_adj_app_insert_admin_or_self"
  ON salary_adjustment_applications FOR INSERT
  WITH CHECK (
    technician_id = auth.uid()
    OR is_admin()
  );

-- PASO 5: Crear política de UPDATE para admins
CREATE POLICY "salary_adj_app_update_admin"
  ON salary_adjustment_applications FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- PASO 6: Crear política de DELETE para admins
CREATE POLICY "salary_adj_app_delete_admin"
  ON salary_adjustment_applications FOR DELETE
  USING (is_admin());

-- ============================================
-- VERIFICACIÓN
-- ============================================
SELECT 
  '=== POLÍTICAS CREADAS ===' as seccion;

SELECT 
  policyname,
  cmd,
  qual as using_clause,
  with_check as with_check_clause
FROM pg_policies
WHERE tablename = 'salary_adjustment_applications'
ORDER BY policyname;
