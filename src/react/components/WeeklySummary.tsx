import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentWeekRange, currentMonthRange } from "@/lib/date";
import KpiCard from "./KpiCard";

interface WeeklySummaryProps {
  technicianId: string;
  refreshKey?: number;
}

export default function WeeklySummary({ technicianId, refreshKey = 0 }: WeeklySummaryProps) {
  const [kpis, setKpis] = useState({
    count: 0,
    weekGain: 0,
    weekAdjustments: 0,
    weekNet: 0,
    pending: 0,
    monthGain: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { start, end } = currentWeekRange();
      const { start: ms, end: me } = currentMonthRange();

      // Consulta para órdenes de la semana
      const { data: week, error: weekError } = await supabase
        .from("orders")
        .select("*")
        .eq("technician_id", technicianId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      // Consulta para órdenes del mes
      const { data: month, error: monthError } = await supabase
        .from("orders")
        .select("*")
        .eq("technician_id", technicianId)
        .gte("created_at", ms.toISOString())
        .lte("created_at", me.toISOString());

      const { data: weeklyAdjustments, error: adjustmentsError } = await supabase
        .from("salary_adjustments")
        .select("amount")
        .eq("technician_id", technicianId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (weekError) {
        console.error("Error loading week orders:", weekError);
      }
      if (monthError) {
        console.error("Error loading month orders:", monthError);
      }
      if (adjustmentsError) {
        console.error("Error loading weekly adjustments:", adjustmentsError);
      }

      const weekOrders = week ?? [];
      const monthOrders = month ?? [];
      const adjustmentsList = weeklyAdjustments ?? [];

      // Contar todas las órdenes de la semana (con y sin recibo)
      const count = weekOrders.length;
      
      // Ganancia semanal: solo órdenes con recibo (pagadas), excluyendo devueltas y canceladas
      const weekGain = weekOrders
        .filter((r) => r.status === "paid")
        .reduce((s, r) => s + (r.commission_amount ?? 0), 0);
      
      // Pendientes: solo órdenes sin recibo, excluyendo devueltas y canceladas
      const pending = weekOrders
        .filter((r) => r.status === "pending")
        .reduce((s, r) => s + (r.commission_amount ?? 0), 0);
      
      // Total del mes: solo órdenes con recibo (pagadas), excluyendo devueltas y canceladas
      const monthGain = monthOrders
        .filter((r) => r.status === "paid")
        .reduce((s, r) => s + (r.commission_amount ?? 0), 0);

      const weekAdjustmentsTotal = adjustmentsList.reduce(
        (sum, adj) => sum + (adj?.amount ?? 0),
        0
      );
      const weekNet = Math.max(weekGain - weekAdjustmentsTotal, 0);

      setKpis({
        count,
        weekGain,
        weekAdjustments: weekAdjustmentsTotal,
        weekNet,
        pending,
        monthGain,
      });
      setLoading(false);
    }
    load();
  }, [technicianId, refreshKey]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg shadow-md p-6 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
            <div className="h-8 bg-slate-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        title="Servicios de la Semana"
        value={kpis.count}
        icon="📋"
      />
      <KpiCard
        title="Ganancia Semanal (Con Recibo)"
        value={
          <>
            <span>
              $
              {kpis.weekGain.toLocaleString('es-CL', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </span>
            <span className="block text-sm font-normal text-slate-500 mt-1">
              Neto: $
              {kpis.weekNet.toLocaleString('es-CL', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
              {" · Ajustes: -$"}
              {kpis.weekAdjustments.toLocaleString('es-CL', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </span>
          </>
        }
        icon="💰"
      />
      <KpiCard
        title="Pendientes de Pago"
        value={`$${kpis.pending.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
        icon="⏳"
      />
      <KpiCard
        title="Total del Mes (Con Recibo)"
        value={`$${kpis.monthGain.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
        icon="📊"
      />
    </div>
  );
}

