-- ============================================
-- FIX: Políticas RLS para DELETE de salary_adjustments
-- ============================================
-- Este script asegura que los admins puedan eliminar ajustes
-- ============================================

-- Crear función helper si no existe
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

-- Eliminar política de DELETE existente si existe
DROP POLICY IF EXISTS "salary_adjustments_delete_admin" ON salary_adjustments;
DROP POLICY IF EXISTS "salary_adjustments_delete_own" ON salary_adjustments;

-- Crear política de DELETE para admins
CREATE POLICY "salary_adjustments_delete_admin"
  ON salary_adjustments FOR DELETE
  USING (is_admin());

-- Verificar que se creó
SELECT 
  '=== POLÍTICA DE DELETE CREADA ===' as seccion;

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'salary_adjustments'
  AND cmd = 'DELETE';
