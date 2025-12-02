import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDate, currentWeekRange } from "@/lib/date";
import { formatCLP } from "@/lib/currency";
import { calculatePayoutWeek, calculatePayoutYear } from "@/lib/payoutWeek";
import type { Order, OrderNote, Profile } from "@/types";
// Bsale integration removed - now using manual receipt URL
import { calcCommission } from "@/lib/commission";
import type { PaymentMethod } from "@/lib/commission";

interface OrdersTableProps {
  technicianId?: string;
  refreshKey?: number;
  onUpdate?: () => void;
  isAdmin?: boolean;
  branchId?: string; // Opcional: filtrar por sucursal
  technicianIds?: string[]; // Opcional: lista de IDs de técnicos
  weekFilter?: { // Opcional: filtro de semana de pago
    payoutWeek: number;
    payoutYear: number;
    weekStart: Date;
    weekEnd: Date;
  };
}

type LoadFilters = {
  technicianId?: string;
  technicianIds?: string[];
};

export default function OrdersTable({ technicianId, refreshKey = 0, onUpdate, isAdmin = false, branchId, technicianIds, weekFilter }: OrdersTableProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"all" | "paid" | "pending" | "returned" | "cancelled">("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | "current_week" | "range">("all");
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [orderSearch, setOrderSearch] = useState("");
  const [loading, setLoading] = useState(!isAdmin);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCostsId, setEditingCostsId] = useState<string | null>(null);
  const [editReceipt, setEditReceipt] = useState("");
  const [editReceiptUrl, setEditReceiptUrl] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>("");
  const [editReceiptDate, setEditReceiptDate] = useState<string>("");
  const [editReplacementCost, setEditReplacementCost] = useState<number>(0);
  const [editRepairCost, setEditRepairCost] = useState<number>(0);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [notesByOrder, setNotesByOrder] = useState<Record<string, OrderNote[]>>({});
  const [notesLoading, setNotesLoading] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteFormVisible, setNoteFormVisible] = useState<Record<string, boolean>>({});
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});
  const [notesError, setNotesError] = useState<Record<string, string | null>>({});
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [updatingCostsId, setUpdatingCostsId] = useState<string | null>(null);
  const [technicianOptions, setTechnicianOptions] = useState<Profile[]>([]);
  const [loadingTechnicians, setLoadingTechnicians] = useState(false);
  const [selectedAdminTechnician, setSelectedAdminTechnician] = useState("");
  const [selectedLocal, setSelectedLocal] = useState("");
  const [hasAdminSearched, setHasAdminSearched] = useState(!isAdmin);
  const [adminActiveFilters, setAdminActiveFilters] = useState<LoadFilters | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Record<string, { hasDuplicateReceipt: boolean }>>({});

  const localOptions = useMemo(() => {
    const locales = new Set<string>();
    technicianOptions.forEach((tech) => {
      if (tech.local) {
        locales.add(tech.local);
      }
    });
    return Array.from(locales).sort((a, b) => a.localeCompare(b));
  }, [technicianOptions]);

  const load = useCallback(async (filters?: LoadFilters) => {
    if (isAdmin && !filters && !technicianId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    let q = supabase
      .from("orders")
      .select(`
        *,
        suppliers (
          id,
          name
        )
      `)
      .order("created_at", { ascending: false });

    // Filtrar por sucursal si se proporciona
    if (branchId) {
      q = q.eq("sucursal_id", branchId);
    }
    
    if (filters?.technicianId) {
      q = q.eq("technician_id", filters.technicianId);
    } else if (filters?.technicianIds) {
      if (filters.technicianIds.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }
      q = q.in("technician_id", filters.technicianIds);
    } else if (technicianIds && technicianIds.length > 0) {
      q = q.in("technician_id", technicianIds);
    } else if (technicianId) {
      q = q.eq("technician_id", technicianId);
    }

    // Aplicar filtro de semana de pago si se proporciona
    if (weekFilter) {
      // Para órdenes pagadas: filtrar por payout_week y payout_year
      // Para órdenes pendientes: filtrar por created_at dentro del rango de la semana
      q = q.or(
        `and(status.eq.paid,payout_week.eq.${weekFilter.payoutWeek},payout_year.eq.${weekFilter.payoutYear}),` +
        `and(status.eq.pending,created_at.gte.${weekFilter.weekStart.toISOString()},created_at.lte.${weekFilter.weekEnd.toISOString()})`
      );
    }

    const { data, error } = await q;

    if (error) {
      console.error("Error loading orders:", error);
      console.error("Detalles del error:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      setOrders([]);
      setDuplicates({});
      // Si es admin y hay error, mostrar mensaje
      if (isAdmin) {
        setAdminError(`Error al cargar órdenes: ${error.message}. Revisa la consola para más detalles.`);
      }
    } else {
      const loadedOrders = (data as Order[]) ?? [];
      setOrders(loadedOrders);
      // Detectar duplicados de receipt_number
      const receiptCounts: Record<string, string[]> = {};
      loadedOrders.forEach(order => {
        if (order.receipt_number && order.receipt_number.trim()) {
          const receipt = order.receipt_number.trim();
          if (!receiptCounts[receipt]) {
            receiptCounts[receipt] = [];
          }
          receiptCounts[receipt].push(order.id);
        }
      });
      
      const detectedDuplicates: Record<string, { hasDuplicateReceipt: boolean }> = {};
      Object.entries(receiptCounts).forEach(([receipt, orderIds]) => {
        if (orderIds.length > 1) {
          orderIds.forEach(orderId => {
            detectedDuplicates[orderId] = { hasDuplicateReceipt: true };
          });
        }
      });
      setDuplicates(detectedDuplicates);
    }
    setLoading(false);
  }, [technicianId, isAdmin, branchId, technicianIds, weekFilter]);

  const refreshOrders = useCallback(() => {
    if (isAdmin) {
      if (adminActiveFilters) {
        void load(adminActiveFilters);
      }
    } else {
      void load();
    }
  }, [isAdmin, adminActiveFilters, load]);

  const adminRefreshKeyRef = useRef(refreshKey);

  useEffect(() => {
    if (!isAdmin) {
      void load();
    }
  }, [isAdmin, technicianId, refreshKey, load]);

  useEffect(() => {
    if (!isAdmin || !adminActiveFilters || !hasAdminSearched) {
      adminRefreshKeyRef.current = refreshKey;
      return;
    }
    if (adminRefreshKeyRef.current === refreshKey) {
      return;
    }
    adminRefreshKeyRef.current = refreshKey;
    void load(adminActiveFilters);
  }, [isAdmin, refreshKey, adminActiveFilters, hasAdminSearched, load]);

  useEffect(() => {
    if (!isAdmin) {
      setTechnicianOptions([]);
      return;
    }

    let cancelled = false;
    async function fetchTechnicians() {
      setLoadingTechnicians(true);
      const { data, error } = await supabase
        .from("users")
        .select("id, name, local")
        .eq("role", "technician")
        .order("name");

      if (!cancelled) {
        if (error) {
          console.error("Error loading technicians for admin search:", error);
          setTechnicianOptions([]);
        } else {
          setTechnicianOptions((data as Profile[]) ?? []);
        }
        setLoadingTechnicians(false);
      }
    }

    void fetchTechnicians();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  async function handleAdminSearch() {
    if (!isAdmin) {
      return;
    }
    setAdminError(null);

    if (!selectedLocal && !selectedAdminTechnician) {
      setHasAdminSearched(true);
      setAdminActiveFilters(null);
      setOrders([]);
      setAdminError("Selecciona un local o un técnico para iniciar la búsqueda.");
      return;
    }

    let filters: LoadFilters | null = null;

    if (selectedAdminTechnician) {
      filters = { technicianId: selectedAdminTechnician };
    } else if (selectedLocal) {
      const techniciansForLocal = technicianOptions.filter(
        (tech) => (tech.local || "") === selectedLocal
      );

      if (techniciansForLocal.length === 0) {
        setHasAdminSearched(true);
        setAdminActiveFilters(null);
        setOrders([]);
        setAdminError("No encontramos técnicos asociados a ese local.");
        return;
      }

      filters = { technicianIds: techniciansForLocal.map((tech) => tech.id) };
    }

    if (!filters) {
      setAdminError("Selecciona un local o un técnico válido.");
      return;
    }

    setHasAdminSearched(true);
    setAdminActiveFilters(filters);
    setLoading(true);
    try {
      await load(filters);
    } catch (err) {
      console.error("Error en búsqueda de órdenes:", err);
      setAdminError("Error al cargar las órdenes. Intenta nuevamente.");
      setOrders([]);
      setLoading(false);
    }
  }

  function handleAdminReset() {
    setSelectedAdminTechnician("");
    setSelectedLocal("");
    setAdminActiveFilters(null);
    setOrders([]);
    setHasAdminSearched(false);
    setAdminError(null);
    setFilter("all");
    setPeriodFilter("all");
    setCustomRange({ start: "", end: "" });
    setOrderSearch("");
    if (isAdmin) {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;

    if (periodFilter === "current_week") {
      const { start, end } = currentWeekRange();
      rangeStart = new Date(start);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(end);
      rangeEnd.setHours(23, 59, 59, 999);
    } else if (periodFilter === "range") {
      if (customRange.start) {
        rangeStart = new Date(customRange.start);
        rangeStart.setHours(0, 0, 0, 0);
      }
      if (customRange.end) {
        rangeEnd = new Date(customRange.end);
        rangeEnd.setHours(23, 59, 59, 999);
      } else if (rangeStart) {
        rangeEnd = new Date(rangeStart);
        rangeEnd.setHours(23, 59, 59, 999);
      }
      if (!rangeStart && customRange.end) {
        rangeStart = new Date(customRange.end);
        rangeStart.setHours(0, 0, 0, 0);
      }
    }

    const orderQuery = orderSearch.trim().toLowerCase();

    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) {
        return false;
      }
      // Siempre excluir devueltas y canceladas de los filtros "all", "paid", "pending" a menos que se filtren explícitamente
      if (filter === "all" || filter === "paid" || filter === "pending") {
        if (o.status === "returned" || o.status === "cancelled") {
          return false;
        }
      }

      if ((periodFilter === "current_week" || periodFilter === "range") && (rangeStart || rangeEnd)) {
        const created = new Date(o.created_at);
        if (rangeStart && created < rangeStart) {
          return false;
        }
        if (rangeEnd && created > rangeEnd) {
          return false;
        }
      }

      if (orderQuery) {
        const orderNumber = (o.order_number || "").toLowerCase();
        if (!orderNumber.includes(orderQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [orders, filter, periodFilter, orderSearch, customRange]);

  async function handleUpdateReceipt(orderId: string) {
    // Obtener la orden actual para recalcular la comisión
    const currentOrder = orders.find((o) => o.id === orderId);
    if (!currentOrder) {
      alert("Error: No se encontró la orden");
      return;
    }

    // Permitir actualizar medio de pago sin recibo
    // Si hay recibo, validarlo; si no, solo actualizar el medio de pago
    const hasReceipt = editReceipt.trim().length > 0;
    
    // IMPORTANTE: Si la orden ya tiene recibo Y estamos modificando/agregando uno nuevo,
    // también debemos verificar si necesita actualizar la fecha a la semana actual
    const isUpdatingReceipt = hasReceipt && currentOrder.receipt_number;
    
    // Verificar duplicados (permitir pero mostrar advertencia)
    let hasDuplicateReceipt = false;
    if (hasReceipt) {
      const { data: duplicateOrders } = await supabase
        .from("orders")
        .select("id, receipt_number")
        .eq("receipt_number", editReceipt.trim())
        .neq("id", orderId);
      
      hasDuplicateReceipt = duplicateOrders && duplicateOrders.length > 0;
      
      if (hasDuplicateReceipt) {
        const confirmMessage = `⚠️ Este número de recibo ya está registrado en ${duplicateOrders.length} otra(s) orden(es). ¿Deseas continuar de todas formas?`;
        if (!window.confirm(confirmMessage)) {
          return;
        }
      }
    }

    // Recalcular comisión si hay método de pago
    const paymentMethodToUse = editPaymentMethod || currentOrder.payment_method || "";
    const newCommission = calcCommission({
      paymentMethod: paymentMethodToUse as PaymentMethod,
      costoRepuesto: currentOrder.replacement_cost || 0,
      precioTotal: currentOrder.repair_cost || 0,
    });

    // Si hay recibo, marcar como pagada; si no, mantener el estado actual o "pending"
    const newStatus = hasReceipt ? "paid" : (currentOrder.status || "pending");

    // ⚠️ CAMBIO CRÍTICO: Si estamos marcando como pagada por primera vez, establecer paid_at, payout_week y payout_year
    // Estos campos se fijan permanentemente y nunca se recalculan después
    const now = new Date();
    const isMarkingAsPaid = newStatus === "paid" && currentOrder.status !== "paid";
    const paidAt = isMarkingAsPaid ? now.toISOString() : (currentOrder.paid_at || null);
    const payoutWeek = isMarkingAsPaid ? calculatePayoutWeek(now) : (currentOrder.payout_week || null);
    const payoutYear = isMarkingAsPaid ? calculatePayoutYear(now) : (currentOrder.payout_year || null);

    // Si se está quitando el estado de pagada, limpiar los campos de payout
    const shouldClearPayoutFields = newStatus !== "paid" && currentOrder.status === "paid";
    
    const updateData: {
      payment_method: string;
      status: string;
      commission_amount: number;
      receipt_number?: string | null;
      receipt_url?: string | null;
      paid_at?: string | null;
      payout_week?: number | null;
      payout_year?: number | null;
      created_at?: string;
    } = {
      payment_method: paymentMethodToUse || '', // Usar '' en lugar de null (NOT NULL constraint)
      status: newStatus,
      commission_amount: newCommission,
      paid_at: shouldClearPayoutFields ? null : paidAt,
      payout_week: shouldClearPayoutFields ? null : payoutWeek,
      payout_year: shouldClearPayoutFields ? null : payoutYear,
    };

    // Solo actualizar recibo si se proporciona
    if (hasReceipt) {
      updateData.receipt_number = editReceipt.trim();
      updateData.receipt_url = editReceiptUrl.trim() || null;

      // Si se proporcionó una fecha de recibo, verificar si es diferente a la fecha original
      // y si cae en una semana diferente, actualizar la fecha de la orden
      if (editReceiptDate) {
        const originalOrderDate = new Date(currentOrder.created_at);
        const receiptDate = new Date(editReceiptDate + 'T12:00:00'); // Agregar hora para evitar problemas de zona horaria
        
        // Comparar solo las fechas (sin hora)
        const originalDateOnly = new Date(originalOrderDate.getFullYear(), originalOrderDate.getMonth(), originalOrderDate.getDate());
        const receiptDateOnly = new Date(receiptDate.getFullYear(), receiptDate.getMonth(), receiptDate.getDate());
        
        // Verificar si la fecha es diferente
        const isDifferentDate = receiptDateOnly.getTime() !== originalDateOnly.getTime();
        
        // Calcular las semanas de ambas fechas
        const { start: originalWeekStart } = currentWeekRange(originalOrderDate);
        const { start: receiptWeekStart } = currentWeekRange(receiptDate);
        
        // Verificar si cae en una semana diferente
        const isDifferentWeek = receiptWeekStart.getTime() !== originalWeekStart.getTime();
        
        console.log(`🔍 Verificando fecha de recibo para orden ${currentOrder.order_number}:`, {
          fechaOriginal: originalOrderDate.toLocaleDateString('es-CL'),
          fechaRecibo: receiptDate.toLocaleDateString('es-CL'),
          semanaOriginal: originalWeekStart.toLocaleDateString('es-CL'),
          semanaRecibo: receiptWeekStart.toLocaleDateString('es-CL'),
          esFechaDiferente: isDifferentDate,
          esSemanaDiferente: isDifferentWeek
        });
        
        // Si la fecha es diferente, actualizar (permitir fechas futuras razonables, hasta 30 días)
        if (isDifferentDate) {
          const now = new Date();
          const daysDifference = Math.floor((receiptDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          // Permitir fechas futuras hasta 30 días
          if (daysDifference > 30) {
            alert(`⚠️ La fecha del recibo no puede ser más de 30 días en el futuro.`);
            return;
          }
          
          // Actualizar siempre que la fecha sea diferente (permite corregir fechas incorrectas)
          // No importa si es anterior o posterior, el usuario puede corregirla
          
          // Guardar la fecha original si no existe en original_created_at (ANTES de actualizar)
          if (!currentOrder.original_created_at) {
            console.log(`📝 Guardando fecha original: ${originalOrderDate.toISOString()}`);
            // Actualizar original_created_at antes de cambiar created_at
            const { error: originalError } = await supabase
              .from("orders")
              .update({ original_created_at: currentOrder.created_at })
              .eq("id", orderId);
            
            if (originalError) {
              console.error("❌ Error guardando original_created_at:", originalError);
            } else {
              console.log(`✅ original_created_at guardado exitosamente`);
            }
          }
          
          // Actualizar la fecha de la orden a la fecha del recibo (en UTC)
          const receiptDateUTC = new Date(Date.UTC(
            receiptDate.getFullYear(),
            receiptDate.getMonth(),
            receiptDate.getDate(),
            12, 0, 0, 0
          ));
          updateData.created_at = receiptDateUTC.toISOString();
          console.log(`🔄 ACTUALIZANDO orden ${currentOrder.order_number}: fecha cambia de ${originalOrderDate.toLocaleDateString('es-CL')} a ${receiptDate.toLocaleDateString('es-CL')}`);
          if (isDifferentWeek) {
            console.log(`📅 La orden se moverá a una nueva semana`);
          }
          console.log(`📊 Nueva fecha en ISO: ${receiptDateUTC.toISOString()}`);
        } else {
          console.log(`ℹ️ La fecha del recibo es igual a la fecha original, no se actualiza`);
        }
      }
    }

    console.log(`💾 Actualizando orden ${currentOrder.order_number} con datos:`, updateData);
    
    const { error, data: updatedData } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId)
      .select()
      .single();

    if (error) {
      alert(`Error: ${error.message}`);
      console.error("❌ Error actualizando orden:", error);
    } else {
      console.log(`✅ Orden ${currentOrder.order_number} actualizada exitosamente:`, updatedData);
      
      // Si se actualizó la fecha a una nueva semana, mostrar mensaje informativo
      if (updateData.created_at) {
        const orderDate = new Date(currentOrder.created_at);
        const newDate = new Date(updateData.created_at);
        console.log(`✅ Orden ${currentOrder.order_number} actualizada: fecha cambiada de ${orderDate.toLocaleDateString('es-CL')} a ${newDate.toLocaleDateString('es-CL')} (nueva semana)`);
        alert(`✅ Orden actualizada. La fecha se ajustó a la semana de la fecha del recibo (${newDate.toLocaleDateString('es-CL')}).`);
      } else {
        if (hasDuplicateReceipt) {
          alert(`✅ Orden actualizada. ⚠️ Advertencia: Este número de recibo está duplicado en otra(s) orden(es).`);
        } else {
          console.log(`✅ Recibo agregado/modificado a orden ${currentOrder.order_number}`);
        }
      }

      setEditingId(null);
      setEditReceipt("");
      setEditReceiptUrl("");
      setEditPaymentMethod("");
      setEditReceiptDate("");
      
      // Esperar un momento antes de refrescar para asegurar que la actualización se complete en la BD
      setTimeout(() => {
        refreshOrders(); // Recargar órdenes (esto actualizará los duplicados automáticamente)
        if (onUpdate) onUpdate(); // Notificar al componente padre
        // Disparar evento para notificar a otros componentes (WeeklySummary, AdminReports, etc.)
        window.dispatchEvent(new CustomEvent('orderUpdated'));
        console.log(`🔄 Evento 'orderUpdated' disparado para refrescar componentes`);
      }, 500);
    }
  }

  async function handleUpdateCosts(orderId: string) {
    // Obtener la orden actual para recalcular la comisión
    const currentOrder = orders.find((o) => o.id === orderId);
    if (!currentOrder) {
      alert("Error: No se encontró la orden");
      return;
    }

    // Validar que los montos sean números válidos
    if (isNaN(editReplacementCost) || editReplacementCost < 0) {
      alert("El costo del repuesto debe ser un número válido mayor o igual a 0");
      return;
    }
    if (isNaN(editRepairCost) || editRepairCost < 0) {
      alert("El costo de reparación debe ser un número válido mayor o igual a 0");
      return;
    }

    // Recalcular comisión con los nuevos montos
    const paymentMethodToUse = currentOrder.payment_method || "";
    const newCommission = calcCommission({
      paymentMethod: paymentMethodToUse as PaymentMethod,
      costoRepuesto: editReplacementCost,
      precioTotal: editRepairCost,
    });

    setUpdatingCostsId(orderId);

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          replacement_cost: editReplacementCost,
          repair_cost: editRepairCost,
          commission_amount: newCommission,
        })
        .eq("id", orderId);

      if (error) {
        alert(`Error: ${error.message}`);
      } else {
        setEditingCostsId(null);
        setEditReplacementCost(0);
        setEditRepairCost(0);
        refreshOrders(); // Recargar órdenes (esto actualizará los duplicados automáticamente)
        if (onUpdate) onUpdate(); // Notificar al componente padre para actualizar KPIs
        // Disparar evento para notificar a otros componentes (AdminReports, SupplierPurchases)
        window.dispatchEvent(new CustomEvent('orderUpdated'));
      }
    } catch (error) {
      console.error("Error updating order costs:", error);
      alert("Error al actualizar los montos. Intenta nuevamente.");
    } finally {
      setUpdatingCostsId(null);
    }
  }

  async function fetchNotes(orderId: string) {
    setNotesLoading((prev) => ({ ...prev, [orderId]: true }));
    const { data, error } = await supabase
      .from("order_notes")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading order notes:", error);
      setNotesError((prev) => ({ ...prev, [orderId]: "No se pudieron cargar las notas. Intenta nuevamente." }));
      setNotesByOrder((prev) => ({ ...prev, [orderId]: [] }));
    } else {
      setNotesError((prev) => ({ ...prev, [orderId]: null }));
      setNotesByOrder((prev) => ({ ...prev, [orderId]: (data as OrderNote[]) ?? [] }));
    }
    setNotesLoading((prev) => ({ ...prev, [orderId]: false }));
  }

  async function toggleNotes(orderId: string) {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      setNoteFormVisible((prev) => ({ ...prev, [orderId]: false }));
      return;
    }
    setExpandedOrderId(orderId);
    if (!notesByOrder[orderId]) {
      await fetchNotes(orderId);
    }
  }

  async function handleAddNote(orderId: string) {
    const content = (noteDrafts[orderId] || "").trim();

    if (!content) {
      alert("Escribe una nota antes de guardar.");
      return;
    }

    setSavingNotes((prev) => ({ ...prev, [orderId]: true }));
    const { data, error } = await supabase
      .from("order_notes")
      .insert({
        order_id: orderId,
        technician_id: technicianId || null,
        note: content,
      })
      .select()
      .maybeSingle();
    setSavingNotes((prev) => ({ ...prev, [orderId]: false }));

    if (error) {
      console.error("Error saving order note:", error);
      alert("No pudimos guardar la nota. Intenta nuevamente.");
      return;
    }

    if (data) {
      setNotesByOrder((prev) => ({
        ...prev,
        [orderId]: [data as OrderNote, ...(prev[orderId] || [])],
      }));
      setNoteDrafts((prev) => ({ ...prev, [orderId]: "" }));
      setNoteFormVisible((prev) => ({ ...prev, [orderId]: false }));
    } else {
      await fetchNotes(orderId);
    }
  }

  function openNoteForm(orderId: string) {
    setNoteFormVisible((prev) => ({ ...prev, [orderId]: true }));
  }

  function cancelNoteForm(orderId: string) {
    setNoteDrafts((prev) => ({ ...prev, [orderId]: "" }));
    setNoteFormVisible((prev) => ({ ...prev, [orderId]: false }));
  }

  async function handleDeleteOrder(orderId: string) {
    if (!confirm("¿Estás seguro de que deseas eliminar esta orden definitivamente? Esta acción no se puede deshacer y la orden será borrada permanentemente de la base de datos.")) {
      return;
    }

    setDeletingOrderId(orderId);

    try {
      // Primero eliminar las notas relacionadas
      await supabase
        .from("order_notes")
        .delete()
        .eq("order_id", orderId);

      // Luego eliminar la orden definitivamente
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId);

      if (error) {
        alert(`Error al eliminar la orden: ${error.message}`);
      } else {
        refreshOrders(); // Recargar órdenes
        if (onUpdate) onUpdate(); // Notificar al componente padre
        // Disparar evento para notificar a otros componentes (AdminReports, SupplierPurchases)
        window.dispatchEvent(new CustomEvent('orderDeleted'));
      }
    } catch (error) {
      console.error("Error deleting order:", error);
      alert("Error al eliminar la orden. Intenta nuevamente.");
    } finally {
      setDeletingOrderId(null);
    }
  }

  async function handleUpdateStatus(orderId: string, newStatus: "returned" | "cancelled") {
    const statusText = newStatus === "returned" ? "devuelta" : "cancelada";
    if (!confirm(`¿Estás seguro de que deseas marcar esta orden como ${statusText}? Esta orden dejará de sumar a las ganancias.`)) {
      return;
    }

    setUpdatingStatusId(orderId);

    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);

      if (error) {
        alert(`Error al actualizar el estado: ${error.message}`);
      } else {
        refreshOrders(); // Recargar órdenes
        if (onUpdate) onUpdate(); // Notificar al componente padre
        // Disparar evento para notificar a otros componentes (AdminReports, SupplierPurchases)
        window.dispatchEvent(new CustomEvent('orderUpdated'));
      }
    } catch (error) {
      console.error("Error updating order status:", error);
      alert("Error al actualizar el estado. Intenta nuevamente.");
    } finally {
      setUpdatingStatusId(null);
    }
  }

  function handlePeriodFilterChange(value: "all" | "current_week" | "range") {
    setPeriodFilter(value);
    if (value !== "range") {
      setCustomRange({ start: "", end: "" });
    }
  }

  const orderFiltersToolbar = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 w-full">
      <input
        type="text"
        className="flex-1 min-w-0 sm:min-w-[180px] border border-slate-300 rounded-md px-3 py-2 text-sm"
        placeholder="Buscar por N° de orden..."
        value={orderSearch}
        onChange={(e) => setOrderSearch(e.target.value)}
      />
      <select
        className="w-full sm:w-auto sm:min-w-[160px] border border-slate-300 rounded-md px-3 py-2 text-sm"
        value={periodFilter}
        onChange={(e) => handlePeriodFilterChange(e.target.value as "all" | "current_week" | "range")}
      >
        <option value="all">Todas las semanas</option>
        <option value="current_week">Semana actual (S-V)</option>
        <option value="range">Rango personalizado</option>
      </select>
      <select
        className="w-full sm:w-auto sm:min-w-[140px] border border-slate-300 rounded-md px-3 py-2 text-sm"
        value={filter}
        onChange={(e) => setFilter(e.target.value as any)}
      >
        <option value="all">Todos los estados</option>
        <option value="paid">Con recibo (Pagadas)</option>
        <option value="pending">Pendientes</option>
        <option value="returned">Devueltas</option>
        <option value="cancelled">Canceladas</option>
      </select>
      {periodFilter === "range" && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
          <label className="flex flex-col text-xs text-slate-500 sm:text-[11px]">
            Desde
            <input
              type="date"
              className="border border-slate-300 rounded-md px-2 py-1 text-sm text-slate-700"
              value={customRange.start}
              onChange={(e) => setCustomRange((prev) => ({ ...prev, start: e.target.value }))}
            />
          </label>
          <label className="flex flex-col text-xs text-slate-500 sm:text-[11px]">
            Hasta
            <input
              type="date"
              className="border border-slate-300 rounded-md px-2 py-1 text-sm text-slate-700"
              value={customRange.end}
              min={customRange.start || undefined}
              onChange={(e) => setCustomRange((prev) => ({ ...prev, end: e.target.value }))}
            />
          </label>
          <button
            type="button"
            className="text-xs text-slate-500 underline underline-offset-2 mt-2 sm:mt-5"
            onClick={() => setCustomRange({ start: "", end: "" })}
          >
            Limpiar rango
          </button>
        </div>
      )}
    </div>
  );

  const adminSearchToolbar = isAdmin ? (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Buscar por local
          </label>
          <select
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            value={selectedLocal}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedLocal(value);
              setAdminError(null);
              if (value) {
                setSelectedAdminTechnician("");
              }
            }}
            disabled={loadingTechnicians || loading}
          >
            <option value="">{loadingTechnicians ? "Cargando locales..." : "Selecciona un local"}</option>
            {localOptions.map((local) => (
              <option key={local} value={local}>
                {local}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Buscar por técnico
          </label>
          <select
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            value={selectedAdminTechnician}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedAdminTechnician(value);
              setAdminError(null);
              if (value) {
                setSelectedLocal("");
              }
            }}
            disabled={loadingTechnicians || loading}
          >
            <option value="">{loadingTechnicians ? "Cargando técnicos..." : "Selecciona un técnico"}</option>
            {technicianOptions.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.name} {tech.local ? `• ${tech.local}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs text-slate-500">
          Selecciona un local o técnico para listar solo las órdenes asociadas.
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleAdminSearch()}
          disabled={
            loading ||
            (!selectedLocal && !selectedAdminTechnician) ||
            loadingTechnicians
          }
          className="px-4 py-2 text-xs font-semibold rounded-md text-white bg-brand-light hover:bg-white hover:text-brand border border-brand-light hover:border-white transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Buscar
        </button>
        <button
          type="button"
          onClick={handleAdminReset}
          disabled={loading}
          className="px-4 py-2 text-xs border border-slate-300 rounded-md hover:bg-slate-100 transition disabled:opacity-50"
        >
          Limpiar
        </button>
      </div>
      {adminError && <p className="text-xs text-red-600">{adminError}</p>}
    </div>
  ) : null;

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center text-slate-500">Cargando órdenes...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
      <div className="mb-4 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Órdenes de Reparación</h3>
          <p className="text-xs text-slate-500">
            {isAdmin
              ? "Busca órdenes específicas por local o técnico antes de filtrarlas."
              : "Consulta y gestiona todas tus órdenes de la semana."}
          </p>
        </div>
        {isAdmin ? (
          <>
            {adminSearchToolbar}
            {hasAdminSearched && orderFiltersToolbar}
          </>
        ) : (
          orderFiltersToolbar
        )}
      </div>
      
      {isAdmin && !hasAdminSearched ? (
        <div className="text-center text-slate-500 py-8">
          Usa el buscador para ver las órdenes por local o técnico.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-500 py-8">
          {isAdmin ? "No se encontraron órdenes con los filtros seleccionados." : "No hay órdenes registradas"}
        </div>
      ) : (
        <>
          {(() => {
            const visibleDuplicates = filtered.filter(o => duplicates[o.id]);
            return visibleDuplicates.length > 0 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-xs text-amber-800 font-semibold mb-1">
                  ⚠️ Advertencia: Se detectaron órdenes con datos duplicados
                </p>
                <p className="text-xs text-amber-700">
                  Hay {visibleDuplicates.length} orden(es) visible(s) con números de recibo repetidos. 
                  Las órdenes afectadas muestran una advertencia discreta.
                </p>
              </div>
            );
          })()}
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-visible">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Fecha</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">N° Orden</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-left">Equipo</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-left">Servicio</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Pago</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">Repuesto</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Proveedor</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-right whitespace-nowrap">Costo Rep.</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Estado</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Recibo</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Comisión</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Notas</th>
                    {(technicianId || isAdmin) && <th className="py-2 px-2 text-xs font-semibold text-slate-700 text-left whitespace-nowrap">Acciones</th>}
                  </tr>
                </thead>
            <tbody>
              {filtered.map((o) => (
                <Fragment key={o.id}>
                  <tr className={`border-b ${expandedOrderId === o.id ? "border-transparent" : "border-slate-100"} ${
                    o.status === "returned" || o.status === "cancelled" 
                      ? "bg-red-50/30 hover:bg-red-50/50" 
                      : duplicates[o.id] 
                      ? "bg-amber-50/50 hover:bg-amber-50/70 border-l-4 border-l-amber-500"
                      : "hover:bg-slate-50"
                  }`}>
                    <td className="py-2 px-2 whitespace-nowrap text-xs">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span>{formatDate(o.created_at)}</span>
                          {o.original_created_at && new Date(o.original_created_at).getTime() !== new Date(o.created_at).getTime() && (
                            <span 
                              className="text-[10px] text-amber-600 cursor-help" 
                              title={`⚠️ Fecha modificada\nOriginal: ${new Date(o.original_created_at).toLocaleDateString('es-CL')}\nNueva: ${new Date(o.created_at).toLocaleDateString('es-CL')}`}
                            >
                              ⚠️
                            </span>
                          )}
                        </div>
                        {o.original_created_at && new Date(o.original_created_at).getTime() !== new Date(o.created_at).getTime() && (
                          <span className="text-[9px] text-amber-600 italic block">
                            <span className="font-medium">Original:</span> {new Date(o.original_created_at).toLocaleDateString('es-CL')} → 
                            <span className="font-medium"> Cambiada a:</span> {new Date(o.created_at).toLocaleDateString('es-CL')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap text-xs font-medium">
                      <div className="flex items-center gap-1">
                        <span>{o.order_number || "-"}</span>
                        {duplicates[o.id]?.hasDuplicateOrderNumber && (
                          <span 
                            className="text-amber-600 cursor-help font-bold" 
                            title="⚠️ Este número de orden está duplicado"
                          >
                            ⚠️
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-xs max-w-[120px] truncate" title={o.device}>{o.device}</td>
                    <td className="py-2 px-2 text-xs text-slate-600 max-w-[150px]">
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate" title={o.service_description}>{o.service_description}</span>
                        {o.receipt_number && (
                          <span className="text-[10px] text-slate-500">
                            Recibo: {(() => {
                              const receiptLink = o.receipt_url;
                              
                              return receiptLink ? (
                                <a
                                  href={receiptLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-0.5"
                                  title="Abrir recibo"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {o.receipt_number}
                                  <svg className="w-2.5 h-2.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              ) : (
                                <span className="text-slate-600">{o.receipt_number}</span>
                              );
                            })()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap text-xs">{o.payment_method || "-"}</td>
                    <td className="py-2 px-2 whitespace-nowrap text-right text-xs">
                      {editingCostsId === o.id ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-20 border border-slate-300 rounded px-1 py-0.5 text-xs"
                          value={editReplacementCost}
                          onChange={(e) => setEditReplacementCost(parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          autoFocus
                        />
                      ) : (
                        <span className="text-slate-700">{formatCLP(o.replacement_cost || 0)}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap text-xs">
                      {(o as any).suppliers?.name || "-"}
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap text-right text-xs">
                      {editingCostsId === o.id ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-20 border border-slate-300 rounded px-1 py-0.5 text-xs"
                          value={editRepairCost}
                          onChange={(e) => setEditRepairCost(parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                      ) : (
                        <span className="text-slate-700">{formatCLP(o.repair_cost || 0)}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                          o.status === "pending"
                            ? "bg-amber-100 text-amber-700"
                            : o.status === "paid"
                            ? "bg-emerald-100 text-emerald-700"
                            : o.status === "returned"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {o.status === "pending" 
                          ? "Pend." 
                          : o.status === "paid"
                          ? "Pagado"
                          : o.status === "returned"
                          ? "Dev."
                          : "Canc."}
                      </span>
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap text-xs">
                    {editingId === o.id ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          className="w-24 border border-slate-300 rounded px-1.5 py-0.5 text-xs"
                          value={editReceipt}
                          onChange={(e) => setEditReceipt(e.target.value)}
                          placeholder="N° Boleta (opcional)"
                          autoFocus
                        />
                        <input
                          type="url"
                          className="w-full border border-slate-300 rounded px-1.5 py-0.5 text-xs"
                          value={editReceiptUrl}
                          onChange={(e) => setEditReceiptUrl(e.target.value)}
                          placeholder="Link del recibo (opcional)"
                        />
                        <select
                          className="w-24 border border-slate-300 rounded px-1.5 py-0.5 text-xs"
                          value={editPaymentMethod || o.payment_method || ""}
                          onChange={(e) => setEditPaymentMethod(e.target.value as PaymentMethod)}
                        >
                          <option value="">Sin método</option>
                          <option value="EFECTIVO">Efectivo</option>
                          <option value="TARJETA">Tarjeta</option>
                          <option value="TRANSFERENCIA">Transferencia</option>
                        </select>
                        <input
                          type="date"
                          className="w-24 border border-slate-300 rounded px-1.5 py-0.5 text-xs"
                          value={editReceiptDate}
                          onChange={(e) => setEditReceiptDate(e.target.value)}
                          placeholder="Fecha de recibo"
                          title="Selecciona la fecha del recibo (puede ser futura)"
                        />
                        <p className="text-[10px] text-slate-500">
                          Selecciona la fecha del recibo. Si cae en otra semana, la orden se moverá a esa semana.
                        </p>
                      </div>
                    ) : o.receipt_number ? (
                      <div className="flex items-center gap-1">
                        {o.receipt_url ? (
                          <a
                            href={o.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium flex items-center gap-1"
                            title="Abrir recibo (se abre en nueva pestaña)"
                          >
                            {o.receipt_number}
                            <svg className="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        ) : (
                          <span className="text-slate-700 text-xs">{o.receipt_number}</span>
                        )}
                        {duplicates[o.id]?.hasDuplicateReceipt && (
                          <span 
                            className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-medium rounded border border-amber-200"
                            title="⚠️ Este número de recibo está duplicado en otra orden"
                          >
                            ⚠️ Duplicado
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="py-2 px-2 font-semibold text-brand whitespace-nowrap text-xs">
                    {formatCLP(o.commission_amount || 0)}
                  </td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void toggleNotes(o.id)}
                        className="px-2 py-0.5 border border-slate-300 text-xs rounded hover:bg-slate-100 transition"
                      >
                        {expandedOrderId === o.id ? "Ocultar" : "Notas"}
                      </button>
                    </td>
                    {(technicianId || isAdmin) && (
                      <td className="py-2 px-2">
                        <div className="flex flex-col gap-1">
                          {editingCostsId === o.id ? (
                            <>
                              <button
                                onClick={() => handleUpdateCosts(o.id)}
                                disabled={updatingCostsId === o.id}
                                className="px-2 py-0.5 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {updatingCostsId === o.id ? "Guardando..." : "Guardar"}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingCostsId(null);
                                  setEditReplacementCost(0);
                                  setEditRepairCost(0);
                                }}
                                disabled={updatingCostsId === o.id}
                                className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs rounded hover:bg-slate-300 transition disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : editingId === o.id ? (
                            <>
                              <button
                                onClick={() => handleUpdateReceipt(o.id)}
                                className="px-2 py-0.5 bg-brand-light text-brand-white text-xs rounded hover:bg-white hover:text-brand border border-brand-light hover:border-white transition font-medium"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={() => {
                                  setEditingId(null);
                                  setEditReceipt("");
                                  setEditReceiptUrl("");
                                  setEditPaymentMethod("");
                                  setEditReceiptDate("");
                                }}
                                className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs rounded hover:bg-slate-300 transition"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              {isAdmin && (o.status === "pending" || o.status === "paid") && (
                                <button
                                  onClick={() => {
                                    setEditingCostsId(o.id);
                                    setEditReplacementCost(o.replacement_cost || 0);
                                    setEditRepairCost(o.repair_cost || 0);
                                  }}
                                  className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition font-medium"
                                  title="Editar montos de repuesto y reparación"
                                >
                                  Editar Montos
                                </button>
                              )}
                              {(technicianId || isAdmin) && (o.status === "pending" || (isAdmin && o.status === "paid")) && (
                                <button
                                  onClick={() => {
                                    setEditingId(o.id);
                                    setEditReceipt(o.receipt_number || "");
                                    setEditReceiptUrl(o.receipt_url || "");
                                    setEditPaymentMethod((o.payment_method as PaymentMethod) || "");
                                    // Inicializar con la fecha de hoy o la fecha original de la orden
                                    const today = new Date().toISOString().split('T')[0];
                                    setEditReceiptDate(today);
                                  }}
                                  className="px-2 py-0.5 bg-brand-light text-brand-white text-xs rounded hover:bg-white hover:text-brand border border-brand-light hover:border-white transition font-medium"
                                >
                                  Recibo
                                </button>
                              )}
                              {(technicianId || isAdmin) && (o.status === "pending" || o.status === "paid") && (
                                <button
                                  onClick={() => handleUpdateStatus(o.id, "returned")}
                                  disabled={updatingStatusId === o.id}
                                  className="px-1 py-0.5 text-red-600 text-xs hover:text-red-700 hover:underline transition disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Marcar como devuelto"
                                >
                                  {updatingStatusId === o.id ? "..." : "Devolver"}
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteOrder(o.id)}
                                  disabled={deletingOrderId === o.id}
                                  className="px-2 py-0.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {deletingOrderId === o.id ? "..." : "Eliminar"}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                </tr>
                  {expandedOrderId === o.id && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={(technicianId || isAdmin) ? 11 : 10} className="px-4 py-4">
                        <div className="space-y-4">
                          {(isAdmin || technicianId) && o.original_created_at && new Date(o.original_created_at).getTime() !== new Date(o.created_at).getTime() && (
                            <div className="pb-2 border-b border-amber-200 bg-amber-50 rounded px-3 py-2">
                              <p className="text-[10px] text-amber-700 font-semibold mb-1">
                                ⚠️ Fecha modificada
                              </p>
                              <div className="space-y-0.5 text-[10px] text-amber-700">
                                <p>
                                  <span className="font-medium">Registrada originalmente:</span> {new Date(o.original_created_at).toLocaleString("es-CL", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </p>
                                <p>
                                  <span className="font-medium">Cambiada a:</span> {new Date(o.created_at).toLocaleString("es-CL", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </p>
                              </div>
                              <p className="text-[9px] text-amber-600 mt-1 italic">
                                La fecha fue actualizada al agregar el recibo de pago.
                              </p>
                            </div>
                          )}
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-800">Notas de la orden</h4>
                              <p className="text-xs text-slate-500">
                                Estas notas quedan visibles solo dentro de este panel.
                              </p>
                            </div>
                          </div>

                          {notesLoading[o.id] ? (
                            <div className="text-sm text-slate-500">Cargando notas...</div>
                          ) : (notesByOrder[o.id]?.length ?? 0) > 0 ? (
                            <ul className="space-y-2">
                              {notesByOrder[o.id]!.map((note) => (
                                <li
                                  key={note.id}
                                  className="border border-slate-200 bg-white rounded-md px-3 py-2"
                                >
                                  <div className="text-xs text-slate-500 mb-1">
                                    {new Date(note.created_at).toLocaleString("es-CL", {
                                      dateStyle: "short",
                                      timeStyle: "short",
                                    })}
                                  </div>
                                  <p className="text-sm text-slate-700 whitespace-pre-line">{note.note}</p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-sm text-slate-500">
                              {notesError[o.id]
                                ? "No se encontraron notas. Usa “Agregar nota” para dejar la primera."
                                : "Aún no hay notas. Usa “Agregar nota” para dejar la primera observación."}
                            </div>
                          )}

                          {noteFormVisible[o.id] ? (
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-slate-600">
                                Nueva nota
                              </label>
                              <textarea
                                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-y min-h-[80px]"
                                placeholder="Escribe una observación..."
                                value={noteDrafts[o.id] || ""}
                                onChange={(e) =>
                                  setNoteDrafts((prev) => ({ ...prev, [o.id]: e.target.value }))
                                }
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => cancelNoteForm(o.id)}
                                  className="px-4 py-2 border border-slate-300 text-xs rounded-md hover:bg-slate-100 transition"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleAddNote(o.id)}
                                  disabled={savingNotes[o.id]}
                                  className="px-4 py-2 bg-brand-light text-brand-white text-xs rounded-md hover:bg-white hover:text-brand border border-brand-light hover:border-white transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                >
                                  {savingNotes[o.id] ? "Guardando..." : "Guardar nota"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => openNoteForm(o.id)}
                                className="px-4 py-2 border border-dashed border-brand text-brand text-xs rounded-md hover:bg-brand/5 transition"
                              >
                                Agregar nota
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

