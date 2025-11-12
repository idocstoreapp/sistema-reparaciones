import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { calcCommission } from "@/lib/commission";
import type { PaymentMethod } from "@/lib/commission";
import type { Supplier } from "@/types";

interface OrderFormProps {
  technicianId: string;
  onSaved: () => void;
}

export default function OrderForm({ technicianId, onSaved }: OrderFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  
  const [orderNumber, setOrderNumber] = useState("");
  const [device, setDevice] = useState("");
  const [service, setService] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [replacementCost, setReplacementCost] = useState(0);
  const [precioTotal, setPrecioTotal] = useState(0); // Precio total cobrado (ya incluye repuesto)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [initialNote, setInitialNote] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadSuppliers() {
      const { data } = await supabase.from("suppliers").select("*").order("name");
      if (data) setSuppliers(data);
    }
    loadSuppliers();
  }, []);

  const commission = useMemo(
    () =>
      calcCommission({
        paymentMethod,
        costoRepuesto: replacementCost,
        precioTotal: precioTotal,
      }),
    [paymentMethod, replacementCost, precioTotal]
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!orderNumber || !device || !service || !paymentMethod) {
      alert("Por favor completa todos los campos obligatorios");
      return;
    }

    setLoading(true);
    const status = receiptNumber.trim() ? "paid" : "pending";
    
    const { data: createdOrder, error } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        technician_id: technicianId,
        supplier_id: supplierId || null,
        device,
        service_description: service,
        replacement_cost: replacementCost,
        repair_cost: precioTotal, // Precio total cobrado
        payment_method: paymentMethod,
        receipt_number: receiptNumber.trim() || null,
        status,
        commission_amount: commission,
      })
      .select()
      .maybeSingle();

    setLoading(false);

    if (error) {
      alert(`Error: ${error.message}`);
    } else {
      if (createdOrder && initialNote.trim()) {
        const { error: noteError } = await supabase.from("order_notes").insert({
          order_id: createdOrder.id,
          technician_id: technicianId,
          note: initialNote.trim(),
        });

        if (noteError) {
          console.error("Error guardando nota inicial:", noteError);
          alert("La orden se creó, pero hubo un problema al guardar la nota inicial.");
        }
      }

      onSaved();
      // Reset form
      setOrderNumber("");
      setDevice("");
      setService("");
      setSupplierId("");
      setReplacementCost(0);
      setPrecioTotal(0);
      setPaymentMethod("");
      setReceiptNumber("");
      setInitialNote("");
    }
  }

  return (
    <form onSubmit={save} className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Nueva Orden de Reparación</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2 bg-slate-50"
            type="date"
            value={today}
            readOnly
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">N° de Orden *</label>
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            placeholder="Ej: 23228"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Equipo (Marca y Modelo) *</label>
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            placeholder="Ej: iPhone 13 Pro"
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Servicio realizado *</label>
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            placeholder="Ej: Cambio de pantalla"
            value={service}
            onChange={(e) => setService(e.target.value)}
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Valor Repuesto ($)</label>
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={replacementCost || ""}
            onChange={(e) => setReplacementCost(Number(e.target.value) || 0)}
          />
          <p className="text-xs text-slate-500 mt-1">
            Costo del repuesto (solo informativo - ya está incluido en el precio total)
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Precio Total Cobrado ($) *</label>
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={precioTotal || ""}
            onChange={(e) => setPrecioTotal(Number(e.target.value) || 0)}
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            {paymentMethod === "EFECTIVO" 
              ? "Total cobrado al cliente en efectivo"
              : paymentMethod === "TARJETA" || paymentMethod === "TRANSFERENCIA"
              ? "Total cobrado al cliente (se aplicará descuento del 19% por impuesto automáticamente)"
              : "Total cobrado al cliente (incluye repuesto y mano de obra)"}
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Método de Pago *</label>
          <select
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            required
          >
            <option value="">Seleccionar...</option>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TARJETA">Tarjeta</option>
            <option value="TRANSFERENCIA">Transferencia</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Proveedor</label>
          <select
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Seleccionar proveedor...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">N° Recibo</label>
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            placeholder="Opcional - Requerido para marcar como pagada"
            value={receiptNumber}
            onChange={(e) => setReceiptNumber(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">
            Si no hay recibo, la orden quedará como pendiente
          </p>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
          <textarea
            className="w-full border border-slate-300 rounded-md px-3 py-2 min-h-[90px] resize-y"
            placeholder="Agrega observaciones relevantes para esta orden o descuentos de repuestos en stock..."
            value={initialNote}
            onChange={(e) => setInitialNote(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">
            Las notas quedarán visibles solo dentro del detalle oculto de la orden.
          </p>
        </div>
      </div>
      
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <div className="text-sm">
          <span className="text-slate-600">Ganancia calculada (40%): </span>
          <span className="font-semibold text-brand">${commission.toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-brand text-white rounded-md hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Guardando..." : "Registrar Orden de Reparación"}
        </button>
      </div>
    </form>
  );
}

