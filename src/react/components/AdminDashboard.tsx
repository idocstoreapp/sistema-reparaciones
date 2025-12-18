import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentMonthRange, dateToUTCStart, dateToUTCEnd } from "@/lib/date";
import { formatCLP } from "@/lib/currency";
import { calcCommission } from "@/lib/commission";
import { getCurrentPayoutWeek } from "@/lib/payoutWeek";
import type { PaymentMethod } from "@/lib/commission";
import KpiCard from "./KpiCard";
import AdminReports from "./AdminReports";
// UpdateBsaleUrls component removed - Bsale integration removed

export default function AdminDashboard() {
  const [kpis, setKpis] = useState({
    monthGain: 0,
    pendingAll: 0,
    purchases: 0,
    warrantyOrders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Función para recargar KPIs
  const refreshKPIs = () => {
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { start: monthStart, end: monthEnd } = currentMonthRange();

        // Convertir fechas a UTC para evitar problemas de zona horaria
        const monthStartUTC = dateToUTCStart(monthStart);
        const monthEndUTC = dateToUTCEnd(monthEnd);

        // ⚠️ CAMBIO CRÍTICO: Para el mes, usar paid_at para órdenes pagadas (retrocompatibilidad)
        // Las órdenes pendientes se filtran por created_at ya que aún no tienen paid_at
        const currentPayout = getCurrentPayoutWeek();
        
        // Cargar órdenes pagadas del mes (por paid_at)
        const { data: paidOrders, error: paidError } = await supabase
          .from("orders")
          .select("*")
          .eq("status", "paid")
          .or(`and(paid_at.gte.${monthStartUTC.toISOString()},paid_at.lte.${monthEndUTC.toISOString()}),and(paid_at.is.null,created_at.gte.${monthStartUTC.toISOString()},created_at.lte.${monthEndUTC.toISOString()})`);

        if (paidError) {
          console.error("Error cargando órdenes pagadas:", paidError);
        }

        // Cargar TODAS las órdenes pendientes (sin límite de fecha)
        // El KPI "Pagos Pendientes a Técnicos" debe mostrar todas las órdenes pendientes
        const { data: pendingOrders, error: pendingError } = await supabase
          .from("orders")
          .select("*")
          .eq("status", "pending");

        if (pendingError) {
          console.error("Error cargando órdenes pendientes:", pendingError);
        }

        // Solo contar órdenes pagadas (con recibo) en las ganancias, excluyendo devueltas y canceladas
        const monthGain = (paidOrders || []).reduce(
          (s, r) => s + (r.commission_amount ?? 0),
          0
        );

        // Pendientes: recalcular comisión basándose en el medio de pago actual
        // (puede que hayan agregado el medio de pago después de crear la orden)
        const pendingAll = (pendingOrders || [])
          .reduce((s, r) => {
            // Si la orden tiene medio de pago, recalcular la comisión
            // Si no tiene medio de pago, usar la comisión almacenada (probablemente 0)
            const paymentMethod = (r.payment_method as PaymentMethod) || "";
            if (paymentMethod) {
              const recalculatedCommission = calcCommission({
                paymentMethod,
                costoRepuesto: r.replacement_cost ?? 0,
                precioTotal: r.repair_cost ?? 0,
              });
              return s + recalculatedCommission;
            }
            // Si no hay medio de pago, usar la comisión almacenada
            return s + (r.commission_amount ?? 0);
          }, 0);

        // Log para depuración
        if (pendingOrders && pendingOrders.length > 0) {
          const ordersWithPayment = pendingOrders.filter(o => o.payment_method).length;
          const ordersWithoutPayment = pendingOrders.length - ordersWithPayment;
          console.log(`📊 AdminDashboard - Órdenes pendientes: ${pendingOrders.length} total (${ordersWithPayment} con pago, ${ordersWithoutPayment} sin pago)`);
          console.log(`💰 AdminDashboard - Total pagos pendientes calculado: ${formatCLP(pendingAll)}`);
        }

        // Compras de la semana actual (pagadas, con proveedor)
        // ⚠️ CAMBIO: Filtrar por payout_week/payout_year para órdenes pagadas de la semana actual
        const purchases = (paidOrders || [])
          .filter(
            (r) =>
              (r.replacement_cost ?? 0) > 0 &&
              r.supplier_id &&
              r.payout_week === currentPayout.week &&
              r.payout_year === currentPayout.year
          )
          .reduce((s, r) => s + (r.replacement_cost ?? 0), 0);

        // Contar órdenes en garantía (returned o cancelled)
        const { data: warrantyOrdersData, error: warrantyError } = await supabase
          .from("orders")
          .select("id")
          .in("status", ["returned", "cancelled"]);

        if (warrantyError) {
          console.error("Error cargando órdenes en garantía:", warrantyError);
        }

        const warrantyOrders = warrantyOrdersData?.length || 0;

        setKpis({
          monthGain,
          pendingAll,
          purchases,
          warrantyOrders,
        });
      } catch (error) {
        console.error("Error general cargando KPIs:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [refreshKey]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
          Panel del Administrador
        </h1>
        <p className="text-sm sm:text-base text-slate-600">
          Supervisión y control de operaciones, pagos y proveedores
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title="Ganancia Total del Mes (Con Recibo)"
          value={formatCLP(kpis.monthGain)}
          icon="💰"
        />
        <KpiCard
          title="Pagos Pendientes a Técnicos"
          value={formatCLP(kpis.pendingAll)}
          icon="⏳"
        />
        <KpiCard
          title="Total Compras a Proveedores"
          value={formatCLP(kpis.purchases)}
          icon="🛒"
        />
        <KpiCard
          title="Órdenes en Garantía"
          value={kpis.warrantyOrders}
          icon="🛡️"
        />
      </div>

      <AdminReports key={refreshKey} />
    </div>
  );
}

