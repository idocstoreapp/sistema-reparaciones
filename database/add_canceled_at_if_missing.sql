-- Asegurar que la tabla orders tenga la columna que usa el schema cache (canceled_at).
-- Si tienes el error "could not find the canceled_at column of orders on the schema cache",
-- ejecuta este script y luego en el SQL Editor: NOTIFY pgrst, 'reload schema';

-- Añadir columna canceled_at si no existe (nombre que espera PostgREST/schema cache)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP WITH TIME ZONE;

-- Si ya tenías cancelled_at (británico), copiar valores a canceled_at
UPDATE orders
SET canceled_at = cancelled_at
WHERE cancelled_at IS NOT NULL AND (canceled_at IS NULL OR canceled_at <> cancelled_at);

-- Índice para consultas
CREATE INDEX IF NOT EXISTS idx_orders_canceled_at ON orders(canceled_at);

-- Refrescar schema cache de PostgREST (ejecutar después de este script):
-- NOTIFY pgrst, 'reload schema';
