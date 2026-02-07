-- ============================================
-- SCRIPT PARA RESETEAR TÉCNICO (MÉTODO DIRECTO)
-- ============================================
-- ⚠️ ADVERTENCIA: Este script elimina TODOS los datos relacionados con el técnico
-- Usa ALTER TABLE para deshabilitar RLS temporalmente
-- ============================================

-- ⚠️ CAMBIA ESTE UID CON EL DEL TÉCNICO QUE QUIERES RESETEAR
-- UID del técnico usado en pruebas: e44d680a-f803-43dc-848d-0d77723da2f3

-- ============================================
-- PASO 1: Verificar datos antes de eliminar
-- ============================================
SELECT 
    '=== DATOS ANTES DE ELIMINAR ===' as seccion,
    (SELECT COUNT(*) FROM salary_adjustments WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3') as ajustes,
    (SELECT COUNT(*) FROM salary_adjustment_applications WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3') as aplicaciones,
    (SELECT COUNT(*) FROM salary_settlements WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3') as liquidaciones;

-- ============================================
-- PASO 2: Deshabilitar RLS temporalmente y eliminar
-- ============================================

-- Deshabilitar RLS en salary_adjustment_applications
ALTER TABLE salary_adjustment_applications DISABLE ROW LEVEL SECURITY;

-- Eliminar aplicaciones
DELETE FROM salary_adjustment_applications
WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3';

-- Rehabilitar RLS
ALTER TABLE salary_adjustment_applications ENABLE ROW LEVEL SECURITY;

-- Deshabilitar RLS en salary_adjustments
ALTER TABLE salary_adjustments DISABLE ROW LEVEL SECURITY;

-- Eliminar ajustes
DELETE FROM salary_adjustments
WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3';

-- Rehabilitar RLS
ALTER TABLE salary_adjustments ENABLE ROW LEVEL SECURITY;

-- Deshabilitar RLS en salary_settlements
ALTER TABLE salary_settlements DISABLE ROW LEVEL SECURITY;

-- Eliminar liquidaciones
DELETE FROM salary_settlements
WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3';

-- Rehabilitar RLS
ALTER TABLE salary_settlements ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PASO 3: Verificar que se eliminó todo
-- ============================================
SELECT 
    '=== DATOS DESPUÉS DE ELIMINAR ===' as seccion,
    (SELECT COUNT(*) FROM salary_adjustments WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3') as ajustes_restantes,
    (SELECT COUNT(*) FROM salary_adjustment_applications WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3') as aplicaciones_restantes,
    (SELECT COUNT(*) FROM salary_settlements WHERE technician_id = 'e44d680a-f803-43dc-848d-0d77723da2f3') as liquidaciones_restantes;
