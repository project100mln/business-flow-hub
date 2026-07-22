import type { TenantDatabase } from "@/integrations/supabase/types-tenant";

// ---- Типы строк сервисного модуля ----
// Берём типы из TenantDatabase (types-tenant.ts), а не из сгенерированного
// types.ts — там ещё нет service_plans/service_events и новых полей
// service_requests/tasks (миграция expand применена в БД, но клиентские
// типы регенерируют отдельно).
type TenantTables = TenantDatabase["public"]["Tables"];
export type ServiceRequestRow = TenantTables["service_requests"]["Row"];
export type ServicePlanRow = TenantTables["service_plans"]["Row"];
export type ServiceEventRow = TenantTables["service_events"]["Row"];
export type ServiceTaskRow = TenantTables["tasks"]["Row"];
export type ServiceRequestUpdate = TenantTables["service_requests"]["Update"];

// Заявка, как её выбирают экраны сервиса: строка + join клиент/объект/адрес.
export type ServiceRequestWithRefs = ServiceRequestRow & {
  clients?: { full_name: string | null; phone?: string | null; address?: string | null } | null;
  objects?: { name: string | null; address?: string | null } | null;
};

// Справочник сотрудников, как его выбирают экраны сервиса (profiles: id + имя).
export type StaffOption = { id: string; full_name: string | null };

// ---- Статусы ----
export const SERVICE_STATUS: Record<string, string> = {
  new: "Новая",
  callback: "Перезвон",
  scheduled: "Запланирована",
  confirmed: "Подтверждена",
  assigned: "Назначена",
  en_route: "В пути",
  arrived: "На месте",
  in_progress: "В работе",
  problem: "Проблема",
  rescheduled: "Перенесена",
  done: "Завершена",
  cancelled: "Отменена",
};

// Цвет бейджа по статусу (варианты Badge)
export const STATUS_TONE: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  callback: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  scheduled: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  confirmed: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  assigned: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  en_route: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  arrived: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  in_progress: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  problem: "bg-red-500/10 text-red-600 border-red-500/20",
  rescheduled: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  done: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

// Группы для доски (порядок важен)
export const BOARD_GROUPS: { key: string; title: string; statuses: string[] }[] = [
  { key: "inbox", title: "Входящие", statuses: ["new", "callback"] },
  { key: "planned", title: "Запланировано", statuses: ["scheduled", "confirmed", "assigned"] },
  { key: "enroute", title: "В пути", statuses: ["en_route", "arrived"] },
  { key: "working", title: "В работе", statuses: ["in_progress"] },
  { key: "problem", title: "Проблемы", statuses: ["problem", "rescheduled"] },
  { key: "closed", title: "Завершено", statuses: ["done", "cancelled"] },
];

// Клиентская копия FSM из БД — показываем только допустимые следующие статусы.
// Источник правды всё равно в триггере service_request_validate().
export const TRANSITIONS: Record<string, string[]> = {
  new: ["callback", "scheduled", "cancelled"],
  callback: ["scheduled", "cancelled"],
  scheduled: ["confirmed", "rescheduled", "cancelled"],
  confirmed: ["assigned", "rescheduled", "cancelled"],
  assigned: ["en_route", "rescheduled", "cancelled"],
  en_route: ["arrived", "problem", "rescheduled"],
  arrived: ["in_progress", "problem"],
  in_progress: ["done", "problem"],
  problem: ["in_progress", "rescheduled", "done", "cancelled"],
  rescheduled: ["scheduled", "cancelled"],
  done: [],
  cancelled: [],
};

export const PRIORITY: Record<string, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочный",
};

export const SERVICE_TYPE: Record<string, string> = {
  one_time: "Разовый",
  maintenance: "Периодический",
};

export const TASK_TYPE: Record<string, string> = {
  service_callback: "Перезвон",
  service_feedback: "Обратная связь",
  service_upcoming: "Предстоящий сервис",
};

// Нормализация телефона — только цифры (совпадает с индексом в БД).
export const normalizePhone = (p?: string | null): string => (p ?? "").replace(/\D/g, "");

export const fmtDateTime = (v?: string | null): string =>
  v
    ? new Date(v).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const fmtDate = (v?: string | null): string =>
  v ? new Date(v).toLocaleDateString("ru-RU") : "—";

export const toLocalInput = (v?: string | null): string => (v ? v.slice(0, 16) : "");

export const isOverdue = (v?: string | null): boolean => !!v && new Date(v).getTime() < Date.now();

export const isToday = (v?: string | null): boolean => {
  if (!v) return false;
  const d = new Date(v);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
};
