/**
 * Helper para validar documentos en Bsale
 * 
 * IMPORTANTE: 
 * - Para pruebas: Crea una cuenta en https://www.bsale.cl y obtén tu token de sandbox
 * - Para producción: Envía un correo a [email protected] desde una cuenta de administrador
 *   solicitando un token de producción para acceder a las boletas reales del cliente.
 * 
 * Agrega en tu archivo .env:
 * PUBLIC_BSALE_ACCESS_TOKEN=tu_token_aqui
 * 
 * También puedes configurar la URL base (opcional, por defecto usa api.bsale.cl):
 * PUBLIC_BSALE_API_URL=https://api.bsale.cl (o https://api.bsale.io según tu país)
 */

interface BsaleDocument {
  id?: number;
  number?: string;
  url?: string;
  total?: number;
  totalAmount?: number;
  [key: string]: any;
}

interface BsaleResponse {
  count?: number;
  items?: BsaleDocument[];
  // Algunas respuestas pueden venir en formato diferente
  [key: string]: any;
}

/**
 * Valida si un número de boleta existe en Bsale
 * @param receiptNumber - Número de boleta a validar
 * @returns Objeto con información del documento si existe, null si no existe
 */
export async function validateBsaleDocument(
  receiptNumber: string
): Promise<{ exists: boolean; document: BsaleDocument | null; error?: string }> {
  const accessToken = import.meta.env.PUBLIC_BSALE_ACCESS_TOKEN;
  const apiUrl = import.meta.env.PUBLIC_BSALE_API_URL || "https://api.bsale.cl";

  if (!accessToken) {
    console.warn("PUBLIC_BSALE_ACCESS_TOKEN no está configurado. La validación de Bsale no funcionará.");
    return {
      exists: false,
      document: null,
      error: "Token de Bsale no configurado",
    };
  }

  if (!receiptNumber || !receiptNumber.trim()) {
    return {
      exists: false,
      document: null,
      error: "Número de boleta vacío",
    };
  }

  try {
    // Intentar buscar por número de documento
    // La API de Bsale puede usar diferentes parámetros según la versión
    const url = `${apiUrl}/v1/documents.json?number=${encodeURIComponent(receiptNumber.trim())}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "access_token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Error ${response.status}: ${response.statusText}`;
      
      if (response.status === 401) {
        errorMessage = "Token de Bsale inválido o expirado. Verifica que sea un token de producción si necesitas acceder a boletas reales.";
      } else if (response.status === 403) {
        errorMessage = "Token sin permisos. Asegúrate de usar un token de producción para acceder a documentos reales.";
      } else if (response.status === 404) {
        // 404 puede significar que el endpoint no existe o el documento no se encontró
        // Intentaremos parsear la respuesta para ver si hay más información
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Si no se puede parsear, usar el mensaje por defecto
        }
      }
      
      console.error("Error en respuesta de Bsale:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      
      return {
        exists: false,
        document: null,
        error: errorMessage,
      };
    }

    const data: BsaleResponse = await response.json();

    // La estructura de respuesta puede variar
    const count = data.count ?? (Array.isArray(data.items) ? data.items.length : 0);
    const items = data.items ?? (Array.isArray(data) ? data : []);

    if (count === 0 || !items || items.length === 0) {
      return {
        exists: false,
        document: null,
      };
    }

    // Tomar el primer documento encontrado
    const document = items[0];
    
    // Extraer información del documento según la estructura de Bsale
    const documentNumber = document.number || document.documentNumber || receiptNumber.trim();
    const documentId = document.id || document.documentId;
    const total = document.totalAmount || document.total || document.amount || null;
    
    // Construir URL del documento (puede variar según el país)
    let documentUrl = document.url;
    if (!documentUrl && documentId) {
      const baseDomain = apiUrl.includes("bsale.cl") ? "bsale.cl" : "bsale.io";
      documentUrl = `https://www.${baseDomain}/document/${documentId}`;
    }
    
    return {
      exists: true,
      document: {
        number: documentNumber,
        url: documentUrl || null,
        totalAmount: total,
        id: documentId,
      },
    };
  } catch (error) {
    console.error("Error validando documento en Bsale:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return {
      exists: false,
      document: null,
      error: `Error de conexión con Bsale: ${errorMessage}. Verifica tu conexión a internet y la configuración del token.`,
    };
  }
}

/**
 * Verifica si un número de recibo ya está registrado en la base de datos
 */
export async function checkReceiptNumberExists(
  receiptNumber: string,
  excludeOrderId?: string
): Promise<boolean> {
  const { supabase } = await import("./supabase");
  
  if (!receiptNumber || !receiptNumber.trim()) {
    return false; // Si está vacío, no hay duplicado
  }
  
  let query = supabase
    .from("orders")
    .select("id")
    .eq("receipt_number", receiptNumber.trim())
    .limit(1);

  if (excludeOrderId) {
    query = query.neq("id", excludeOrderId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error verificando recibo duplicado:", error);
    return false; // En caso de error, permitir continuar
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Verifica si un número de orden ya está registrado en la base de datos
 */
export async function checkOrderNumberExists(
  orderNumber: string,
  excludeOrderId?: string
): Promise<boolean> {
  const { supabase } = await import("./supabase");
  
  if (!orderNumber || !orderNumber.trim()) {
    return false; // Si está vacío, no hay duplicado
  }
  
  let query = supabase
    .from("orders")
    .select("id")
    .eq("order_number", orderNumber.trim())
    .limit(1);

  if (excludeOrderId) {
    query = query.neq("id", excludeOrderId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error verificando número de orden duplicado:", error);
    return false; // En caso de error, permitir continuar
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Detecta duplicados en una lista de órdenes
 * Retorna un mapa con los IDs de las órdenes que tienen duplicados y el tipo de duplicado
 */
export interface DuplicateInfo {
  hasDuplicateOrderNumber: boolean;
  hasDuplicateReceipt: boolean;
}

export function detectDuplicates(orders: Array<{ id: string; order_number: string; receipt_number?: string | null }>): Record<string, DuplicateInfo> {
  const duplicates: Record<string, DuplicateInfo> = {};
  
  // Contar ocurrencias de números de orden
  const orderNumberCounts: Record<string, string[]> = {};
  // Contar ocurrencias de números de recibo (solo si no son null/empty)
  const receiptNumberCounts: Record<string, string[]> = {};
  
  // Primera pasada: contar ocurrencias
  orders.forEach((order) => {
    const orderNum = order.order_number?.trim();
    if (orderNum) {
      if (!orderNumberCounts[orderNum]) {
        orderNumberCounts[orderNum] = [];
      }
      orderNumberCounts[orderNum].push(order.id);
    }
    
    const receiptNum = order.receipt_number?.trim();
    if (receiptNum) {
      if (!receiptNumberCounts[receiptNum]) {
        receiptNumberCounts[receiptNum] = [];
      }
      receiptNumberCounts[receiptNum].push(order.id);
    }
  });
  
  // Segunda pasada: marcar duplicados
  orders.forEach((order) => {
    const orderNum = order.order_number?.trim();
    const receiptNum = order.receipt_number?.trim();
    
    const hasDuplicateOrderNumber = orderNum ? (orderNumberCounts[orderNum]?.length ?? 0) > 1 : false;
    const hasDuplicateReceipt = receiptNum ? (receiptNumberCounts[receiptNum]?.length ?? 0) > 1 : false;
    
    if (hasDuplicateOrderNumber || hasDuplicateReceipt) {
      duplicates[order.id] = {
        hasDuplicateOrderNumber,
        hasDuplicateReceipt,
      };
    }
  });
  
  return duplicates;
}

