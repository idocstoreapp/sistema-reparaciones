import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentMonthRange } from "@/lib/date";
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

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { start, end } = currentMonthRange();

      // Cargar todas las órdenes del mes
      const { data: allOrders } = await supabase
        .from("orders")
        .select("*")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (allOrders) {
        // Solo contar órdenes pagadas (con recibo) en las ganancias, excluyendo devueltas y canceladas
        const paidOrders = allOrders.filter((r) => r.status === "paid");
        const monthGain = paidOrders.reduce(
          (s, r) => s + (r.commission_amount ?? 0),
          0
        );
        const pendingAll = allOrders
          .filter((r) => r.status === "pending")
          .reduce((s, r) => s + (r.commission_amount ?? 0), 0);
        // Compras solo de órdenes pagadas (excluyendo devueltas y canceladas)
        const purchases = paidOrders.reduce(
          (s, r) => s + (r.replacement_cost ?? 0),
          0
        );

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
  }, []);

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
          value={`$${kpis.monthGain.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon="💰"
        />
        <KpiCard
          title="Pagos Pendientes a Técnicos"
          value={`$${kpis.pendingAll.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon="⏳"
        />
        <KpiCard
          title="Total Compras a Proveedores"
          value={`$${kpis.purchases.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon="🛒"
        />
        <KpiCard
          title="Órdenes en Garantía"
          value={kpis.warrantyOrders}
          icon="🛡️"
        />
      </div>

      <AdminReports />

      <SupplierPurchases />

      <UserManagement />

      <div className="grid grid-cols-1 gap-6">
        <TechnicianPayments />
        <OrdersTable isAdmin={true} onUpdate={() => {}} />
      </div>
    </div>
  );
}

