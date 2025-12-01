import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatCLP } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import type { GeneralExpense, Branch, Profile } from "@/types";

interface GeneralExpensesProps {
  sucursalId?: string; // Opcional: si se pasa, filtra por sucursal
  refreshKey?: number;
}

export default function GeneralExpenses({ sucursalId, refreshKey = 0 }: GeneralExpensesProps) {
  const [expenses, setExpenses] = useState<GeneralExpense[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    sucursal_id: sucursalId || "",
    tipo: "arriendo" as "arriendo" | "internet" | "luz" | "agua" | "facturas" | "servicios",
    monto: "",
    fecha: new Date().toISOString().split("T")[0],
    descripcion: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [sucursalId, refreshKey]);

  async function loadData() {
    setLoading(true);
    try {
      // Cargar sucursales primero
      const { data: branchesData } = await supabase
        .from("branches")
        .select("*")
        .order("name");

      setBranches(branchesData || []);

      // Cargar gastos generales
      let query = supabase
        .from("general_expenses")
        .select(`
          *,
          branch:branches(*),
          user:users(id, name, email)
        `)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false });

      if (sucursalId) {
        query = query.eq("sucursal_id", sucursalId);
      }

      const { data: expensesData, error: expensesError } = await query;

      if (expensesError) throw expensesError;

      setExpenses(expensesData || []);
    } catch (err) {
      console.error("Error cargando gastos generales:", err);
      setError("Error al cargar los gastos. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!formData.sucursal_id) {
      setError("Debes seleccionar una sucursal");
      return;
    }

    if (!formData.monto || parseFloat(formData.monto) <= 0) {
      setError("El monto debe ser mayor a 0");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario no autenticado");

      const { error: insertError } = await supabase
        .from("general_expenses")
        .insert({
          sucursal_id: formData.sucursal_id,
          user_id: user.id,
          tipo: formData.tipo,
          monto: parseFloat(formData.monto),
          fecha: formData.fecha,
          descripcion: formData.descripcion.trim() || null,
        });

      if (insertError) throw insertError;

      // Limpiar formulario
      setFormData({
        sucursal_id: sucursalId || "",
        tipo: "arriendo",
        monto: "",
        fecha: new Date().toISOString().split("T")[0],
        descripcion: "",
      });
      setShowForm(false);
      await loadData();
    } catch (err: any) {
      console.error("Error guardando gasto:", err);
      setError(err.message || "Error al guardar el gasto. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  const totalByType = expenses.reduce((acc, exp) => {
    acc[exp.tipo] = (acc[exp.tipo] || 0) + exp.monto;
    return acc;
  }, {} as Record<string, number>);

  const total = expenses.reduce((sum, exp) => sum + exp.monto, 0);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <p className="text-slate-600">Cargando gastos generales...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">
          Gastos Generales {sucursalId ? "(Filtrado por Sucursal)" : "(Todas las Sucursales)"}
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition font-medium"
        >
          {showForm ? "Cancelar" : "+ Nuevo Gasto"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 p-4 rounded-lg space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Sucursal *
              </label>
              <select
                value={formData.sucursal_id}
                onChange={(e) => setFormData({ ...formData, sucursal_id: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                required
                disabled={!!sucursalId}
              >
                <option value="">Selecciona una sucursal</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tipo de Gasto *
              </label>
              <select
                value={formData.tipo}
                onChange={(e) => setFormData({ ...formData, tipo: e.target.value as any })}
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                required
              >
                <option value="arriendo">Arriendo</option>
                <option value="internet">Internet</option>
                <option value="luz">Luz</option>
                <option value="agua">Agua</option>
                <option value="facturas">Facturas</option>
                <option value="servicios">Servicios</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Monto (CLP) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.monto}
                onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                placeholder="0"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Fecha *
              </label>
              <input
                type="date"
                value={formData.fecha}
                onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Descripción (opcional)
              </label>
              <input
                type="text"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                placeholder="Ej: Pago de factura de servicios"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2 bg-brand-light text-white rounded-md hover:bg-brand transition font-medium disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar Gasto"}
          </button>
        </form>
      )}

      {/* Resumen por tipo */}
      <div className="grid grid-cols-6 gap-4">
        <div className="bg-slate-50 p-3 rounded">
          <p className="text-xs text-slate-600">Arriendo</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatCLP(totalByType["arriendo"] || 0)}
          </p>
        </div>
        <div className="bg-slate-50 p-3 rounded">
          <p className="text-xs text-slate-600">Internet</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatCLP(totalByType["internet"] || 0)}
          </p>
        </div>
        <div className="bg-slate-50 p-3 rounded">
          <p className="text-xs text-slate-600">Luz</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatCLP(totalByType["luz"] || 0)}
          </p>
        </div>
        <div className="bg-slate-50 p-3 rounded">
          <p className="text-xs text-slate-600">Agua</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatCLP(totalByType["agua"] || 0)}
          </p>
        </div>
        <div className="bg-slate-50 p-3 rounded">
          <p className="text-xs text-slate-600">Facturas/Servicios</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatCLP((totalByType["facturas"] || 0) + (totalByType["servicios"] || 0))}
          </p>
        </div>
        <div className="bg-brand-light/10 p-3 rounded border-2 border-brand-light">
          <p className="text-xs text-slate-600">Total</p>
          <p className="text-lg font-semibold text-brand">
            {formatCLP(total)}
          </p>
        </div>
      </div>

      {/* Tabla de gastos */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 font-semibold text-slate-700">Fecha</th>
              <th className="text-left py-2 px-2 font-semibold text-slate-700">Sucursal</th>
              <th className="text-left py-2 px-2 font-semibold text-slate-700">Tipo</th>
              <th className="text-left py-2 px-2 font-semibold text-slate-700">Descripción</th>
              <th className="text-right py-2 px-2 font-semibold text-slate-700">Monto</th>
              <th className="text-left py-2 px-2 font-semibold text-slate-700">Registrado por</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-4 text-slate-500">
                  No hay gastos registrados
                </td>
              </tr>
            ) : (
              expenses.map((exp) => (
                <tr key={exp.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-2">{formatDate(exp.fecha)}</td>
                  <td className="py-2 px-2">
                    {(exp.branch as Branch)?.name || "N/A"}
                  </td>
                  <td className="py-2 px-2">
                    <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                      {exp.tipo === "arriendo" ? "Arriendo" :
                       exp.tipo === "internet" ? "Internet" :
                       exp.tipo === "luz" ? "Luz" :
                       exp.tipo === "agua" ? "Agua" :
                       exp.tipo === "facturas" ? "Facturas" : "Servicios"}
                    </span>
                  </td>
                  <td className="py-2 px-2">{exp.descripcion || "-"}</td>
                  <td className="py-2 px-2 text-right font-medium">{formatCLP(exp.monto)}</td>
                  <td className="py-2 px-2 text-xs text-slate-600">
                    {(exp.user as Profile)?.name || "N/A"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

