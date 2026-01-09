import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Footer from "./components/Footer";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        window.location.href = "/dashboard";
      }
    });
  }, []);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const { error: authError, data: authData } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (authError) {
      setLoading(false);
      setErr(authError.message);
      return;
    }

    // Verificar si el usuario está habilitado
    // Si el campo enabled no existe o es NULL, se considera habilitado por defecto
    if (authData.user) {
      try {
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("enabled")
          .eq("id", authData.user.id)
          .maybeSingle();

        // Si hay error al consultar o el perfil no existe, permitir el login
        // (puede ser que el campo enabled no exista aún en la BD)
        if (profileError) {
          console.warn("No se pudo verificar el estado del usuario, permitiendo login:", profileError);
          // Continuar con el login si hay error (retrocompatibilidad)
        } else if (profile && profile.enabled === false) {
          // Solo bloquear si explícitamente está deshabilitado
          await supabase.auth.signOut();
          setLoading(false);
          setErr("Tu cuenta ha sido deshabilitada. Contacta al administrador.");
          return;
        }
        // Si profile.enabled es null, undefined o true, permitir el login
      } catch (err) {
        // Si hay cualquier error (campo no existe, etc.), permitir el login
        console.warn("Error al verificar enabled, permitiendo login:", err);
      }
    }

    setLoading(false);
    window.location.href = "/dashboard";
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-brand to-brand-dark">
      <form
        onSubmit={onLogin}
        className="max-w-md w-full bg-white p-8 rounded-lg shadow-2xl space-y-6"
      >
        <div className="text-center">
          <img 
            src="/logo.png" 
            alt="IDocStore Logo" 
            className="h-56 w-auto mx-auto mb-4 object-contain"
          />
          <h2 className="text-2xl font-bold text-brand mb-2">Registro de Servicios</h2>
          <p className="text-slate-600">Ingresa tus credenciales</p>
        </div>

        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {err}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Email
          </label>
          <input
            className="w-full border-2 border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Contraseña
          </label>
          <input
            className="w-full border-2 border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
            type="password"
            placeholder="••••••••"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-light text-brand-white rounded-md py-2 font-medium hover:bg-white hover:text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 border-brand-light hover:border-white"
        >
          {loading ? "Ingresando..." : "Entrar"}
        </button>
      </form>
      <Footer />
    </div>
  );
}

