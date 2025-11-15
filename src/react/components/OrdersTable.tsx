import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDate, currentWeekRange } from "@/lib/date";
import { formatCLP } from "@/lib/currency";
import type { Order, OrderNote, Profile } from "@/types";
import { validateBsaleDocument, checkReceiptNumberExists } from "@/lib/bsale";
import { calcCommission } from "@/lib/commission";
import type { PaymentMethod } from "@/lib/commission";

interface OrdersTableProps {
  technicianId?: string;
  refreshKey?: number;
  onUpdate?: () => void;
  isAdmin?: boolean;
}

type LoadFilters = {
  technicianId?: string;
  technicianIds?: string[];
};

export default function OrdersTable({ technicianId, refreshKey = 0, onUpdate, isAdmin = false }: OrdersTableProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"all" | "paid" | "pending" | "returned" | "cancelled">("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | "current_week" | "range">("all");
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [orderSearch, setOrderSearch] = useState("");
  const [loading, setLoading] = useState(!isAdmin);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCostsId, setEditingCostsId] = useState<string | null>(null);
  const [editReceipt, setEditReceipt] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>("");
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
      .select("*")
      .order("created_at", { ascending: false });

    if (filters?.technicianId) {
      q = q.eq("technician_id", filters.technicianId);
    } else if (filters?.technicianIds) {
      if (filters.technicianIds.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }
      q = q.in("technician_id", filters.technicianIds);
    } else if (technicianId) {
      q = q.eq("technician_id", technicianId);
    }

    const { data, error } = await q;

    if (error) {
      console.error("Error loading orders:", error);
      setOrders([]);
    } else {
      setOrders((data as Order[]) ?? []);
    }
    setLoading(false);
  }, [technicianId, isAdmin]);

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
    await load(filters);
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
    if (!editReceipt.trim()) {
      alert("Por favor ingresa un número de recibo");
      return;
    }

    // Obtener la orden actual para recalcular la comisión
    const currentOrder = orders.find((o) => o.id === orderId);
    if (!currentOrder) {
      alert("Error: No se encontró la orden");
      return;
    }

    // Validar número de boleta con Bsale (OPCIONAL - no bloquea si falla)
    let bsaleData: { number?: string; url?: string; totalAmount?: number } | null = null;
    
    // Intentar validar con Bsale, pero no bloquear si falla
    try {
      const bsaleValidation = await validateBsaleDocument(editReceipt.trim());
      
      // Solo usar datos de Bsale si la validación fue exitosa
      if (bsaleValidation.exists && bsaleValidation.document) {
        bsaleData = bsaleValidation.document;
      } else {
        // Si no existe o hay error, solo registrar en consola pero continuar
        if (bsaleValidation.error) {
          console.warn("Bsale validation skipped:", bsaleValidation.error);
        }
      }
    } catch (error) {
      // Si hay cualquier error, continuar sin validación
      console.warn("Bsale validation error, continuing without validation:", error);
    }

    // Verificar duplicados en la base de datos (excluyendo la orden actual)
    const isDuplicate = await checkReceiptNumberExists(editReceipt.trim(), orderId);
    if (isDuplicate) {
      alert("⚠️ Este número de boleta ya está registrado en otra orden");
      return;
    }

    // Recalcular comisión si hay método de pago
    const paymentMethodToUse = editPaymentMethod || currentOrder.payment_method || "";
    const newCommission = calcCommission({
      paymentMethod: paymentMethodToUse as PaymentMethod,
      costoRepuesto: currentOrder.replacement_cost || 0,
      precioTotal: currentOrder.repair_cost || 0,
    });

    const { error } = await supabase
      .from("orders")
      .update({
        receipt_number: editReceipt.trim(),
        payment_method: paymentMethodToUse || null,
        status: "paid",
        bsale_number: bsaleData?.number || null,
        bsale_url: bsaleData?.url || null,
        bsale_total_amount: bsaleData?.totalAmount || null,
        commission_amount: newCommission,
      })
      .eq("id", orderId);

    if (error) {
      alert(`Error: ${error.message}`);
    } else {
      setEditingId(null);
      setEditReceipt("");
      setEditPaymentMethod("");
      refreshOrders(); // Recargar órdenes
      if (onUpdate) onUpdate(); // Notificar al componente padre
      // Disparar evento para notificar a otros componentes (AdminReports, SupplierPurchases)
      window.dispatchEvent(new CustomEvent('orderUpdated'));
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
        refreshOrders(); // Recargar órdenes
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
                      : "hover:bg-slate-50"
                  }`}>
                    <td className="py-2 px-2 whitespace-nowrap text-xs">{formatDate(o.created_at)}</td>
                    <td className="py-2 px-2 whitespace-nowrap text-xs font-medium">{o.order_number || "-"}</td>
                    <td className="py-2 px-2 text-xs max-w-[120px] truncate" title={o.device}>{o.device}</td>
                    <td className="py-2 px-2 text-xs text-slate-600 max-w-[150px] truncate" title={o.service_description}>{o.service_description}</td>
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
                          placeholder="N° Recibo"
                          autoFocus
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
                      </div>
                    ) : o.receipt_number ? (
                      <span className="text-slate-700 text-xs">{o.receipt_number}</span>
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
                                  setEditPaymentMethod("");
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
                              {technicianId && o.status === "pending" && (
                                <button
                                  onClick={() => {
                                    setEditingId(o.id);
                                    setEditReceipt(o.receipt_number || "");
                                    setEditPaymentMethod((o.payment_method as PaymentMethod) || "");
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
                      <td colSpan={(technicianId || isAdmin) ? 10 : 9} className="px-4 py-4">
                        <div className="space-y-4">
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
      )}
    </div>
  );
}

