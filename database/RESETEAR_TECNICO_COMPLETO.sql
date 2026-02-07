-- ============================================
-- SCRIPT PARA RESETEAR TODOS LOS DATOS DE UN TÉCNICO
-- ============================================
-- ⚠️ ADVERTENCIA: Este script elimina TODOS los datos relacionados con el técnico
-- Incluye: ajustes de sueldo, aplicaciones, liquidaciones, órdenes
-- ============================================

-- REEMPLAZA ESTE UID CON EL DEL TÉCNICO QUE QUIERES RESETEAR
-- UID del técnico usado en pruebas: e44d680a-f803-43dc-848d-0d77723da2f3
DO $$
DECLARE
    v_technician_id UUID := 'e44d680a-f803-43dc-848d-0d77723da2f3'; -- ⚠️ CAMBIA ESTE UID
    v_technician_name TEXT;
    v_count_adjustments INTEGER;
    v_count_applications INTEGER;
    v_count_settlements INTEGER;
    v_count_orders INTEGER;
BEGIN
    -- Obtener nombre del técnico para confirmación
    SELECT name INTO v_technician_name
    FROM users
    WHERE id = v_technician_id;
    
    IF v_technician_name IS NULL THEN
        RAISE EXCEPTION 'No se encontró el técnico con ID: %', v_technician_id;
    END IF;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'RESETEANDO DATOS DEL TÉCNICO: %', v_technician_name;
    RAISE NOTICE 'UID: %', v_technician_id;
    RAISE NOTICE '========================================';
    
    -- Contar registros antes de eliminar
    SELECT COUNT(*) INTO v_count_adjustments
    FROM salary_adjustments
    WHERE technician_id = v_technician_id;
    
    SELECT COUNT(*) INTO v_count_applications
    FROM salary_adjustment_applications
    WHERE technician_id = v_technician_id;
    
    SELECT COUNT(*) INTO v_count_settlements
    FROM salary_settlements
    WHERE technician_id = v_technician_id;
    
    -- Contar órdenes (deshabilitar RLS temporalmente para contar)
    ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
    SELECT COUNT(*) INTO v_count_orders
    FROM orders
    WHERE technician_id = v_technician_id;
    ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
    
    RAISE NOTICE 'Registros encontrados:';
    RAISE NOTICE '  - Ajustes de sueldo: %', v_count_adjustments;
    RAISE NOTICE '  - Aplicaciones de ajustes: %', v_count_applications;
    RAISE NOTICE '  - Liquidaciones: %', v_count_settlements;
    RAISE NOTICE '  - Órdenes: %', v_count_orders;
    RAISE NOTICE '========================================';
    
    -- PASO 1: Deshabilitar RLS temporalmente para poder eliminar
    RAISE NOTICE 'Deshabilitando RLS temporalmente...';
    ALTER TABLE salary_adjustment_applications DISABLE ROW LEVEL SECURITY;
    ALTER TABLE salary_adjustments DISABLE ROW LEVEL SECURITY;
    ALTER TABLE salary_settlements DISABLE ROW LEVEL SECURITY;
    ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
    
    -- PASO 2: Eliminar aplicaciones de ajustes (primero por foreign key)
    RAISE NOTICE 'Eliminando aplicaciones de ajustes...';
    DELETE FROM salary_adjustment_applications
    WHERE technician_id = v_technician_id;
    RAISE NOTICE '✓ Aplicaciones eliminadas';
    
    -- PASO 3: Eliminar ajustes de sueldo
    RAISE NOTICE 'Eliminando ajustes de sueldo...';
    DELETE FROM salary_adjustments
    WHERE technician_id = v_technician_id;
    RAISE NOTICE '✓ Ajustes eliminados';
    
    -- PASO 4: Eliminar liquidaciones
    RAISE NOTICE 'Eliminando liquidaciones...';
    DELETE FROM salary_settlements
    WHERE technician_id = v_technician_id;
    RAISE NOTICE '✓ Liquidaciones eliminadas';
    
    -- PASO 5: Eliminar órdenes
    RAISE NOTICE 'Eliminando órdenes...';
    DELETE FROM orders
    WHERE technician_id = v_technician_id;
    RAISE NOTICE '✓ Órdenes eliminadas';
    
    -- PASO 6: Rehabilitar RLS
    RAISE NOTICE 'Rehabilitando RLS...';
    ALTER TABLE salary_adjustment_applications ENABLE ROW LEVEL SECURITY;
    ALTER TABLE salary_adjustments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE salary_settlements ENABLE ROW LEVEL SECURITY;
    ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE '✓ RLS rehabilitado';
    
    -- PASO 4: Eliminar órdenes
    RAISE NOTICE 'Eliminando órdenes...';
    DELETE FROM orders
    WHERE technician_id = v_technician_id;
    RAISE NOTICE '✓ Órdenes eliminadas';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✓ RESETEO COMPLETADO';
    RAISE NOTICE '========================================';
    
    -- Verificar que se eliminó todo
    SELECT COUNT(*) INTO v_count_adjustments
    FROM salary_adjustments
    WHERE technician_id = v_technician_id;
    
    SELECT COUNT(*) INTO v_count_applications
    FROM salary_adjustment_applications
    WHERE technician_id = v_technician_id;
    
    ALTER TABLE salary_settlements DISABLE ROW LEVEL SECURITY;
    SELECT COUNT(*) INTO v_count_settlements
    FROM salary_settlements
    WHERE technician_id = v_technician_id;
    ALTER TABLE salary_settlements ENABLE ROW LEVEL SECURITY;
    
    ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
    SELECT COUNT(*) INTO v_count_orders
    FROM orders
    WHERE technician_id = v_technician_id;
    ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
    
    RAISE NOTICE 'Verificación final:';
    RAISE NOTICE '  - Ajustes restantes: %', v_count_adjustments;
    RAISE NOTICE '  - Aplicaciones restantes: %', v_count_applications;
    RAISE NOTICE '  - Liquidaciones restantes: %', v_count_settlements;
    RAISE NOTICE '  - Órdenes restantes: %', v_count_orders;
    RAISE NOTICE '========================================';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error al resetear técnico: %', SQLERRM;
END $$;

-- ============================================
-- VERIFICACIÓN POST-RESETEO
-- ============================================
-- Ejecuta esto después para verificar que todo se eliminó:

SELECT 
    'Ajustes restantes' as tipo,
    COUNT(*) as cantidad
FROM salary_adjustments
WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3' -- ⚠️ CAMBIA ESTE UID

UNION ALL

SELECT 
    'Aplicaciones restantes' as tipo,
    COUNT(*) as cantidad
FROM salary_adjustment_applications
WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3' -- ⚠️ CAMBIA ESTE UID

UNION ALL

SELECT 
    'Liquidaciones restantes' as tipo,
    COUNT(*) as cantidad
FROM salary_settlements
WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3' -- ⚠️ CAMBIA ESTE UID

UNION ALL

SELECT 
    'Órdenes restantes' as tipo,
    COUNT(*) as cantidad
FROM orders
WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3'; -- ⚠️ CAMBIA ESTE UID

-- ============================================
-- NOTAS:
-- ============================================
-- 1. Este script deshabilita RLS temporalmente para poder eliminar
-- 2. Este script elimina: ajustes, aplicaciones, liquidaciones Y órdenes
-- 3. Este script NO elimina el usuario de la tabla users
-- 4. El técnico seguirá existiendo en la tabla users, solo se eliminan sus datos
-- 5. Para eliminar completamente el técnico, ejecuta también:
--    DELETE FROM users WHERE id = 'e44d680a-f803-43dc-848d-0d77723da2f3';
-- 6. Si todos los valores de verificación son 0, el reseteo fue exitoso
