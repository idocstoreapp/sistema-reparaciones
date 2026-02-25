-- Opcional: crear tabla "orders_notes" si en tu proyecto la tabla de notas tiene ese nombre.
-- La aplicación por defecto usa la tabla "order_notes" (ver add_order_notes.sql).
-- Si el error menciona la tabla "orders_notes", ejecuta este script y cambia en el código
-- las referencias de "order_notes" a "orders_notes", o renombra esta tabla a "order_notes".

CREATE TABLE IF NOT EXISTS orders_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_notes_order ON orders_notes(order_id);

ALTER TABLE orders_notes ENABLE ROW LEVEL SECURITY;

-- Políticas básicas (ajustar si ya tienes otras)
DROP POLICY IF EXISTS "orders_notes_select_own_or_admin" ON orders_notes;
CREATE POLICY "orders_notes_select_own_or_admin"
  ON orders_notes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = orders_notes.order_id AND o.technician_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS "orders_notes_insert_own_or_admin" ON orders_notes;
CREATE POLICY "orders_notes_insert_own_or_admin"
  ON orders_notes FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = orders_notes.order_id AND o.technician_id = auth.uid())
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS "orders_notes_update_admin" ON orders_notes;
CREATE POLICY "orders_notes_update_admin"
  ON orders_notes FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'));

DROP POLICY IF EXISTS "orders_notes_delete_admin" ON orders_notes;
CREATE POLICY "orders_notes_delete_admin"
  ON orders_notes FOR DELETE
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'));
