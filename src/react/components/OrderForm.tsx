import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { calcCommission } from "@/lib/commission";
import { formatCLP, formatCLPInput, parseCLPInput } from "@/lib/currency";
import type { PaymentMethod } from "@/lib/commission";
import type { Supplier } from "@/types";

interface OrderFormProps {
  technicianId: string;
  onSaved: () => void;
}

export default function OrderForm({ technicianId, onSaved }: OrderFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [orderDate, setOrderDate] = useState(today);
  const [orderNumber, setOrderNumber] = useState("");
  const [device, setDevice] = useState("");
  const [service, setService] = useState("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [replacementCost, setReplacementCost] = useState(0);
  const [precioTotal, setPrecioTotal] = useState(0); // Precio total cobrado (ya incluye repuesto)
  const handleReplacementCostChange = (value: string) => {
    if (value.trim() === "") {
      setReplacementCost(0);
      return;
    }
    setReplacementCost(parseCLPInput(value));
  };

  const handlePrecioTotalChange = (value: string) => {
    if (value.trim() === "") {
      setPrecioTotal(0);
      return;
    }
    setPrecioTotal(parseCLPInput(value));
  };
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [initialNote, setInitialNote] = useState("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierContact, setNewSupplierContact] = useState("");
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSuppliers() {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) {
        console.error("Error cargando proveedores:", error);
        setSupplierError("No pudimos cargar los proveedores. Intenta nuevamente.");
        return;
      }
      if (data) setSuppliers(data);
    }
    loadSuppliers();
  }, []);

  async function handleQuickCreateSupplier(e: React.FormEvent) {
    e.preventDefault();
    if (!newSupplierName.trim()) {
      setSupplierError("Ingresa un nombre de proveedor.");
      return;
    }
    setSupplierError(null);
    setCreatingSupplier(true);
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        name: newSupplierName.trim(),
        contact_info: newSupplierContact.trim() ? newSupplierContact.trim() : null,
      })
      .select()
      .maybeSingle();
    setCreatingSupplier(false);
    if (error) {
      console.error("Error creando proveedor:", error);
      setSupplierError("No pudimos crear el proveedor. Intenta nuevamente.");
      return;
    }
    if (data) {
      setSuppliers((prev) =>
        [...prev, data].sort((a, b) => a.name.localeCompare(b.name, "es"))
      );
      setSupplierId(data.id);
      setNewSupplierName("");
      setNewSupplierContact("");
      setSupplierFormOpen(false);
      setSupplierError(null);
      window.dispatchEvent(new CustomEvent("supplierCreated"));
    }
  }

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
    if (!orderNumber || !device || !service) {
      alert("Por favor completa todos los campos obligatorios");
      return;
    }

    setLoading(true);
    const status = receiptNumber.trim() ? "paid" : "pending";
    
    if (!orderDate) {
      alert("Selecciona una fecha válida para la orden.");
      setLoading(false);
      return;
    }

    // Crear fecha en UTC para evitar problemas de zona horaria
    // La fecha seleccionada viene en formato YYYY-MM-DD, crear Date en UTC
    const [year, month, day] = orderDate.split('-').map(Number);
    const createdAt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

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
        payment_method: paymentMethod || null,
        receipt_number: receiptNumber.trim() || null,
        status,
        commission_amount: commission,
        created_at: createdAt.toISOString(),
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
      setOrderDate(today);
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Fecha *</label>
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            type="date"
            max={today}
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            required
          />
          <p className="text-xs text-slate-500 mt-1">
            Puedes ajustar la fecha si estás registrando una orden atrasada.
          </p>
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
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={formatCLPInput(replacementCost)}
            onChange={(e) => handleReplacementCostChange(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">
            Costo del repuesto en CLP (solo informativo - ya está incluido en el precio total)
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Precio Total Cobrado ($) *</label>
          <input
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={formatCLPInput(precioTotal)}
            onChange={(e) => handlePrecioTotalChange(e.target.value)}
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
          <label className="block text-sm font-medium text-slate-700 mb-1">Método de Pago</label>
          <select
            className="w-full border border-slate-300 rounded-md px-3 py-2"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          >
            <option value="">Seleccionar...</option>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TARJETA">Tarjeta</option>
            <option value="TRANSFERENCIA">Transferencia</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Opcional - Se puede agregar después al agregar el recibo
          </p>
        </div>
        
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-slate-700">Proveedor</label>
            <button
              type="button"
              onClick={() => setSupplierFormOpen((prev) => !prev)}
              className="text-xs text-brand hover:text-brand-dark"
            >
              {supplierFormOpen ? "Cancelar" : "Agregar proveedor"}
            </button>
          </div>
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
          {supplierFormOpen && (
            <form
              onSubmit={handleQuickCreateSupplier}
              className="mt-3 space-y-2 border border-slate-200 rounded-md p-3 bg-slate-50"
            >
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nombre del proveedor *
                </label>
                <input
                  className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="Ej: Repuestos Rápidos"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Contacto (opcional)
                </label>
                <input
                  className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm"
                  value={newSupplierContact}
                  onChange={(e) => setNewSupplierContact(e.target.value)}
                  placeholder="Teléfono, Instagram, etc."
                />
              </div>
              {supplierError && (
                <p className="text-xs text-red-600">{supplierError}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={creatingSupplier}
                  className="px-3 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {creatingSupplier ? "Guardando..." : "Guardar y usar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSupplierFormOpen(false);
                    setSupplierError(null);
                  }}
                  className="px-3 py-1 text-xs font-semibold rounded-md border border-slate-300 text-slate-600 hover:bg-white"
                >
                  Cerrar
                </button>
              </div>
            </form>
          )}
          {!supplierFormOpen && supplierError && (
            <p className="text-xs text-red-600 mt-1">{supplierError}</p>
          )}
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
          <span className="font-semibold text-brand">{formatCLP(commission)}</span>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-brand-light text-brand-white rounded-md hover:bg-white hover:text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 border-brand-light hover:border-white font-medium"
        >
          {loading ? "Guardando..." : "Registrar Orden de Reparación"}
        </button>
      </div>
    </form>
  );
}

