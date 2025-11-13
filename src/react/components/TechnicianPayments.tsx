import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { currentWeekRange, formatDate } from "@/lib/date";
import type { Profile, SalaryAdjustment, Order } from "@/types";

interface TechnicianPaymentsProps {
  refreshKey?: number;
}

export default function TechnicianPayments({ refreshKey = 0 }: TechnicianPaymentsProps) {
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [selectedTech, setSelectedTech] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<SalaryAdjustment[]>([]);
  const [returnedOrders, setReturnedOrders] = useState<Order[]>([]);
  const [weeklyTotals, setWeeklyTotals] = useState<Record<string, number>>({});
  const [weeklyAdjustmentTotals, setWeeklyAdjustmentTotals] = useState<Record<string, number>>({});
  const [weeklyReturnsTotals, setWeeklyReturnsTotals] = useState<Record<string, number>>({});

  // Función para cargar técnicos (reutilizable con useCallback)
  const loadTechnicians = useCallback(async () => {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("role", "technician")
      .order("name");
    if (data) {
      setTechnicians(data);
      // Limpiar la selección si el técnico seleccionado ya no existe
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

  useEffect(() => {
    async function loadWeeklyData() {
      const { start, end } = currentWeekRange();
      const totals: Record<string, number> = {};
      const adjustmentTotals: Record<string, number> = {};

      const returnsTotals: Record<string, number> = {};

      await Promise.all(
        technicians.map(async (tech) => {
          const [{ data: orders }, { data: adjustmentsData }, { data: returnedData }] = await Promise.all([
            supabase
          .from("orders")
          .select("commission_amount")
          .eq("technician_id", tech.id)
          .eq("status", "paid") // Solo órdenes pagadas, excluyendo devueltas y canceladas
          .gte("created_at", start.toISOString())
              .lte("created_at", end.toISOString()),
            supabase
              .from("salary_adjustments")
              .select("amount")
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
          ]);

        totals[tech.id] =
          orders?.reduce((s, o) => s + (o.commission_amount ?? 0), 0) ?? 0;
          adjustmentTotals[tech.id] =
            adjustmentsData?.reduce((s, adj) => s + (adj.amount ?? 0), 0) ?? 0;
          returnsTotals[tech.id] =
            returnedData?.reduce((s, o) => s + (o.commission_amount ?? 0), 0) ?? 0;
        })
      );

      setWeeklyTotals(totals);
      setWeeklyAdjustmentTotals(adjustmentTotals);
      setWeeklyReturnsTotals(returnsTotals);
    }
    if (technicians.length > 0) void loadWeeklyData();
  }, [technicians]);

  useEffect(() => {
    async function loadAdjustments() {
      if (!selectedTech) {
        setAdjustments([]);
        setReturnedOrders([]);
        return;
      }

      const { start, end } = currentWeekRange();
      const [{ data: adjustmentsData }, { data: returnedData }] = await Promise.all([
        supabase
          .from("salary_adjustments")
          .select("*")
          .eq("technician_id", selectedTech)
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("*")
          .eq("technician_id", selectedTech)
          .in("status", ["returned", "cancelled"])
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())
          .order("created_at", { ascending: false }),
      ]);

      setAdjustments((adjustmentsData as SalaryAdjustment[]) ?? []);
      setReturnedOrders((returnedData as Order[]) ?? []);
    }
    loadAdjustments();
  }, [selectedTech]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Pagos a Técnicos
      </h3>

      <div className="space-y-3">
        {technicians.map((tech) => {
          const weeklyTotal = weeklyTotals[tech.id] ?? 0;
          const adjustmentTotal = weeklyAdjustmentTotals[tech.id] ?? 0;
          const returnsTotal = weeklyReturnsTotals[tech.id] ?? 0;
          const netTotal = Math.max(weeklyTotal - adjustmentTotal - returnsTotal, 0);
          const isSelected = selectedTech === tech.id;

          return (
            <div
              key={tech.id}
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                isSelected
                  ? "border-brand bg-brand/5"
                  : "border-slate-200 hover:border-slate-300"
              }`}
              onClick={() => setSelectedTech(isSelected ? null : tech.id)}
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
                <div className="mt-4 pt-4 border-t border-slate-200">
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
                  </div>
                  {adjustments.length === 0 && returnedOrders.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No hay ajustes ni devoluciones registradas esta semana.
                    </p>
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
                            <span className="font-semibold text-red-600">
                              -${order.commission_amount?.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || "0"}
                            </span>
                          </div>
                        );
                      })}
                      {/* Mostrar ajustes de sueldo */}
                      {adjustments.map((adj) => (
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
                          <span className="font-semibold">
                            ${adj.amount.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
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

