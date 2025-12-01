export type Role = "admin" | "technician";

export interface Profile {
  id: string;
  role: Role;
  name: string;
  last_name?: string | null;
  document_number?: string | null;
  email: string;
  avatar_url?: string | null;
  local?: string | null;
}

export interface Order {
  id: string;
  created_at: string;
  order_number: string;
  technician_id: string;
  supplier_id?: string | null;
  device: string;
  service_description: string;
  replacement_cost: number;
  repair_cost: number;
  payment_method: "EFECTIVO" | "TARJETA" | "TRANSFERENCIA" | "";
  receipt_number?: string | null;
  status: "pending" | "paid" | "returned" | "cancelled";
  commission_amount: number;
  // Campos de semana de pago - se asignan cuando status = 'paid' y nunca se recalculan
  paid_at?: string | null; // Fecha en que la orden fue pagada
  payout_week?: number | null; // Número de semana (1-53) en que fue pagada
  payout_year?: number | null; // Año en que fue pagada
  // Campos legacy (mantenidos para retrocompatibilidad, basados en created_at)
  week_start?: string | null;
  month?: number | null;
  year?: number | null;
}

export interface OrderNote {
  id: string;
  order_id: string;
  technician_id?: string | null;
  note: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_info?: string | null;
  created_at: string;
}

export interface SalaryAdjustment {
  id: string;
  created_at: string;
  technician_id: string;
  type: "advance" | "discount";
  amount: number;
  note?: string | null;
  available_from?: string | null;
}

export interface SalaryAdjustmentApplication {
  id: string;
  adjustment_id: string;
  technician_id: string;
  applied_amount: number;
  week_start: string;
  created_at: string;
  created_by?: string | null;
}

export interface SalarySettlement {
  id: string;
  technician_id: string;
  week_start: string;
  amount: number;
  note?: string | null;
  context?: "technician" | "admin";
  payment_method?: "efectivo" | "transferencia" | "otro" | null;
  details?: Record<string, any> | null;
  created_by?: string | null;
  created_at: string;
}

