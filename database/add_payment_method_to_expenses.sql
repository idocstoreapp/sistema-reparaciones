-- ============================================
-- Script: Agregar campo payment_method a gastos
-- ============================================
-- Este script agrega el campo payment_method a las tablas
-- small_expenses y general_expenses para registrar el medio de pago
-- ============================================

-- 1. Agregar campo payment_method a small_expenses
ALTER TABLE small_expenses
ADD COLUMN IF NOT EXISTS payment_method TEXT 
CHECK (payment_method IN ('EFECTIVO', 'TRANSFERENCIA', 'DEBITO', 'CREDITO'))
DEFAULT 'EFECTIVO';

-- 2. Agregar campo payment_method a general_expenses
ALTER TABLE general_expenses
ADD COLUMN IF NOT EXISTS payment_method TEXT 
CHECK (payment_method IN ('EFECTIVO', 'TRANSFERENCIA', 'DEBITO', 'CREDITO'))
DEFAULT 'EFECTIVO';

-- 3. Actualizar registros existentes para que tengan un valor por defecto
UPDATE small_expenses
SET payment_method = 'EFECTIVO'
WHERE payment_method IS NULL;

UPDATE general_expenses
SET payment_method = 'EFECTIVO'
WHERE payment_method IS NULL;

-- 4. Hacer el campo NOT NULL después de actualizar los valores existentes
ALTER TABLE small_expenses
ALTER COLUMN payment_method SET NOT NULL;

ALTER TABLE general_expenses
ALTER COLUMN payment_method SET NOT NULL;

-- 5. Verificar que los campos se agregaron correctamente
SELECT 
  '=== ESTRUCTURA DE SMALL_EXPENSES ===' as seccion;

SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'small_expenses'
  AND column_name = 'payment_method';

SELECT 
  '=== ESTRUCTURA DE GENERAL_EXPENSES ===' as seccion;

SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'general_expenses'
  AND column_name = 'payment_method';

-- 6. Mostrar algunos registros de ejemplo
SELECT 
  '=== EJEMPLO DE REGISTROS ACTUALIZADOS ===' as seccion;

SELECT 
  id,
  tipo,
  monto,
  payment_method,
  fecha
FROM small_expenses
ORDER BY created_at DESC
LIMIT 5;

SELECT 
  id,
  tipo,
  monto,
  payment_method,
  fecha
FROM general_expenses
ORDER BY created_at DESC
LIMIT 5;
