-- ============================================
-- Script de reparación: Corregir error de Foreign Key en order_notes
-- ============================================
-- Ejecutar este script en el SQL Editor de Supabase si aparece el error:
-- "insert or update on table "order_notes" violates foreign key constraint "order_notes_order_id_fkey"
--
-- Este script:
-- 1. Verifica y corrige datos huérfanos en order_notes
-- 2. Verifica que la foreign key constraint esté correctamente configurada
-- 3. Ajusta las políticas RLS para permitir verificación de existencia del order_id

-- ============================================
-- PASO 1: Verificar datos huérfanos (notas con order_id que no existe)
-- ============================================
SELECT 
  'Notas huérfanas encontradas (order_id que no existe en orders):' as diagnostico,
  COUNT(*) as total
FROM order_notes note
LEFT JOIN orders o ON note.order_id = o.id
WHERE o.id IS NULL;

-- Mostrar detalles de las notas huérfanas (si existen)
SELECT 
  note.id as note_id,
  note.order_id,
  note.created_at,
  note.note
FROM order_notes note
LEFT JOIN orders o ON note.order_id = o.id
WHERE o.id IS NULL;

-- ============================================
-- PASO 2: Verificar que la tabla orders existe y tiene datos
-- ============================================
SELECT 
  'Total de órdenes en la tabla orders:' as diagnostico,
  COUNT(*) as total
FROM orders;

-- ============================================
-- PASO 3: Verificar la foreign key constraint
-- ============================================
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
LEFT JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'order_notes'
  AND kcu.column_name = 'order_id';

-- ============================================
-- PASO 4: Eliminar notas huérfanas (OPCIONAL - descomenta si quieres eliminar)
-- ============================================
-- CUIDADO: Esto eliminará todas las notas cuyo order_id no existe en orders
-- Descomenta solo si estás seguro de que quieres eliminar estas notas

/*
DELETE FROM order_notes
WHERE order_id NOT IN (SELECT id FROM orders);
*/

-- ============================================
-- PASO 5: Asegurar que la foreign key constraint existe y está correcta
-- ============================================
DO $$
BEGIN
  -- Verificar si la constraint existe
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'order_notes_order_id_fkey'
      AND table_name = 'order_notes'
  ) THEN
    -- Crear la constraint si no existe
    ALTER TABLE order_notes
    ADD CONSTRAINT order_notes_order_id_fkey
    FOREIGN KEY (order_id)
    REFERENCES orders(id)
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Foreign key constraint creada correctamente';
  ELSE
    RAISE NOTICE 'Foreign key constraint ya existe';
  END IF;
END $$;

-- ============================================
-- PASO 6: Verificar y ajustar políticas RLS para INSERT
-- El problema puede ser que las políticas RLS están bloqueando la verificación
-- de existencia del order_id. Necesitamos asegurarnos de que la política permita
-- verificar que el order_id existe en orders antes de insertar.
-- ============================================

-- Eliminar la política de INSERT existente si hay problemas
DROP POLICY IF EXISTS "order_notes_insert_own_or_admin" ON order_notes;

-- Recrear la política de INSERT con verificación mejorada
CREATE POLICY "order_notes_insert_own_or_admin"
  ON order_notes FOR INSERT
  WITH CHECK (
    -- Verificar que el order_id existe en orders (esto debe pasar primero)
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_notes.order_id
    )
    AND (
      -- Y además, verificar permisos: el usuario debe ser el técnico asignado a la orden
      EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = order_notes.order_id
          AND o.technician_id = auth.uid()
      )
      -- O el usuario debe ser admin o encargado
      OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND (u.role = 'admin' OR u.role = 'encargado')
      )
    )
  );

-- ============================================
-- PASO 7: Verificar que todo está correcto
-- ============================================
SELECT 
  'Diagnóstico final:' as resultado,
  (SELECT COUNT(*) FROM orders) as total_orders,
  (SELECT COUNT(*) FROM order_notes) as total_notes,
  (SELECT COUNT(*) FROM order_notes note 
   LEFT JOIN orders o ON note.order_id = o.id 
   WHERE o.id IS NULL) as notas_huérfanas;

-- Verificar políticas
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN cmd = 'INSERT' THEN 'Política de inserción'
    WHEN cmd = 'SELECT' THEN 'Política de lectura'
    WHEN cmd = 'UPDATE' THEN 'Política de actualización'
    WHEN cmd = 'DELETE' THEN 'Política de eliminación'
  END as descripcion
FROM pg_policies
WHERE tablename = 'order_notes'
ORDER BY cmd, policyname;
