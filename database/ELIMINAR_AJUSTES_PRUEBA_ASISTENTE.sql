-- ============================================
-- ELIMINAR AJUSTES DE PRUEBA - VERSIÓN ASISTIDA
-- ============================================
-- Este script te permite eliminar ajustes por nombre del técnico y rango de fechas
-- o por IDs específicos
-- ============================================

-- OPCIÓN 1: ELIMINAR POR NOMBRE Y RANGO DE FECHAS
-- ============================================
-- Cambia estos valores:
DO $$
DECLARE
  nombre_tecnico TEXT := 'Yohannys';  -- ⚠️ CAMBIA AQUÍ el nombre del técnico
  fecha_inicio TIMESTAMP := '2025-01-20 00:00:00';  -- ⚠️ CAMBIA AQUÍ fecha inicio
  fecha_fin TIMESTAMP := '2025-01-20 23:59:59';     -- ⚠️ CAMBIA AQUÍ fecha fin
  
  tech_id UUID;
  ajustes_eliminados INTEGER := 0;
  aplicaciones_eliminadas INTEGER := 0;
BEGIN
  -- Obtener ID del técnico
  SELECT id INTO tech_id FROM users WHERE name = nombre_tecnico LIMIT 1;
  
  IF tech_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el técnico: %', nombre_tecnico;
  END IF;
  
  RAISE NOTICE 'Eliminando ajustes del técnico: % (ID: %)', nombre_tecnico, tech_id;
  RAISE NOTICE 'Rango de fechas: % hasta %', fecha_inicio, fecha_fin;
  
  -- Verificar qué se va a eliminar
  SELECT COUNT(*) INTO ajustes_eliminados
  FROM salary_adjustments
  WHERE technician_id = tech_id
    AND created_at >= fecha_inicio
    AND created_at <= fecha_fin;
  
  SELECT COUNT(*) INTO aplicaciones_eliminadas
  FROM salary_adjustment_applications saa
  INNER JOIN salary_adjustments sa ON saa.adjustment_id = sa.id
  WHERE sa.technician_id = tech_id
    AND sa.created_at >= fecha_inicio
    AND sa.created_at <= fecha_fin;
  
  RAISE NOTICE 'Se encontraron % ajustes y % aplicaciones a eliminar', ajustes_eliminados, aplicaciones_eliminadas;
  
  -- ⚠️ DESCOMENTA LAS SIGUIENTES LÍNEAS PARA ELIMINAR:
  /*
  -- Eliminar aplicaciones primero
  DELETE FROM salary_adjustment_applications
  WHERE adjustment_id IN (
    SELECT id FROM salary_adjustments
    WHERE technician_id = tech_id
      AND created_at >= fecha_inicio
      AND created_at <= fecha_fin
  );
  
  -- Eliminar ajustes
  DELETE FROM salary_adjustments
  WHERE technician_id = tech_id
    AND created_at >= fecha_inicio
    AND created_at <= fecha_fin;
  
  RAISE NOTICE '✅ Eliminación completada';
  */
  
  -- Si las líneas anteriores están comentadas, solo se mostrará el resumen
  IF ajustes_eliminados > 0 THEN
    RAISE NOTICE '⚠️ Para eliminar realmente, descomenta las líneas DELETE en el script';
  END IF;
END $$;

-- OPCIÓN 2: ELIMINAR POR IDs ESPECÍFICOS
-- ============================================
-- ⚠️ DESCOMENTA Y CAMBIA LOS IDs:
/*
DO $$
DECLARE
  ajuste_id_1 UUID := 'REEMPLAZA-CON-ID-1';  -- ⚠️ ID del primer ajuste
  ajuste_id_2 UUID := 'REEMPLAZA-CON-ID-2';  -- ⚠️ ID del segundo ajuste
  
  aplicaciones_eliminadas INTEGER := 0;
  ajustes_eliminados INTEGER := 0;
BEGIN
  -- Eliminar aplicaciones primero
  DELETE FROM salary_adjustment_applications
  WHERE adjustment_id IN (ajuste_id_1, ajuste_id_2);
  
  GET DIAGNOSTICS aplicaciones_eliminadas = ROW_COUNT;
  
  -- Eliminar ajustes
  DELETE FROM salary_adjustments
  WHERE id IN (ajuste_id_1, ajuste_id_2);
  
  GET DIAGNOSTICS ajustes_eliminados = ROW_COUNT;
  
  RAISE NOTICE '✅ Se eliminaron % aplicaciones y % ajustes', aplicaciones_eliminadas, ajustes_eliminados;
END $$;
*/

-- VERIFICACIÓN: Ver ajustes restantes del técnico
SELECT 
  '=== AJUSTES RESTANTES DEL TÉCNICO ===' as seccion;

SELECT 
  sa.id,
  u.name as technician_name,
  sa.type,
  sa.amount,
  sa.note,
  sa.created_at,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
WHERE u.name = 'Yohannys'  -- ⚠️ CAMBIA AQUÍ el nombre del técnico
GROUP BY sa.id, u.name, sa.type, sa.amount, sa.note, sa.created_at
ORDER BY sa.created_at DESC;
