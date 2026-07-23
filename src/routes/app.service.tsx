import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Eye, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  SERVICE_STATUS,
  STATUS_TONE,
  PRIORITY,
  SERVICE_TYPE,
  TRANSITIONS,
  fmtDateTime,
  isOverdue,
  isToday,
  type ServiceRequestWithRefs,
  type StaffOption,
} from "@/lib/service";
import { serviceKeys, invalidateServiceRequest } from "@/lib/service-queries";
import { getServiceCapabilities, DENIED_MESSAGE, type ServiceTab } from "@/lib/service-permissions";
import { ServiceRequestDialog } from "@/components/service/service-request-dialog";
import { ServiceRequestDetails } from "@/components/service/service-request-details";
import { ServiceBoard } from "@/components/service/service-board";
import { ServiceCallbackQueue } from "@/components/service/service-callback-queue";
import { ServicePlans } from "@/components/service/service-plans";

export const Route = createFileRoute("/app/service")({ component: Service });

function Service() {
  const qc = useQueryClient();
  const { roles, user, loading: authLoading } = useAuth();
  const caps = useMemo(() => getServiceCapabilities(roles), [roles]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRequestWithRefs | null>(null);
  const [detail, setDetail] = useState<ServiceRequestWithRefs | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fPriority, setFPriority] = useState("all");
  const [fCoordinator, setFCoordinator] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [fType, setFType] = useState("all");
  const [fDate, setFDate] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyToday, setOnlyToday] = useState(false);
  const [activeTab, setActiveTab] = useState<ServiceTab>("board");

  const {
    data: items = [],
    isLoading: itemsLoading,
    error: itemsError,
    refetch: refetchItems,
  } = useQuery({
    queryKey: serviceKeys.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select("*, clients(full_name, phone, address), objects(name, address)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ServiceRequestWithRefs[];
    },
  });
  const { data: staff = [], error: staffError } = useQuery({
    queryKey: serviceKeys.staff(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: serviceTasks = [] } = useQuery({
    queryKey: serviceKeys.tasksKpi(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, task_type, status, due_at")
        .in("task_type", ["service_callback", "service_feedback", "service_upcoming"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (staffError) toast.error(`Не удалось загрузить сотрудников: ${staffError.message}`);
  }, [staffError]);

  const staffName = (uid?: string | null) => staff.find((s) => s.id === uid)?.full_name || "—";

  const del = useMutation({
    mutationFn: async (id: string) => {
      // Прикладная проверка перед мутацией — не только скрытая кнопка.
      // Реальная защита — RLS (см. серверный гэп в отчёте).
      if (!caps.canDeleteRequest) throw new Error(DENIED_MESSAGE);
      const { error } = await supabase.from("service_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, id) => {
      toast.success("Удалено");
      invalidateServiceRequest(qc, id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- KPIs ----
  const kpi = useMemo(() => {
    const list = items;
    const tks = serviceTasks;
    const activeCb = tks.filter((t) => t.task_type === "service_callback" && t.status !== "done");
    return {
      new: list.filter((i) => i.status === "new").length,
      today: list.filter(
        (i) => isToday(i.scheduled_at) && !["done", "cancelled"].includes(i.status),
      ).length,
      overdueCb: activeCb.filter((t) => isOverdue(t.due_at)).length,
      planned: list.filter((i) => ["scheduled", "confirmed", "assigned"].includes(i.status)).length,
      enroute: list.filter((i) => ["en_route", "arrived"].includes(i.status)).length,
      working: list.filter((i) => i.status === "in_progress").length,
      problem: list.filter((i) => ["problem", "rescheduled"].includes(i.status)).length,
      doneToday: list.filter((i) => i.status === "done" && isToday(i.completed_at)).length,
      feedbackToday: tks.filter(
        (t) =>
          t.task_type === "service_feedback" &&
          t.status !== "done" &&
          (isToday(t.due_at) || isOverdue(t.due_at)),
      ).length,
    };
  }, [items, serviceTasks]);

  // ---- filtered list ----
  const filtered = useMemo(() => {
    // Клиентское сужение для исполнителя: только его заявки. Это НЕ
    // безопасность — RLS должна фильтровать на сервере. Если БД вернула
    // чужие строки, мы их скроем в UI, но не заявляем, что это защита.
    let list =
      caps.onlyAssignedInUI && user?.id ? items.filter((i) => i.assignee_id === user.id) : items;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (i) =>
          (i.issue || "").toLowerCase().includes(s) ||
          (i.clients?.full_name || "").toLowerCase().includes(s) ||
          (i.clients?.phone || "").toLowerCase().includes(s) ||
          (i.objects?.name || "").toLowerCase().includes(s),
      );
    }
    if (fStatus !== "all") list = list.filter((i) => i.status === fStatus);
    if (fPriority !== "all") list = list.filter((i) => i.priority === fPriority);
    if (fCoordinator !== "all") list = list.filter((i) => i.coordinator_id === fCoordinator);
    if (fAssignee !== "all") list = list.filter((i) => i.assignee_id === fAssignee);
    if (fType !== "all") list = list.filter((i) => (i.service_type || "one_time") === fType);
    if (fDate) list = list.filter((i) => i.scheduled_at && i.scheduled_at.slice(0, 10) === fDate);
    if (onlyOverdue)
      list = list.filter(
        (i) => isOverdue(i.scheduled_at) && !["done", "cancelled"].includes(i.status),
      );
    if (onlyToday) list = list.filter((i) => isToday(i.scheduled_at));
    return list;
  }, [
    items,
    search,
    fStatus,
    fPriority,
    fCoordinator,
    fAssignee,
    fType,
    fDate,
    onlyOverdue,
    onlyToday,
    caps.onlyAssignedInUI,
    user?.id,
  ]);

  const openDetail = (r: ServiceRequestWithRefs) => {
    setDetail(r);
    setDetailOpen(true);
  };
  const openDetailById = (id: string) => {
    const r = items.find((x) => x.id === id);
    if (r) openDetail(r);
  };
  // После refetch (смена статуса, редактирование, перенос, перезвон)
  // подтягиваем свежую версию открытой карточки, чтобы имя клиента,
  // телефон, ответственный, статус и таймлайн не «застревали».
  useEffect(() => {
    if (!detail) return;
    const fresh = items.find((x) => x.id === detail.id);
    if (fresh && fresh !== detail) setDetail(fresh);
  }, [items, detail]);

  // Открытие заявки из карточки плана обслуживания.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === "string") openDetailById(id);
    };
    window.addEventListener("orbit:open-service-request", handler as EventListener);
    return () => window.removeEventListener("orbit:open-service-request", handler as EventListener);
    // openDetailById зависит от items → перерегистрируем при обновлении списка
  }, [items]);

  const nextStep = (r: ServiceRequestWithRefs) => {
    if (r.status === "done" || r.status === "cancelled") return "—";
    const n = TRANSITIONS[r.status]?.[0];
    return n ? SERVICE_STATUS[n] : "—";
  };

  // Пока грузятся сессия / профиль / enabled_modules — не мигаем заглушкой
  // «Сервис недоступен»: роли ещё не приехали, caps.canViewService = false
  // по умолчанию. Показываем skeleton, потом уже решаем.
  if (authLoading) {
    return <ServicePageSkeleton />;
  }

  if (!caps.canViewService) {
    return (
      <div className="p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface/40 p-6 text-center">
          <h1 className="text-lg font-semibold">Сервис недоступен</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ваша роль не участвует в диспетчеризации сервисных заявок. Если это ошибка — обратитесь
            к администратору.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Сервис</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Диспетчеризация заявок, перезвоны и обслуживание.
          </p>
        </div>
        {caps.canCreateRequest && (
          <Button
            className="bg-gradient-primary"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4 mr-1" />
            Новая заявка
          </Button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
        <Kpi label="Новые" value={kpi.new} />
        <Kpi label="Сегодня" value={kpi.today} />
        <Kpi
          label="Просроч. перезвоны"
          value={kpi.overdueCb}
          tone={kpi.overdueCb ? "text-red-600" : ""}
        />
        <Kpi label="Запланировано" value={kpi.planned} />
        <Kpi label="В пути" value={kpi.enroute} />
        <Kpi label="В работе" value={kpi.working} />
        <Kpi label="Проблемы" value={kpi.problem} tone={kpi.problem ? "text-red-600" : ""} />
        <Kpi label="Завершено сегодня" value={kpi.doneToday} />
        <Kpi label="Обратная связь" value={kpi.feedbackToday} />
      </div>

      <Tabs
        value={caps.tabs.includes(activeTab) ? activeTab : (caps.tabs[0] ?? "board")}
        onValueChange={(v) => setActiveTab(v as ServiceTab)}
      >
        <TabsList>
          {caps.tabs.includes("board") && <TabsTrigger value="board">Доска</TabsTrigger>}
          {caps.tabs.includes("all") && <TabsTrigger value="all">Все заявки</TabsTrigger>}
          {caps.tabs.includes("callbacks") && (
            <TabsTrigger value="callbacks">Перезвоны</TabsTrigger>
          )}
          {caps.tabs.includes("plans") && (
            <TabsTrigger value="plans">Планы обслуживания</TabsTrigger>
          )}
        </TabsList>

        {/* Доска */}
        <TabsContent value="board" className="mt-4">
          <ServiceBoard
            items={items}
            isLoading={itemsLoading}
            error={itemsError}
            onRetry={() => refetchItems()}
            onOpen={openDetail}
          />
        </TabsContent>

        {/* Все заявки */}
        <TabsContent value="all" className="mt-4 space-y-4">
          {/* фильтры */}
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              placeholder="Поиск…"
              className="w-48"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Input
              type="date"
              className="w-40"
              value={fDate}
              onChange={(e) => setFDate(e.target.value)}
            />
            <FilterSelect
              value={fStatus}
              onChange={setFStatus}
              placeholder="Статус"
              options={SERVICE_STATUS}
            />
            <FilterSelect
              value={fPriority}
              onChange={setFPriority}
              placeholder="Приоритет"
              options={PRIORITY}
            />
            <FilterSelect
              value={fType}
              onChange={setFType}
              placeholder="Тип"
              options={SERVICE_TYPE}
            />
            <StaffSelect
              value={fCoordinator}
              onChange={setFCoordinator}
              placeholder="Оператор"
              staff={staff}
            />
            <StaffSelect
              value={fAssignee}
              onChange={setFAssignee}
              placeholder="Исполнитель"
              staff={staff}
            />
            <label className="flex items-center gap-1.5 text-sm">
              <Switch checked={onlyOverdue} onCheckedChange={setOnlyOverdue} />
              Просроченные
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <Switch checked={onlyToday} onCheckedChange={setOnlyToday} />
              Сегодня
            </label>
          </div>

          {/* Мобильный список карточек (<md). На md+ показываем таблицу ниже.
              Одна и та же выборка `filtered`, тот же openDetail/del. */}
          <div className="md:hidden space-y-2">
            {filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => openDetail(s)}
                className="w-full text-left rounded-2xl border border-border bg-gradient-surface shadow-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.clients?.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.clients?.phone || "—"}
                    </div>
                  </div>
                  <Badge variant="outline" className={`${STATUS_TONE[s.status]} shrink-0`}>
                    {SERVICE_STATUS[s.status] || s.status}
                  </Badge>
                </div>
                <div className="mt-2 text-sm line-clamp-2">{s.issue}</div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="whitespace-nowrap">{fmtDateTime(s.scheduled_at)}</span>
                  <span className="truncate">{staffName(s.assignee_id)}</span>
                  {caps.canEditFinancialFields && (
                    <span className="whitespace-nowrap">
                      {new Intl.NumberFormat("ru-RU").format(Number(s.cost || 0))} ₸
                    </span>
                  )}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="rounded-2xl border border-border p-6 text-center text-sm text-muted-foreground">
                {itemsLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Загружаем…
                  </span>
                ) : itemsError ? (
                  <span className="inline-flex items-center gap-2 text-destructive">
                    <AlertCircle className="size-4" /> Ошибка: {itemsError.message}
                  </span>
                ) : (
                  "Заявок не найдено"
                )}
              </div>
            )}
          </div>

          <div className="hidden md:block rounded-2xl border border-border bg-gradient-surface shadow-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Клиент</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead>Объект/адрес</TableHead>
                  <TableHead>Проблема</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Оператор</TableHead>
                  <TableHead>Исполнитель</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Приоритет</TableHead>
                  <TableHead className="text-right">Стоимость</TableHead>
                  <TableHead>Следующий шаг</TableHead>
                  <TableHead className="w-24 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => openDetail(s)}>
                    <TableCell className="font-medium">{s.clients?.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.clients?.phone || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[10rem] truncate">
                      {s.objects?.name || s.clients?.address || s.objects?.address || "—"}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate">{s.issue}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {SERVICE_TYPE[s.service_type] || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {staffName(s.coordinator_id)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {staffName(s.assignee_id)}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {fmtDateTime(s.scheduled_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_TONE[s.status]}>
                        {SERVICE_STATUS[s.status] || s.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{PRIORITY[s.priority] || s.priority}</Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {new Intl.NumberFormat("ru-RU").format(Number(s.cost || 0))} ₸
                    </TableCell>
                    <TableCell className="text-muted-foreground">{nextStep(s)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" onClick={() => openDetail(s)}>
                        <Eye className="size-4" />
                      </Button>
                      {caps.canDeleteRequest && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => confirm("Удалить заявку?") && del.mutate(s.id)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-muted-foreground py-12">
                      {itemsLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin" /> Загружаем заявки…
                        </span>
                      ) : itemsError ? (
                        <span className="inline-flex items-center gap-2 text-destructive">
                          <AlertCircle className="size-4" /> Ошибка загрузки: {itemsError.message}
                        </span>
                      ) : (
                        "Заявок не найдено"
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Перезвоны */}
        {caps.tabs.includes("callbacks") && (
          <TabsContent value="callbacks" className="mt-4">
            <ServiceCallbackQueue staff={staff} onOpenRequest={openDetailById} caps={caps} />
          </TabsContent>
        )}

        {/* Планы */}
        {caps.tabs.includes("plans") && (
          <TabsContent value="plans" className="mt-4">
            <ServicePlans staff={staff} caps={caps} currentUserId={user?.id ?? null} />
          </TabsContent>
        )}
      </Tabs>

      <ServiceRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        currentUserId={user?.id ?? null}
        caps={caps}
      />
      <ServiceRequestDetails
        request={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        staff={staff}
        currentUserId={user?.id ?? null}
        caps={caps}
        onEdit={(r) => {
          setEditing(r);
          setDialogOpen(true);
        }}
      />
    </div>
  );
}

function Kpi({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-gradient-surface shadow-card px-3 py-2.5">
      <div className={`text-xl font-semibold ${tone}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Record<string, string>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-36">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}: все</SelectItem>
        {Object.entries(options).map(([k, l]) => (
          <SelectItem key={k} value={k}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StaffSelect({
  value,
  onChange,
  placeholder,
  staff,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  staff: StaffOption[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}: все</SelectItem>
        {staff.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.full_name || "Без имени"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Skeleton в стиле остальных страниц (rounded-2xl, border, surface, muted
// pulse). Показываем ровно на время загрузки auth/roles, чтобы не мигнуть
// ложным «Сервис недоступен» до того, как приедут роли.
function ServicePageSkeleton() {
  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-md bg-muted animate-pulse" />
          <div className="h-4 w-64 rounded-md bg-muted/70 animate-pulse" />
        </div>
        <div className="h-9 w-36 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-surface/40 p-3 space-y-2"
          >
            <div className="h-6 w-10 rounded bg-muted animate-pulse" />
            <div className="h-3 w-20 rounded bg-muted/70 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-surface/40 h-64 animate-pulse" />
    </div>
  );
}
