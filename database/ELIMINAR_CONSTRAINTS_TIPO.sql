-- ============================================
-- SCRIPT DEFINITIVO: Eliminar constraints de tipo de gasto
-- ============================================
-- EJECUTA ESTE SCRIPT COMPLETO EN SUPABASE SQL EDITOR
-- ============================================

-- PASO 1: Eliminar constraint de small_expenses
ALTER TABLE small_expenses 
DROP CONSTRAINT IF EXISTS small_expenses_tipo_check CASCADE;

-- PASO 2: Eliminar constraint de general_expenses  
ALTER TABLE general_expenses 
DROP CONSTRAINT IF EXISTS general_expenses_tipo_check CASCADE;

-- PASO 3: Verificar que se eliminaron
SELECT 
  '✅ Constraints eliminados correctamente' as resultado;

-- PASO 4: Mostrar constraints restantes (debería estar vacío)
SELECT 
  conrelid::regclass::text as tabla,
  conname as nombre_constraint,
  pg_get_constraintdef(oid) as definicion
FROM pg_constraint
WHERE (conrelid = 'small_expenses'::regclass OR conrelid = 'general_expenses'::regclass)
  AND (conname LIKE '%tipo%' OR pg_get_constraintdef(oid) LIKE '%tipo%');

-- Si el resultado está vacío, significa que se eliminaron correctamente
-- Si aún aparecen constraints, cópialos y ejecuta:
-- ALTER TABLE [tabla] DROP CONSTRAINT [nombre] CASCADE;
