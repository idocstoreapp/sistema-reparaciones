import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentMonthRange, currentWeekRange } from "@/lib/date";
import { formatCLP } from "@/lib/currency";
import { calcCommission } from "@/lib/commission";
import { getCurrentPayoutWeek } from "@/lib/payoutWeek";
import type { PaymentMethod } from "@/lib/commission";
import KpiCard from "./KpiCard";
import OrdersTable from "./OrdersTable";
import AdminReports from "./AdminReports";
import TechnicianPayments from "./TechnicianPayments";
import SupplierPurchases from "./SupplierPurchases";
import UserManagement from "./UserManagement";

export default function AdminDashboard() {
  const [kpis, setKpis] = useState({
    monthGain: 0,
    pendingAll: 0,
    purchases: 0,
    warrantyOrders: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [supplierPurchasesOpen, setSupplierPurchasesOpen] = useState(false);
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [technicianPaymentsOpen, setTechnicianPaymentsOpen] = useState(false);

  // Función para recargar KPIs
  const refreshKPIs = () => {
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { start: monthStart, end: monthEnd } = currentMonthRange();
      const { start: weekStart, end: weekEnd } = currentWeekRange();

      // ⚠️ CAMBIO CRÍTICO: Para el mes, usar paid_at para órdenes pagadas (retrocompatibilidad)
      // Las órdenes pendientes se filtran por created_at ya que aún no tienen paid_at
      const currentPayout = getCurrentPayoutWeek();
      
      // Cargar órdenes del mes: pagadas por paid_at, pendientes por created_at
      const { data: allOrders } = await supabase
        .from("orders")
        .select("*")
        .or(`and(status.eq.paid,paid_at.gte.${monthStart.toISOString()},paid_at.lte.${monthEnd.toISOString()}),and(status.eq.pending,created_at.gte.${monthStart.toISOString()},created_at.lte.${monthEnd.toISOString()}),and(status.in.(returned,cancelled),created_at.gte.${monthStart.toISOString()},created_at.lte.${monthEnd.toISOString()})`);

      if (allOrders) {
        // Solo contar órdenes pagadas (con recibo) en las ganancias, excluyendo devueltas y canceladas
        const paidOrders = allOrders.filter((r) => r.status === "paid");
        const monthGain = paidOrders.reduce(
          (s, r) => s + (r.commission_amount ?? 0),
          0
        );
        // Pendientes: recalcular comisión basándose en el medio de pago actual
        // (puede que hayan agregado el medio de pago después de crear la orden)
        const pendingAll = allOrders
          .filter((r) => r.status === "pending")
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
        // Compras de la semana actual (pagadas, con proveedor)
        // ⚠️ CAMBIO: Filtrar por payout_week/payout_year para órdenes pagadas de la semana actual
        const purchases = paidOrders
          .filter(
            (r) =>
              (r.replacement_cost ?? 0) > 0 &&
              r.supplier_id &&
              r.payout_week === currentPayout.week &&
              r.payout_year === currentPayout.year
          )
          .reduce((s, r) => s + (r.replacement_cost ?? 0), 0);

        setKpis({
          monthGain,
          pendingAll,
          purchases,
          warrantyOrders: 0, // TODO: implementar campo de garantía
        });
      }
      setLoading(false);
    }
    load();
  }, [refreshKey]);

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Panel del Administrador
        </h1>
        <p className="text-slate-600">
          Supervisión y control de operaciones, pagos y proveedores
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Card colapsable para Compras a Proveedores */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <button
          onClick={() => setSupplierPurchasesOpen(!supplierPurchasesOpen)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛒</span>
            <div className="text-left">
              <h3 className="text-lg font-semibold text-slate-900">
                Compras a Proveedores
              </h3>
              <p className="text-sm text-slate-600">
                Gestiona y consulta las compras realizadas a proveedores
              </p>
            </div>
          </div>
          <span className="text-slate-400 text-xl">
            {supplierPurchasesOpen ? "▼" : "▶"}
          </span>
        </button>
        {supplierPurchasesOpen && (
          <div className="border-t border-slate-200">
            <SupplierPurchases key={refreshKey} />
          </div>
        )}
      </div>

      {/* Card colapsable para Gestión de Usuarios */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <button
          onClick={() => setUserManagementOpen(!userManagementOpen)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">👥</span>
            <div className="text-left">
              <h3 className="text-lg font-semibold text-slate-900">
                Gestión de Usuarios
              </h3>
              <p className="text-sm text-slate-600">
                Administra técnicos y administradores del sistema
              </p>
            </div>
          </div>
          <span className="text-slate-400 text-xl">
            {userManagementOpen ? "▼" : "▶"}
          </span>
        </button>
        {userManagementOpen && (
          <div className="border-t border-slate-200">
            <UserManagement />
          </div>
        )}
      </div>

      {/* Card colapsable para Pago a Técnicos */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <button
          onClick={() => setTechnicianPaymentsOpen(!technicianPaymentsOpen)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">💵</span>
            <div className="text-left">
              <h3 className="text-lg font-semibold text-slate-900">
                Pago a Técnicos
              </h3>
              <p className="text-sm text-slate-600">
                Gestiona pagos, liquidaciones y ajustes de sueldo de técnicos
              </p>
            </div>
          </div>
          <span className="text-slate-400 text-xl">
            {technicianPaymentsOpen ? "▼" : "▶"}
          </span>
        </button>
        {technicianPaymentsOpen && (
          <div className="border-t border-slate-200">
            <TechnicianPayments key={refreshKey} />
          </div>
        )}
      </div>

      <OrdersTable isAdmin={true} onUpdate={refreshKPIs} />
    </div>
  );
}

