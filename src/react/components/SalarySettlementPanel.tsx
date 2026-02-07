import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentWeekRange, formatDate } from "@/lib/date";
import { formatCLP } from "@/lib/currency";
import type { SalaryAdjustment, SalaryAdjustmentApplication } from "@/types";

interface SalarySettlementPanelProps {
  technicianId: string;
  technicianName?: string;
  baseAmount: number;
  adjustmentTotal: number;
  context: "technician" | "admin";
  onAfterSettlement?: () => void;
}

type AdjustmentWithPending = SalaryAdjustment & {
  remaining: number;
  appliedTotal: number;
  isCurrentWeek: boolean;
  availableFromDate: Date;
  isAvailableThisWeek: boolean;
};

export default function SalarySettlementPanel({
  technicianId,
  technicianName,
  baseAmount,
  adjustmentTotal,
  context,
  onAfterSettlement,
}: SalarySettlementPanelProps) {
  const [pendingAdjustments, setPendingAdjustments] = useState<AdjustmentWithPending[]>([]);
  // Estado simplificado para selección de adelantos
  const [selectedAdjustments, setSelectedAdjustments] = useState<Record<string, {
    selected: boolean;
    amount: number; // Monto a descontar (puede ser parcial)
  }>>({});
  const [adjustmentDrafts, setAdjustmentDrafts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [applicationsSupported, setApplicationsSupported] = useState(true);
  const [setupWarning, setSetupWarning] = useState<string | null>(null);
  const [settledAmount, setSettledAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "transferencia" | "efectivo/transferencia">("efectivo");
  const [cashAmount, setCashAmount] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [customAmountInput, setCustomAmountInput] = useState(0);
  const [deletingAdjustmentId, setDeletingAdjustmentId] = useState<string | null>(null);
  const [returnedOrders, setReturnedOrders] = useState<any[]>([]);
  const [returnsTotal, setReturnsTotal] = useState(0);

  const { start: weekStartDate, end: weekEndDate } = currentWeekRange();
  const weekStartISO = weekStartDate.toISOString().slice(0, 10);

  async function loadPendingAdjustments() {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Consultar si hay liquidaciones registradas para esta semana
    const { data: settlementsData } = await supabase
      .from("salary_settlements")
      .select("created_at")
      .eq("technician_id", technicianId)
      .eq("week_start", weekStartISO)
      .order("created_at", { ascending: false });

    // Fecha de la última liquidación de la semana (si existe)
    const lastSettlementDate = settlementsData && settlementsData.length > 0
      ? new Date(settlementsData[0].created_at)
      : null;

    async function fetchAdjustments(includeApplications: boolean) {
      const selectClause = includeApplications
        ? "*, applications:salary_adjustment_applications(applied_amount, week_start)"
        : "*";
      // Cargar TODOS los ajustes sin filtrar por fecha
      // El filtrado se hará después basándose en las aplicaciones (remaining > 0)
      const query = supabase
        .from("salary_adjustments")
        .select(selectClause)
        .eq("technician_id", technicianId);
      
      return await query.order("created_at", { ascending: false });
    }

    let adjustmentsResponse = await fetchAdjustments(applicationsSupported);

    if (adjustmentsResponse.error && applicationsSupported) {
      const msg = adjustmentsResponse.error.message?.toLowerCase() ?? "";
      if (msg.includes("salary_adjustment_applications") || msg.includes("does not exist")) {
        setApplicationsSupported(false);
        setSetupWarning(
          "Para usar la liquidación parcial debes ejecutar el script `database/add_salary_adjustment_applications.sql` en Supabase y volver a intentarlo."
        );
        adjustmentsResponse = await fetchAdjustments(false);
      }
    }

    if (adjustmentsResponse.error) {
      console.error("Error cargando ajustes pendientes:", adjustmentsResponse.error);
      setPendingAdjustments([]);
      setAdjustmentDrafts({});
      setErrorMsg("No pudimos cargar los ajustes pendientes. Intenta nuevamente.");
      setLoading(false);
      return;
    }

    const adjustmentsData =
      (adjustmentsResponse.data ?? []) as unknown as (SalaryAdjustment & {
        applications?: SalaryAdjustmentApplication[];
      })[];

    console.log("📊 [SalarySettlementPanel] Cargando ajustes:", {
      totalAjustes: adjustmentsData.length,
      applicationsSupported,
      technicianId,
      primerAjuste: adjustmentsData[0] ? {
        id: adjustmentsData[0].id,
        amount: adjustmentsData[0].amount,
        type: adjustmentsData[0].type,
        applications: (adjustmentsData[0] as any)?.applications
      } : null,
      todosLosAjustes: adjustmentsData.map(adj => ({
        id: adj.id,
        amount: adj.amount,
        type: adj.type,
        note: adj.note,
        applications: (adj as any)?.applications || []
      }))
    });

    const normalized: AdjustmentWithPending[] = adjustmentsData
      .map((adj) => {
        const applications = (adj as any)?.applications ?? [];
        const appliedTotal =
          applicationsSupported
            ? (applications as SalaryAdjustmentApplication[]).reduce(
                (sum, app) => sum + (app.applied_amount ?? 0),
                0
              ) ?? 0
            : 0;
        const remaining = Math.max((adj.amount ?? 0) - appliedTotal, 0);
        
        // Calcular isAvailableThisWeek antes de usarlo
        const createdDate = new Date(adj.created_at);
        const availableFromDate = adj.available_from
          ? new Date(adj.available_from)
          : new Date(createdDate);
        availableFromDate.setHours(0, 0, 0, 0);
        const isAvailableThisWeek = availableFromDate <= weekEndDate;
        
        // Log para debugging - mostrar TODOS los ajustes con aplicaciones
        console.log(`🔍 Ajuste ${adj.id}: monto=${adj.amount}, aplicado=${appliedTotal}, restante=${remaining}`, {
          applications: applications.length,
          aplicaciones: applications,
          technician_id: adj.technician_id,
          type: adj.type,
          note: adj.note,
          available_from: adj.available_from,
          isAvailableThisWeek,
          weekEndDate: weekEndDate.toISOString()
        });
        
        // Log especial para adelantos de 100,000
        if (adj.amount === 100000 && adj.type === 'advance') {
          console.warn(`⚠️ ADELANTO DE 100,000 ENCONTRADO:`, {
            id: adj.id,
            amount: adj.amount,
            appliedTotal,
            remaining,
            applications: applications,
            willShow: remaining > 0 && isAvailableThisWeek,
            willShowInSettled: remaining <= 0
          });
        }
        return {
          ...adj,
          appliedTotal,
          remaining,
          availableFromDate,
          isAvailableThisWeek,
          isCurrentWeek: createdDate >= weekStartDate && createdDate <= weekEndDate,
        };
      });
      // CORREGIDO: Mostrar TODOS los ajustes, incluso los completamente aplicados
      // Solo filtrar por remaining > 0 para mostrar en la sección de "pendientes"
      // Pero permitir ver y eliminar todos los ajustes

    // Inicializar selección de ajustes cuando se cargan
    const newSelections: Record<string, { selected: boolean; amount: number }> = {};
    normalized.forEach((adj) => {
      if (!selectedAdjustments[adj.id]) {
        newSelections[adj.id] = {
          selected: false,
          amount: adj.remaining, // Por defecto, el monto completo
        };
      }
    });
    if (Object.keys(newSelections).length > 0) {
      setSelectedAdjustments((prev) => ({ ...prev, ...newSelections }));
    }

    setPendingAdjustments(normalized);
    setAdjustmentDrafts((prev) => {
      const next: Record<string, number> = {};
      normalized.forEach((adj) => {
        const previousValue = prev[adj.id];
        if (!adj.isAvailableThisWeek) {
          next[adj.id] = 0;
          return;
        }
        if (typeof previousValue === "number") {
          next[adj.id] = Math.min(Math.max(previousValue, 0), adj.remaining);
        } else {
          next[adj.id] = adj.remaining;
        }
      });
      return next;
    });
    // Cargar liquidaciones registradas para la semana
    const settlementsResponse = await supabase
      .from("salary_settlements")
      .select("amount")
      .eq("technician_id", technicianId)
      .eq("week_start", weekStartISO);

    if (settlementsResponse.error) {
      console.error("Error cargando liquidaciones:", settlementsResponse.error);
      const msg = settlementsResponse.error.message?.toLowerCase() ?? "";
      if (msg.includes("salary_settlements") || msg.includes("does not exist")) {
        setSetupWarning((prev) =>
          prev
            ? prev
            : "Para registrar pagos completos ejecuta el script `database/add_salary_settlements.sql` en Supabase."
        );
        setSettledAmount(0);
      }
    } else {
      setSettledAmount(
        settlementsResponse.data?.reduce((sum, row) => sum + (row.amount ?? 0), 0) ?? 0
      );
    }

    // Cargar devoluciones y cancelaciones de la semana
    // Solo las creadas después de la última liquidación (si existe)
    const { start, end } = currentWeekRange();
    let returnsQuery = supabase
      .from("orders")
      .select("id, commission_amount, status")
      .eq("technician_id", technicianId)
      .in("status", ["returned", "cancelled"])
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());
    
    // Si hay liquidación, solo contar devoluciones creadas DESPUÉS de la liquidación
    if (lastSettlementDate) {
      returnsQuery = returnsQuery.gte("created_at", lastSettlementDate.toISOString());
    }
    
    const { data: returnedData } = await returnsQuery;

    if (returnedData) {
      setReturnedOrders(returnedData);
      const total = returnedData.reduce((sum, order) => sum + (order.commission_amount ?? 0), 0);
      setReturnsTotal(total);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (technicianId) {
      void loadPendingAdjustments();
    }
    
    // Escuchar eventos de liquidación para refrescar el panel
    const handleSettlementCreated = () => {
      if (technicianId) {
        void loadPendingAdjustments();
      }
    };
    
    window.addEventListener('settlementCreated', handleSettlementCreated);
    return () => {
      window.removeEventListener('settlementCreated', handleSettlementCreated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicianId]);

  // Calcular total de ajustes seleccionados (usando nuevo sistema simplificado)
  const selectedAdjustmentsTotal = useMemo(
    () =>
      pendingAdjustments.reduce((sum, adj) => {
        if (!adj.isAvailableThisWeek) {
          return sum;
        }
        const selection = selectedAdjustments[adj.id];
        if (selection && selection.selected) {
          return sum + Math.min(Math.max(selection.amount, 0), adj.remaining);
        }
        // Fallback al sistema anterior si no hay selección nueva
        const raw = adjustmentDrafts[adj.id];
        const value = Number.isFinite(raw) ? raw : 0;
        return sum + Math.min(Math.max(value ?? 0, 0), adj.remaining);
      }, 0),
    [pendingAdjustments, selectedAdjustments, adjustmentDrafts]
  );

  const availableAdjustments = useMemo(
    () => pendingAdjustments.filter((adj) => adj.isAvailableThisWeek),
    [pendingAdjustments]
  );

  const deferredHoldback = useMemo(
    () =>
      pendingAdjustments.reduce((sum, adj) => {
        if (!adj.isAvailableThisWeek && adj.availableFromDate > weekEndDate) {
          return sum + adj.remaining;
        }
        return sum;
      }, 0),
    [pendingAdjustments, weekEndDate]
  );

  const totalAdjustable = useMemo(
    () => availableAdjustments.reduce((sum, adj) => sum + adj.remaining, 0),
    [availableAdjustments]
  );
  const grossAvailable = baseAmount - settledAmount;
  const minPayable = Math.max(grossAvailable - (totalAdjustable + deferredHoldback), 0);
  const maxPayable = Math.max(baseAmount + deferredHoldback, grossAvailable);
  const netRemaining = Math.max(grossAvailable - (selectedAdjustmentsTotal + deferredHoldback), 0);

  // Calcular monto a pagar automáticamente basado en selección de ajustes
  useEffect(() => {
    const totalToPay = Math.max(0, grossAvailable - selectedAdjustmentsTotal - deferredHoldback);
    setCustomAmountInput(totalToPay);
  }, [grossAvailable, selectedAdjustmentsTotal, deferredHoldback]);

  // Calcular saldo restante después del pago
  const remainingBalance = useMemo(() => {
    const paidAmount = paymentMethod === "efectivo/transferencia" 
      ? cashAmount + transferAmount 
      : customAmountInput;
    return Math.max(0, netRemaining - paidAmount);
  }, [netRemaining, customAmountInput, cashAmount, transferAmount, paymentMethod]);

  function distributeDeduction(amountToDeduct: number) {
    let remaining = Math.max(0, Math.min(amountToDeduct, totalAdjustable));
    const next: Record<string, number> = {};
    pendingAdjustments.forEach((adj) => {
      if (!adj.isAvailableThisWeek) {
        next[adj.id] = 0;
        return;
      }
      if (remaining <= 0) {
        next[adj.id] = 0;
        return;
      }
      const apply = Math.min(adj.remaining, remaining);
      next[adj.id] = apply;
      remaining -= apply;
    });
    return next;
  }

  function applyPreset(mode: "net" | "full") {
    const target = mode === "full" ? maxPayable : minPayable;
    applyCustomAmount(target);
  }

  function applyCustomAmount(targetValue?: number) {
    const clamped = Math.max(minPayable, Math.min(targetValue ?? customAmountInput, maxPayable));
    const desiredDeduction = Math.max(
      0,
      Math.min(totalAdjustable, Math.max(grossAvailable - deferredHoldback - clamped, 0))
    );
    const nextDrafts = distributeDeduction(desiredDeduction);
    setCustomAmountInput(clamped);
    setAdjustmentDrafts(nextDrafts);
  }

  // Funciones simplificadas para manejar selección de ajustes
  function handleToggleAdjustmentSelection(adjId: string) {
    const target = pendingAdjustments.find((adj) => adj.id === adjId);
    if (!target || !target.isAvailableThisWeek) return;
    
    setSelectedAdjustments((prev) => {
      const current = prev[adjId];
      return {
        ...prev,
        [adjId]: {
          selected: !current?.selected,
          amount: current?.selected ? 0 : target.remaining, // Si se deselecciona, poner 0; si se selecciona, poner el monto completo
        },
      };
    });
  }

  function handleAdjustmentAmountChange(adjId: string, value: string) {
    const target = pendingAdjustments.find((adj) => adj.id === adjId);
    if (!target || !target.isAvailableThisWeek) return;
    
    const numeric = Number(value);
    if (Number.isNaN(numeric) || numeric < 0) {
      setSelectedAdjustments((prev) => ({
        ...prev,
        [adjId]: { ...prev[adjId], amount: 0 },
      }));
      return;
    }
    
    const clamped = Math.max(0, Math.min(numeric, target.remaining));
    setSelectedAdjustments((prev) => ({
      ...prev,
      [adjId]: { ...prev[adjId], amount: clamped },
    }));
  }

  // Mantener funciones antiguas para compatibilidad
  function handleDraftChange(adjId: string, value: string) {
    handleAdjustmentAmountChange(adjId, value);
  }

  function handleToggleAdjustment(adjId: string, enabled: boolean) {
    if (enabled) {
      handleToggleAdjustmentSelection(adjId);
    } else {
      setSelectedAdjustments((prev) => ({
        ...prev,
        [adjId]: { ...prev[adjId], selected: false, amount: 0 },
      }));
    }
  }

  function formatAmount(amount: number) {
    return formatCLP(amount);
  }
  const canEditAdjustments = context === "admin";

  async function handleDeleteAdjustment(adjustmentId: string) {
    const target = pendingAdjustments.find((adj) => adj.id === adjustmentId);
    if (!target) {
      console.error("❌ No se encontró el ajuste a eliminar:", adjustmentId);
      setErrorMsg("No se encontró el ajuste a eliminar.");
      return;
    }
    
    const confirmed = window.confirm(
      `¿Eliminar este ajuste de sueldo (${target.type === "advance" ? "Adelanto" : "Descuento"} de ${formatAmount(target.amount ?? 0)})?\n\n` +
      `Monto original: ${formatAmount(target.amount)}\n` +
      `Aplicado: ${formatAmount(target.appliedTotal)}\n` +
      `Restante: ${formatAmount(target.remaining)}\n\n` +
      `Esta acción no se puede deshacer.`
    );
    if (!confirmed) {
      return;
    }
    
    setErrorMsg(null);
    setDeletingAdjustmentId(adjustmentId);
    
    console.log("🗑️ Intentando eliminar ajuste:", {
      adjustmentId,
      technicianId,
      amount: target.amount,
      remaining: target.remaining
    });
    
    const { data, error } = await supabase
      .from("salary_adjustments")
      .delete()
      .eq("id", adjustmentId)
      .eq("technician_id", technicianId)
      .select(); // Seleccionar para verificar que se eliminó
    
    setDeletingAdjustmentId(null);
    
    if (error) {
      console.error("❌ Error eliminando ajuste:", error);
      console.error("Detalles del error:", JSON.stringify(error, null, 2));
      
      const errorMsg = error.message?.toLowerCase() || "";
      if (errorMsg.includes("row-level security") || errorMsg.includes("policy")) {
        setErrorMsg("❌ Error de permisos: No tienes permisos para eliminar este ajuste. Verifica que tengas rol de administrador.");
      } else {
        setErrorMsg(`❌ No pudimos eliminar el ajuste: ${error.message || "Error desconocido"}`);
      }
      return;
    }
    
    if (data && data.length > 0) {
      console.log("✅ Ajuste eliminado correctamente:", data);
      setSuccessMsg(`✅ Ajuste eliminado correctamente.`);
    } else {
      console.warn("⚠️ No se recibió confirmación de eliminación, pero no hubo error");
      setSuccessMsg(`⚠️ Ajuste posiblemente eliminado. Verifica en el listado.`);
    }
    
    // Recargar ajustes
    await loadPendingAdjustments();
  }

  async function handleLiquidation() {
    // Si es pago mixto, validar que ambos montos sumen el total
    let targetAmount = customAmountInput;
    
    if (paymentMethod === "efectivo/transferencia") {
      const mixedTotal = cashAmount + transferAmount;
      if (mixedTotal <= 0) {
        setErrorMsg("Debes ingresar al menos un monto en efectivo o transferencia.");
        return;
      }
      if (mixedTotal > netRemaining) {
        setErrorMsg(`El total de efectivo + transferencia no puede exceder el total a liquidar (${formatCLP(netRemaining)}).`);
        return;
      }
      // Usar el total mixto como monto a liquidar
      targetAmount = mixedTotal;
      setCustomAmountInput(mixedTotal);
    } else {
      // Para efectivo o transferencia individual, validar que no exceda el total a liquidar
      if (targetAmount > netRemaining) {
        setErrorMsg(`El monto no puede exceder el total a liquidar (${formatCLP(netRemaining)}).`);
        return;
      }
    }
    
    // Permitir pagos parciales (no requiere que sea exactamente minPayable o maxPayable)
    if (targetAmount <= 0) {
      setErrorMsg("Debes ingresar un monto mayor a 0 para liquidar.");
      return;
    }
    
    if (targetAmount > netRemaining) {
      setErrorMsg(`El monto no puede exceder el total a liquidar (${formatCLP(netRemaining)}).`);
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);

    setSaving(true);
    applyCustomAmount(targetAmount);

    const desiredDeduction = Math.max(
      0,
      Math.min(totalAdjustable, Math.max(grossAvailable - deferredHoldback - targetAmount, 0))
    );
    const draftsForSave = distributeDeduction(desiredDeduction);
    setAdjustmentDrafts(draftsForSave);
    setCustomAmountInput(targetAmount);

    // Usar nuevo sistema de selección de ajustes
    const entriesToApply = pendingAdjustments
      .filter((adj) => adj.isAvailableThisWeek)
      .map((adj) => {
        const selection = selectedAdjustments[adj.id];
        if (selection && selection.selected && selection.amount > 0) {
          return {
            adjustment_id: adj.id,
            technician_id: technicianId,
            applied_amount: Math.min(selection.amount, adj.remaining),
          };
        }
        return null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => !!entry && entry.applied_amount > 0);

    const appliedById = entriesToApply.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.adjustment_id] = entry.applied_amount;
      return acc;
    }, {});

    const { data: userData } = await supabase.auth.getUser();

    // Preparar aplicaciones para la función transaccional
    const applicationsPayload = entriesToApply.map((entry) => ({
      adjustment_id: entry.adjustment_id,
      applied_amount: entry.applied_amount,
    }));

    const nextWeekStart = new Date(weekStartDate);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    nextWeekStart.setHours(0, 0, 0, 0);
    const nextWeekStartISO = nextWeekStart.toISOString().slice(0, 10);

    const carryOverAdjustments = pendingAdjustments
      .map((adj) => {
        if (!adj.isCurrentWeek || !adj.isAvailableThisWeek) return null;
        const raw = draftsForSave[adj.id] ?? 0;
        const leftover = Math.max(adj.remaining - raw, 0);
        if (leftover <= 0) return null;
        return { adj, leftover };
      })
      .filter((item): item is { adj: AdjustmentWithPending; leftover: number } => !!item);

    const carryOverSummary: { original_id: string; amount: number }[] = [];

    for (const item of carryOverAdjustments) {
      const { error: deferError } = await supabase
        .from("salary_adjustments")
        .update({
          available_from: nextWeekStartISO,
          note: item.adj.note
            ? `${item.adj.note} (pendiente ${formatDate(nextWeekStartISO)})`
            : `Pendiente desde ${formatDate(nextWeekStartISO)}`,
        })
        .eq("id", item.adj.id);

      if (deferError) {
        console.error("Error actualizando ajuste diferido:", deferError);
        setErrorMsg("No pudimos diferir parte de los descuentos. Intenta nuevamente.");
        setSaving(false);
        return;
      }

      carryOverSummary.push({ original_id: item.adj.id, amount: item.leftover });
    }

    const detailsPayload = {
      base_amount: baseAmount,
      selected_adjustments_total: selectedAdjustmentsTotal,
      settled_amount: targetAmount,
      adjustments: pendingAdjustments.map((adj) => {
        const applied = appliedById[adj.id] ?? 0;
        return {
          id: adj.id,
          type: adj.type,
          note: adj.note,
          amount: adj.amount,
          applied,
          omitted: Math.max(adj.remaining - applied, 0),
          carried_to_next_week:
            carryOverSummary.find((item) => item.original_id === adj.id)?.amount ?? 0,
        };
      }),
      carry_over: carryOverSummary,
      // Si es pago mixto, guardar los montos por separado
      ...(paymentMethod === "efectivo/transferencia" && {
        payment_breakdown: {
          efectivo: cashAmount,
          transferencia: transferAmount,
          total: targetAmount,
        },
      }),
    };

    const settlementData = {
      technician_id: technicianId,
      week_start: weekStartISO,
      amount: targetAmount,
      note: null,
      context,
      payment_method: paymentMethod,
      details: detailsPayload,
      created_by: userData?.user?.id ?? null,
    };
    
    console.log("Guardando liquidación con los siguientes datos:", settlementData);
    console.log("Aplicaciones a registrar:", applicationsPayload);
    
    // Intentar usar función transaccional primero
    let insertedData: any[] | null = null;
    let settlementError: any = null;
    
    try {
      const { data, error } = await supabase.rpc('register_settlement_with_applications', {
        p_technician_id: technicianId,
        p_week_start: weekStartISO,
        p_amount: targetAmount,
        p_payment_method: paymentMethod,
        p_details: detailsPayload,
        p_applications: applicationsPayload.length > 0 ? applicationsPayload : null,
        p_created_by: userData?.user?.id ?? null,
      });
      
      if (error) {
        console.warn("Error usando función transaccional, intentando método antiguo:", error);
        // Fallback al método antiguo si la función no existe
        settlementError = error;
      } else if (data) {
        // La función retorna el ID de la liquidación
        const settlementId = data;
        // Obtener los datos completos
        const { data: settlementData, error: fetchError } = await supabase
          .from("salary_settlements")
          .select("*")
          .eq("id", settlementId)
          .single();
        
        if (fetchError) {
          settlementError = fetchError;
        } else {
          insertedData = [settlementData];
        }
      }
    } catch (rpcError: any) {
      console.warn("Función transaccional no disponible, usando método antiguo:", rpcError);
      // Fallback: usar método antiguo
      const { data, error } = await supabase
        .from("salary_settlements")
        .insert(settlementData)
        .select();
      
      insertedData = data;
      settlementError = error;
      
      // Si el settlement se guardó, guardar aplicaciones por separado
      if (data && data.length > 0 && applicationsSupported && entriesToApply.length > 0) {
        const payload = entriesToApply.map((entry) => ({
          ...entry,
          week_start: weekStartISO,
          created_by: userData?.user?.id ?? null,
        }));
        
        const { error: appError } = await supabase
          .from("salary_adjustment_applications")
          .insert(payload);
        
        if (appError) {
          console.error("Error guardando aplicaciones:", appError);
          setErrorMsg("⚠️ La liquidación se guardó pero hubo un error al registrar las aplicaciones. Verifica manualmente.");
        }
      }
    }

    setSaving(false);

    if (settlementError) {
      console.error("Error registrando pago:", settlementError);
      console.error("Detalles del error:", JSON.stringify(settlementError, null, 2));
      const msg = settlementError.message?.toLowerCase() ?? "";
      if (msg.includes("salary_settlements") || msg.includes("does not exist")) {
        setSetupWarning(
          "Para registrar pagos completos ejecuta el script `database/add_salary_settlements.sql` en Supabase."
        );
        setErrorMsg(
          "No pudimos registrar el pago porque falta la tabla de liquidaciones. Ejecuta el script indicado y vuelve a intentarlo."
        );
      } else if (msg.includes("row-level security") || msg.includes("policy")) {
        setErrorMsg(
          `Error de seguridad: ${settlementError.message}. Verifica que tengas permisos de administrador para registrar liquidaciones.`
        );
        console.error("Problema con las políticas RLS. Verifica las políticas de inserción en Supabase.");
      } else {
        setErrorMsg(`No pudimos registrar el pago: ${settlementError.message}. Verifica la consola para más detalles.`);
      }
      return;
    }

    if (!insertedData || insertedData.length === 0) {
      console.error("No se recibieron datos de confirmación de la inserción");
      setErrorMsg("❌ ERROR CRÍTICO: La liquidación no se pudo confirmar. NO se guardó. Por favor, intenta nuevamente.");
      // Intentar verificar si se guardó de todas formas consultando la BD
      try {
        const { data: verification, error: verifyError } = await supabase
          .from("salary_settlements")
          .select("id, amount, created_at")
          .eq("technician_id", technicianId)
          .eq("week_start", weekStartISO)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (verification && !verifyError) {
          console.warn("Aunque no se recibió confirmación, se encontró una liquidación en la BD:", verification);
          setSuccessMsg(`⚠️ Liquidación posiblemente guardada (ID: ${verification.id}). Verifica en el historial.`);
        } else {
          setErrorMsg("❌ ERROR: La liquidación NO se guardó. Verifica los logs en la consola e intenta nuevamente.");
        }
      } catch (verifyErr) {
        console.error("Error al verificar liquidación:", verifyErr);
        setErrorMsg("❌ ERROR: No se pudo confirmar si la liquidación se guardó. Verifica en el historial o intenta nuevamente.");
      }
      return;
    }

    // VERIFICACIÓN ADICIONAL: Confirmar que realmente se guardó consultando la BD
    const savedSettlementId = insertedData[0].id;
    console.log("Liquidación insertada, verificando en BD... ID:", savedSettlementId);
    
    try {
      const { data: verification, error: verifyError } = await supabase
        .from("salary_settlements")
        .select("id, amount, created_at, technician_id, week_start")
        .eq("id", savedSettlementId)
        .maybeSingle();
      
      if (verifyError || !verification) {
        console.error("❌ ERROR: La liquidación se insertó pero NO se pudo verificar:", verifyError);
        setErrorMsg(`⚠️ ADVERTENCIA: La liquidación fue insertada (ID: ${savedSettlementId}) pero no se pudo verificar. Por favor, verifica en el historial si aparece correctamente.`);
        // Continuar de todas formas ya que la inserción fue exitosa
      } else {
        console.log("✅ VERIFICACIÓN EXITOSA: La liquidación se guardó correctamente:", verification);
      }
    } catch (verifyErr) {
      console.error("Error en verificación adicional:", verifyErr);
      // Continuar de todas formas
    }

    setSuccessMsg(`✅ Liquidación registrada correctamente. ID: ${savedSettlementId} | Monto: ${formatCLP(targetAmount)} | Técnico: ${technicianName || technicianId}`);
    setPaymentMethod("efectivo");
    setCashAmount(0);
    setTransferAmount(0);
    await loadPendingAdjustments();
    if (onAfterSettlement) {
      onAfterSettlement();
    }
    
    // Disparar evento para actualizar el historial
    window.dispatchEvent(new CustomEvent('settlementCreated'));
    
    // Alert visual adicional para asegurar que el usuario vea el mensaje
    setTimeout(() => {
      alert(`✅ LIQUIDACIÓN GUARDADA\n\nID: ${savedSettlementId}\nMonto: ${formatCLP(targetAmount)}\nTécnico: ${technicianName || technicianId}\n\nPuedes verificar en el historial de liquidaciones.`);
    }, 500);
  }

  const noAdjustments = pendingAdjustments.length === 0;
  const settlementInfo = (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <p className="text-xs text-slate-500">Total ganado</p>
          <p className="text-lg font-semibold text-emerald-600">${formatAmount(baseAmount)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <p className="text-xs text-slate-500">Descuentos</p>
          <p className="text-lg font-semibold text-slate-700">
            -${formatAmount(selectedAdjustmentsTotal)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <p className="text-xs text-slate-500">Devoluciones</p>
          <p className="text-xs text-slate-400 mb-1">
            {returnedOrders.length} {returnedOrders.length === 1 ? 'orden' : 'órdenes'}
          </p>
          <p className="text-lg font-semibold text-sky-600">${formatAmount(returnsTotal)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <p className="text-xs text-slate-500">Total a liquidar</p>
          <p className="text-lg font-semibold text-brand">${formatAmount(netRemaining)}</p>
        </div>
      </div>
      {deferredHoldback > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm flex flex-col gap-1">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
            Pendiente próxima semana
          </p>
          <p className="text-lg font-semibold text-amber-700">
            ${formatAmount(deferredHoldback)}
          </p>
          <p className="text-xs text-amber-700">
            No se pagará esta semana y quedará pendiente para la próxima liquidación.
          </p>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="border border-slate-200 rounded-md p-4 text-sm text-slate-500">
        Cargando liquidación...
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-4 bg-slate-50">
      {setupWarning && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
          {setupWarning}
        </div>
      )}
      <div>
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h5 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
            💡 Guía de Pago al Técnico
            {technicianName && <span className="text-xs text-blue-600">• {technicianName}</span>}
          </h5>
          <div className="text-xs text-blue-800 space-y-1">
            <p><strong>Paso 1:</strong> Revisa el "Total a liquidar" (ganancias menos descuentos)</p>
            <p><strong>Paso 2:</strong> Si el técnico tiene adelantos pendientes, selecciona cuáles descontar</p>
            <p><strong>Paso 3:</strong> Puedes descontar el adelanto completo o solo una parte (pago parcial)</p>
            <p><strong>Paso 4:</strong> Selecciona el medio de pago y confirma el monto final</p>
          </div>
        </div>
        
        <h5 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-2">
          💵 Realizar Pago al Técnico
          {technicianName && <span className="text-xs text-slate-500">• {technicianName}</span>}
        </h5>
        <p className="text-xs text-slate-500 mb-3">
          Este es el pago final que recibirá el técnico. Si tiene adelantos, puedes descontarlos aquí.
        </p>
        
        {/* Selector de tipo de ajuste */}

        <div className="flex flex-wrap items-center gap-2 mt-2">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-500 flex items-center gap-2">
              Medio de pago:
              <select
                className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                value={paymentMethod}
                onChange={(e) => {
                  const newMethod = e.target.value as "efectivo" | "transferencia" | "efectivo/transferencia";
                  setPaymentMethod(newMethod);
                  if (newMethod !== "efectivo/transferencia") {
                    setCashAmount(0);
                    setTransferAmount(0);
                    // Si cambia a efectivo o transferencia, resetear el monto
                    setCustomAmountInput(0);
                  } else {
                    // Si cambia a mixto, resetear ambos montos
                    setCashAmount(0);
                    setTransferAmount(0);
                    setCustomAmountInput(0);
                  }
                }}
              >
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo/transferencia">Efectivo/Transferencia</option>
              </select>
            </label>
            {paymentMethod === "efectivo" && (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-500 flex flex-col gap-1">
                  Monto en Efectivo:
                  <input
                    type="number"
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm w-32"
                    value={customAmountInput}
                    min={0}
                    max={netRemaining}
                    disabled={false}
                    onChange={(e) => {
                      const amount = Number(e.target.value) || 0;
                      const clamped = Math.min(amount, netRemaining);
                      setCustomAmountInput(clamped);
                    }}
                  />
                </label>
                {customAmountInput > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-emerald-600 font-medium">
                      A pagar: {formatCLP(customAmountInput)}
                    </p>
                    {remainingBalance > 0 && (
                      <p className="text-xs text-amber-600 font-semibold">
                        Saldo restante: {formatCLP(remainingBalance)}
                      </p>
                    )}
                    {remainingBalance === 0 && (
                      <p className="text-xs text-emerald-600">
                        ✓ Liquidación completa
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {paymentMethod === "transferencia" && (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-slate-500 flex flex-col gap-1">
                  Monto en Transferencia:
                  <input
                    type="number"
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm w-32"
                    value={customAmountInput}
                    min={0}
                    max={netRemaining}
                    disabled={false}
                    onChange={(e) => {
                      const amount = Number(e.target.value) || 0;
                      const clamped = Math.min(amount, netRemaining);
                      setCustomAmountInput(clamped);
                    }}
                  />
                </label>
                {customAmountInput > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-emerald-600 font-medium">
                      A pagar: {formatCLP(customAmountInput)}
                    </p>
                    {remainingBalance > 0 && (
                      <p className="text-xs text-amber-600 font-semibold">
                        Saldo restante: {formatCLP(remainingBalance)}
                      </p>
                    )}
                    {remainingBalance === 0 && (
                      <p className="text-xs text-emerald-600">
                        ✓ Liquidación completa
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {paymentMethod === "efectivo/transferencia" && (
              <div className="flex gap-3 items-end">
                <label className="text-xs text-slate-500 flex flex-col gap-1">
                  Monto en Efectivo:
                  <input
                    type="number"
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm w-32"
                    value={cashAmount}
                    min={0}
                    max={netRemaining}
                    onChange={(e) => {
                      const cash = Number(e.target.value) || 0;
                      const maxCash = Math.min(cash, netRemaining);
                      setCashAmount(maxCash);
                      const remaining = Math.max(0, netRemaining - maxCash);
                      // Ajustar transferAmount si excede el restante
                      const adjustedTransfer = Math.min(transferAmount, remaining);
                      setTransferAmount(adjustedTransfer);
                      setCustomAmountInput(maxCash + adjustedTransfer);
                    }}
                  />
                  {cashAmount > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      Restante: {formatCLP(Math.max(0, netRemaining - cashAmount))}
                    </p>
                  )}
                </label>
                <label className="text-xs text-slate-500 flex flex-col gap-1">
                  Monto en Transferencia:
                  <input
                    type="number"
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm w-32"
                    value={transferAmount}
                    min={0}
                    max={Math.max(0, netRemaining - cashAmount)}
                    onChange={(e) => {
                      const transfer = Number(e.target.value) || 0;
                      const maxTransfer = Math.max(0, netRemaining - cashAmount);
                      const adjustedTransfer = Math.min(transfer, maxTransfer);
                      setTransferAmount(adjustedTransfer);
                      setCustomAmountInput(cashAmount + adjustedTransfer);
                    }}
                  />
                </label>
                <div className="text-xs text-slate-600 pb-1 flex flex-col">
                  <span className="font-semibold text-emerald-600">
                    A pagar: {formatCLP(cashAmount + transferAmount)}
                  </span>
                  {remainingBalance > 0 && (
                    <span className="text-amber-600 font-semibold mt-1">
                      Saldo restante: {formatCLP(remainingBalance)}
                    </span>
                  )}
                  {remainingBalance === 0 && cashAmount + transferAmount > 0 && (
                    <span className="text-emerald-600 mt-1">
                      ✓ Liquidación completa
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {settlementInfo}

      {/* Mostrar resumen del pago y saldo restante */}
      {((paymentMethod === "efectivo" && customAmountInput > 0) ||
        (paymentMethod === "transferencia" && customAmountInput > 0) ||
        (paymentMethod === "efectivo/transferencia" && (cashAmount + transferAmount) > 0)) && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-700">Resumen del pago:</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-500">Monto a pagar:</p>
              <p className="text-lg font-semibold text-emerald-600">
                {formatCLP(paymentMethod === "efectivo/transferencia" ? cashAmount + transferAmount : customAmountInput)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Saldo restante:</p>
              <p className={`text-lg font-semibold ${remainingBalance > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {formatCLP(remainingBalance)}
              </p>
            </div>
          </div>
          {remainingBalance > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-200">
              <p className="text-xs text-amber-700">
                ⚠️ El saldo restante de {formatCLP(remainingBalance)} quedará pendiente para la próxima liquidación.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Mostrar TODOS los ajustes, separando pendientes de saldados */}
      <div className="space-y-3">
        {/* DEBUG: Mostrar información de ajustes cargados */}
        {process.env.NODE_ENV === 'development' && pendingAdjustments.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 text-xs">
            <p className="font-semibold">🔍 DEBUG: Total ajustes cargados: {pendingAdjustments.length}</p>
            <p>Pendientes (remaining &gt; 0): {pendingAdjustments.filter(adj => adj.remaining > 0).length}</p>
            <p>Saldados (remaining = 0): {pendingAdjustments.filter(adj => adj.remaining <= 0).length}</p>
            <p>Disponibles esta semana: {pendingAdjustments.filter(adj => adj.isAvailableThisWeek).length}</p>
            {pendingAdjustments.filter(adj => adj.amount === 100000 && adj.type === 'advance').length > 0 && (
              <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded">
                <p className="text-red-800 font-bold">
                  ⚠️ ADELANTO DE 100,000 ENCONTRADO:
                </p>
                {pendingAdjustments.filter(adj => adj.amount === 100000 && adj.type === 'advance').map(adj => (
                  <div key={adj.id} className="text-red-700 mt-1">
                    ID: {adj.id.slice(0, 8)}... | 
                    Monto: {formatAmount(adj.amount)} | 
                    Aplicado: {formatAmount(adj.appliedTotal)} | 
                    Restante: {formatAmount(adj.remaining)} | 
                    Disponible: {adj.isAvailableThisWeek ? 'Sí' : 'No'}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Ajustes pendientes (remaining > 0) */}
        {pendingAdjustments.filter(adj => adj.remaining > 0 && adj.isAvailableThisWeek).length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                Adelantos y Descuentos Pendientes ({pendingAdjustments.filter(a => a.remaining > 0 && a.isAvailableThisWeek).length})
              </span>
              <span className="text-sm text-slate-600 font-medium">
                Total a descontar: <span className="text-red-600">{formatAmount(selectedAdjustmentsTotal)}</span>
              </span>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-3">
              <p className="text-xs text-blue-800">
                💡 <strong>Instrucciones:</strong> Marca los adelantos que quieres descontar y ajusta el monto si es necesario. 
                Puedes descontar el monto completo o solo una parte.
              </p>
            </div>

            <div className="space-y-2">
              {pendingAdjustments
                .filter(adj => adj.remaining > 0 && adj.isAvailableThisWeek)
                .map((adj) => {
                const selection = selectedAdjustments[adj.id] || { selected: false, amount: adj.remaining };
                const isSelected = selection.selected;
                const amountToDeduct = isSelected ? selection.amount : 0;
                
                return (
                  <div
                    key={adj.id}
                    className={`bg-white border-2 rounded-lg p-4 transition-all ${
                      isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox para seleccionar */}
                      <div className="flex-shrink-0 pt-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleAdjustmentSelection(adj.id)}
                          className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                        />
                      </div>
                      
                      {/* Información del ajuste */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`font-semibold text-sm ${
                              adj.type === "advance" ? "text-blue-600" : "text-red-600"
                            }`}
                          >
                            {adj.type === "advance" ? "💰 Adelanto" : "📉 Descuento"}
                          </span>
                          {adj.note && (
                            <span className="text-xs text-slate-500">• {adj.note}</span>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mb-2">
                          <div>
                            <span className="text-slate-500">Monto original:</span>{" "}
                            <span className="font-semibold">{formatAmount(adj.amount)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Pendiente:</span>{" "}
                            <span className="font-semibold text-slate-900">{formatAmount(adj.remaining)}</span>
                          </div>
                        </div>
                        
                        {/* Campo para editar monto a descontar */}
                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Monto a descontar (puede ser parcial):
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={0}
                                max={adj.remaining}
                                step={1000}
                                value={amountToDeduct}
                                onChange={(e) => handleAdjustmentAmountChange(adj.id, e.target.value)}
                                className="w-32 border border-slate-300 rounded-md px-3 py-2 text-sm font-medium"
                                placeholder="0"
                              />
                              <span className="text-xs text-slate-500">
                                de {formatAmount(adj.remaining)} disponible
                              </span>
                            </div>
                            {amountToDeduct < adj.remaining && (
                              <p className="text-xs text-amber-600 mt-1">
                                ⚠️ Se descontarán {formatAmount(amountToDeduct)}. 
                                Quedarán {formatAmount(adj.remaining - amountToDeduct)} pendientes para la próxima semana.
                              </p>
                            )}
                            {amountToDeduct === adj.remaining && (
                              <p className="text-xs text-emerald-600 mt-1">
                                ✅ Se descontará el monto completo. No quedará pendiente.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Botón eliminar (solo admin) */}
                      {canEditAdjustments && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAdjustment(adj.id)}
                          disabled={deletingAdjustmentId === adj.id}
                          className="flex-shrink-0 text-red-600 hover:text-red-800 disabled:opacity-50"
                          title="Eliminar ajuste"
                        >
                          {deletingAdjustmentId === adj.id ? "..." : "🗑️"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Ajustes completamente saldados (remaining = 0) - solo para ver/eliminar */}
        {pendingAdjustments.filter(adj => adj.remaining <= 0).length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-300">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase">
                Ajustes Saldados ({pendingAdjustments.filter(adj => adj.remaining <= 0).length})
              </p>
              <p className="text-xs text-slate-400">
                Estos ajustes ya fueron completamente aplicados
              </p>
            </div>
            <div className="space-y-2">
              {pendingAdjustments
                .filter(adj => adj.remaining <= 0)
                .map((adj) => (
                  <div
                    key={adj.id}
                    className="bg-slate-50 border border-slate-200 rounded-md p-3 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span
                          className={`font-semibold ${
                            adj.type === "advance" ? "text-blue-600" : "text-red-600"
                          }`}
                        >
                          {adj.type === "advance" ? "💰 Adelanto" : "📉 Descuento"}
                        </span>
                        {adj.note && (
                          <span className="text-xs text-slate-500">• {adj.note}</span>
                        )}
                        <span className="text-xs text-emerald-600 font-medium">✅ Saldado</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Monto original: {formatAmount(adj.amount)} • 
                        Aplicado: {formatAmount(adj.appliedTotal)} • 
                        Restante: {formatAmount(adj.remaining)}
                      </div>
                    </div>
                    {canEditAdjustments && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAdjustment(adj.id)}
                        disabled={deletingAdjustmentId === adj.id}
                        className="flex-shrink-0 ml-3 px-3 py-1 text-xs font-medium rounded-md border border-red-500 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Eliminar ajuste"
                      >
                        {deletingAdjustmentId === adj.id ? "Eliminando..." : "🗑️ Eliminar"}
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Mostrar ajustes diferidos (no disponibles esta semana) */}
        {pendingAdjustments.filter(adj => !adj.isAvailableThisWeek && adj.remaining > 0).length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
              Ajustes pendientes para próximas semanas
            </p>
            <div className="space-y-2">
              {pendingAdjustments
                .filter(adj => !adj.isAvailableThisWeek && adj.remaining > 0)
                .map((adj) => (
                  <div
                    key={adj.id}
                    className="bg-amber-50 border border-amber-200 rounded-md p-2 text-xs text-amber-700"
                  >
                    <span className="font-semibold">
                      {adj.type === "advance" ? "Adelanto" : "Descuento"}
                    </span>
                    {" "}de {formatAmount(adj.remaining)} - Disponible desde {formatDate(adj.availableFromDate)}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Mensaje si no hay ajustes */}
        {pendingAdjustments.length === 0 && (
          <div className="text-sm text-slate-500 bg-white border border-dashed border-slate-300 rounded-md p-4">
            {netRemaining <= 0
              ? "No hay saldo pendiente. Todo está liquidado 🎉"
              : `No hay ajustes pendientes esta semana. Puedes registrar el pago completo de ${formatAmount(
                  netRemaining
                )} usando el botón.`}
          </div>
        )}
      </div>

      {errorMsg && <div className="text-xs text-red-600">{errorMsg}</div>}
      {successMsg && <div className="text-xs text-emerald-600">{successMsg}</div>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => void loadPendingAdjustments()}
          className="px-4 py-2 text-xs border border-slate-300 rounded-md hover:bg-slate-100 transition"
          disabled={saving}
        >
          Actualizar
        </button>
        <button
          type="button"
          onClick={() => void handleLiquidation()}
          disabled={saving || (paymentMethod === "efectivo/transferencia" ? (cashAmount + transferAmount) <= 0 : customAmountInput <= 0)}
          className="px-4 py-2 text-xs font-semibold rounded-md text-white bg-brand-light hover:bg-white hover:text-brand border border-brand-light hover:border-white transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Guardando..." : "Registrar liquidación"}
        </button>
      </div>
    </div>
  );
}



