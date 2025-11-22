import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentWeekRange, currentMonthRange } from "@/lib/date";
import { formatCLP } from "@/lib/currency";
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
    pendingCount: 0,
    monthGain: 0,
    returnsAndCancellations: 0,
    totalReturnsAndCancellations: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { start, end } = currentWeekRange();
      const { start: ms, end: me } = currentMonthRange();
      const weekStartISO = start.toISOString().slice(0, 10);

      // Consultar si hay liquidaciones registradas para esta semana
      // Si hay liquidación, solo contar órdenes creadas DESPUÉS de la liquidación más reciente
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

      // Consulta para órdenes de la semana
      // Si hay liquidación, solo contar órdenes creadas DESPUÉS de la liquidación
      let weekQuery = supabase
        .from("orders")
        .select("*")
        .eq("technician_id", technicianId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      
      // Si hay liquidación, excluir órdenes liquidadas (solo contar órdenes nuevas)
      if (lastSettlementDate) {
        weekQuery = weekQuery.gte("created_at", lastSettlementDate.toISOString());
      }

      const { data: week, error: weekError } = await weekQuery;

      // Consulta para órdenes del mes (sin excluir por liquidación - se conserva el total del mes)
      const { data: month, error: monthError } = await supabase
        .from("orders")
        .select("*")
        .eq("technician_id", technicianId)
        .gte("created_at", ms.toISOString())
        .lte("created_at", me.toISOString());

      // Consulta para total histórico de devoluciones/cancelaciones (sin límite de tiempo)
      const { data: totalReturns, error: totalReturnsError } = await supabase
        .from("orders")
        .select("*")
        .eq("technician_id", technicianId)
        .in("status", ["returned", "cancelled"]);

      // Consulta para TODAS las órdenes pendientes (sin recibo) - sin límite de fecha
      // Esto muestra el total de dinero que falta por recibir por órdenes sin recibo
      const { data: allPendingOrders, error: pendingError } = await supabase
        .from("orders")
        .select("*")
        .eq("technician_id", technicianId)
        .eq("status", "pending");

      // Ajustes de la semana - solo los creados después de la última liquidación (si existe)
      let adjustmentsQuery = supabase
        .from("salary_adjustments")
        .select("amount")
        .eq("technician_id", technicianId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());
      
      // Si hay liquidación, solo contar ajustes creados DESPUÉS de la liquidación
      if (lastSettlementDate) {
        adjustmentsQuery = adjustmentsQuery.gte("created_at", lastSettlementDate.toISOString());
      }
      
      const { data: weeklyAdjustments, error: adjustmentsError } = await adjustmentsQuery;

      if (weekError) {
        console.error("Error loading week orders:", weekError);
      }
      if (monthError) {
        console.error("Error loading month orders:", monthError);
      }
      if (totalReturnsError) {
        console.error("Error loading total returns:", totalReturnsError);
      }
      if (pendingError) {
        console.error("Error loading pending orders:", pendingError);
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
      
      // Pendientes: solo contar la cantidad de órdenes pendientes (sin límite de fecha)
      // No calculamos el total de dinero para no modificar la fórmula original
      const allPending = allPendingOrders ?? [];
      const pendingCount = allPending.length; // Contar cantidad de órdenes pendientes
      
      // Total del mes: solo órdenes con recibo (pagadas), excluyendo devueltas y canceladas
      const monthGain = monthOrders
        .filter((r) => r.status === "paid")
        .reduce((s, r) => s + (r.commission_amount ?? 0), 0);

      // Contar devoluciones y cancelaciones (garantías) de la semana
      const returnsAndCancellations = weekOrders.filter(
        (r) => r.status === "returned" || r.status === "cancelled"
      ).length;

      // Contar total histórico de devoluciones y cancelaciones (sin límite de tiempo)
      const totalReturnsAndCancellations = (totalReturns ?? []).length;

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
        pendingCount,
        monthGain,
        returnsAndCancellations,
        totalReturnsAndCancellations,
      });
      setLoading(false);
    }
    load();
    
    // Escuchar eventos de liquidación y actualización de órdenes para refrescar el dashboard
    const handleSettlementCreated = () => {
      load();
    };
    
    const handleOrderUpdated = () => {
      load();
    };
    
    window.addEventListener('settlementCreated', handleSettlementCreated);
    window.addEventListener('orderUpdated', handleOrderUpdated);
    return () => {
      window.removeEventListener('settlementCreated', handleSettlementCreated);
      window.removeEventListener('orderUpdated', handleOrderUpdated);
    };
  }, [technicianId, refreshKey]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white rounded-lg shadow-md p-6 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
            <div className="h-8 bg-slate-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
              {formatCLP(kpis.weekGain)}
            </span>
            <span className="block text-sm font-normal text-slate-500 mt-1">
              Neto: $
              {formatCLP(kpis.weekNet)}
              {" · Ajustes: -$"}
              {formatCLP(kpis.weekAdjustments)}
            </span>
          </>
        }
        icon="💰"
      />
      <KpiCard
        title="Pendientes de Pago"
        value={
          <>
            <span className="text-2xl font-semibold text-slate-900">
              {kpis.pendingCount}
            </span>
            <span className="block text-sm font-normal text-slate-500 mt-1">
              {kpis.pendingCount === 1 ? 'orden pendiente' : 'órdenes pendientes'}
            </span>
            <span className="block text-xs font-normal text-slate-400 mt-1">
              Sin recibo registrado
            </span>
          </>
        }
        icon="⏳"
      />
      <KpiCard
        title="Total del Mes (Con Recibo)"
        value={formatCLP(kpis.monthGain)}
        icon="📊"
      />
      <KpiCard
        title="Devoluciones/Garantías"
        value={
          <>
            <span>{kpis.returnsAndCancellations}</span>
            <span className="block text-sm font-normal text-slate-500 mt-1">
              Total histórico: {kpis.totalReturnsAndCancellations}
            </span>
          </>
        }
        icon="🔄"
      />
    </div>
  );
}

