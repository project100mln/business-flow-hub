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

export type TenantDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: {
      [T in keyof Database["public"]["Tables"]]: Omit<Database["public"]["Tables"][T], "Insert"> & {
        Insert: OptionalCompanyId<Database["public"]["Tables"][T]["Insert"]>;
      };
    };
  };
};
