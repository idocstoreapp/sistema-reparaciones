-- ============================================
-- FIX COMPLETO: Políticas RLS de salary_settlements
-- ============================================
-- Este script elimina TODAS las políticas existentes y las recrea
-- usando funciones helper con SECURITY DEFINER
-- ============================================

-- PASO 1: Crear/actualizar función helper is_admin()
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
DROP POLICY IF EXISTS "salary_settlements_insert_admin_or_self" ON salary_settlements;
DROP POLICY IF EXISTS "salary_settlements_select_own_or_admin" ON salary_settlements;
DROP POLICY IF EXISTS "salary_settlements_update_admin" ON salary_settlements;
DROP POLICY IF EXISTS "salary_settlements_delete_admin" ON salary_settlements;

-- PASO 3: Crear política de SELECT
CREATE POLICY "salary_settlements_select_own_or_admin"
  ON salary_settlements FOR SELECT
  USING (
    technician_id = auth.uid()
    OR is_admin()
  );

-- PASO 4: Crear política de INSERT (CRÍTICA - debe permitir a admins)
CREATE POLICY "salary_settlements_insert_admin_or_self"
  ON salary_settlements FOR INSERT
  WITH CHECK (
    technician_id = auth.uid()
    OR is_admin()
  );

-- PASO 5: Crear política de UPDATE para admins
CREATE POLICY "salary_settlements_update_admin"
  ON salary_settlements FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- PASO 6: Crear política de DELETE para admins
CREATE POLICY "salary_settlements_delete_admin"
  ON salary_settlements FOR DELETE
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
WHERE tablename = 'salary_settlements'
ORDER BY policyname;

-- ============================================
-- PRUEBA MANUAL (opcional - descomenta para probar)
-- ============================================
-- Si quieres probar manualmente si puedes insertar:
-- INSERT INTO salary_settlements (technician_id, week_start, amount)
-- SELECT 
--   (SELECT id FROM users WHERE role = 'technician' LIMIT 1),
--   CURRENT_DATE,
--   1000
-- WHERE is_admin();
-- ============================================
