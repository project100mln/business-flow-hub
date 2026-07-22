import type { Database } from "./types";

// company_id во всех операционных таблицах NOT NULL, но заполняется на сервере
// BEFORE INSERT-триггером set_company_id() из профиля текущего пользователя
// (см. supabase/migrations/20260718120000_*.sql). Клиент это поле при INSERT
// не передаёт, и это корректно в рантайме. Сгенерированный types.ts знать о
// триггере не может и требует company_id в каждом Insert — поэтому здесь, в
// одном месте, ослабляем ТОЛЬКО Insert.company_id до необязательного, не
// редактируя сгенерированный файл. При регенерации types.ts править ничего
// не нужно.

type OptionalCompanyId<I> = I extends { company_id: infer V }
  ? Omit<I, "company_id"> & { company_id?: V }
  : I;

// ---------------------------------------------------------------
// Ручное расширение типов для сервисного модуля.
// Миграция supabase/migrations/20260719120000_service_operations_v1_expand.sql
// уже применена в БД (создаёт service_plans, service_events и добавляет
// поля в service_requests/tasks), но сгенерированный types.ts ещё не
// перегенерён. Дублируем описание один раз здесь, чтобы TS видел актуальную
// схему. При регенерации types.ts эти определения станут избыточными —
// TenantDatabase их автоматически «поглотит» через Omit ниже.
// ---------------------------------------------------------------
type ServicePlansRow = {
  id: string;
  company_id: string;
  client_id: string;
  object_id: string | null;
  product_id: string | null;
  name: string;
  service_type: string;
  issue_template: string;
  interval_days: number;
  next_visit_at: string;
  coordinator_id: string | null;
  assignee_id: string | null;
  priority: string;
  estimated_cost: number | null;
  notes: string | null;
  is_active: boolean;
  last_generated_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ServiceEventsRow = {
  id: string;
  company_id: string;
  service_request_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
};

type ServiceRequestsExtras = {
  service_type: string;
  service_plan_id: string | null;
  previous_service_request_id: string | null;
  coordinator_id: string | null;
  confirmed_at: string | null;
  departed_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  resolution: string | null;
  problem_resolved: boolean | null;
  rescheduled_from: string | null;
  reschedule_reason: string | null;
  reschedule_count: number;
  feedback_due_at: string | null;
};

type TasksExtras = {
  task_type: string | null;
  service_request_id: string | null;
};

type TableShape<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type ExistingTables = Database["public"]["Tables"];

type ExtendedServiceRequests = TableShape<
  ExistingTables["service_requests"]["Row"] & ServiceRequestsExtras,
  ExistingTables["service_requests"]["Insert"] & Partial<ServiceRequestsExtras>,
  ExistingTables["service_requests"]["Update"] & Partial<ServiceRequestsExtras>
>;

type ExtendedTasks = TableShape<
  ExistingTables["tasks"]["Row"] & TasksExtras,
  ExistingTables["tasks"]["Insert"] & Partial<TasksExtras>,
  ExistingTables["tasks"]["Update"] & Partial<TasksExtras>
>;

type ServicePlansTable = TableShape<
  ServicePlansRow,
  Omit<ServicePlansRow, "id" | "created_at" | "updated_at" | "company_id"> & {
    id?: string;
    company_id?: string;
    created_at?: string;
    updated_at?: string;
    is_active?: boolean;
    last_generated_at?: string | null;
    priority?: string;
    service_type?: string;
    object_id?: string | null;
    product_id?: string | null;
    coordinator_id?: string | null;
    assignee_id?: string | null;
    estimated_cost?: number | null;
    notes?: string | null;
    created_by?: string | null;
  },
  Partial<ServicePlansRow>
>;

type ServiceEventsTable = TableShape<
  ServiceEventsRow,
  Omit<ServiceEventsRow, "id" | "occurred_at" | "company_id" | "metadata"> & {
    id?: string;
    company_id?: string;
    occurred_at?: string;
    metadata?: Record<string, unknown>;
    from_status?: string | null;
    to_status?: string | null;
    actor_id?: string | null;
    notes?: string | null;
  },
  Partial<ServiceEventsRow>
>;

type ServiceAugment = {
  service_plans: ServicePlansTable;
  service_events: ServiceEventsTable;
  service_requests: ExtendedServiceRequests;
  tasks: ExtendedTasks;
};

// Полный список таблиц: существующие (с ослабленным company_id в Insert) +
// расширения service_plans/service_events + расширенные service_requests/tasks.
type TenantTables = {
  [T in keyof ExistingTables]: T extends keyof ServiceAugment
    ? Omit<ServiceAugment[T], "Insert"> & {
        Insert: OptionalCompanyId<ServiceAugment[T]["Insert"]>;
      }
    : Omit<ExistingTables[T], "Insert"> & {
        Insert: OptionalCompanyId<ExistingTables[T]["Insert"]>;
      };
} & {
  service_plans: Omit<ServicePlansTable, "Insert"> & {
    Insert: OptionalCompanyId<ServicePlansTable["Insert"]>;
  };
  service_events: Omit<ServiceEventsTable, "Insert"> & {
    Insert: OptionalCompanyId<ServiceEventsTable["Insert"]>;
  };
};

export type TenantDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: TenantTables;
  };
};
