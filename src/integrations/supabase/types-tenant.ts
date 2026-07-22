import type { Database } from "./types";

// company_id во всех операционных таблицах NOT NULL, но заполняется на сервере
// BEFORE INSERT-триггером set_company_id(). См. types-tenant история.
type OptionalCompanyId<I> = I extends { company_id: infer V }
  ? Omit<I, "company_id"> & { company_id?: V }
  : I;

// ---------------------------------------------------------------
// Ручное расширение типов для сервисного модуля.
// Миграция 20260719120000_service_operations_v1_expand.sql применена в БД
// (service_plans, service_events, доп. поля service_requests/tasks), но
// сгенерированный types.ts ещё не перегенерён. После регенерации этот блок
// можно удалить.
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

type ExistingTables = Database["public"]["Tables"];

// Расширяем существующие таблицы, СОХРАНЯЯ Relationships из генератора,
// чтобы PostgREST-джойны типа `clients(full_name)` резолвились типами.
type ExtendedServiceRequests = Omit<
  ExistingTables["service_requests"],
  "Row" | "Insert" | "Update"
> & {
  Row: ExistingTables["service_requests"]["Row"] & ServiceRequestsExtras;
  Insert: ExistingTables["service_requests"]["Insert"] & Partial<ServiceRequestsExtras>;
  Update: ExistingTables["service_requests"]["Update"] & Partial<ServiceRequestsExtras>;
};

type ExtendedTasks = Omit<ExistingTables["tasks"], "Row" | "Insert" | "Update"> & {
  Row: ExistingTables["tasks"]["Row"] & TasksExtras;
  Insert: ExistingTables["tasks"]["Insert"] & Partial<TasksExtras>;
  Update: ExistingTables["tasks"]["Update"] & Partial<TasksExtras>;
};

// Relationships у новых таблиц — минимальный набор для клиентских джойнов
// (`clients(full_name)`, `objects(name)` и т.п.).
type ServicePlansTable = {
  Row: ServicePlansRow;
  Insert: Partial<ServicePlansRow> & {
    client_id: string;
    name: string;
    issue_template: string;
    interval_days: number;
    next_visit_at: string;
  };
  Update: Partial<ServicePlansRow>;
  Relationships: [
    {
      foreignKeyName: "service_plans_client_id_fkey";
      columns: ["client_id"];
      isOneToOne: false;
      referencedRelation: "clients";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "service_plans_object_id_fkey";
      columns: ["object_id"];
      isOneToOne: false;
      referencedRelation: "objects";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "service_plans_product_id_fkey";
      columns: ["product_id"];
      isOneToOne: false;
      referencedRelation: "products";
      referencedColumns: ["id"];
    },
  ];
};

type ServiceEventsTable = {
  Row: ServiceEventsRow;
  Insert: Partial<ServiceEventsRow> & {
    service_request_id: string;
    event_type: string;
  };
  Update: Partial<ServiceEventsRow>;
  Relationships: [
    {
      foreignKeyName: "service_events_service_request_id_fkey";
      columns: ["service_request_id"];
      isOneToOne: false;
      referencedRelation: "service_requests";
      referencedColumns: ["id"];
    },
  ];
};

type ServiceAugment = {
  service_plans: ServicePlansTable;
  service_events: ServiceEventsTable;
  service_requests: ExtendedServiceRequests;
  tasks: ExtendedTasks;
};

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
