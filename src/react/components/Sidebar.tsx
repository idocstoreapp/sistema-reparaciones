import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";

export type DashboardSection = 
  | "dashboard" 
  | "reports" 
  | "suppliers" 
  | "users" 
  | "payments" 
  | "orders" 
  | "branches";

interface SidebarProps {
  currentSection: DashboardSection;
  onSectionChange: (section: DashboardSection) => void;
  userRole: string;
}

export default function Sidebar({ currentSection, onSectionChange, userRole }: SidebarProps) {
  const [me, setMe] = useState<Profile | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        setMe(profile as Profile);
      }
    }
    loadProfile();
  }, []);

  // Solo mostrar sidebar para admin y encargados
  if (userRole !== "admin" && userRole !== "encargado") {
    return null;
  }

  const menuItems: Array<{
    id: DashboardSection;
    label: string;
    icon: string;
    adminOnly?: boolean;
    encargadoOnly?: boolean;
  }> = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "📊",
    },
    {
      id: "reports",
      label: "Reportes Administrativos",
      icon: "📈",
      adminOnly: true,
    },
    {
      id: "suppliers",
      label: "Compra a Proveedores",
      icon: "🛒",
      adminOnly: true,
    },
    {
      id: "users",
      label: "Gestión de Usuarios",
      icon: "👥",
      adminOnly: true,
    },
    {
      id: "payments",
      label: "Pago a Técnicos",
      icon: "💵",
      adminOnly: true, // El encargado ve esto dentro de su dashboard, no como sección separada
    },
    {
      id: "orders",
      label: "Órdenes de Reparación",
      icon: "🔧",
      // Tanto admin como encargado pueden ver órdenes, pero el encargado solo ve las de su sucursal
    },
    {
      id: "branches",
      label: "Gestión de Sucursales y Gastos",
      icon: "🏢",
      // Tanto admin como encargado pueden ver esto, pero el encargado solo ve/agrega gastos hormiga de su sucursal
    },
  ];

  // Filtrar items según el rol
  const visibleItems = menuItems.filter((item) => {
    if (item.adminOnly && userRole !== "admin") return false;
    if (item.encargadoOnly && userRole !== "encargado") return false;
    return true;
  });

  return (
    <aside className="w-64 bg-slate-50 border-r border-slate-200 min-h-screen fixed left-0 top-20 pb-4 overflow-y-auto z-10">
      <nav className="px-4 space-y-1 pt-4">
        {visibleItems.map((item) => {
          const isActive = currentSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                isActive
                  ? "bg-brand text-white shadow-md"
                  : "text-slate-700 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Información del usuario */}
      {me && (
        <div className="mt-8 px-4 border-t border-slate-200 pt-4">
          <div className="text-xs text-slate-500 mb-2">Usuario actual</div>
          <div className="text-sm font-medium text-slate-700">{me.name}</div>
          <div className="text-xs text-slate-500">
            {userRole === "admin" ? "Administrador" : "Encargado"}
          </div>
        </div>
      )}
    </aside>
  );
}

