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
  | "branches"
  | "metrics";

interface SidebarProps {
  currentSection: DashboardSection;
  onSectionChange: (section: DashboardSection) => void;
  userRole: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ currentSection, onSectionChange, userRole, isOpen, onClose }: SidebarProps) {
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
    adminOnly?: boolean;
    encargadoOnly?: boolean;
  }> = [
    {
      id: "dashboard",
      label: "Dashboard"
    },
    {
      id: "reports",
      label: "Reportes Administrativos",
      adminOnly: true,
    },
    {
      id: "suppliers",
      label: "Compra a Proveedores",
      adminOnly: true,
    },
    {
      id: "users",
      label: "Gestión de Usuarios",
      adminOnly: true,
    },
    {
      id: "payments",
      label: "Pago a Técnicos",
      adminOnly: true, // El encargado ve esto dentro de su dashboard, no como sección separada
    },
    {
      id: "orders",
      label: "Órdenes de Reparación",
      // Tanto admin como encargado pueden ver órdenes, pero el encargado solo ve las de su sucursal
    },
    {
      id: "branches",
      label: "Gestión de Sucursales y Gastos",
      // Tanto admin como encargado pueden ver esto, pero el encargado solo ve/agrega gastos hormiga de su sucursal
    },
    {
      id: "metrics",
      label: "Métricas y Análisis",
      adminOnly: true,
    },
  ];

  // Filtrar items según el rol
  const visibleItems = menuItems.filter((item) => {
    if (item.adminOnly && userRole !== "admin") return false;
    if (item.encargadoOnly && userRole !== "encargado") return false;
    return true;
  });

  return (
    <>
      {/* Overlay para móvil */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static
          top-20 left-0
          w-64 bg-blue-200 border-r border-slate-200
          min-h-[calc(100vh-5rem)] h-[calc(100vh-5rem)]
          pb-4 overflow-y-auto
          z-50 lg:z-10
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Botón cerrar en móvil */}
        <div className="lg:hidden flex justify-end p-4 border-b border-slate-200">
          <button
            onClick={onClose}
            className="text-slate-600 hover:text-slate-900 p-2"
            aria-label="Cerrar menú"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="px-4 space-y-1 pt-4">
          {visibleItems.map((item) => {
            const isActive = currentSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSectionChange(item.id);
                  // Cerrar sidebar en móvil al seleccionar una opción
                  if (window.innerWidth < 1024) {
                    onClose();
                  }
                }}
                className={`w-full max-w-[200px] flex items-center justify-center gap-3 px-4 py-3 rounded-md transition-colors ${
                  isActive
                    ? "bg-brand text-white shadow-md"
                    : "text-slate-700 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                
                <span className="font-medium text-sm">{item.label}</span>
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
    </>
  );
}

