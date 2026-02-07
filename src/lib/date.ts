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
 * Crea una fecha en UTC desde un string YYYY-MM-DD a las 00:00:00 UTC
 * Esto evita problemas de zona horaria al filtrar fechas
 */
export function dateStringToUTCStart(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Crea una fecha en UTC desde un string YYYY-MM-DD a las 23:59:59.999 UTC
 * Esto evita problemas de zona horaria al filtrar fechas
 */
export function dateStringToUTCEnd(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

/**
 * Convierte un objeto Date a UTC start (00:00:00) del mismo día
 * Útil para filtrar fechas que vienen de date-fns o Date locales
 */
export function dateToUTCStart(date: Date): Date {
  return new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0, 0, 0, 0
  ));
}

/**
 * Convierte un objeto Date a UTC end (23:59:59.999) del mismo día
 * Útil para filtrar fechas que vienen de date-fns o Date locales
 */
export function dateToUTCEnd(date: Date): Date {
  return new Date(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23, 59, 59, 999
  ));
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
