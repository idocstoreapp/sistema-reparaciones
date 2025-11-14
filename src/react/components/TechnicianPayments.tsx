import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { currentWeekRange, formatDate } from "@/lib/date";
import type { Profile, SalaryAdjustment, Order, SalarySettlement } from "@/types";
import SalarySettlementPanel from "./SalarySettlementPanel";

interface TechnicianPaymentsProps {
  refreshKey?: number;
}

export default function TechnicianPayments({ refreshKey = 0 }: TechnicianPaymentsProps) {
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [technicianOptions, setTechnicianOptions] = useState<Profile[]>([]);
  const [selectedTech, setSelectedTech] = useState<string | null>(null);
  const [adjustmentsByTech, setAdjustmentsByTech] = useState<Record<string, SalaryAdjustment[]>>({});
  const [returnsByTech, setReturnsByTech] = useState<Record<string, Order[]>>({});
  const [weeklyTotals, setWeeklyTotals] = useState<Record<string, number>>({});
  const [weeklyAdjustmentTotals, setWeeklyAdjustmentTotals] = useState<Record<string, number>>({});
  const [weeklyReturnsTotals, setWeeklyReturnsTotals] = useState<Record<string, number>>({});
  const [weeklySettlementTotals, setWeeklySettlementTotals] = useState<Record<string, number>>({});
  const [openSettlementPanels, setOpenSettlementPanels] = useState<Record<string, boolean>>({});
  const [deletingAdjustmentId, setDeletingAdjustmentId] = useState<string | null>(null);
  const [loadingDetailsByTech, setLoadingDetailsByTech] = useState<Record<string, boolean>>({});
  const [settlingAdjustmentsByTech, setSettlingAdjustmentsByTech] = useState<Record<string, boolean>>({});
  const [settlingReturnsByTech, setSettlingReturnsByTech] = useState<Record<string, boolean>>({});
  const [actionErrorsByTech, setActionErrorsByTech] = useState<Record<string, string | null>>({});
  const [deletingReturnId, setDeletingReturnId] = useState<string | null>(null);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyResults, setHistoryResults] = useState<SalarySettlement[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyFilters, setHistoryFilters] = useState<{
    technicianId: string;
    paymentMethod: "all" | "efectivo" | "transferencia" | "otro";
    startDate: string;
    endDate: string;
  }>({
    technicianId: "all",
    paymentMethod: "all",
    startDate: "",
    endDate: "",
  });
  const [historyAggregates, setHistoryAggregates] = useState<{
    efectivo: number;
    transferencia: number;
    otro: number;
  }>({
    efectivo: 0,
    transferencia: 0,
    otro: 0,
  });
  const technicianNameMap = useMemo(
    () =>
      technicians.reduce<Record<string, string>>((acc, tech) => {
        acc[tech.id] = tech.name;
        return acc;
      }, {}),
    [technicians]
  );

  const loadTechnicians = useCallback(async () => {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("role", "technician")
      .order("name");
    if (data) {
      setTechnicians(data);
      setTechnicianOptions(data);
      // Limpiar la selección si el técnico seleccionado ya no existe
    const { start, end } = currentWeekRange();
    setHistoryFilters((prev) => ({
      ...prev,
      startDate: prev.startDate || start.toISOString().slice(0, 10),
      endDate: prev.endDate || end.toISOString().slice(0, 10),
    }));
      setSelectedTech((currentSelected) => {
        if (currentSelected && !data.find((tech) => tech.id === currentSelected)) {
          return null;
        }
        return currentSelected;
      });
    }
  }, []);

  useEffect(() => {
    loadTechnicians();
  }, [refreshKey, loadTechnicians]);

  // Escuchar eventos de actualización de usuarios
  useEffect(() => {
    window.addEventListener('userCreated', loadTechnicians);
    window.addEventListener('userDeleted', loadTechnicians);
    window.addEventListener('userUpdated', loadTechnicians);

    return () => {
      window.removeEventListener('userCreated', loadTechnicians);
      window.removeEventListener('userDeleted', loadTechnicians);
      window.removeEventListener('userUpdated', loadTechnicians);
    };
  }, [loadTechnicians]);

  const loadWeeklyData = useCallback(async () => {
    if (technicians.length === 0) return;
      const { start, end } = currentWeekRange();
    const weekStartISO = start.toISOString().slice(0, 10);
      const totals: Record<string, number> = {};
      const adjustmentTotals: Record<string, number> = {};
      const returnsTotals: Record<string, number> = {};
    const settlementTotals: Record<string, number> = {};

      await Promise.all(
        technicians.map(async (tech) => {
        const [
          { data: orders },
          { data: adjustmentsData },
          { data: returnedData },
          { data: settlementsData },
        ] = await Promise.all([
            supabase
          .from("orders")
          .select("commission_amount")
          .eq("technician_id", tech.id)
          .eq("status", "paid") // Solo órdenes pagadas, excluyendo devueltas y canceladas
          .gte("created_at", start.toISOString())
              .lte("created_at", end.toISOString()),
            supabase
              .from("salary_adjustments")
            .select("amount, available_from, created_at")
              .eq("technician_id", tech.id)
              .gte("created_at", start.toISOString())
              .lte("created_at", end.toISOString()),
            supabase
              .from("orders")
              .select("commission_amount")
              .eq("technician_id", tech.id)
              .in("status", ["returned", "cancelled"])
              .gte("created_at", start.toISOString())
              .lte("created_at", end.toISOString()),
          supabase
            .from("salary_settlements")
            .select("amount")
            .eq("technician_id", tech.id)
            .eq("week_start", weekStartISO),
        ]);

        totals[tech.id] = orders?.reduce((s, o) => s + (o.commission_amount ?? 0), 0) ?? 0;
        const adjustmentsForWeek =
          adjustmentsData
            ?.filter((adj) => {
              const availableFrom = adj.available_from
                ? new Date(adj.available_from)
                : new Date(adj.created_at);
              return availableFrom <= end;
            })
            .reduce((sum, adj) => sum + (adj.amount ?? 0), 0) ?? 0;

        adjustmentTotals[tech.id] = adjustmentsForWeek;
          returnsTotals[tech.id] =
            returnedData?.reduce((s, o) => s + (o.commission_amount ?? 0), 0) ?? 0;
        settlementTotals[tech.id] =
          settlementsData?.reduce((s, row) => s + (row.amount ?? 0), 0) ?? 0;
        })
      );

      setWeeklyTotals(totals);
      setWeeklyAdjustmentTotals(adjustmentTotals);
      setWeeklyReturnsTotals(returnsTotals);
    setWeeklySettlementTotals(settlementTotals);
  }, [technicians]);

  useEffect(() => {
    if (technicians.length > 0) {
      void loadWeeklyData();
    }
  }, [technicians, loadWeeklyData]);

  const loadAdjustmentsForTech = useCallback(
    async (techId: string | null, force = false) => {
      if (!techId) return;
      if (!force && adjustmentsByTech[techId] && returnsByTech[techId]) {
        return;
      }

      setActionErrorsByTech((prev) => ({ ...prev, [techId]: null }));
      setLoadingDetailsByTech((prev) => ({ ...prev, [techId]: true }));
      const { start, end } = currentWeekRange();

      try {
        const [{ data: adjustmentsData, error: adjError }, { data: returnedData, error: retError }] =
          await Promise.all([
        supabase
          .from("salary_adjustments")
          .select("*")
              .eq("technician_id", techId)
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("*")
              .eq("technician_id", techId)
          .in("status", ["returned", "cancelled"])
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())
          .order("created_at", { ascending: false }),
      ]);

        if (adjError || retError) {
          throw adjError || retError;
        }

        setAdjustmentsByTech((prev) => ({
          ...prev,
          [techId]: (adjustmentsData as SalaryAdjustment[]) ?? [],
        }));
        setReturnsByTech((prev) => ({
          ...prev,
          [techId]: (returnedData as Order[]) ?? [],
        }));
      } catch (error) {
        console.error("Error cargando ajustes/devoluciones:", error);
        setActionErrorsByTech((prev) => ({
          ...prev,
          [techId]: "No pudimos cargar los ajustes. Intenta nuevamente.",
        }));
      } finally {
        setLoadingDetailsByTech((prev) => ({ ...prev, [techId]: false }));
      }
    },
    [adjustmentsByTech, returnsByTech]
  );

  const toggleSettlementPanel = useCallback(
    (techId: string) => {
      setOpenSettlementPanels((prev) => {
        const nextOpen = !prev[techId];
        if (nextOpen) {
          void loadAdjustmentsForTech(techId);
        }
        return {
          ...prev,
          [techId]: nextOpen,
        };
      });
    },
    [loadAdjustmentsForTech]
  );

  const fetchHistoryWithFilters = useCallback(
    async (filters: typeof historyFilters) => {
      setHistoryLoading(true);
      setHistoryError(null);
      let query = supabase.from("salary_settlements").select("*").order("created_at", {
        ascending: false,
      });
      if (filters.technicianId !== "all") {
        query = query.eq("technician_id", filters.technicianId);
      }
      if (filters.paymentMethod !== "all") {
        query = query.eq("payment_method", filters.paymentMethod);
      }
      if (filters.startDate) {
        query = query.gte("created_at", `${filters.startDate}T00:00:00.000Z`);
      }
      if (filters.endDate) {
        query = query.lte("created_at", `${filters.endDate}T23:59:59.999Z`);
      }

      const { data, error } = await query.limit(100);

      if (error) {
        console.error("Error cargando historial de liquidaciones:", error);
        setHistoryResults([]);
        setHistoryAggregates({ efectivo: 0, transferencia: 0, otro: 0 });
        setHistoryError("No pudimos cargar el historial. Intenta nuevamente.");
      } else {
        const list = (data as SalarySettlement[]) ?? [];
        setHistoryResults(list);
        const aggregates = list.reduce(
          (acc, entry) => {
            if (entry.payment_method === "transferencia") {
              acc.transferencia += entry.amount ?? 0;
            } else if (entry.payment_method === "efectivo") {
              acc.efectivo += entry.amount ?? 0;
            } else {
              acc.otro += entry.amount ?? 0;
            }
            return acc;
          },
          { efectivo: 0, transferencia: 0, otro: 0 }
        );
        setHistoryAggregates(aggregates);
      }
      setHistoryLoading(false);
    },
    []
  );

  const handleManualHistorySearch = useCallback(() => {
    setHistoryPanelOpen(true);
    void fetchHistoryWithFilters(historyFilters);
  }, [historyFilters, fetchHistoryWithFilters]);

  const handleResetHistoryFilters = useCallback(() => {
    const { start, end } = currentWeekRange();
    const next = {
      technicianId: "all",
      paymentMethod: "all" as const,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
    setHistoryFilters(next);
    setHistoryPanelOpen(true);
    void fetchHistoryWithFilters(next);
  }, [fetchHistoryWithFilters]);

  const handleOpenHistoryForTech = useCallback(
    (techId: string) => {
      const next = { ...historyFilters, technicianId: techId };
      setHistoryFilters(next);
      setHistoryPanelOpen(true);
      void fetchHistoryWithFilters(next);
    },
    [historyFilters, fetchHistoryWithFilters]
  );

  const toggleHistoryPanel = useCallback(() => {
    setHistoryPanelOpen((prev) => {
      const next = !prev;
      if (next && historyResults.length === 0) {
        void fetchHistoryWithFilters(historyFilters);
      }
      return next;
    });
  }, [historyResults.length, historyFilters, fetchHistoryWithFilters]);

  useEffect(() => {
    if (selectedTech) {
      void loadAdjustmentsForTech(selectedTech);
    }
  }, [selectedTech, loadAdjustmentsForTech]);

  const handleDeleteAdjustment = useCallback(
    async (techId: string, adjustmentId: string) => {
      const techAdjustments = adjustmentsByTech[techId] ?? [];
      const target = techAdjustments.find((adj) => adj.id === adjustmentId);
      if (!target) return;

      const confirmed = window.confirm("¿Eliminar este ajuste de sueldo?");
      if (!confirmed) return;

      setActionErrorsByTech((prev) => ({ ...prev, [techId]: null }));
      setDeletingAdjustmentId(adjustmentId);
      const { error } = await supabase
        .from("salary_adjustments")
        .delete()
        .eq("id", adjustmentId)
        .eq("technician_id", techId);
      setDeletingAdjustmentId(null);

      if (error) {
        console.error("Error eliminando ajuste:", error);
        setActionErrorsByTech((prev) => ({
          ...prev,
          [techId]: "No pudimos eliminar el ajuste. Intenta nuevamente.",
        }));
        return;
      }

      setAdjustmentsByTech((prev) => ({
        ...prev,
        [techId]: techAdjustments.filter((adj) => adj.id !== adjustmentId),
      }));
      setWeeklyAdjustmentTotals((prev) => {
        const next = { ...prev };
        next[techId] = Math.max((next[techId] ?? 0) - (target.amount ?? 0), 0);
        return next;
      });
      void loadWeeklyData();
    },
    [adjustmentsByTech, loadWeeklyData]
  );

  const handleSettleAdjustments = useCallback(
    async (techId: string) => {
      const techAdjustments = adjustmentsByTech[techId] ?? [];
      if (techAdjustments.length === 0) return;

      const confirmed = window.confirm("¿Seguro que quieres saldar todos los ajustes de esta semana?");
      if (!confirmed) return;

      setActionErrorsByTech((prev) => ({ ...prev, [techId]: null }));
      setSettlingAdjustmentsByTech((prev) => ({ ...prev, [techId]: true }));
      const { start, end } = currentWeekRange();

      const { error } = await supabase
        .from("salary_adjustments")
        .delete()
        .eq("technician_id", techId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      setSettlingAdjustmentsByTech((prev) => ({ ...prev, [techId]: false }));

      if (error) {
        console.error("Error al saldar ajustes:", error);
        setActionErrorsByTech((prev) => ({
          ...prev,
          [techId]: "No pudimos saldar los ajustes. Intenta nuevamente.",
        }));
        return;
      }

      setAdjustmentsByTech((prev) => ({ ...prev, [techId]: [] }));
      setWeeklyAdjustmentTotals((prev) => ({ ...prev, [techId]: 0 }));
      void loadWeeklyData();
    },
    [adjustmentsByTech, loadWeeklyData]
  );

  const handleDeleteReturn = useCallback(
    async (techId: string, orderId: string) => {
      const techReturns = returnsByTech[techId] ?? [];
      const target = techReturns.find((order) => order.id === orderId);
      if (!target) return;

      const confirmed = window.confirm("¿Eliminar esta devolución/cancelación del historial?");
      if (!confirmed) return;

      setActionErrorsByTech((prev) => ({ ...prev, [techId]: null }));
      setDeletingReturnId(orderId);
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId)
        .eq("technician_id", techId)
        .in("status", ["returned", "cancelled"]);
      setDeletingReturnId(null);

      if (error) {
        console.error("Error eliminando devolución:", error);
        setActionErrorsByTech((prev) => ({
          ...prev,
          [techId]: "No pudimos eliminar la devolución. Intenta nuevamente.",
        }));
        return;
      }

      setReturnsByTech((prev) => ({
        ...prev,
        [techId]: techReturns.filter((order) => order.id !== orderId),
      }));
      setWeeklyReturnsTotals((prev) => {
        const next = { ...prev };
        next[techId] = Math.max((next[techId] ?? 0) - (target.commission_amount ?? 0), 0);
        return next;
      });
      void loadWeeklyData();
    },
    [returnsByTech, loadWeeklyData]
  );

  const handleSettleReturns = useCallback(
    async (techId: string) => {
      const techReturns = returnsByTech[techId] ?? [];
      if (techReturns.length === 0) return;

      const confirmed = window.confirm(
        "¿Seguro que quieres eliminar todas las devoluciones/cancelaciones de esta semana?"
      );
      if (!confirmed) return;

      setActionErrorsByTech((prev) => ({ ...prev, [techId]: null }));
      setSettlingReturnsByTech((prev) => ({ ...prev, [techId]: true }));
      const { start, end } = currentWeekRange();

      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("technician_id", techId)
        .in("status", ["returned", "cancelled"])
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      setSettlingReturnsByTech((prev) => ({ ...prev, [techId]: false }));

      if (error) {
        console.error("Error al eliminar devoluciones:", error);
        setActionErrorsByTech((prev) => ({
          ...prev,
          [techId]: "No pudimos eliminar las devoluciones. Intenta nuevamente.",
        }));
        return;
      }

      setReturnsByTech((prev) => ({ ...prev, [techId]: [] }));
      setWeeklyReturnsTotals((prev) => ({ ...prev, [techId]: 0 }));
      void loadWeeklyData();
    },
    [returnsByTech, loadWeeklyData]
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Pagos a Técnicos
      </h3>

      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Historial y filtros de liquidaciones</p>
            <p className="text-xs text-slate-500">Busca pagos anteriores por técnico, medio de pago o rango de fechas.</p>
          </div>
          <button
            type="button"
            onClick={toggleHistoryPanel}
            className="text-xs font-semibold px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-white"
          >
            {historyPanelOpen ? "Ocultar historial" : "Mostrar historial"}
          </button>
        </div>

        {historyPanelOpen && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Técnico</label>
                <select
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  value={historyFilters.technicianId}
                  onChange={(e) =>
                    setHistoryFilters((prev) => ({ ...prev, technicianId: e.target.value }))
                  }
                >
                  <option value="all">Todos</option>
                  {technicianOptions.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Medio de pago</label>
                <select
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  value={historyFilters.paymentMethod}
                  onChange={(e) =>
                    setHistoryFilters((prev) => ({
                      ...prev,
                      paymentMethod: e.target.value as "all" | "efectivo" | "transferencia" | "otro",
                    }))
                  }
                >
                  <option value="all">Todos</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Desde</label>
                <input
                  type="date"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  value={historyFilters.startDate}
                  onChange={(e) =>
                    setHistoryFilters((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Hasta</label>
                <input
                  type="date"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  value={historyFilters.endDate}
                  onChange={(e) =>
                    setHistoryFilters((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleManualHistorySearch}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-brand-light text-white hover:bg-brand/90"
              >
                Buscar
              </button>
              <button
                type="button"
                onClick={handleResetHistoryFilters}
                className="px-4 py-2 text-xs font-semibold rounded-md border border-slate-300 text-slate-600 hover:bg-white"
              >
                Limpiar
              </button>
            </div>
            <div className="text-xs text-slate-500">
              <span className="mr-4">
                Efectivo:{" "}
                <span className="font-semibold text-emerald-600">
                  ${historyAggregates.efectivo.toLocaleString("es-CL")}
                </span>
              </span>
              <span className="mr-4">
                Transferencia:{" "}
                <span className="font-semibold text-sky-600">
                  ${historyAggregates.transferencia.toLocaleString("es-CL")}
                </span>
              </span>
              <span>
                Otro:{" "}
                <span className="font-semibold text-slate-700">
                  ${historyAggregates.otro.toLocaleString("es-CL")}
                </span>
              </span>
            </div>
            {historyError && <p className="text-xs text-red-600">{historyError}</p>}
            {historyLoading ? (
              <p className="text-sm text-slate-500">Cargando liquidaciones...</p>
            ) : historyResults.length === 0 ? (
              <p className="text-sm text-slate-500">No hay liquidaciones para los filtros seleccionados.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {historyResults.map((entry) => {
                  const paymentMethodLabel =
                    entry.payment_method === "transferencia"
                      ? "Transferencia"
                      : entry.payment_method === "efectivo"
                      ? "Efectivo"
                      : entry.payment_method === "otro"
                      ? "Otro"
                      : "Sin dato";
                  return (
                    <div
                      key={entry.id}
                      className="bg-white border border-slate-200 rounded-md p-3 text-sm"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-slate-800">
                            {technicianNameMap[entry.technician_id] || "Técnico"}
                          </p>
                          <p className="text-xs text-slate-500">
                            Semana {formatDate(entry.week_start)} • Medio: {paymentMethodLabel}
                          </p>
                        </div>
                        <span className="font-semibold text-brand">
                          ${entry.amount.toLocaleString("es-CL")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {technicians.map((tech) => {
          const weeklyTotal = weeklyTotals[tech.id] ?? 0;
          const adjustmentTotal = weeklyAdjustmentTotals[tech.id] ?? 0;
          const returnsTotal = weeklyReturnsTotals[tech.id] ?? 0;
          const settlementTotal = weeklySettlementTotals[tech.id] ?? 0;
          const netBeforeSettlement = Math.max(weeklyTotal - adjustmentTotal - returnsTotal, 0);
          const netTotal = Math.max(netBeforeSettlement - settlementTotal, 0);
          const pendingDebt = Math.max(settlementTotal - netBeforeSettlement, 0);
          const baseAmountForSettlement = Math.max(weeklyTotal - returnsTotal, 0);
          const isSelected = selectedTech === tech.id;
          const isSettlementOpen = openSettlementPanels[tech.id] ?? false;
          const cardAdjustments = adjustmentsByTech[tech.id] ?? [];
          const cardReturns = returnsByTech[tech.id] ?? [];
          const cardLoading = loadingDetailsByTech[tech.id] ?? false;
          const cardActionError = actionErrorsByTech[tech.id];
          const isSettlingAdj = settlingAdjustmentsByTech[tech.id] ?? false;
          const isSettlingRet = settlingReturnsByTech[tech.id] ?? false;

          return (
            <div
              key={tech.id}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                isSelected
                  ? "border-brand bg-brand/5"
                  : "border-slate-200 hover:border-slate-300"
              }`}
              onClick={() => {
                const nextSelected = isSelected ? null : tech.id;
                setSelectedTech(nextSelected);
                void loadWeeklyData();
                void loadAdjustmentsForTech(tech.id, true);
              }}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium text-slate-900">{tech.name}</div>
                  <div className="text-sm text-slate-600">
                    Total semanal (con recibo): $
                    {weeklyTotal.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    {returnsTotal > 0 && (
                      <span className="ml-2 text-xs text-red-600">
                        (Devoluciones: -${returnsTotal.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
                      </span>
                    )}
                    <span className="ml-2 text-xs text-slate-500">
                      (Neto estimado: $
                      {netTotal.toLocaleString('es-CL', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                      )
                    </span>
                  </div>
                </div>
                <div className="text-2xl">{isSelected ? "▼" : "▶"}</div>
              </div>

              {isSelected && (
                <div
                  className="mt-4 pt-4 border-t border-slate-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h4 className="font-medium text-slate-700 mb-2">
                    Ajustes de Sueldo y Devoluciones
                  </h4>
                  <div className="flex flex-col gap-2 text-sm text-slate-600 mb-3">
                    <div className="flex items-center justify-between">
                      <span>
                        Total ajustes: $
                        {adjustmentTotal.toLocaleString('es-CL', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                    {returnsTotal > 0 && (
                      <div className="flex items-center justify-between text-red-600">
                        <span>
                          Total devoluciones/cancelaciones: -$
                          {returnsTotal.toLocaleString('es-CL', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">
                        Saldo estimado: $
                        {netTotal.toLocaleString('es-CL', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </div>
                    {pendingDebt > 0 && (
                      <div className="flex items-center justify-between text-amber-600">
                        <span>
                          Pendiente próxima semana (el técnico debe): $
                          {pendingDebt.toLocaleString('es-CL', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    )}
                    {settlementTotal > 0 && (
                      <div className="flex items-center justify-between text-sky-600">
                        <span>
                          Liquidado: $
                          {settlementTotal.toLocaleString('es-CL', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSettlementPanel(tech.id);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold border border-brand-light text-brand rounded-md hover:bg-brand/5 transition"
                    >
                      {isSettlementOpen ? "Ocultar ajustes de sueldo" : "Ajustes de sueldo"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenHistoryForTech(tech.id);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold border border-slate-300 text-slate-600 rounded-md hover:bg-slate-100 transition"
                    >
                      Historial de liquidaciones
                    </button>
                    {cardActionError && (
                      <p className="text-xs text-red-600">{cardActionError}</p>
                    )}
                  </div>
                  {isSettlementOpen && (
                    <div className="mb-4">
                      <SalarySettlementPanel
                        technicianId={tech.id}
                        technicianName={tech.name}
                        baseAmount={weeklyTotal}
                        adjustmentTotal={adjustmentTotal}
                        context="admin"
                        onAfterSettlement={() => {
                          void loadWeeklyData();
                          void loadAdjustmentsForTech(tech.id, true);
                          void loadSettlementHistory(tech.id, true);
                        }}
                      />
                    </div>
                  )}
                  {(cardAdjustments.length > 0 || cardReturns.length > 0) && (
                    <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
                      {cardReturns.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSettleReturns(tech.id);
                          }}
                          disabled={isSettlingRet}
                          className="px-3 py-1 text-xs font-medium text-white bg-amber-600 rounded-md hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {isSettlingRet ? "Eliminando devoluciones..." : "Eliminar devoluciones"}
                        </button>
                      )}
                      {cardAdjustments.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSettleAdjustments(tech.id);
                          }}
                          disabled={isSettlingAdj}
                          className="px-3 py-1 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {isSettlingAdj ? "Saldando ajustes..." : "Saldar ajustes"}
                        </button>
                      )}
                    </div>
                  )}
                  {cardLoading ? (
                    <p className="text-sm text-slate-500">Actualizando historial...</p>
                  ) : cardAdjustments.length === 0 && cardReturns.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No hay ajustes ni devoluciones registradas esta semana.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {cardReturns.map((order) => {
                        const dateTime = new Date(order.created_at).toLocaleString("es-CL", {
                          dateStyle: "short",
                          timeStyle: "short",
                        });
                        return (
                          <div
                            key={order.id}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm p-3 bg-red-50/30 border border-red-200 rounded-md gap-2"
                          >
                            <div>
                              <div>
                                <span className="font-medium text-red-600">
                                  {order.status === "returned" ? "Devolución" : "Cancelación"}
                                </span>
                                <span className="text-slate-600 ml-2">
                                  - Orden #{order.order_number} • {order.device}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 mt-1">
                                {dateTime}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                            <span className="font-semibold text-red-600">
                              -${order.commission_amount?.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || "0"}
                            </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleDeleteReturn(tech.id, order.id);
                                }}
                                disabled={deletingReturnId === order.id || isSettlingRet}
                                className="text-xs text-red-600 hover:text-red-500 disabled:opacity-60"
                              >
                                {deletingReturnId === order.id ? "Eliminando..." : "Eliminar"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {cardAdjustments.map((adj) => (
                        <div
                          key={adj.id}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm p-3 bg-slate-50 border border-slate-200 rounded-md gap-2"
                        >
                          <div>
                          <div>
                            <span
                              className={`font-medium ${
                                adj.type === "advance"
                                  ? "text-blue-600"
                                  : "text-red-600"
                              }`}
                            >
                              {adj.type === "advance" ? "Adelanto" : "Descuento"}
                            </span>
                            {adj.note && (
                              <span className="text-slate-600 ml-2">
                                - {adj.note}
                              </span>
                            )}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              {formatDate(adj.created_at)} •{" "}
                              {new Date(adj.created_at).toLocaleTimeString("es-CL", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                          <span className="font-semibold">
                            ${adj.amount.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteAdjustment(tech.id, adj.id);
                              }}
                              disabled={deletingAdjustmentId === adj.id || isSettlingAdj}
                              className="text-xs text-red-600 hover:text-red-500 disabled:opacity-60"
                            >
                              {deletingAdjustmentId === adj.id ? "Eliminando..." : "Eliminar"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

