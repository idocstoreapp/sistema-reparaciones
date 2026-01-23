-- ============================================
-- ELIMINAR TODOS LOS AJUSTES DE PRUEBA
-- ============================================
-- Este script elimina ajustes específicos de prueba
-- Basado en el settlement del 2026-01-17
-- ============================================

-- AJUSTES IDENTIFICADOS:
-- 1. ID: 14600391-83b9-4337-9777-118174d4696f (adelanto 100,000)
-- ⚠️ Agrega más IDs aquí si hay otros ajustes de prueba

DO $$
DECLARE
  ajuste_id_1 UUID := '14600391-83b9-4337-9777-118174d4696f';  -- Ajuste identificado
  -- ajuste_id_2 UUID := 'OTRO-ID-AQUI';  -- Descomenta y agrega si hay más
  
  aplicaciones_eliminadas INTEGER := 0;
  ajustes_eliminados INTEGER := 0;
BEGIN
  RAISE NOTICE 'Iniciando eliminación de ajustes de prueba...';
  
  -- Verificar qué se va a eliminar
  SELECT COUNT(*) INTO ajustes_eliminados
  FROM salary_adjustments
  WHERE id = ajuste_id_1;
  -- Agrega más IDs aquí: OR id = ajuste_id_2
  
  SELECT COUNT(*) INTO aplicaciones_eliminadas
  FROM salary_adjustment_applications
  WHERE adjustment_id = ajuste_id_1;
  -- Agrega más IDs aquí: OR adjustment_id = ajuste_id_2
  
  RAISE NOTICE 'Se encontraron % ajustes y % aplicaciones a eliminar', ajustes_eliminados, aplicaciones_eliminadas;
  
  -- ⚠️ DESCOMENTA LAS SIGUIENTES LÍNEAS PARA ELIMINAR REALMENTE:
  /*
  -- Eliminar aplicaciones primero
  DELETE FROM salary_adjustment_applications
  WHERE adjustment_id = ajuste_id_1;
  -- Agrega más IDs aquí: OR adjustment_id = ajuste_id_2
  
  GET DIAGNOSTICS aplicaciones_eliminadas = ROW_COUNT;
  
  -- Eliminar ajustes
  DELETE FROM salary_adjustments
  WHERE id = ajuste_id_1;
  -- Agrega más IDs aquí: OR id = ajuste_id_2
  
  GET DIAGNOSTICS ajustes_eliminados = ROW_COUNT;
  
  RAISE NOTICE '✅ Eliminación completada: % aplicaciones y % ajustes eliminados', aplicaciones_eliminadas, ajustes_eliminados;
  */
  
  IF ajustes_eliminados > 0 THEN
    RAISE NOTICE '⚠️ Para eliminar realmente, descomenta las líneas DELETE en el script';
  END IF;
END $$;

-- Ver ajustes restantes del técnico "tecnico"
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
WHERE u.name = 'tecnico'
GROUP BY sa.id, u.name, sa.type, sa.amount, sa.note, sa.created_at
ORDER BY sa.created_at DESC;
