import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatCLP } from "@/lib/currency";
import type { Profile, Branch } from "@/types";
import SmallExpenses from "./SmallExpenses";
import KpiCard from "./KpiCard";

export default function EncargadoDashboard() {
  const [me, setMe] = useState<Profile | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [summary, setSummary] = useState({
    total_small_expenses: 0,
    total_repuestos: 0,
  });

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  async function loadData() {
    setLoading(true);
    try {
      // Cargar perfil del usuario
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setMe(profileData as Profile);

        // Cargar sucursal
        if (profileData.sucursal_id) {
          const { data: branchData } = await supabase
            .from("branches")
            .select("*")
            .eq("id", profileData.sucursal_id)
            .single();

          if (branchData) {
            setBranch(branchData as Branch);
            await loadSummary(branchData.id);
          }
        }
      }
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary(branchId: string) {
    try {
      // Gastos hormiga de la sucursal
      const { data: smallExpenses } = await supabase
        .from("small_expenses")
        .select("monto")
        .eq("sucursal_id", branchId);

      const total_small_expenses = (smallExpenses || []).reduce((sum, exp) => sum + (exp.monto || 0), 0);

      // Repuestos de la sucursal (de órdenes pagadas)
      const { data: orders } = await supabase
        .from("orders")
        .select("replacement_cost")
        .eq("status", "paid")
        .eq("sucursal_id", branchId);

      const total_repuestos = (orders || []).reduce((sum, order) => sum + (order.replacement_cost || 0), 0);

      setSummary({
        total_small_expenses,
        total_repuestos,
      });
    } catch (err) {
      console.error("Error cargando resumen:", err);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-slate-600">Cargando...</p>
      </div>
    );
  }

  if (!me || !branch) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded">
          <p className="font-semibold">⚠️ Configuración incompleta</p>
          <p className="text-sm mt-1">
            No tienes una sucursal asignada. Contacta al administrador para que te asigne una sucursal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Panel del Encargado
        </h1>
        <p className="text-slate-600">
          {branch.name} • Gestiona los gastos hormiga de tu sucursal
        </p>
      </div>

      {/* KPIs de la Sucursal */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <KpiCard
          title="Total Gastos Hormiga"
          value={formatCLP(summary.total_small_expenses)}
          icon="🐜"
        />
        <KpiCard
          title="Total Repuestos"
          value={formatCLP(summary.total_repuestos)}
          icon="🔧"
        />
      </div>

      {/* Componente de Gastos Hormiga */}
      <SmallExpenses sucursalId={branch.id} refreshKey={refreshKey} />

      {/* Botón para refrescar */}
      <div className="flex justify-end">
        <button
          onClick={() => setRefreshKey(prev => prev + 1)}
          className="px-4 py-2 bg-brand-light text-white rounded-md hover:bg-brand transition font-medium"
        >
          🔄 Actualizar Datos
        </button>
      </div>
    </div>
  );
}

