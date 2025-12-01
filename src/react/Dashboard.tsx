import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";
import WeeklySummary from "./components/WeeklySummary";
import OrderForm from "./components/OrderForm";
import OrdersTable from "./components/OrdersTable";
import WeeklyReport from "./components/WeeklyReport";
import AdminDashboard from "./components/AdminDashboard";
import EncargadoDashboard from "./components/EncargadoDashboard";

function Header({ userName, userRole }: { userName: string; userRole: string }) {
  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="bg-brand shadow-lg border-b-2 border-brand-light mb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-32">
          <div className="flex items-center gap-4">
            <img 
              src="/logo.png" 
              alt="IDocStore Logo" 
              className="h-40 w-auto object-contain"
            />
            <div>
              <h1 className="text-xl font-bold text-brand-white">
                Registro de Servicios
              </h1>
              <p className="text-sm text-brand-white">
                {userName} • {userRole === "admin" ? "Administrador" : userRole === "encargado" ? "Encargado" : "Técnico"}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium text-brand-white bg-brand-light border-2 border-brand-light rounded-md hover:bg-white hover:text-brand transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    </header>
  );
}

function TechnicalView({ me }: { me: Profile }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Dashboard - {me.name}
        </h1>
        <p className="text-slate-600">Técnico Especialista</p>
      </div>

      <WeeklySummary technicianId={me.id} refreshKey={refreshKey} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OrderForm
          technicianId={me.id}
          onSaved={() => setRefreshKey((x) => x + 1)}
        />
        <WeeklyReport technicianId={me.id} refreshKey={refreshKey} />
      </div>

      <OrdersTable 
        key={refreshKey} 
        technicianId={me.id} 
        onUpdate={() => setRefreshKey((x) => x + 1)} 
      />
    </div>
  );
}

export default function Dashboard() {
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const { data, error } = await supabase.auth.getUser();

        if (error) {
          throw error;
        }

        const user = data.user;
        if (!user) {
          window.location.href = "/login";
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Error al cargar perfil:", profileError);
          console.error("Detalles del error:", {
            message: profileError.message,
            details: profileError.details,
            hint: profileError.hint,
            code: profileError.code,
          });
          throw profileError;
        }

        if (!profile) {
          console.error("Usuario autenticado pero sin perfil:", {
            userId: user.id,
            userEmail: user.email,
          });
          setErrorMsg(
            `No encontramos tu perfil en la tabla 'users'. Tu ID de Authentication es: ${user.id}. Verifica en Supabase que existe un registro en la tabla 'users' con este mismo ID.`
          );
          return;
        }

        setMe(profile as Profile);
      } catch (err) {
        console.error("Error cargando el perfil:", err);
        setErrorMsg("No pudimos cargar tu sesión. Revisa la consola y tus credenciales.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand border-t-transparent mx-auto mb-4"></div>
        <p className="text-slate-600">Cargando...</p>
      </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-white shadow-md rounded-lg p-6 max-w-lg text-center space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Sesión incompleta</h2>
          <p className="text-slate-600">
            {errorMsg ??
              "No encontramos la información de tu usuario. Verifica que tengas un perfil con rol asignado en la base de datos."}
          </p>
          <button
            className="px-4 py-2 bg-brand-light text-brand-white rounded-md hover:bg-white hover:text-brand border-2 border-brand-light hover:border-white transition font-medium"
            onClick={() => {
              window.location.href = "/login";
            }}
          >
            Volver al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header userName={me.name} userRole={me.role} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {me.role === "admin" ? (
          <AdminDashboard />
        ) : me.role === "encargado" ? (
          <EncargadoDashboard />
        ) : (
          <TechnicalView me={me} />
        )}
      </div>
    </div>
  );
}

