-- ============================================
-- SCRIPT DE ROLLBACK - REVERTIR CAMBIOS
-- ============================================
-- Este script elimina la función transaccional si necesitas
-- volver al sistema anterior
-- ============================================

-- Eliminar función transaccional
DROP FUNCTION IF EXISTS register_settlement_with_applications(
  UUID, DATE, NUMERIC, TEXT, JSONB, JSONB, UUID
);

-- ============================================
-- NOTA: Los cambios en el código TypeScript/React
-- deben revertirse manualmente desde el control de versiones (git)
-- ============================================
