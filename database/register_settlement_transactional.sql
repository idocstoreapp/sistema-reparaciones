-- ============================================
-- FUNCIÓN TRANSACCIONAL PARA REGISTRAR LIQUIDACIONES
-- ============================================
-- Esta función garantiza que la liquidación y las aplicaciones
-- se guarden de forma atómica (todo o nada)
-- ============================================

CREATE OR REPLACE FUNCTION register_settlement_with_applications(
  p_technician_id UUID,
  p_week_start DATE,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_details JSONB,
  p_applications JSONB, -- Array de {adjustment_id, applied_amount}
  p_created_by UUID
) RETURNS UUID AS $$
DECLARE
  v_settlement_id UUID;
  app JSONB;
  v_applied_amount NUMERIC;
  v_adjustment_id UUID;
  v_current_applied NUMERIC;
  v_adjustment_total NUMERIC;
BEGIN
  -- Validar que el array de aplicaciones no esté vacío si hay ajustes
  IF p_applications IS NULL OR jsonb_array_length(p_applications) = 0 THEN
    -- Permitir liquidaciones sin aplicaciones (pago sin descuentos)
    NULL;
  ELSE
    -- Validar cada aplicación antes de insertar
    FOR app IN SELECT * FROM jsonb_array_elements(p_applications)
    LOOP
      v_adjustment_id := (app->>'adjustment_id')::UUID;
      v_applied_amount := (app->>'applied_amount')::NUMERIC;
      
      -- Validar que el ajuste existe y pertenece al técnico
      SELECT amount INTO v_adjustment_total
      FROM salary_adjustments
      WHERE id = v_adjustment_id
        AND technician_id = p_technician_id;
      
      IF v_adjustment_total IS NULL THEN
        RAISE EXCEPTION 'Ajuste % no existe o no pertenece al técnico %', v_adjustment_id, p_technician_id;
      END IF;
      
      -- Calcular aplicaciones actuales
      SELECT COALESCE(SUM(applied_amount), 0) INTO v_current_applied
      FROM salary_adjustment_applications
      WHERE adjustment_id = v_adjustment_id;
      
      -- Validar que no se exceda el monto del ajuste
      IF (v_current_applied + v_applied_amount) > v_adjustment_total THEN
        RAISE EXCEPTION 'Aplicación excede el monto del ajuste. Ajuste: %, Aplicado: %, Nuevo: %, Total: %',
          v_adjustment_id, v_current_applied, v_applied_amount, v_adjustment_total;
      END IF;
      
      -- Validar que el monto sea positivo
      IF v_applied_amount <= 0 THEN
        RAISE EXCEPTION 'El monto aplicado debe ser mayor a 0. Ajuste: %, Monto: %', v_adjustment_id, v_applied_amount;
      END IF;
    END LOOP;
  END IF;
  
  -- Insertar liquidación
  INSERT INTO salary_settlements (
    technician_id,
    week_start,
    amount,
    payment_method,
    details,
    created_by
  ) VALUES (
    p_technician_id,
    p_week_start,
    p_amount,
    p_payment_method,
    p_details,
    p_created_by
  ) RETURNING id INTO v_settlement_id;
  
  -- Insertar aplicaciones si existen
  IF p_applications IS NOT NULL AND jsonb_array_length(p_applications) > 0 THEN
    FOR app IN SELECT * FROM jsonb_array_elements(p_applications)
    LOOP
      INSERT INTO salary_adjustment_applications (
        adjustment_id,
        technician_id,
        applied_amount,
        week_start,
        created_by
      ) VALUES (
        (app->>'adjustment_id')::UUID,
        p_technician_id,
        (app->>'applied_amount')::NUMERIC,
        p_week_start,
        p_created_by
      );
    END LOOP;
  END IF;
  
  RETURN v_settlement_id;
  
EXCEPTION
  WHEN OTHERS THEN
    -- En caso de error, hacer rollback automático (transacción implícita)
    RAISE EXCEPTION 'Error registrando liquidación: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMENTARIOS
-- ============================================
COMMENT ON FUNCTION register_settlement_with_applications IS 
'Registra una liquidación y sus aplicaciones de ajustes de forma transaccional. 
Si falla cualquier parte, se hace rollback completo.';

-- ============================================
-- PERMISOS
-- ============================================
-- La función usa SECURITY DEFINER para ejecutarse con permisos del creador
-- Los usuarios con rol admin pueden llamarla
