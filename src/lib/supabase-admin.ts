/**
 * Cliente Admin de Supabase para operaciones que requieren permisos elevados
 * 
 * IMPORTANTE: Este archivo usa el service_role key que solo debe estar en el servidor.
 * En producción, deberías usar Edge Functions en lugar de exponer esto en el frontend.
 * 
 * Para desarrollo, puedes configurar:
 * PUBLIC_SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
 * 
 * ⚠️ NUNCA expongas el service_role key en código público o repositorios.
 */

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = import.meta.env.PUBLIC_SUPABASE_SERVICE_ROLE_KEY as string;

// Solo crear el cliente admin si tenemos el service_role key
export const supabaseAdmin = serviceRoleKey
  ? createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

