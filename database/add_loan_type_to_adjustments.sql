-- ============================================
-- Script: Agregar tipo 'loan' (préstamo) a salary_adjustments
-- ============================================
-- Este script agrega el tipo 'loan' para préstamos que no afectan los saldos
-- ============================================

-- 1. Eliminar el constraint existente
ALTER TABLE salary_adjustments
  DROP CONSTRAINT IF EXISTS salary_adjustments_type_check;

-- 2. Agregar el nuevo constraint con 'loan'
ALTER TABLE salary_adjustments
  ADD CONSTRAINT salary_adjustments_type_check 
  CHECK (type IN ('advance', 'discount', 'loan'));

-- 3. Verificar que el constraint se agregó correctamente
SELECT 
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'salary_adjustments_type_check';

-- 4. Comentario para documentar el nuevo tipo
COMMENT ON COLUMN salary_adjustments.type IS 'Tipo de ajuste: advance (adelanto que se descuenta), discount (descuento), loan (préstamo que no afecta saldos)';
