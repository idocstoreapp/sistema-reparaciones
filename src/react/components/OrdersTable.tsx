import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDate, currentWeekRange } from "@/lib/date";
import type { Order, OrderNote } from "@/types";
import { validateBsaleDocument, checkReceiptNumberExists } from "@/lib/bsale";
import { calcCommission } from "@/lib/commission";
import type { PaymentMethod } from "@/lib/commission";

interface OrdersTableProps {
  technicianId?: string;
  refreshKey?: number;
  onUpdate?: () => void;
}

export default function OrdersTable({ technicianId, refreshKey = 0, onUpdate }: OrdersTableProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"all" | "paid" | "pending">("all");
  const [periodFilter, setPeriodFilter] = useState<"all" | "current_week">("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReceipt, setEditReceipt] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>("");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [notesByOrder, setNotesByOrder] = useState<Record<string, OrderNote[]>>({});
  const [notesLoading, setNotesLoading] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteFormVisible, setNoteFormVisible] = useState<Record<string, boolean>>({});
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});
  const [notesError, setNotesError] = useState<Record<string, string | null>>({});

  async function load() {
    setLoading(true);
    let q = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (technicianId) {
      q = q.eq("technician_id", technicianId);
    }

    const { data, error } = await q;
    
    if (error) {
      console.error("Error loading orders:", error);
      setOrders([]);
    } else {
      setOrders((data as Order[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [technicianId, refreshKey]);

  const filtered = useMemo(() => {
    let weekStart: Date | null = null;
    let weekEnd: Date | null = null;

    if (periodFilter === "current_week") {
      const { start } = currentWeekRange();
      weekStart = new Date(start);
      weekStart.setHours(0, 0, 0, 0);
      weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 4); // lunes a viernes
      weekEnd.setHours(23, 59, 59, 999);
    }

    const orderQuery = orderSearch.trim().toLowerCase();

    return orders.filter((o) => {
      if (filter !== "all" && o.status !== filter) {
        return false;
      }

      if (periodFilter === "current_week" && weekStart && weekEnd) {
        const created = new Date(o.created_at);
        if (created < weekStart || created > weekEnd) {
          return false;
        }
      }

      if (orderQuery) {
        const orderNumber = (o.order_number || "").toLowerCase();
        if (!orderNumber.includes(orderQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [orders, filter, periodFilter, orderSearch]);

  async function handleUpdateReceipt(orderId: string) {
    if (!editReceipt.trim()) {
      alert("Por favor ingresa un número de recibo");
      return;
    }

    // Obtener la orden actual para recalcular la comisión
    const currentOrder = orders.find((o) => o.id === orderId);
    if (!currentOrder) {
      alert("Error: No se encontró la orden");
      return;
    }

    // Validar número de boleta con Bsale (OPCIONAL - no bloquea si falla)
    let bsaleData: { number?: string; url?: string; totalAmount?: number } | null = null;
    
    // Intentar validar con Bsale, pero no bloquear si falla
    try {
      const bsaleValidation = await validateBsaleDocument(editReceipt.trim());
      
      // Solo usar datos de Bsale si la validación fue exitosa
      if (bsaleValidation.exists && bsaleValidation.document) {
        bsaleData = bsaleValidation.document;
      } else {
        // Si no existe o hay error, solo registrar en consola pero continuar
        if (bsaleValidation.error) {
          console.warn("Bsale validation skipped:", bsaleValidation.error);
        }
      }
    } catch (error) {
      // Si hay cualquier error, continuar sin validación
      console.warn("Bsale validation error, continuing without validation:", error);
    }

    // Verificar duplicados en la base de datos (excluyendo la orden actual)
    const isDuplicate = await checkReceiptNumberExists(editReceipt.trim(), orderId);
    if (isDuplicate) {
      alert("⚠️ Este número de boleta ya está registrado en otra orden");
      return;
    }

    // Recalcular comisión si hay método de pago
    const paymentMethodToUse = editPaymentMethod || currentOrder.payment_method || "";
    const newCommission = calcCommission({
      paymentMethod: paymentMethodToUse as PaymentMethod,
      costoRepuesto: currentOrder.replacement_cost || 0,
      precioTotal: currentOrder.repair_cost || 0,
    });

    const { error } = await supabase
      .from("orders")
      .update({
        receipt_number: editReceipt.trim(),
        payment_method: paymentMethodToUse || null,
        status: "paid",
        bsale_number: bsaleData?.number || null,
        bsale_url: bsaleData?.url || null,
        bsale_total_amount: bsaleData?.totalAmount || null,
        commission_amount: newCommission,
      })
      .eq("id", orderId);

    if (error) {
      alert(`Error: ${error.message}`);
    } else {
      setEditingId(null);
      setEditReceipt("");
      setEditPaymentMethod("");
      load(); // Recargar órdenes
      if (onUpdate) onUpdate(); // Notificar al componente padre
    }
  }

  async function fetchNotes(orderId: string) {
    setNotesLoading((prev) => ({ ...prev, [orderId]: true }));
    const { data, error } = await supabase
      .from("order_notes")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading order notes:", error);
      setNotesError((prev) => ({ ...prev, [orderId]: "No se pudieron cargar las notas. Intenta nuevamente." }));
      setNotesByOrder((prev) => ({ ...prev, [orderId]: [] }));
    } else {
      setNotesError((prev) => ({ ...prev, [orderId]: null }));
      setNotesByOrder((prev) => ({ ...prev, [orderId]: (data as OrderNote[]) ?? [] }));
    }
    setNotesLoading((prev) => ({ ...prev, [orderId]: false }));
  }

  async function toggleNotes(orderId: string) {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      setNoteFormVisible((prev) => ({ ...prev, [orderId]: false }));
      return;
    }
    setExpandedOrderId(orderId);
    if (!notesByOrder[orderId]) {
      await fetchNotes(orderId);
    }
  }

  async function handleAddNote(orderId: string) {
    const content = (noteDrafts[orderId] || "").trim();

    if (!content) {
      alert("Escribe una nota antes de guardar.");
      return;
    }

    setSavingNotes((prev) => ({ ...prev, [orderId]: true }));
    const { data, error } = await supabase
      .from("order_notes")
      .insert({
        order_id: orderId,
        technician_id: technicianId || null,
        note: content,
      })
      .select()
      .maybeSingle();
    setSavingNotes((prev) => ({ ...prev, [orderId]: false }));

    if (error) {
      console.error("Error saving order note:", error);
      alert("No pudimos guardar la nota. Intenta nuevamente.");
      return;
    }

    if (data) {
      setNotesByOrder((prev) => ({
        ...prev,
        [orderId]: [data as OrderNote, ...(prev[orderId] || [])],
      }));
      setNoteDrafts((prev) => ({ ...prev, [orderId]: "" }));
      setNoteFormVisible((prev) => ({ ...prev, [orderId]: false }));
    } else {
      await fetchNotes(orderId);
    }
  }

  function openNoteForm(orderId: string) {
    setNoteFormVisible((prev) => ({ ...prev, [orderId]: true }));
  }

  function cancelNoteForm(orderId: string) {
    setNoteDrafts((prev) => ({ ...prev, [orderId]: "" }));
    setNoteFormVisible((prev) => ({ ...prev, [orderId]: false }));
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center text-slate-500">Cargando órdenes...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-center lg:justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Órdenes de Reparación</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <input
            type="text"
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            placeholder="Buscar por N° de orden..."
            value={orderSearch}
            onChange={(e) => setOrderSearch(e.target.value)}
          />
          <select
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as "all" | "current_week")}
          >
            <option value="all">Todas las semanas</option>
            <option value="current_week">Semana actual (L-V)</option>
          </select>
        <select
          className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
        >
            <option value="all">Todos los estados</option>
          <option value="paid">Con recibo (Pagadas)</option>
          <option value="pending">Pendientes</option>
        </select>
        </div>
      </div>
      
      {filtered.length === 0 ? (
        <div className="text-center text-slate-500 py-8">No hay órdenes registradas</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-200">
                <th className="py-3 px-2 font-semibold text-slate-700">Fecha</th>
                <th className="py-3 px-2 font-semibold text-slate-700">N° Orden</th>
                <th className="py-3 px-2 font-semibold text-slate-700">Equipo</th>
                <th className="py-3 px-2 font-semibold text-slate-700">Servicio</th>
                <th className="py-3 px-2 font-semibold text-slate-700">Método de Pago</th>
                <th className="py-3 px-2 font-semibold text-slate-700">Estado</th>
                <th className="py-3 px-2 font-semibold text-slate-700">N° Recibo</th>
                <th className="py-3 px-2 font-semibold text-slate-700">Comisión</th>
                <th className="py-3 px-2 font-semibold text-slate-700">Notas</th>
                {technicianId && <th className="py-3 px-2 font-semibold text-slate-700">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <Fragment key={o.id}>
                  <tr className={`border-b ${expandedOrderId === o.id ? "border-transparent" : "border-slate-100"} hover:bg-slate-50`}>
                  <td className="py-3 px-2">{formatDate(o.created_at)}</td>
                    <td className="py-3 px-2">{o.order_number || "-"}</td>
                  <td className="py-3 px-2">{o.device}</td>
                  <td className="py-3 px-2 text-slate-600">{o.service_description}</td>
                  <td className="py-3 px-2">{o.payment_method || "-"}</td>
                  <td className="py-3 px-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        o.status === "pending"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {o.status === "pending" ? "Pendiente" : "Pagado"}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    {editingId === o.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          className="w-32 border border-slate-300 rounded-md px-2 py-1 text-sm"
                          value={editReceipt}
                          onChange={(e) => setEditReceipt(e.target.value)}
                          placeholder="N° Recibo"
                          autoFocus
                        />
                        <select
                          className="w-32 border border-slate-300 rounded-md px-2 py-1 text-sm"
                          value={editPaymentMethod || o.payment_method || ""}
                          onChange={(e) => setEditPaymentMethod(e.target.value as PaymentMethod)}
                        >
                          <option value="">Sin método</option>
                          <option value="EFECTIVO">Efectivo</option>
                          <option value="TARJETA">Tarjeta</option>
                          <option value="TRANSFERENCIA">Transferencia</option>
                        </select>
                      </div>
                    ) : o.receipt_number ? (
                      <span className="text-slate-700">{o.receipt_number}</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-2 font-semibold text-brand">
                    ${o.commission_amount?.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) || "0"}
                  </td>
                    <td className="py-3 px-2">
                      <button
                        type="button"
                        onClick={() => void toggleNotes(o.id)}
                        className="px-3 py-1 border border-slate-300 text-xs rounded hover:bg-slate-100 transition"
                      >
                        {expandedOrderId === o.id ? "Ocultar notas" : "Ver notas"}
                      </button>
                    </td>
                  {technicianId && (
                    <td className="py-3 px-2">
                      {editingId === o.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateReceipt(o.id)}
                            className="px-3 py-1 bg-brand-light text-brand-white text-xs rounded hover:bg-white hover:text-brand border border-brand-light hover:border-white transition font-medium"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditReceipt("");
                              setEditPaymentMethod("");
                            }}
                            className="px-3 py-1 bg-slate-200 text-slate-700 text-xs rounded hover:bg-slate-300 transition"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : o.status === "pending" ? (
                        <button
                          onClick={() => {
                            setEditingId(o.id);
                            setEditReceipt(o.receipt_number || "");
                            setEditPaymentMethod((o.payment_method as PaymentMethod) || "");
                          }}
                          className="px-3 py-1 bg-brand-light text-brand-white text-xs rounded hover:bg-white hover:text-brand border-2 border-brand-light hover:border-white transition font-medium"
                        >
                          Agregar Recibo
                        </button>
                      ) : null}
                    </td>
                  )}
                </tr>
                  {expandedOrderId === o.id && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={technicianId ? 9 : 8} className="px-4 py-4">
                        <div className="space-y-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="text-sm font-semibold text-slate-800">Notas de la orden</h4>
                              <p className="text-xs text-slate-500">
                                Estas notas quedan visibles solo dentro de este panel.
                              </p>
                            </div>
                          </div>

                          {notesLoading[o.id] ? (
                            <div className="text-sm text-slate-500">Cargando notas...</div>
                          ) : (notesByOrder[o.id]?.length ?? 0) > 0 ? (
                            <ul className="space-y-2">
                              {notesByOrder[o.id]!.map((note) => (
                                <li
                                  key={note.id}
                                  className="border border-slate-200 bg-white rounded-md px-3 py-2"
                                >
                                  <div className="text-xs text-slate-500 mb-1">
                                    {new Date(note.created_at).toLocaleString("es-CL", {
                                      dateStyle: "short",
                                      timeStyle: "short",
                                    })}
                                  </div>
                                  <p className="text-sm text-slate-700 whitespace-pre-line">{note.note}</p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-sm text-slate-500">
                              {notesError[o.id]
                                ? "No se encontraron notas. Usa “Agregar nota” para dejar la primera."
                                : "Aún no hay notas. Usa “Agregar nota” para dejar la primera observación."}
                            </div>
                          )}

                          {noteFormVisible[o.id] ? (
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-slate-600">
                                Nueva nota
                              </label>
                              <textarea
                                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm resize-y min-h-[80px]"
                                placeholder="Escribe una observación..."
                                value={noteDrafts[o.id] || ""}
                                onChange={(e) =>
                                  setNoteDrafts((prev) => ({ ...prev, [o.id]: e.target.value }))
                                }
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => cancelNoteForm(o.id)}
                                  className="px-4 py-2 border border-slate-300 text-xs rounded-md hover:bg-slate-100 transition"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleAddNote(o.id)}
                                  disabled={savingNotes[o.id]}
                                  className="px-4 py-2 bg-brand-light text-brand-white text-xs rounded-md hover:bg-white hover:text-brand border border-brand-light hover:border-white transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                >
                                  {savingNotes[o.id] ? "Guardando..." : "Guardar nota"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => openNoteForm(o.id)}
                                className="px-4 py-2 border border-dashed border-brand text-brand text-xs rounded-md hover:bg-brand/5 transition"
                              >
                                Agregar nota
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

