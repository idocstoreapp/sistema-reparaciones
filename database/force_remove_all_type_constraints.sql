-- ============================================
-- Script FORZADO: Eliminar TODOS los constraints de tipo
-- ============================================
-- Este script elimina TODOS los constraints relacionados con 'tipo' 
-- en las tablas de gastos, sin importar cómo se llamen
-- ============================================

-- Método 1: Eliminar por nombre conocido
DO $$
BEGIN
  -- Eliminar de small_expenses
  BEGIN
    ALTER TABLE small_expenses DROP CONSTRAINT small_expenses_tipo_check;
    RAISE NOTICE '✅ Eliminado: small_expenses_tipo_check';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ No se encontró: small_expenses_tipo_check';
  END;

  -- Eliminar de general_expenses
  BEGIN
    ALTER TABLE general_expenses DROP CONSTRAINT general_expenses_tipo_check;
    RAISE NOTICE '✅ Eliminado: general_expenses_tipo_check';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ No se encontró: general_expenses_tipo_check';
  END;
END $$;

-- Método 2: Buscar y eliminar TODOS los constraints que contengan 'tipo'
DO $$
DECLARE
  r RECORD;
  constraint_sql TEXT;
BEGIN
  -- Para small_expenses
  FOR r IN 
    SELECT conname, conrelid::regclass::text as table_name
    FROM pg_constraint 
    WHERE conrelid = 'small_expenses'::regclass 
      AND (conname LIKE '%tipo%' OR pg_get_constraintdef(oid) LIKE '%tipo%')
  LOOP
    constraint_sql := 'ALTER TABLE small_expenses DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname) || ' CASCADE';
    EXECUTE constraint_sql;
    RAISE NOTICE '✅ Eliminado constraint: % de la tabla %', r.conname, r.table_name;
  END LOOP;

  -- Para general_expenses
  FOR r IN 
    SELECT conname, conrelid::regclass::text as table_name
    FROM pg_constraint 
    WHERE conrelid = 'general_expenses'::regclass 
      AND (conname LIKE '%tipo%' OR pg_get_constraintdef(oid) LIKE '%tipo%')
  LOOP
    constraint_sql := 'ALTER TABLE general_expenses DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname) || ' CASCADE';
    EXECUTE constraint_sql;
    RAISE NOTICE '✅ Eliminado constraint: % de la tabla %', r.conname, r.table_name;
  END LOOP;
END $$;

-- Verificar que se eliminaron todos
SELECT 
  '=== VERIFICACIÓN FINAL ===' as seccion;

SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ NO HAY CONSTRAINTS DE TIPO - Todo correcto!'
    ELSE '⚠️ AÚN HAY ' || COUNT(*) || ' CONSTRAINT(S) DE TIPO'
  END as estado
FROM pg_constraint
WHERE (conrelid = 'small_expenses'::regclass OR conrelid = 'general_expenses'::regclass)
  AND (conname LIKE '%tipo%' OR pg_get_constraintdef(oid) LIKE '%tipo%');

-- Mostrar los constraints restantes (si los hay)
SELECT 
  conrelid::regclass::text as tabla,
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE (conrelid = 'small_expenses'::regclass OR conrelid = 'general_expenses'::regclass)
  AND (conname LIKE '%tipo%' OR pg_get_constraintdef(oid) LIKE '%tipo%');

-- ============================================
-- IMPORTANTE:
-- ============================================
-- Después de ejecutar este script, deberías poder crear gastos
-- con cualquier tipo personalizado sin problemas.
-- 
-- Si aún ves constraints en la verificación, cópialos y ejecuta:
-- ALTER TABLE [tabla] DROP CONSTRAINT [nombre_constraint] CASCADE;
-- ============================================
