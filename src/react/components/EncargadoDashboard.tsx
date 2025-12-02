import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile, Branch } from "@/types";
import SmallExpenses from "./SmallExpenses";
import TechnicianPayments from "./TechnicianPayments";
import OrdersTable from "./OrdersTable";

export default function EncargadoDashboard() {
  const [me, setMe] = useState<Profile | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeSection, setActiveSection] = useState<"expenses" | "payments" | "orders">("expenses");

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
          }
        }
      }
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
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
          {branch.name} • Gestión de tu sucursal
        </p>
      </div>

      {/* Navegación por secciones */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveSection("expenses")}
            className={`px-4 py-2 rounded-md transition font-medium ${
              activeSection === "expenses"
                ? "bg-brand-light text-white"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
            }`}
          >
            🐜 Gastos Hormiga
          </button>
          <button
            onClick={() => setActiveSection("payments")}
            className={`px-4 py-2 rounded-md transition font-medium ${
              activeSection === "payments"
                ? "bg-brand-light text-white"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
            }`}
          >
            💵 Pago a Técnicos
          </button>
          <button
            onClick={() => setActiveSection("orders")}
            className={`px-4 py-2 rounded-md transition font-medium ${
              activeSection === "orders"
                ? "bg-brand-light text-white"
                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
            }`}
          >
            🔧 Historial de Órdenes
          </button>
        </div>
      </div>

      {/* Contenido según sección activa */}
      {activeSection === "expenses" && (
        <SmallExpenses sucursalId={branch.id} refreshKey={refreshKey} />
      )}

      {activeSection === "payments" && (
        <TechnicianPaymentsForBranch 
          branchId={branch.id} 
          refreshKey={refreshKey} 
        />
      )}

      {activeSection === "orders" && (
        <OrdersTableForBranch 
          branchId={branch.id} 
          refreshKey={refreshKey} 
        />
      )}

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

// Componente para pagos a técnicos filtrado por sucursal
function TechnicianPaymentsForBranch({ branchId, refreshKey }: { branchId: string; refreshKey: number }) {
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTechnicians();
  }, [branchId, refreshKey]);

  async function loadTechnicians() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("role", "technician")
        .eq("sucursal_id", branchId)
        .order("name");

      if (error) throw error;
      setTechnicians(data || []);
    } catch (err) {
      console.error("Error cargando técnicos:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-slate-600">Cargando técnicos...</p>
      </div>
    );
  }

  if (technicians.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-slate-600">No hay técnicos asignados a esta sucursal.</p>
      </div>
    );
  }

  // Usar el componente TechnicianPayments pero filtrando solo técnicos de esta sucursal
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        Pago a Técnicos de tu Sucursal
      </h2>
      <TechnicianPayments 
        refreshKey={refreshKey} 
        branchId={branchId}
        technicianIds={technicians.map(t => t.id)}
      />
    </div>
  );
}

// Componente para órdenes filtradas por sucursal
function OrdersTableForBranch({ branchId, refreshKey }: { branchId: string; refreshKey: number }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        Historial de Órdenes de tu Sucursal
      </h2>
      <OrdersTable 
        isAdmin={false}
        branchId={branchId}
        refreshKey={refreshKey}
      />
    </div>
  );
}


