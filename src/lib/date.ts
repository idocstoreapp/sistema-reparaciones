import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format } from "date-fns";

export function currentWeekRange(d = new Date()) {
  const start = startOfWeek(d, { weekStartsOn: 6 }); // sábado
  const end = endOfWeek(d, { weekStartsOn: 6 }); // viernes
  return { start, end };
}

export function currentMonthRange(d = new Date()) {
  return { 
    start: startOfMonth(d), 
    end: endOfMonth(d) 
  };
}

export function formatDate(date: Date | string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  // Validar que la fecha sea válida
  if (isNaN(d.getTime())) {
    return '';
  }
  return format(d, 'dd/MM/yyyy');
}

export function getWeekStart(date: Date = new Date()): Date {
  return startOfWeek(date, { weekStartsOn: 6 });
}

/**
 * Crea una fecha al inicio del día LOCAL desde un string YYYY-MM-DD
 * Luego, al serializar con toISOString(), representa el instante UTC correcto
 * para ese inicio de día local y evita cortes adelantados/atrasados por zona horaria.
 */
export function dateStringToUTCStart(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Crea una fecha al fin del día LOCAL desde un string YYYY-MM-DD
 * Luego, al serializar con toISOString(), representa el instante UTC correcto
 * para ese fin de día local.
 */
export function dateStringToUTCEnd(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

/**
 * Convierte un Date al inicio del día LOCAL (00:00:00.000)
 * Útil para filtrar por rangos diarios/semanales respetando la zona horaria del usuario.
 */
export function dateToUTCStart(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Convierte un Date al fin del día LOCAL (23:59:59.999)
 * Útil para filtrar por rangos diarios/semanales respetando la zona horaria del usuario.
 */
export function dateToUTCEnd(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Calcula el rango de la semana laboral (sábado a viernes) desde un week_start
 * @param weekStart - Fecha de inicio de semana (sábado) en formato Date o string
 * @returns Objeto con start (sábado) y end (viernes) de la semana
 */
export function getWeekRangeFromStart(weekStart: Date | string): { start: Date; end: Date } {
  const startDate = typeof weekStart === 'string' ? new Date(weekStart) : weekStart;
  startDate.setHours(0, 0, 0, 0);
  
  // El fin es el viernes siguiente (6 días después del sábado)
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);
  
  return { start: startDate, end: endDate };
}
