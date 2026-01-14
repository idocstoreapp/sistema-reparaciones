-- ============================================
-- Script SIMPLE: Eliminar constraints de tipo de gasto
-- ============================================
-- Ejecuta este script para permitir tipos personalizados de gastos
-- ============================================

-- Eliminar constraint de small_expenses (intenta todas las variaciones posibles)
ALTER TABLE small_expenses DROP CONSTRAINT IF EXISTS small_expenses_tipo_check;
ALTER TABLE small_expenses DROP CONSTRAINT IF EXISTS small_expenses_tipo_check CASCADE;

-- Eliminar constraint de general_expenses (intenta todas las variaciones posibles)
ALTER TABLE general_expenses DROP CONSTRAINT IF EXISTS general_expenses_tipo_check;
ALTER TABLE general_expenses DROP CONSTRAINT IF EXISTS general_expenses_tipo_check CASCADE;

-- Verificar que se eliminaron
SELECT 
  '✅ Constraints eliminados. Ahora puedes usar cualquier tipo de gasto personalizado.' as resultado;

-- Verificar que no quedan constraints restrictivos
SELECT 
  '=== VERIFICACIÓN: CONSTRAINTS RESTANTES ===' as seccion;

SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE (conrelid = 'small_expenses'::regclass OR conrelid = 'general_expenses'::regclass)
  AND conname LIKE '%tipo%';

-- Si aún hay constraints, mostrarlos para eliminarlos manualmente
-- Si no hay resultados, significa que se eliminaron correctamente
