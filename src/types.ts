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
  status: "pending" | "paid";
  commission_amount: number;
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
}

