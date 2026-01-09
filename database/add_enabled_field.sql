-- ============================================
-- Agregar campo 'enabled' a la tabla users
-- ============================================
-- Ejecutar este script en el SQL Editor de Supabase

-- Agregar columna 'enabled' a la tabla users (si no existe)
-- Primero agregar como nullable para poder actualizar valores existentes
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'enabled'
  ) THEN
    ALTER TABLE users ADD COLUMN enabled BOOLEAN;
  END IF;
END $$;

-- Actualizar todos los usuarios existentes para que estén habilitados por defecto
UPDATE users SET enabled = true WHERE enabled IS NULL;

-- Ahora hacer la columna NOT NULL con default (solo si no es NOT NULL ya)
DO $$ 
BEGIN
  -- Verificar si la columna es nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'enabled' 
    AND is_nullable = 'YES'
  ) THEN
    -- Primero establecer default
    ALTER TABLE users ALTER COLUMN enabled SET DEFAULT true;
    -- Luego hacer NOT NULL
    ALTER TABLE users ALTER COLUMN enabled SET NOT NULL;
  END IF;
END $$;

-- Crear un índice para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_users_enabled ON users(enabled);



