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

