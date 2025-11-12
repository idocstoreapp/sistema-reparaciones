import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentWeekRange, formatDate } from "@/lib/date";
import type { Order, Profile } from "@/types";

export default function AdminReports() {
  const [weekStart, setWeekStart] = useState(currentWeekRange().start);
  const [selectedTechnician, setSelectedTechnician] = useState<string>("all");
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [weeklyOrders, setWeeklyOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  useEffect(() => {
    async function loadTechnicians() {
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", "technician")
        .order("name");
      if (data) setTechnicians(data);
    }
    loadTechnicians();
  }, []);

  useEffect(() => {
    async function loadWeeklyReport() {
      setLoading(true);
      const { start, end } = currentWeekRange(weekStart);

      let q = supabase
        .from("orders")
        .select("*, technician:users!technician_id(name)")
        .eq("status", "paid") // Solo órdenes pagadas (con recibo), excluyendo devueltas y canceladas
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });

      if (selectedTechnician !== "all") {
        q = q.eq("technician_id", selectedTechnician);
      }

      const { data } = await q;
      setWeeklyOrders((data as Order[]) ?? []);
      setLoading(false);
    }
    loadWeeklyReport();
  }, [weekStart, selectedTechnician]);

  const totalWeek = weeklyOrders.reduce(
    (s, o) => s + (o.commission_amount ?? 0),
    0
  );

  async function handleDeleteOrder(orderId: string) {
    if (!confirm("¿Estás seguro de que deseas cancelar esta orden? La orden se marcará como cancelada y dejará de sumar a las ganancias, pero se mantendrá en el historial.")) {
      return;
    }

    setDeletingOrderId(orderId);

    try {
      // En lugar de eliminar, marcar como cancelada
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", orderId);

      if (error) {
        alert(`Error al cancelar la orden: ${error.message}`);
      } else {
        // Recargar órdenes
        const { start, end } = currentWeekRange(weekStart);
        let q = supabase
          .from("orders")
          .select("*, technician:users!technician_id(name)")
          .eq("status", "paid")
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())
          .order("created_at", { ascending: false });

        if (selectedTechnician !== "all") {
          q = q.eq("technician_id", selectedTechnician);
        }

        const { data } = await q;
        setWeeklyOrders((data as Order[]) ?? []);
      }
    } catch (error) {
      console.error("Error cancelling order:", error);
      alert("Error al cancelar la orden. Intenta nuevamente.");
    } finally {
      setDeletingOrderId(null);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">
        Reportes Administrativos
      </h3>

      <div className="mb-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Semana
            </label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={formatDate(weekStart).split("/").reverse().join("-")}
              onChange={(e) => setWeekStart(new Date(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Filtrar por Técnico
            </label>
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              value={selectedTechnician}
              onChange={(e) => setSelectedTechnician(e.target.value)}
            >
              <option value="all">Todos los técnicos</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <h4 className="font-medium text-slate-700 mb-2">
          Reporte Semanal de Técnicos (Solo órdenes con recibo)
        </h4>
        {loading ? (
          <div className="text-center text-slate-500 py-4">Cargando...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200">
                    <th className="py-2 px-2 font-semibold">Fecha</th>
                    <th className="py-2 px-2 font-semibold">Técnico</th>
                    <th className="py-2 px-2 font-semibold">Equipo</th>
                    <th className="py-2 px-2 font-semibold">Método de Pago</th>
                    <th className="py-2 px-2 font-semibold">Pago Entregado</th>
                    <th className="py-2 px-2 font-semibold">Estado</th>
                    <th className="py-2 px-2 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyOrders.map((o) => (
                    <tr key={o.id} className="border-b border-slate-100">
                      <td className="py-2 px-2">{formatDate(o.created_at)}</td>
                      <td className="py-2 px-2">
                        {(o as any).technician?.name || "N/A"}
                      </td>
                      <td className="py-2 px-2">{o.device}</td>
                      <td className="py-2 px-2">{o.payment_method || "-"}</td>
                      <td className="py-2 px-2">
                        ${o.commission_amount?.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || "0"}
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            o.status === "pending"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {o.status === "pending" ? "Pendiente" : "Pagado"}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <button
                          onClick={() => handleDeleteOrder(o.id)}
                          disabled={deletingOrderId === o.id}
                          className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingOrderId === o.id ? "..." : "Cancelar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-right">
              <span className="font-semibold text-slate-700">
                Total ganado esta semana: ${totalWeek.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

