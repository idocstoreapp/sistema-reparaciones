import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentWeekRange, formatDate } from "@/lib/date";
import type { SalaryAdjustment, Order } from "@/types";
import SalarySettlementPanel from "./SalarySettlementPanel";

interface WeeklyReportProps {
  technicianId: string;
  refreshKey?: number;
}

export default function WeeklyReport({ technicianId, refreshKey = 0 }: WeeklyReportProps) {
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [lastPayment, setLastPayment] = useState<string | null>(null);
  const [returnsDiscount, setReturnsDiscount] = useState(0);
  const [returnedOrders, setReturnedOrders] = useState<Order[]>([]);
  const [adjustments, setAdjustments] = useState<SalaryAdjustment[]>([]);
  const [loadingAdjustments, setLoadingAdjustments] = useState(false);
  const [adjustmentFormOpen, setAdjustmentFormOpen] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<SalaryAdjustment["type"]>("advance");
  const [adjustmentAmount, setAdjustmentAmount] = useState<number | "">("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [deletingAdjustmentId, setDeletingAdjustmentId] = useState<string | null>(null);
  const [settlingReturns, setSettlingReturns] = useState(false);
  const [deletingReturnId, setDeletingReturnId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settlementPanelOpen, setSettlementPanelOpen] = useState(true);
  const [settledAmount, setSettledAmount] = useState(0);

  const loadData = useCallback(async () => {
      setLoading(true);
    setLoadingAdjustments(true);
    try {
      const { start, end } = currentWeekRange();
      const weekStartISO = start.toISOString().slice(0, 10);

      const [{ data: orders }, { data: adjustmentData }, { data: settlementsData }] = await Promise.all([
        supabase
        .from("orders")
        .select("*")
        .eq("technician_id", technicianId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
          .order("created_at", { ascending: false }),
        supabase
          .from("salary_adjustments")
          .select("*")
          .eq("technician_id", technicianId)
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())
          .order("created_at", { ascending: false }),
        supabase
          .from("salary_settlements")
          .select("amount")
          .eq("technician_id", technicianId)
          .eq("week_start", weekStartISO),
      ]);

      if (orders) {
        // Excluir órdenes devueltas y canceladas de los cálculos
        const earned = orders
          .filter((o) => o.status === "paid")
          .reduce((s, o) => s + (o.commission_amount ?? 0), 0);
        const pending = orders
          .filter((o) => o.status === "pending")
          .reduce((s, o) => s + (o.commission_amount ?? 0), 0);

        // Calcular descuento por devoluciones y cancelaciones
        // Solo contar órdenes que estaban pagadas antes de ser devueltas/canceladas
        const returned = orders.filter((o) => o.status === "returned" || o.status === "cancelled");
        const returnsDiscount = returned.reduce((s, o) => s + (o.commission_amount ?? 0), 0);

        const lastPaid = orders
          .filter((o) => o.status === "paid" && o.receipt_number)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        setTotalEarned(earned);
        setTotalPending(pending);
        setLastPayment(lastPaid ? formatDate(lastPaid.created_at) : null);
        // Guardar el descuento por devoluciones en el estado
        setReturnsDiscount(returnsDiscount);
        setReturnedOrders(returned);
      }

      setAdjustments(((adjustmentData as SalaryAdjustment[]) ?? []).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
      setSettledAmount(
        (settlementsData as { amount: number }[])?.reduce((sum, s) => sum + (s.amount ?? 0), 0) ?? 0
      );
    } finally {
      setLoading(false);
      setLoadingAdjustments(false);
    }
  }, [technicianId]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshKey]);

  const totalAdjustments = useMemo(
    () => adjustments.reduce((sum, adj) => sum + (adj.amount ?? 0), 0),
    [adjustments]
  );

  const netEarned = totalEarned - totalAdjustments - returnsDiscount;
  const netAfterSettlements = netEarned - settledAmount;
  const availableForAdvance = Math.max(netAfterSettlements, 0);
  const baseAmountForSettlement = Math.max(totalEarned - returnsDiscount, 0);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center text-slate-500">Cargando reporte...</div>
      </div>
    );
  }

  const total = totalEarned + totalPending;
  const percentage = total > 0 ? (totalEarned / total) * 100 : 0;

  async function handleSaveAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setAdjustmentError(null);

    const amountNumber =
      typeof adjustmentAmount === "string" ? Number(adjustmentAmount) : adjustmentAmount;

    if (!amountNumber || Number.isNaN(amountNumber) || amountNumber <= 0) {
      setAdjustmentError("Ingresa un monto válido.");
      return;
    }

    const cleanNote = adjustmentNote.trim() || null;

    setSavingAdjustment(true);

    const { error } = await supabase.from("salary_adjustments").insert({
      technician_id: technicianId,
      type: adjustmentType,
      amount: amountNumber,
      note: cleanNote,
    });

    setSavingAdjustment(false);

    if (error) {
      console.error("Error registrando ajuste de sueldo:", error);
      setAdjustmentError("No pudimos guardar el ajuste. Intenta nuevamente.");
      return;
    }

    setAdjustmentAmount("");
    setAdjustmentNote("");
    setAdjustmentType("advance");
    setAdjustmentFormOpen(false);
    void loadData();
  }

  async function handleDeleteAdjustment(adjustmentId: string) {
    const target = adjustments.find((adj) => adj.id === adjustmentId);
    if (!target) {
      return;
    }
    const confirmed = window.confirm("¿Eliminar este ajuste de sueldo?");
    if (!confirmed) {
      return;
    }
    setActionError(null);
    setDeletingAdjustmentId(adjustmentId);
    const { error } = await supabase
      .from("salary_adjustments")
      .delete()
      .eq("id", adjustmentId)
      .eq("technician_id", technicianId);
    setDeletingAdjustmentId(null);
    if (error) {
      console.error("Error eliminando ajuste:", error);
      setActionError("No pudimos eliminar el ajuste. Intenta nuevamente.");
      return;
    }
    setAdjustments((prev) => prev.filter((adj) => adj.id !== adjustmentId));
  }

  async function handleDeleteReturn(orderId: string) {
    const target = returnedOrders.find((order) => order.id === orderId);
    if (!target) {
      return;
    }
    const confirmed = window.confirm("¿Eliminar esta devolución/cancelación del historial?");
    if (!confirmed) {
      return;
    }
    setActionError(null);
    setDeletingReturnId(orderId);
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId)
      .eq("technician_id", technicianId)
      .in("status", ["returned", "cancelled"]);
    setDeletingReturnId(null);
    if (error) {
      console.error("Error eliminando devolución:", error);
      setActionError("No pudimos eliminar la devolución. Intenta nuevamente.");
      return;
    }
    setReturnedOrders((prev) => prev.filter((order) => order.id !== orderId));
    setReturnsDiscount((prev) => Math.max(prev - (target.commission_amount ?? 0), 0));
  }

  async function handleSettleAllReturns() {
    if (returnedOrders.length === 0) {
      return;
    }
    const confirmed = window.confirm("¿Seguro que quieres eliminar todas tus devoluciones/cancelaciones de esta semana?");
    if (!confirmed) {
      return;
    }
    setActionError(null);
    setSettlingReturns(true);
    const { start, end } = currentWeekRange();
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("technician_id", technicianId)
      .in("status", ["returned", "cancelled"])
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());
    setSettlingReturns(false);
    if (error) {
      console.error("Error al eliminar devoluciones:", error);
      setActionError("No pudimos eliminar las devoluciones. Intenta nuevamente.");
      return;
    }
    setReturnedOrders([]);
    setReturnsDiscount(0);
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Reporte Semanal de Ganancias</h3>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-slate-600">Total ganado esta semana (con recibo):</span>
          <span className="font-semibold text-emerald-600">
            ${totalEarned.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-600">Ajustes registrados (descuentos / adelantos):</span>
          <span className="font-semibold text-slate-600">
            -$
            {totalAdjustments.toLocaleString('es-CL', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </span>
        </div>

        {returnsDiscount > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-slate-600">Descuento por devoluciones/cancelaciones:</span>
            <span className="font-semibold text-red-600">
              -$
              {returnsDiscount.toLocaleString('es-CL', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </span>
          </div>
        )}

        <div className="flex justify-between items-center">
          <span className="text-slate-600 font-medium">Total real disponible:</span>
          <span className="font-semibold text-brand">
            ${netAfterSettlements.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-600">Liquidado esta semana:</span>
          <span className="font-semibold text-sky-600">
            ${settledAmount.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
            <SalarySettlementPanel
              technicianId={technicianId}
              baseAmount={baseAmountForSettlement}
              context="technician"
              onAfterSettlement={() => void loadData()}
            />
        
        <div className="flex justify-between items-center">
          <span className="text-slate-600">Total pendiente:</span>
          <span className="font-semibold text-amber-600">
            ${totalPending.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
        
        {lastPayment && (
          <div className="flex justify-between items-center">
            <span className="text-slate-600">Último pago recibido:</span>
            <span className="font-medium text-slate-700">{lastPayment}</span>
          </div>
        )}
        
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Progreso semanal</span>
            <span>
              {total > 0 ? (
                <>
                  <span className="text-emerald-600">{((totalEarned / total) * 100).toFixed(0)}%</span>
                  {" / "}
                  <span className="text-amber-600">{((totalPending / total) * 100).toFixed(0)}%</span>
                </>
              ) : (
                "0%"
              )}
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3 flex overflow-hidden">
            {total > 0 && (
              <>
                {/* Parte verde: Pagado con recibo */}
                {totalEarned > 0 && (
                  <div
                    className="bg-emerald-500 h-3 transition-all duration-300"
                    style={{ width: `${(totalEarned / total) * 100}%` }}
                  ></div>
                )}
                {/* Parte anaranjada: Pendiente */}
                {totalPending > 0 && (
                  <div
                    className="bg-amber-500 h-3 transition-all duration-300"
                    style={{ width: `${(totalPending / total) * 100}%` }}
                  ></div>
                )}
              </>
            )}
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
              Pagado
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
              Pendiente
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Ajustes de sueldo de la semana</h4>
            <p className="text-xs text-slate-500">
              Descuentos, adelantos y devoluciones se restan del total ganado. Saldo disponible: $
              {availableForAdvance.toLocaleString('es-CL', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 self-start sm:self-auto">
            {returnedOrders.length > 0 && (
              <button
                type="button"
                onClick={handleSettleAllReturns}
                disabled={settlingReturns}
                className="px-3 py-2 text-xs font-medium border border-amber-500 text-amber-600 rounded-md hover:bg-amber-50 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {settlingReturns ? "Eliminando devoluciones..." : "Eliminar devoluciones"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSettlementPanelOpen((prev) => !prev)}
              className="px-3 py-2 text-xs font-medium border border-brand-light text-brand rounded-md hover:bg-brand/5 transition"
            >
              {settlementPanelOpen ? "Ocultar liquidación" : "Liquidar sueldo"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdjustmentFormOpen((prev) => !prev);
                setAdjustmentError(null);
              }}
              className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-100 transition"
            >
              {adjustmentFormOpen ? "Cerrar formulario" : "Registrar ajuste"}
            </button>
          </div>
        </div>

        {settlementPanelOpen && (
          <div className="mb-5">
            <SalarySettlementPanel
              technicianId={technicianId}
              baseAmount={baseAmountForSettlement}
              context="technician"
              onAfterSettlement={() => void loadData()}
            />
          </div>
        )}

        {adjustmentFormOpen && (
          <form onSubmit={handleSaveAdjustment} className="bg-slate-50 border border-slate-200 rounded-md p-4 space-y-3 mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                <select
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  value={adjustmentType}
                  onChange={(e) => setAdjustmentType(e.target.value as SalaryAdjustment["type"])}
                >
                  <option value="advance">Adelanto</option>
                  <option value="discount">Descuento</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Monto</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  value={adjustmentAmount === "" ? "" : adjustmentAmount}
                  onChange={(e) =>
                    setAdjustmentAmount(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="Ej: 20000"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nota (opcional)
                </label>
                <input
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  placeholder="Motivo o detalle"
                />
              </div>
            </div>
            {adjustmentError && (
              <div className="text-xs text-amber-600">{adjustmentError}</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdjustmentFormOpen(false);
                  setAdjustmentType("advance");
                  setAdjustmentAmount("");
                  setAdjustmentNote("");
                  setAdjustmentError(null);
                }}
                className="px-4 py-2 text-xs border border-slate-300 rounded-md hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingAdjustment}
                className="px-4 py-2 text-xs bg-brand-light text-brand-white rounded-md hover:bg-white hover:text-brand border-2 border-brand-light hover:border-white transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {savingAdjustment ? "Guardando..." : "Guardar ajuste"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {actionError && <div className="text-xs text-red-600">{actionError}</div>}
          {loadingAdjustments ? (
            <div className="text-sm text-slate-500">Cargando ajustes...</div>
          ) : adjustments.length === 0 && returnedOrders.length === 0 ? (
            <div className="text-sm text-slate-500">
              No hay ajustes registrados esta semana.
            </div>
          ) : (
            <div className="space-y-2">
              {/* Mostrar devoluciones/cancelaciones primero */}
              {returnedOrders.map((order) => {
                const dateTime = new Date(order.created_at).toLocaleString("es-CL", {
                  dateStyle: "short",
                  timeStyle: "short",
                });
                return (
                  <div
                    key={order.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-red-200 bg-red-50/30 rounded-md px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium text-red-600">
                        {order.status === "returned" ? "Devolución" : "Cancelación"}
                      </span>
                      <span className="text-slate-600 ml-2">- Orden #{order.order_number}</span>
                      <div className="text-xs text-slate-400">{dateTime}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-red-600">
                        -${order.commission_amount?.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || "0"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteReturn(order.id)}
                        disabled={deletingReturnId === order.id || settlingReturns}
                        className="text-xs text-red-600 hover:text-red-500 disabled:opacity-60"
                      >
                        {deletingReturnId === order.id ? "Eliminando..." : "Eliminar"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {/* Mostrar ajustes de sueldo */}
              {adjustments.map((adj) => {
                const dateTime = new Date(adj.created_at).toLocaleString("es-CL", {
                  dateStyle: "short",
                  timeStyle: "short",
                });
                return (
                  <div
                    key={adj.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-slate-200 bg-white rounded-md px-3 py-2 text-sm"
                  >
                    <div>
                      <span
                        className={`font-medium ${
                          adj.type === "advance" ? "text-blue-600" : "text-red-600"
                        }`}
                      >
                        {adj.type === "advance" ? "Adelanto" : "Descuento"}
                      </span>
                      {adj.note && <span className="text-slate-600 ml-2">- {adj.note}</span>}
                      <div className="text-xs text-slate-400">{dateTime}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">
                        ${adj.amount.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteAdjustment(adj.id)}
                        disabled={deletingAdjustmentId === adj.id}
                        className="text-xs text-red-600 hover:text-red-500 disabled:opacity-60"
                      >
                        {deletingAdjustmentId === adj.id ? "Eliminando..." : "Eliminar"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

