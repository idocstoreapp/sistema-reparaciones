-- ============================================
-- Script: Corregir constraints para permitir tipos personalizados de gastos
-- ============================================
-- Este script elimina TODOS los constraints restrictivos y permite cualquier tipo de gasto
-- ============================================

-- 1. Verificar constraints existentes
SELECT 
  '=== CONSTRAINTS ACTUALES EN SMALL_EXPENSES ===' as seccion;

SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'small_expenses'::regclass
  AND conname LIKE '%tipo%';

SELECT 
  '=== CONSTRAINTS ACTUALES EN GENERAL_EXPENSES ===' as seccion;

SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'general_expenses'::regclass
  AND conname LIKE '%tipo%';

-- 2. Eliminar TODOS los constraints de tipo (por si hay múltiples)
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Eliminar constraints de small_expenses
  FOR r IN 
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'small_expenses'::regclass 
      AND conname LIKE '%tipo%'
  LOOP
    EXECUTE 'ALTER TABLE small_expenses DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    RAISE NOTICE 'Eliminado constraint: %', r.conname;
  END LOOP;

  -- Eliminar constraints de general_expenses
  FOR r IN 
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'general_expenses'::regclass 
      AND conname LIKE '%tipo%'
  LOOP
    EXECUTE 'ALTER TABLE general_expenses DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    RAISE NOTICE 'Eliminado constraint: %', r.conname;
  END LOOP;
END $$;

-- 3. Agregar constraints flexibles que solo validen que tipo no sea NULL ni vacío
ALTER TABLE small_expenses 
ADD CONSTRAINT small_expenses_tipo_check 
CHECK (tipo IS NOT NULL AND LENGTH(TRIM(tipo)) > 0);

ALTER TABLE general_expenses 
ADD CONSTRAINT general_expenses_tipo_check 
CHECK (tipo IS NOT NULL AND LENGTH(TRIM(tipo)) > 0);

-- 4. Verificar que los constraints se crearon correctamente
SELECT 
  '=== CONSTRAINTS FINALES EN SMALL_EXPENSES ===' as seccion;

SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'small_expenses'::regclass
  AND conname LIKE '%tipo%';

SELECT 
  '=== CONSTRAINTS FINALES EN GENERAL_EXPENSES ===' as seccion;

SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'general_expenses'::regclass
  AND conname LIKE '%tipo%';

-- 5. Probar insertar un tipo personalizado (solo para verificar, no se inserta realmente)
-- SELECT 'Prueba de constraint:' as test;
-- SELECT 
--   CASE 
--     WHEN 'Papel prueba' IS NOT NULL AND LENGTH(TRIM('Papel prueba')) > 0 
--     THEN '✅ El tipo personalizado "Papel prueba" sería válido'
--     ELSE '❌ El tipo personalizado "Papel prueba" NO sería válido'
--   END as resultado;

-- ============================================
-- NOTAS:
-- ============================================
-- 1. Los constraints ahora solo validan que el tipo no sea NULL ni una cadena vacía
-- 2. Se pueden usar cualquier tipo de gasto personalizado
-- 3. Los tipos predefinidos (aseo, mercaderia, arriendo, etc.) siguen funcionando
-- 4. Los tipos personalizados como "Papel prueba" ahora deberían funcionar
-- ============================================
