-- ============================================
-- MIGRACIÓN: Sistema de Gastos por Sucursal
-- ============================================
-- Este script crea:
-- 1. Tabla de sucursales (branches)
-- 2. Tabla de gastos hormiga (small_expenses)
-- 3. Tabla de gastos generales (general_expenses)
-- 4. Actualiza tabla users para agregar rol 'encargado' y sucursal_id
-- 5. Actualiza tabla orders para agregar sucursal_id
-- ============================================

-- 1. Crear tabla de sucursales
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Actualizar tabla users para agregar rol 'encargado' y sucursal_id
-- Primero eliminar la constraint antigua
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
-- Agregar nueva constraint con 'encargado'
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'technician', 'encargado'));
-- Agregar columna sucursal_id
ALTER TABLE users ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- 3. Actualizar tabla orders para agregar sucursal_id
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- 4. Crear tabla de gastos hormiga (registrados por encargados)
CREATE TABLE IF NOT EXISTS small_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('aseo', 'mercaderia', 'compras_pequenas')),
  monto NUMERIC NOT NULL CHECK (monto > 0),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  descripcion TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Crear tabla de gastos generales (registrados por administradores)
CREATE TABLE IF NOT EXISTS general_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sucursal_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('arriendo', 'internet', 'luz', 'agua', 'facturas', 'servicios')),
  monto NUMERIC NOT NULL CHECK (monto > 0),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  descripcion TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_users_sucursal ON users(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_orders_sucursal ON orders(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_small_expenses_sucursal ON small_expenses(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_small_expenses_fecha ON small_expenses(fecha);
CREATE INDEX IF NOT EXISTS idx_small_expenses_user ON small_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_general_expenses_sucursal ON general_expenses(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_general_expenses_fecha ON general_expenses(fecha);
CREATE INDEX IF NOT EXISTS idx_general_expenses_user ON general_expenses(user_id);

-- 7. Habilitar RLS en las nuevas tablas
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE small_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_expenses ENABLE ROW LEVEL SECURITY;

-- 8. Políticas RLS para branches
-- Todos los usuarios autenticados pueden ver sucursales
CREATE POLICY "branches_select_all"
  ON branches FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Solo admins pueden crear/actualizar/eliminar sucursales
CREATE POLICY "branches_modify_admin"
  ON branches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.role = 'admin'
    )
  );

-- 9. Políticas RLS para small_expenses (gastos hormiga)
-- Encargados pueden ver gastos de su sucursal
-- Admins pueden ver todos los gastos
CREATE POLICY "small_expenses_select_encargado_or_admin"
  ON small_expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND (
        u.role = 'admin' 
        OR (u.role = 'encargado' AND u.sucursal_id = small_expenses.sucursal_id)
      )
    )
  );

-- Solo encargados pueden crear gastos hormiga en su sucursal
CREATE POLICY "small_expenses_insert_encargado"
  ON small_expenses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.role = 'encargado' 
      AND u.sucursal_id = small_expenses.sucursal_id
    )
  );

-- Solo encargados pueden actualizar gastos de su sucursal
-- Admins pueden actualizar todos
CREATE POLICY "small_expenses_update_encargado_or_admin"
  ON small_expenses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND (
        u.role = 'admin' 
        OR (u.role = 'encargado' AND u.sucursal_id = small_expenses.sucursal_id)
      )
    )
  );

-- Solo admins pueden eliminar gastos hormiga
CREATE POLICY "small_expenses_delete_admin"
  ON small_expenses FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.role = 'admin'
    )
  );

-- 10. Políticas RLS para general_expenses (gastos generales)
-- Solo admins pueden ver gastos generales
CREATE POLICY "general_expenses_select_admin"
  ON general_expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.role = 'admin'
    )
  );

-- Solo admins pueden crear gastos generales
CREATE POLICY "general_expenses_insert_admin"
  ON general_expenses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.role = 'admin'
    )
  );

-- Solo admins pueden actualizar/eliminar gastos generales
CREATE POLICY "general_expenses_modify_admin"
  ON general_expenses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.role = 'admin'
    )
  );

-- 11. Función para actualizar updated_at en branches
CREATE OR REPLACE FUNCTION update_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updated_at
CREATE TRIGGER trigger_update_branches_updated_at
  BEFORE UPDATE ON branches
  FOR EACH ROW
  EXECUTE FUNCTION update_branches_updated_at();

-- 12. Insertar 7 sucursales de ejemplo (puedes modificar los nombres)
INSERT INTO branches (name, address) VALUES
  ('Sucursal 1', 'Dirección Sucursal 1'),
  ('Sucursal 2', 'Dirección Sucursal 2'),
  ('Sucursal 3', 'Dirección Sucursal 3'),
  ('Sucursal 4', 'Dirección Sucursal 4'),
  ('Sucursal 5', 'Dirección Sucursal 5'),
  ('Sucursal 6', 'Dirección Sucursal 6'),
  ('Sucursal 7', 'Dirección Sucursal 7')
ON CONFLICT (name) DO NOTHING;

-- 13. Comentarios para documentar las tablas
COMMENT ON TABLE branches IS 'Sucursales de la empresa. Cada técnico y encargado pertenece a una sucursal.';
COMMENT ON TABLE small_expenses IS 'Gastos hormiga registrados por encargados. Categorías: aseo, mercaderia, compras_pequenas.';
COMMENT ON TABLE general_expenses IS 'Gastos generales registrados por administradores. Categorías: arriendo, internet, luz, agua, facturas, servicios.';
COMMENT ON COLUMN users.sucursal_id IS 'ID de la sucursal a la que pertenece el usuario. NULL para admins.';
COMMENT ON COLUMN orders.sucursal_id IS 'ID de la sucursal a la que pertenece la orden (heredada del técnico).';

-- ============================================
-- NOTAS IMPORTANTES:
-- ============================================
-- 1. Después de ejecutar este script:
--    - Actualiza los usuarios existentes para asignarles una sucursal_id
--    - Actualiza las órdenes existentes para asignarles la sucursal_id del técnico
--
-- 2. Para asignar sucursal a usuarios existentes:
--    UPDATE users SET sucursal_id = (SELECT id FROM branches WHERE name = 'Sucursal 1' LIMIT 1) WHERE role = 'technician' AND sucursal_id IS NULL;
--
-- 3. Para asignar sucursal a órdenes existentes:
--    UPDATE orders SET sucursal_id = (SELECT sucursal_id FROM users WHERE id = orders.technician_id) WHERE sucursal_id IS NULL;



