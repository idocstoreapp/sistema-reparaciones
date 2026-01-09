-- ============================================
-- Script de reparación: Agregar campo 'enabled' si no existe
-- ============================================
-- Ejecutar este script en el SQL Editor de Supabase si los técnicos no pueden iniciar sesión

-- Paso 1: Agregar columna si no existe (nullable primero)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS enabled BOOLEAN;

-- Paso 2: Establecer todos los valores NULL a true (habilitados)
UPDATE users 
SET enabled = true 
WHERE enabled IS NULL;

-- Paso 3: Establecer default a true
ALTER TABLE users 
ALTER COLUMN enabled SET DEFAULT true;

-- Paso 4: Hacer la columna NOT NULL (solo si todos los valores están establecidos)
-- Esto puede fallar si hay NULLs, por eso primero actualizamos arriba
DO $$ 
BEGIN
  -- Verificar si hay valores NULL
  IF NOT EXISTS (SELECT 1 FROM users WHERE enabled IS NULL) THEN
    ALTER TABLE users ALTER COLUMN enabled SET NOT NULL;
  END IF;
END $$;

-- Paso 5: Crear índice si no existe
CREATE INDEX IF NOT EXISTS idx_users_enabled ON users(enabled);

-- Verificar que todo esté bien
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'enabled';

