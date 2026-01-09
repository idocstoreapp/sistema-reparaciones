-- ============================================
-- Script de reparación: Verificar y corregir políticas de order_notes
-- ============================================
-- Ejecutar este script en el SQL Editor de Supabase si los técnicos no pueden guardar notas

-- Paso 1: Verificar si la tabla existe
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'order_notes'
  ) THEN
    -- Crear la tabla si no existe
    CREATE TABLE order_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      technician_id UUID REFERENCES users(id) ON DELETE SET NULL,
      note TEXT NOT NULL
    );
    
    CREATE INDEX idx_order_notes_order ON order_notes(order_id);
    ALTER TABLE order_notes ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Paso 2: Eliminar políticas existentes si hay problemas
DROP POLICY IF EXISTS "order_notes_insert_own_or_admin" ON order_notes;
DROP POLICY IF EXISTS "order_notes_select_own_or_admin" ON order_notes;
DROP POLICY IF EXISTS "order_notes_update_admin" ON order_notes;
DROP POLICY IF EXISTS "order_notes_delete_admin" ON order_notes;

-- Paso 3: Crear políticas correctas

-- Política para SELECT: técnicos pueden ver notas de sus órdenes, admins pueden ver todas
CREATE POLICY "order_notes_select_own_or_admin"
  ON order_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_notes.order_id
        AND o.technician_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (u.role = 'admin' OR u.role = 'encargado')
    )
  );

-- Política para INSERT: técnicos pueden agregar notas a sus órdenes, admins pueden agregar a cualquier orden
CREATE POLICY "order_notes_insert_own_or_admin"
  ON order_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_notes.order_id
        AND o.technician_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND (u.role = 'admin' OR u.role = 'encargado')
    )
  );

-- Política para UPDATE: solo admins pueden editar
CREATE POLICY "order_notes_update_admin"
  ON order_notes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
    )
  );

-- Política para DELETE: solo admins pueden eliminar
CREATE POLICY "order_notes_delete_admin"
  ON order_notes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
    )
  );

-- Paso 4: Verificar que las políticas se crearon correctamente
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'order_notes'
ORDER BY policyname;
