-- ============================================
-- Agregar campo 'enabled' a la tabla users
-- ============================================
-- Ejecutar este script en el SQL Editor de Supabase

-- Agregar columna 'enabled' a la tabla users (por defecto true para usuarios existentes)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true NOT NULL;

-- Actualizar todos los usuarios existentes para que estén habilitados por defecto
UPDATE users SET enabled = true WHERE enabled IS NULL;

-- Crear un índice para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_users_enabled ON users(enabled);


