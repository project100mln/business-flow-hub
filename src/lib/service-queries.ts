import type { QueryClient } from "@tanstack/react-query";

// Централизованные ключи запросов модуля «Сервис».
// ВАЖНО: сохраняем существующие ключи, чтобы не сломать инвалидации:
//   ["service-tasks","kpi"]           — KPI-счётчики
//   ["service-tasks","callbacks","queue"] — очередь перезвонов
export const serviceKeys = {
  all: ["service"] as const,
  list: () => ["service"] as const,
  staff: () => ["service-staff"] as const,
  objects: () => ["objects-min"] as const,
  products: () => ["products-min"] as const,
  clientSearch: (q: string) => ["client-search", q] as const,
  clientDupe: (phone: string) => ["client-dupe", phone] as const,

  tasksAll: ["service-tasks"] as const,
  tasksKpi: () => ["service-tasks", "kpi"] as const,
  tasksCallbacksQueue: () => ["service-tasks", "callbacks", "queue"] as const,

  events: (id?: string | null) => ["service-events", id] as const,
  callbacks: (id?: string | null) => ["service-callbacks", id] as const,

  plans: () => ["service-plans"] as const,
  plan: (id?: string | null) => ["service-plan", id] as const,
};

// Массово обновляем всё, что связано с сервисной заявкой: списки, доска,
// KPI, очередь перезвонов, история и активные перезвоны в открытой карточке.
export function invalidateServiceRequest(qc: QueryClient, requestId?: string | null) {
  qc.invalidateQueries({ queryKey: serviceKeys.all });
  qc.invalidateQueries({ queryKey: serviceKeys.tasksAll }); // KPI + очередь
  if (requestId) {
    qc.invalidateQueries({ queryKey: serviceKeys.events(requestId) });
    qc.invalidateQueries({ queryKey: serviceKeys.callbacks(requestId) });
  }
}

export function invalidateServicePlans(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: serviceKeys.plans() });
  qc.invalidateQueries({ queryKey: serviceKeys.all }); // план создаёт заявку через триггер
  qc.invalidateQueries({ queryKey: serviceKeys.tasksAll });
}
