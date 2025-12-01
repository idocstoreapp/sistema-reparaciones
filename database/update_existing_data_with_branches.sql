-- ============================================
-- Script para actualizar datos existentes con sucursales
-- ============================================
-- IMPORTANTE: Ejecutar DESPUÉS de add_branches_and_expenses.sql
-- Este script asigna sucursales a usuarios y órdenes existentes
-- ============================================

-- 1. Asignar sucursal a usuarios técnicos existentes (si no tienen sucursal asignada)
-- Distribuye los técnicos entre las 7 sucursales de forma equitativa
UPDATE users
SET sucursal_id = (
  SELECT id FROM branches 
  ORDER BY name 
  LIMIT 1 OFFSET (
    (ROW_NUMBER() OVER (ORDER BY created_at) - 1) % 7
  )
)
WHERE role = 'technician' 
  AND sucursal_id IS NULL;

-- 2. Asignar sucursal a encargados existentes (si no tienen sucursal asignada)
-- Distribuye los encargados entre las 7 sucursales de forma equitativa
UPDATE users
SET sucursal_id = (
  SELECT id FROM branches 
  ORDER BY name 
  LIMIT 1 OFFSET (
    (ROW_NUMBER() OVER (ORDER BY created_at) - 1) % 7
  )
)
WHERE role = 'encargado' 
  AND sucursal_id IS NULL;

-- 3. Asignar sucursal a órdenes existentes basándose en la sucursal del técnico
UPDATE orders
SET sucursal_id = (
  SELECT sucursal_id 
  FROM users 
  WHERE users.id = orders.technician_id
)
WHERE sucursal_id IS NULL
  AND EXISTS (
    SELECT 1 
    FROM users 
    WHERE users.id = orders.technician_id 
    AND users.sucursal_id IS NOT NULL
  );

-- 4. Verificar resultados
-- Ver cuántos usuarios tienen sucursal asignada
SELECT 
  role,
  COUNT(*) as total,
  COUNT(sucursal_id) as con_sucursal,
  COUNT(*) - COUNT(sucursal_id) as sin_sucursal
FROM users
WHERE role IN ('technician', 'encargado')
GROUP BY role;

-- Ver cuántas órdenes tienen sucursal asignada
SELECT 
  COUNT(*) as total_ordenes,
  COUNT(sucursal_id) as con_sucursal,
  COUNT(*) - COUNT(sucursal_id) as sin_sucursal
FROM orders;

-- Ver distribución de usuarios por sucursal
SELECT 
  b.name as sucursal,
  COUNT(u.id) as total_usuarios,
  COUNT(CASE WHEN u.role = 'technician' THEN 1 END) as tecnicos,
  COUNT(CASE WHEN u.role = 'encargado' THEN 1 END) as encargados
FROM branches b
LEFT JOIN users u ON u.sucursal_id = b.id
WHERE u.role IN ('technician', 'encargado')
GROUP BY b.id, b.name
ORDER BY b.name;

-- ============================================
-- NOTAS:
-- ============================================
-- 1. Este script distribuye usuarios de forma automática entre las 7 sucursales
-- 2. Si necesitas asignar usuarios específicos a sucursales específicas, hazlo manualmente:
--    UPDATE users SET sucursal_id = 'uuid-de-la-sucursal' WHERE id = 'uuid-del-usuario';
-- 3. Las órdenes heredan automáticamente la sucursal del técnico que las creó

