import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { currentWeekRange, formatDate } from "@/lib/date";
import { formatCLP } from "@/lib/currency";
import type { SalaryAdjustment, SalaryAdjustmentApplication } from "@/types";

interface SalarySettlementPanelProps {
  technicianId: string;
  technicianName?: string;
  baseAmount: number;
  adjustmentTotal: number;
  context: "technician" | "admin";
  onAfterSettlement?: () => void;
}

type AdjustmentWithPending = SalaryAdjustment & {
  remaining: number;
  appliedTotal: number;
  isCurrentWeek: boolean;
  availableFromDate: Date;
  isAvailableThisWeek: boolean;
};

export default function SalarySettlementPanel({
  technicianId,
  technicianName,
  baseAmount,
  adjustmentTotal,
  context,
  onAfterSettlement,
}: SalarySettlementPanelProps) {
  const [pendingAdjustments, setPendingAdjustments] = useState<AdjustmentWithPending[]>([]);
  const [adjustmentDrafts, setAdjustmentDrafts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [applicationsSupported, setApplicationsSupported] = useState(true);
  const [setupWarning, setSetupWarning] = useState<string | null>(null);
  const [settledAmount, setSettledAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "transferencia" | "otro">("efectivo");
  const [customAmountInput, setCustomAmountInput] = useState(0);
  const [deletingAdjustmentId, setDeletingAdjustmentId] = useState<string | null>(null);

  const { start: weekStartDate, end: weekEndDate } = currentWeekRange();
  const weekStartISO = weekStartDate.toISOString().slice(0, 10);

  async function loadPendingAdjustments() {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    async function fetchAdjustments(includeApplications: boolean) {
      const selectClause = includeApplications
        ? "*, applications:salary_adjustment_applications(applied_amount)"
        : "*";
      return await supabase
        .from("salary_adjustments")
        .select(selectClause)
        .eq("technician_id", technicianId)
        .order("created_at", { ascending: false });
    }

    let adjustmentsResponse = await fetchAdjustments(applicationsSupported);

    if (adjustmentsResponse.error && applicationsSupported) {
      const msg = adjustmentsResponse.error.message?.toLowerCase() ?? "";
      if (msg.includes("salary_adjustment_applications") || msg.includes("does not exist")) {
        setApplicationsSupported(false);
        setSetupWarning(
          "Para usar la liquidación parcial debes ejecutar el script `database/add_salary_adjustment_applications.sql` en Supabase y volver a intentarlo."
        );
        adjustmentsResponse = await fetchAdjustments(false);
      }
    }

    if (adjustmentsResponse.error) {
      console.error("Error cargando ajustes pendientes:", adjustmentsResponse.error);
      setPendingAdjustments([]);
      setAdjustmentDrafts({});
      setErrorMsg("No pudimos cargar los ajustes pendientes. Intenta nuevamente.");
      setLoading(false);
      return;
    }

    const adjustmentsData =
      (adjustmentsResponse.data ?? []) as unknown as (SalaryAdjustment & {
        applications?: SalaryAdjustmentApplication[];
      })[];

    const normalized: AdjustmentWithPending[] = adjustmentsData
      .map((adj) => {
        const applications = (adj as any)?.applications ?? [];
        const appliedTotal =
          applicationsSupported
            ? (applications as SalaryAdjustmentApplication[]).reduce(
                (sum, app) => sum + (app.applied_amount ?? 0),
                0
              ) ?? 0
            : 0;
        const remaining = Math.max((adj.amount ?? 0) - appliedTotal, 0);
        const createdDate = new Date(adj.created_at);
        const availableFromDate = adj.available_from
          ? new Date(adj.available_from)
          : new Date(createdDate);
        availableFromDate.setHours(0, 0, 0, 0);
        const isAvailableThisWeek = availableFromDate <= weekEndDate;
        return {
          ...adj,
          appliedTotal,
          remaining,
          availableFromDate,
          isAvailableThisWeek,
          isCurrentWeek: createdDate >= weekStartDate && createdDate <= weekEndDate,
        };
      })
      .filter((adj) => adj.remaining > 0);

    setPendingAdjustments(normalized);
    setAdjustmentDrafts((prev) => {
      const next: Record<string, number> = {};
      normalized.forEach((adj) => {
        const previousValue = prev[adj.id];
        if (!adj.isAvailableThisWeek) {
          next[adj.id] = 0;
          return;
        }
        if (typeof previousValue === "number") {
          next[adj.id] = Math.min(Math.max(previousValue, 0), adj.remaining);
        } else {
          next[adj.id] = adj.remaining;
        }
      });
      return next;
    });
    // Cargar liquidaciones registradas para la semana
    const settlementsResponse = await supabase
      .from("salary_settlements")
      .select("amount")
      .eq("technician_id", technicianId)
      .eq("week_start", weekStartISO);

    if (settlementsResponse.error) {
      console.error("Error cargando liquidaciones:", settlementsResponse.error);
      const msg = settlementsResponse.error.message?.toLowerCase() ?? "";
      if (msg.includes("salary_settlements") || msg.includes("does not exist")) {
        setSetupWarning((prev) =>
          prev
            ? prev
            : "Para registrar pagos completos ejecuta el script `database/add_salary_settlements.sql` en Supabase."
        );
        setSettledAmount(0);
      }
    } else {
      setSettledAmount(
        settlementsResponse.data?.reduce((sum, row) => sum + (row.amount ?? 0), 0) ?? 0
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    if (technicianId) {
      void loadPendingAdjustments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technicianId]);

  const selectedAdjustmentsTotal = useMemo(
    () =>
      pendingAdjustments.reduce((sum, adj) => {
        if (!adj.isAvailableThisWeek) {
          return sum;
        }
        const raw = adjustmentDrafts[adj.id];
        const value = Number.isFinite(raw) ? raw : adj.remaining;
        return sum + Math.min(Math.max(value ?? 0, 0), adj.remaining);
      }, 0),
    [pendingAdjustments, adjustmentDrafts]
  );

  const availableAdjustments = useMemo(
    () => pendingAdjustments.filter((adj) => adj.isAvailableThisWeek),
    [pendingAdjustments]
  );

  const deferredHoldback = useMemo(
    () =>
      pendingAdjustments.reduce((sum, adj) => {
        if (!adj.isAvailableThisWeek && adj.availableFromDate > weekEndDate) {
          return sum + adj.remaining;
        }
        return sum;
      }, 0),
    [pendingAdjustments, weekEndDate]
  );

  const totalAdjustable = useMemo(
    () => availableAdjustments.reduce((sum, adj) => sum + adj.remaining, 0),
    [availableAdjustments]
  );
  const grossAvailable = baseAmount - settledAmount;
  const minPayable = Math.max(grossAvailable - (totalAdjustable + deferredHoldback), 0);
  const maxPayable = Math.max(baseAmount + deferredHoldback, grossAvailable);
  const netRemaining = Math.max(grossAvailable - (selectedAdjustmentsTotal + deferredHoldback), 0);

  useEffect(() => {
    const defaultAmount = Math.max(minPayable, Math.min(netRemaining, maxPayable));
    setCustomAmountInput(defaultAmount);
  }, [minPayable, netRemaining, maxPayable]);

  function distributeDeduction(amountToDeduct: number) {
    let remaining = Math.max(0, Math.min(amountToDeduct, totalAdjustable));
    const next: Record<string, number> = {};
    pendingAdjustments.forEach((adj) => {
      if (!adj.isAvailableThisWeek) {
        next[adj.id] = 0;
        return;
      }
      if (remaining <= 0) {
        next[adj.id] = 0;
        return;
      }
      const apply = Math.min(adj.remaining, remaining);
      next[adj.id] = apply;
      remaining -= apply;
    });
    return next;
  }

  function applyPreset(mode: "net" | "full") {
    const target = mode === "full" ? maxPayable : minPayable;
    applyCustomAmount(target);
  }

  function applyCustomAmount(targetValue?: number) {
    const clamped = Math.max(minPayable, Math.min(targetValue ?? customAmountInput, maxPayable));
    const desiredDeduction = Math.max(
      0,
      Math.min(totalAdjustable, Math.max(grossAvailable - deferredHoldback - clamped, 0))
    );
    const nextDrafts = distributeDeduction(desiredDeduction);
    setCustomAmountInput(clamped);
    setAdjustmentDrafts(nextDrafts);
  }

  function handleDraftChange(adjId: string, value: string) {
    const target = pendingAdjustments.find((adj) => adj.id === adjId);
    if (!target || !target.isAvailableThisWeek) return;
    const numeric = Number(value);
    if (Number.isNaN(numeric)) {
      setAdjustmentDrafts((prev) => ({ ...prev, [adjId]: 0 }));
      return;
    }
    const clamped = Math.max(0, Math.min(numeric, target.remaining));
    setAdjustmentDrafts((prev) => ({ ...prev, [adjId]: clamped }));
  }

  function handleToggleAdjustment(adjId: string, enabled: boolean) {
    const target = pendingAdjustments.find((adj) => adj.id === adjId);
    if (!target || !target.isAvailableThisWeek) return;
    setAdjustmentDrafts((prev) => ({
      ...prev,
      [adjId]: enabled ? target.remaining : 0,
    }));
  }

  function formatAmount(amount: number) {
    return formatCLP(amount);
  }
  const canEditAdjustments = context === "admin";

  async function handleDeleteAdjustment(adjustmentId: string) {
    const target = pendingAdjustments.find((adj) => adj.id === adjustmentId);
    if (!target) {
      return;
    }
    const confirmed = window.confirm(
      `¿Eliminar este ajuste de sueldo (${target.type === "advance" ? "Adelanto" : "Descuento"} de ${formatAmount(target.amount ?? 0)})?`
    );
    if (!confirmed) {
      return;
    }
    setErrorMsg(null);
    setDeletingAdjustmentId(adjustmentId);
    const { error } = await supabase
      .from("salary_adjustments")
      .delete()
      .eq("id", adjustmentId)
      .eq("technician_id", technicianId);
    setDeletingAdjustmentId(null);
    if (error) {
      console.error("Error eliminando ajuste:", error);
      setErrorMsg("No pudimos eliminar el ajuste. Intenta nuevamente.");
      return;
    }
    await loadPendingAdjustments();
  }

  async function handleLiquidation() {
    const targetAmount = Math.max(minPayable, Math.min(customAmountInput, maxPayable));
    if (targetAmount <= 0) {
      setErrorMsg("No queda saldo por liquidar esta semana.");
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);

    setSaving(true);
    applyCustomAmount(targetAmount);

    const desiredDeduction = Math.max(
      0,
      Math.min(totalAdjustable, Math.max(grossAvailable - deferredHoldback - targetAmount, 0))
    );
    const draftsForSave = distributeDeduction(desiredDeduction);
    setAdjustmentDrafts(draftsForSave);
    setCustomAmountInput(targetAmount);

    const pendingEntries = pendingAdjustments.map((adj) => {
      if (!adj.isAvailableThisWeek) {
        return null;
      }
      const raw = draftsForSave[adj.id];
      const amountToApply = Math.min(Math.max(raw ?? 0, 0), adj.remaining);
      return {
        adjustment_id: adj.id,
        technician_id: technicianId,
        applied_amount: amountToApply,
      };
    });

    const entriesToApply = pendingEntries.filter(
      (entry): entry is NonNullable<typeof entry> => !!entry && entry.applied_amount > 0
    );
    const appliedById = entriesToApply.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.adjustment_id] = entry.applied_amount;
      return acc;
    }, {});

    if (applicationsSupported && entriesToApply.length > 0) {
      const payload = entriesToApply.map((entry) => ({
        ...entry,
        week_start: weekStartISO,
      }));
      const { error } = await supabase.from("salary_adjustment_applications").insert(payload);

      if (error) {
        console.error("Error registrando liquidación:", error);
        const msg = error.message?.toLowerCase() ?? "";
        if (msg.includes("salary_adjustment_applications") || msg.includes("does not exist")) {
          setApplicationsSupported(false);
          setSetupWarning(
            "Para guardar liquidaciones debes ejecutar el script `database/add_salary_adjustment_applications.sql` en Supabase."
          );
          setErrorMsg(
            "No pudimos registrar la liquidación porque falta la tabla de aplicaciones. Ejecuta el script indicado y vuelve a intentarlo."
          );
        } else {
          setErrorMsg("No pudimos registrar la liquidación. Intenta nuevamente.");
        }
        setSaving(false);
        return;
      }
    }

    const nextWeekStart = new Date(weekStartDate);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    nextWeekStart.setHours(0, 0, 0, 0);
    const nextWeekStartISO = nextWeekStart.toISOString().slice(0, 10);

    const carryOverAdjustments = pendingAdjustments
      .map((adj) => {
        if (!adj.isCurrentWeek || !adj.isAvailableThisWeek) return null;
        const raw = draftsForSave[adj.id] ?? 0;
        const leftover = Math.max(adj.remaining - raw, 0);
        if (leftover <= 0) return null;
        return { adj, leftover };
      })
      .filter((item): item is { adj: AdjustmentWithPending; leftover: number } => !!item);

    const carryOverSummary: { original_id: string; amount: number }[] = [];

    for (const item of carryOverAdjustments) {
      const { error: deferError } = await supabase
        .from("salary_adjustments")
        .update({
          available_from: nextWeekStartISO,
          note: item.adj.note
            ? `${item.adj.note} (pendiente ${formatDate(nextWeekStartISO)})`
            : `Pendiente desde ${formatDate(nextWeekStartISO)}`,
        })
        .eq("id", item.adj.id);

      if (deferError) {
        console.error("Error actualizando ajuste diferido:", deferError);
        setErrorMsg("No pudimos diferir parte de los descuentos. Intenta nuevamente.");
        setSaving(false);
        return;
      }

      carryOverSummary.push({ original_id: item.adj.id, amount: item.leftover });
    }

    const detailsPayload = {
      base_amount: baseAmount,
      selected_adjustments_total: selectedAdjustmentsTotal,
      settled_amount: targetAmount,
      adjustments: pendingAdjustments.map((adj) => {
        const applied = appliedById[adj.id] ?? 0;
        return {
          id: adj.id,
          type: adj.type,
          note: adj.note,
          amount: adj.amount,
          applied,
          omitted: Math.max(adj.remaining - applied, 0),
          carried_to_next_week:
            carryOverSummary.find((item) => item.original_id === adj.id)?.amount ?? 0,
        };
      }),
      carry_over: carryOverSummary,
    };

    const { data: userData } = await supabase.auth.getUser();
    const { error: settlementError } = await supabase.from("salary_settlements").insert({
      technician_id: technicianId,
      week_start: weekStartISO,
      amount: targetAmount,
      note: null,
      context,
      payment_method: paymentMethod,
      details: detailsPayload,
      created_by: userData?.user?.id ?? null,
    });

    setSaving(false);

    if (settlementError) {
      console.error("Error registrando pago:", settlementError);
      const msg = settlementError.message?.toLowerCase() ?? "";
      if (msg.includes("salary_settlements") || msg.includes("does not exist")) {
        setSetupWarning(
          "Para registrar pagos completos ejecuta el script `database/add_salary_settlements.sql` en Supabase."
        );
        setErrorMsg(
          "No pudimos registrar el pago porque falta la tabla de liquidaciones. Ejecuta el script indicado y vuelve a intentarlo."
        );
      } else {
        setErrorMsg("No pudimos registrar el pago. Intenta nuevamente.");
      }
      return;
    }

    setSuccessMsg("Liquidación registrada correctamente.");
    setPaymentMethod("efectivo");
    await loadPendingAdjustments();
    if (onAfterSettlement) {
      onAfterSettlement();
    }
  }

  const noAdjustments = pendingAdjustments.length === 0;
  const settlementInfo = (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <p className="text-xs text-slate-500">Base con recibo</p>
          <p className="text-lg font-semibold text-emerald-600">${formatAmount(baseAmount)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <p className="text-xs text-slate-500">Ajustes seleccionados</p>
          <p className="text-lg font-semibold text-slate-700">
            -${formatAmount(selectedAdjustmentsTotal)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <p className="text-xs text-slate-500">Liquidado esta semana</p>
          <p className="text-lg font-semibold text-sky-600">${formatAmount(settledAmount)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-3">
          <p className="text-xs text-slate-500">Saldo por liquidar</p>
          <p className="text-lg font-semibold text-brand">${formatAmount(netRemaining)}</p>
        </div>
      </div>
      {deferredHoldback > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm flex flex-col gap-1">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
            Pendiente próxima semana
          </p>
          <p className="text-lg font-semibold text-amber-700">
            ${formatAmount(deferredHoldback)}
          </p>
          <p className="text-xs text-amber-700">
            No se pagará esta semana y quedará pendiente para la próxima liquidación.
          </p>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="border border-slate-200 rounded-md p-4 text-sm text-slate-500">
        Cargando liquidación...
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-4 bg-slate-50">
      {setupWarning && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
          {setupWarning}
        </div>
      )}
      <div>
        <h5 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          {context === "admin" ? "Liquidación manual" : "Liquidación de sueldo"}
          {technicianName && <span className="text-xs text-slate-500">• {technicianName}</span>}
        </h5>
        <p className="text-xs text-slate-500">
          Ajusta cuánto descontarás esta semana. Los montos omitidos quedarán pendientes para la próxima
          liquidación.
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => applyPreset("net")}
            className="px-3 py-1 text-xs font-semibold border border-emerald-500 text-emerald-600 rounded-md hover:bg-emerald-50 transition"
          >
            Liquidar neto (aplicar descuentos)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("full")}
            className="px-3 py-1 text-xs font-semibold border border-slate-400 text-slate-600 rounded-md hover:bg-slate-100 transition"
          >
            Pagar sueldo completo (sin descuentos)
          </button>
          <label className="text-xs text-slate-500 flex items-center gap-2">
            Medio de pago:
            <select
              className="border border-slate-300 rounded-md px-2 py-1 text-xs"
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as "efectivo" | "transferencia" | "otro")
              }
            >
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="otro">Otro</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <label className="text-xs text-slate-500 flex flex-col gap-1">
            Monto a liquidar (rango ${formatAmount(minPayable)} - ${formatAmount(maxPayable)})
            <input
              type="number"
              className="border border-slate-300 rounded-md px-2 py-1 text-sm w-32"
              value={customAmountInput}
              min={minPayable}
              max={maxPayable}
              onChange={(e) => setCustomAmountInput(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={() => applyCustomAmount(customAmountInput)}
            className="px-3 py-1 text-xs font-semibold border border-slate-300 rounded-md hover:bg-slate-100 transition"
          >
            Aplicar monto
          </button>
        </div>
      </div>

      {settlementInfo}

      {noAdjustments ? (
        <div className="text-sm text-slate-500 bg-white border border-dashed border-slate-300 rounded-md p-4">
          {netRemaining <= 0
            ? "No hay saldo pendiente. Todo está liquidado 🎉"
            : `No hay ajustes pendientes esta semana. Puedes registrar el pago completo de $${formatAmount(
                netRemaining
              )} usando el botón.`}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Ajustes pendientes ({pendingAdjustments.length})
            </span>
            <span className="text-xs text-slate-500">
              Total seleccionado: ${formatAmount(selectedAdjustmentsTotal)}
            </span>
          </div>
          <div className="space-y-2">
            {pendingAdjustments.map((adj) => {
              const draftValue = adjustmentDrafts[adj.id] ?? (adj.isAvailableThisWeek ? adj.remaining : 0);
              const isOmitted = draftValue === 0;
              const isDeferred = !adj.isAvailableThisWeek;
              return (
                <div
                  key={adj.id}
                  className="bg-white border border-slate-200 rounded-md p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={`font-semibold ${
                          adj.type === "advance" ? "text-blue-600" : "text-red-600"
                        }`}
                      >
                        {adj.type === "advance" ? "Adelanto" : "Descuento"}
                      </span>
                      <span className="text-xs text-slate-400">
                        {adj.isCurrentWeek ? "Semana actual" : "Pendiente anterior"}
                      </span>
                    </div>
                    {adj.note && <p className="text-xs text-slate-600 mt-0.5">{adj.note}</p>}
                    <p className="text-xs text-slate-500 mt-1">
                      Registrado el {formatDate(adj.created_at)}
                    </p>
                    {isDeferred && (
                      <p className="text-xs text-amber-600 mt-1">
                        Disponible desde {formatDate(adj.availableFromDate)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="text-xs text-slate-600">
                      Pendiente:
                      <span className="font-semibold text-slate-900 ml-1">
                        ${formatAmount(adj.remaining)}
                      </span>
                    </div>
                    {canEditAdjustments ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={adj.remaining}
                          step={1000}
                          value={draftValue}
                          onChange={(e) => handleDraftChange(adj.id, e.target.value)}
                          disabled={isDeferred}
                          className={`w-28 border rounded-md px-2 py-1 text-sm ${
                            isDeferred ? "border-slate-200 bg-slate-100 text-slate-400" : "border-slate-300"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => handleToggleAdjustment(adj.id, isOmitted)}
                          disabled={isDeferred}
                          className={`text-xs font-medium px-3 py-1 rounded-md border ${
                            isDeferred
                              ? "border-slate-300 text-slate-400 cursor-not-allowed bg-slate-100"
                              : isOmitted
                                  ? "border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                                  : "border-red-500 text-red-600 hover:bg-red-50"
                          }`}
                        >
                          {isDeferred ? "Pendiente próxima semana" : isOmitted ? "Incluir" : "Omitir"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAdjustment(adj.id)}
                          disabled={deletingAdjustmentId === adj.id}
                          className="text-xs font-medium px-2 py-1 rounded-md border border-red-500 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Eliminar ajuste"
                        >
                          {deletingAdjustmentId === adj.id ? "..." : "🗑️"}
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        {isDeferred
                          ? "Se descontará la próxima semana."
                          : "Se descontará completo en la liquidación."}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {errorMsg && <div className="text-xs text-red-600">{errorMsg}</div>}
      {successMsg && <div className="text-xs text-emerald-600">{successMsg}</div>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => void loadPendingAdjustments()}
          className="px-4 py-2 text-xs border border-slate-300 rounded-md hover:bg-slate-100 transition"
          disabled={saving}
        >
          Actualizar
        </button>
        <button
          type="button"
          onClick={() => void handleLiquidation()}
          disabled={saving || netRemaining <= 0}
          className="px-4 py-2 text-xs font-semibold rounded-md text-white bg-brand-light hover:bg-white hover:text-brand border border-brand-light hover:border-white transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Guardando..." : "Registrar liquidación"}
        </button>
      </div>
    </div>
  );
}


