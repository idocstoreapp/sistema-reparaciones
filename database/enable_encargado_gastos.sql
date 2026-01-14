-- ============================================
-- Script: Habilitar encargados para agregar gastos hormiga y generales
-- ============================================
-- Este script actualiza las políticas RLS para permitir que los encargados:
-- 1. Puedan agregar gastos hormiga en su sucursal (ya debería funcionar)
-- 2. Puedan agregar gastos generales en su sucursal (NUEVO)
-- 3. Puedan ver y editar gastos generales de su sucursal (NUEVO)
-- ============================================

-- 1. Verificar que las funciones helper existen
-- (Si no existen, se crearán automáticamente)

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

CREATE OR REPLACE FUNCTION is_encargado()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM users 
    WHERE id = auth.uid() 
    AND role = 'encargado'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_user_sucursal_id()
RETURNS UUID AS $$
DECLARE
  user_sucursal_id UUID;
BEGIN
  SELECT sucursal_id INTO user_sucursal_id
  FROM users
  WHERE id = auth.uid()
  AND role = 'encargado';
  
  RETURN user_sucursal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Actualizar políticas RLS para general_expenses (gastos generales)

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "general_expenses_select_admin" ON general_expenses;
DROP POLICY IF EXISTS "general_expenses_insert_admin" ON general_expenses;
DROP POLICY IF EXISTS "general_expenses_update_admin" ON general_expenses;
DROP POLICY IF EXISTS "general_expenses_delete_admin" ON general_expenses;

-- SELECT: Admins pueden ver todos, encargados solo los de su sucursal
CREATE POLICY "general_expenses_select_admin_or_encargado"
  ON general_expenses FOR SELECT
  USING (
    is_admin()
    OR (
      is_encargado()
      AND get_current_user_sucursal_id() IS NOT NULL
      AND general_expenses.sucursal_id = get_current_user_sucursal_id()
    )
  );

-- INSERT: Admins pueden crear en cualquier sucursal, encargados solo en su sucursal
CREATE POLICY "general_expenses_insert_admin_or_encargado"
  ON general_expenses FOR INSERT
  WITH CHECK (
    is_admin()
    OR (
      is_encargado()
      AND get_current_user_sucursal_id() IS NOT NULL
      AND general_expenses.sucursal_id = get_current_user_sucursal_id()
    )
  );

-- UPDATE: Admins pueden actualizar todos, encargados solo los de su sucursal
CREATE POLICY "general_expenses_update_admin_or_encargado"
  ON general_expenses FOR UPDATE
  USING (
    is_admin()
    OR (
      is_encargado()
      AND get_current_user_sucursal_id() IS NOT NULL
      AND general_expenses.sucursal_id = get_current_user_sucursal_id()
    )
  )
  WITH CHECK (
    is_admin()
    OR (
      is_encargado()
      AND get_current_user_sucursal_id() IS NOT NULL
      AND general_expenses.sucursal_id = get_current_user_sucursal_id()
    )
  );

-- DELETE: Solo admins pueden eliminar
CREATE POLICY "general_expenses_delete_admin"
  ON general_expenses FOR DELETE
  USING (is_admin());

-- 3. Verificar que las políticas de small_expenses también están correctas
-- (Por si acaso, las recreamos para asegurar consistencia)

DROP POLICY IF EXISTS "small_expenses_select_admin_or_encargado" ON small_expenses;
DROP POLICY IF EXISTS "small_expenses_insert_admin_or_encargado" ON small_expenses;
DROP POLICY IF EXISTS "small_expenses_update_admin_or_encargado" ON small_expenses;
DROP POLICY IF EXISTS "small_expenses_delete_admin" ON small_expenses;

-- SELECT: Admins pueden ver todos, encargados solo los de su sucursal
CREATE POLICY "small_expenses_select_admin_or_encargado"
  ON small_expenses FOR SELECT
  USING (
    is_admin()
    OR (
      is_encargado()
      AND get_current_user_sucursal_id() IS NOT NULL
      AND small_expenses.sucursal_id = get_current_user_sucursal_id()
    )
  );

-- INSERT: Admins pueden crear en cualquier sucursal, encargados solo en su sucursal
CREATE POLICY "small_expenses_insert_admin_or_encargado"
  ON small_expenses FOR INSERT
  WITH CHECK (
    is_admin()
    OR (
      is_encargado()
      AND get_current_user_sucursal_id() IS NOT NULL
      AND small_expenses.sucursal_id = get_current_user_sucursal_id()
    )
  );

-- UPDATE: Admins pueden actualizar todos, encargados solo los de su sucursal
CREATE POLICY "small_expenses_update_admin_or_encargado"
  ON small_expenses FOR UPDATE
  USING (
    is_admin()
    OR (
      is_encargado()
      AND get_current_user_sucursal_id() IS NOT NULL
      AND small_expenses.sucursal_id = get_current_user_sucursal_id()
    )
  )
  WITH CHECK (
    is_admin()
    OR (
      is_encargado()
      AND get_current_user_sucursal_id() IS NOT NULL
      AND small_expenses.sucursal_id = get_current_user_sucursal_id()
    )
  );

-- DELETE: Solo admins pueden eliminar
CREATE POLICY "small_expenses_delete_admin"
  ON small_expenses FOR DELETE
  USING (is_admin());

-- 4. Verificar que las políticas se crearon correctamente
SELECT 
  '=== POLÍTICAS PARA SMALL_EXPENSES ===' as seccion;

SELECT 
  policyname,
  cmd,
  CASE 
    WHEN cmd = 'SELECT' THEN 'Ver'
    WHEN cmd = 'INSERT' THEN 'Crear'
    WHEN cmd = 'UPDATE' THEN 'Actualizar'
    WHEN cmd = 'DELETE' THEN 'Eliminar'
  END as accion
FROM pg_policies
WHERE tablename = 'small_expenses'
ORDER BY cmd, policyname;

SELECT 
  '=== POLÍTICAS PARA GENERAL_EXPENSES ===' as seccion;

SELECT 
  policyname,
  cmd,
  CASE 
    WHEN cmd = 'SELECT' THEN 'Ver'
    WHEN cmd = 'INSERT' THEN 'Crear'
    WHEN cmd = 'UPDATE' THEN 'Actualizar'
    WHEN cmd = 'DELETE' THEN 'Eliminar'
  END as accion
FROM pg_policies
WHERE tablename = 'general_expenses'
ORDER BY cmd, policyname;

-- 5. Verificar funciones creadas
SELECT 
  '=== FUNCIONES HELPER ===' as seccion;

SELECT 
  proname as function_name,
  'Creada' as estado
FROM pg_proc
WHERE proname IN ('is_admin', 'is_encargado', 'get_current_user_sucursal_id')
ORDER BY proname;

-- ============================================
-- RESUMEN DE PERMISOS:
-- ============================================
-- ADMIN:
--   - Puede ver/crear/editar/eliminar todos los gastos (hormiga y generales) de todas las sucursales
--
-- ENCARGADO:
--   - Puede ver/crear/editar gastos hormiga de su sucursal
--   - Puede ver/crear/editar gastos generales de su sucursal
--   - NO puede eliminar gastos (solo admins)
--   - NO puede ver/crear gastos de otras sucursales
--
-- IMPORTANTE: Los encargados deben tener sucursal_id asignado en la tabla users
-- ============================================
