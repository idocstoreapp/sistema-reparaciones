import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentWeekRange, currentMonthRange } from "@/lib/date";
import { formatCLP } from "@/lib/currency";
import { calcCommission } from "@/lib/commission";
import { getCurrentPayoutWeek } from "@/lib/payoutWeek";
import type { PaymentMethod } from "@/lib/commission";
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
    returnsAndCancellations: 0,
    totalReturnsAndCancellations: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      
      // ⚠️ CAMBIO CRÍTICO: Usar payout_week y payout_year en lugar de created_at
      // Las comisiones se asignan según la fecha de pago, no la fecha de creación
      const currentPayout = getCurrentPayoutWeek();
      
      // Consulta para órdenes pagadas de la semana actual (basado en payout_week)
      // Solo órdenes que fueron pagadas esta semana según su payout_week/payout_year
      const { data: week, error: weekError } = await supabase
        .from("orders")
        .select("*")
        .eq("technician_id", technicianId)
        .eq("status", "paid") // Solo órdenes pagadas tienen payout_week
        .eq("payout_week", currentPayout.week)
        .eq("payout_year", currentPayout.year);

      // Consulta para órdenes pagadas del mes actual
      // Usar paid_at para filtrar por mes (retrocompatibilidad: órdenes sin payout_week usan paid_at)
      const { data: month, error: monthError } = await supabase
        .from("orders")
        .select("*")
        .eq("technician_id", technicianId)
        .eq("status", "paid")
        .gte("paid_at", ms.toISOString())
        .lte("paid_at", me.toISOString());

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

      // Contar todas las órdenes pagadas de la semana actual (basado en payout_week)
      // ⚠️ CAMBIO: Ahora solo cuenta órdenes con payout_week/payout_year de la semana actual
      const count = weekOrders.length;
      
      // Ganancia semanal: suma de comisiones de órdenes pagadas en la semana actual
      // Estas órdenes tienen payout_week y payout_year que coinciden con la semana actual
      // La semana se fija cuando la orden se marca como pagada y nunca cambia
      const weekGain = weekOrders.reduce((s, r) => s + (r.commission_amount ?? 0), 0);
      
      // Pendientes: calcular el TOTAL de todas las órdenes sin recibo/boleta (sin límite de fecha)
      // Suma total de comisiones de órdenes que están pendientes (status = 'pending')
      // Cuando se agrega el recibo manualmente, estas órdenes pasan a status = 'paid'
      // y se suman en "Ganancia Semanal (Con Recibo)"
      // Recalcular comisión para cada orden pendiente basándose en el medio de pago actual
      // (puede que hayan agregado el medio de pago después de crear la orden)
      const allPending = allPendingOrders ?? [];
      
      // Debug: mostrar órdenes pendientes encontradas
      if (allPending.length > 0) {
        console.log(`[WeeklySummary] Encontradas ${allPending.length} órdenes pendientes:`, allPending.map(o => ({
          order_number: o.order_number,
          payment_method: o.payment_method,
          repair_cost: o.repair_cost,
          replacement_cost: o.replacement_cost,
          commission_amount: o.commission_amount
        })));
      }
      
      const pending = allPending.reduce((s, r) => {
        // Si la orden tiene medio de pago, recalcular la comisión basándose en precio y método
        // Si no tiene medio de pago, usar la comisión almacenada (será 0 hasta que se agregue medio de pago)
        const paymentMethod = (r.payment_method as PaymentMethod) || "";
        if (paymentMethod) {
          const recalculatedCommission = calcCommission({
            paymentMethod,
            costoRepuesto: r.replacement_cost ?? 0,
            precioTotal: r.repair_cost ?? 0,
          });
          console.log(`[WeeklySummary] Orden ${r.order_number}: comisión recalculada = ${recalculatedCommission} (método: ${paymentMethod}, precio: ${r.repair_cost}, repuesto: ${r.replacement_cost})`);
          return s + recalculatedCommission;
        }
        // Si no hay medio de pago, usar la comisión almacenada (probablemente 0)
        // La comisión será 0 hasta que se agregue el medio de pago
        console.log(`[WeeklySummary] Orden ${r.order_number}: sin medio de pago, comisión almacenada = ${r.commission_amount ?? 0}`);
        return s + (r.commission_amount ?? 0);
      }, 0);
      
      console.log(`[WeeklySummary] Total pendiente calculado: ${pending}`);
      
      // Total del mes: suma de comisiones de órdenes pagadas del mes actual
      // Basado en payout_year y filtrado por paid_at para retrocompatibilidad
      const monthGain = monthOrders.reduce((s, r) => s + (r.commission_amount ?? 0), 0);

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
        pending,
        monthGain,
        returnsAndCancellations,
        totalReturnsAndCancellations,
      });
      setLoading(false);
    }
    
    loadData();
    
    // Escuchar evento de actualización de órdenes
    const handleOrderUpdated = () => {
      void loadData();
    };
    
    window.addEventListener('orderUpdated', handleOrderUpdated);
    
    return () => {
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
            <span>${formatCLP(kpis.pending)}</span>
            <span className="block text-xs font-normal text-slate-500 mt-1">
              Órdenes sin recibo/boleta
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

