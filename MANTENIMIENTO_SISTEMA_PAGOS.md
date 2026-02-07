# 🔧 Mantenimiento del Sistema de Pagos a Técnicos

## ⚠️ Problema Común: Aplicaciones Faltantes

### ¿Qué es el problema?

Cuando se crea una liquidación (`salary_settlements`), los ajustes aplicados se guardan en el campo JSON `details`. Sin embargo, si no se crea el registro correspondiente en `salary_adjustment_applications`, el sistema calcula incorrectamente el `remaining` de los ajustes.

**Síntoma:** Un adelanto o descuento aparece como "pendiente" aunque ya fue completamente aplicado en una liquidación.

### ¿Por qué pasa?

1. **Liquidaciones antiguas:** Se crearon antes de implementar `salary_adjustment_applications`
2. **Fallback del código:** Si la función transaccional falla, el código usa el método antiguo que no crea aplicaciones
3. **Errores de red:** Si hay un error al guardar las aplicaciones después del settlement

## ✅ Solución Preventiva

### 1. Script de Recuperación Automática

Ejecuta este script **periódicamente** (recomendado: semanal o mensual):

```sql
\i database/RECUPERAR_TODAS_APLICACIONES_FALTANTES.sql
```

**¿Cuándo ejecutarlo?**
- ✅ Semanalmente (cada lunes, por ejemplo)
- ✅ Después de crear liquidaciones manualmente
- ✅ Si notas que un ajuste aparece como pendiente cuando ya fue pagado

**¿Qué hace?**
- Identifica todas las aplicaciones faltantes desde los settlements
- Las crea automáticamente en `salary_adjustment_applications`
- Verifica que no haya errores en el cálculo de `remaining`

### 2. Verificación Manual

Si sospechas que hay un problema con un técnico específico:

```sql
-- Ver todos los ajustes de un técnico
\i database/ver_ajustes_tecnico.sql
-- (Edita el script para cambiar el nombre del técnico)

-- O verificar un adelanto específico
\i database/diagnostico_adelanto_100mil.sql
```

## 🔍 Cómo Verificar que Todo Está Correcto

### Verificación Rápida

```sql
-- Ver ajustes con remaining incorrecto
SELECT 
  sa.id,
  sa.technician_id,
  u.name as technician_name,
  sa.type,
  sa.amount,
  COALESCE(SUM(saa.applied_amount), 0) as total_aplicado,
  sa.amount - COALESCE(SUM(saa.applied_amount), 0) as remaining
FROM salary_adjustments sa
LEFT JOIN salary_adjustment_applications saa ON sa.id = saa.adjustment_id
LEFT JOIN users u ON sa.technician_id = u.id
GROUP BY sa.id, sa.technician_id, u.name, sa.type, sa.amount
HAVING sa.amount - COALESCE(SUM(saa.applied_amount), 0) < 0  -- Errores
ORDER BY sa.created_at DESC;
```

**Resultado esperado:** No debería haber filas (o solo ajustes con remaining > 0 que son normales)

### Verificación en la Interfaz

1. **Como Admin:**
   - Ve a "Pagos a Técnicos"
   - Selecciona un técnico
   - Abre "Ajustes de sueldo"
   - Verifica que solo aparezcan ajustes con saldo pendiente

2. **Como Técnico:**
   - Ve a "Reporte Semanal"
   - En "Ajustes de sueldo de la semana"
   - Verifica que solo aparezcan ajustes pendientes

## 🛠️ Corrección de Problemas Específicos

### Problema: Adelanto de 100,000 aparece como pendiente

```sql
-- 1. Verificar el estado
\i database/verificar_y_corregir_adelanto_100mil.sql

-- 2. Si no existe el registro, se creará automáticamente
```

### Problema: Múltiples técnicos con ajustes incorrectos

```sql
-- Recuperar TODAS las aplicaciones faltantes
\i database/RECUPERAR_TODAS_APLICACIONES_FALTANTES.sql
```

## 📋 Checklist de Mantenimiento

### Semanal
- [ ] Ejecutar `RECUPERAR_TODAS_APLICACIONES_FALTANTES.sql`
- [ ] Verificar que no haya errores en la consola del navegador
- [ ] Revisar que los ajustes se muestren correctamente

### Mensual
- [ ] Verificar que todos los ajustes tengan su `remaining` correcto
- [ ] Revisar liquidaciones antiguas para asegurar que tienen aplicaciones
- [ ] Documentar cualquier problema encontrado

### Después de Crear Liquidaciones Manualmente
- [ ] Verificar que las aplicaciones se crearon correctamente
- [ ] Si hay error, ejecutar el script de recuperación

## 🔐 Función Transaccional

El sistema usa la función `register_settlement_with_applications` para crear settlements y aplicaciones de forma atómica. Si esta función no existe o falla, el sistema usa un método de fallback que puede no crear las aplicaciones.

**Verificar que la función existe:**

```sql
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'register_settlement_with_applications';
```

**Si no existe, crearla:**

```sql
\i database/register_settlement_transactional.sql
```

## 📞 Soporte

Si encuentras problemas:

1. **Ejecuta el script de recuperación** primero
2. **Revisa los logs** en la consola del navegador (F12)
3. **Verifica el estado** con los scripts de diagnóstico
4. **Documenta el problema** con capturas de pantalla y logs

## 🎯 Mejores Prácticas

1. ✅ **Siempre usar la función transaccional** para crear liquidaciones
2. ✅ **Ejecutar el script de recuperación** periódicamente
3. ✅ **Verificar antes de pagar** que los ajustes estén correctos
4. ✅ **No eliminar ajustes** sin verificar que no tienen aplicaciones pendientes
5. ✅ **Documentar problemas** para evitar que se repitan

---

**Última actualización:** 2026-01-17
**Versión del sistema:** 1.0
