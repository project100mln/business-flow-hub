import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PhoneCall, History, Info, CalendarClock, ArrowRight, Pencil } from "lucide-react";
import {
  SERVICE_STATUS,
  STATUS_TONE,
  TRANSITIONS,
  PRIORITY,
  SERVICE_TYPE,
  TASK_TYPE,
  fmtDateTime,
  isOverdue,
  type ServiceRequestWithRefs,
  type ServiceRequestUpdate,
  type ServiceTaskRow,
  type StaffOption,
} from "@/lib/service";
import { serviceKeys, invalidateServiceRequest } from "@/lib/service-queries";
import type { ServiceCapabilities } from "@/lib/service-permissions";
import { DENIED_MESSAGE } from "@/lib/service-permissions";

export function ServiceRequestDetails({
  request,
  open,
  onOpenChange,
  staff,
  currentUserId,
  caps,
  onEdit,
}: {
  request: ServiceRequestWithRefs | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staff: StaffOption[];
  currentUserId: string | null;
  caps: ServiceCapabilities;
  onEdit?: (r: ServiceRequestWithRefs) => void;
}) {
  const qc = useQueryClient();
  const id = request?.id;
  const staffName = (uid?: string | null) => staff.find((s) => s.id === uid)?.full_name || "—";

  const invalidate = () => invalidateServiceRequest(qc, id);

  // ---- transition state ----
  const [target, setTarget] = useState("");
  const [resolution, setResolution] = useState("");
  const [problemResolved, setProblemResolved] = useState(true);
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");

  const allowed = request ? (TRANSITIONS[request.status] ?? []) : [];

  const changeStatus = useMutation({
    mutationFn: async () => {
      if (!caps.canChangeStatus) throw new Error(DENIED_MESSAGE);
      if (!id) throw new Error("Заявка не выбрана");
      if (!target) throw new Error("Выберите новый статус");
      // Клиентская проверка FSM — сервер повторно валидирует триггером.
      const allowedNow = request ? (TRANSITIONS[request.status] ?? []) : [];
      if (!allowedNow.includes(target)) {
        throw new Error("Такой переход не допускается из текущего статуса");
      }
      const patch: ServiceRequestUpdate = { status: target };
      if (target === "done") {
        if (!resolution.trim()) throw new Error("Опишите результат (resolution)");
        patch.resolution = resolution.trim();
        patch.problem_resolved = problemResolved;
      }
      if (target === "rescheduled") {
        if (!newDate) throw new Error("Укажите новую дату");
        if (!reason.trim()) throw new Error("Укажите причину переноса");
        patch.scheduled_at = new Date(newDate).toISOString();
        patch.reschedule_reason = reason.trim();
      }
      const { error } = await supabase.from("service_requests").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Статус обновлён");
      setTarget("");
      setResolution("");
      setNewDate("");
      setReason("");
      invalidate();
      // Не закрываем шторку — родитель подтянет свежую заявку в открытую
      // карточку (см. useEffect в app.service.tsx). Так пользователь сразу
      // видит новый статус/таймлайн, а не «прыгающий» лист без результата.
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- history ----
  const { data: events = [], error: eventsError } = useQuery({
    queryKey: serviceKeys.events(id),
    enabled: !!id && open,
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("service_events")
        .select("*")
        .eq("service_request_id", id)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---- callbacks (tasks) ----
  const { data: callbacks = [], error: callbacksError } = useQuery({
    queryKey: serviceKeys.callbacks(id),
    enabled: !!id && open,
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("service_request_id", id)
        .order("due_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---- plan ----
  const { data: plan } = useQuery({
    queryKey: serviceKeys.plan(request?.service_plan_id),
    enabled: !!request?.service_plan_id && open,
    queryFn: async () => {
      if (!request?.service_plan_id) return null;
      const { data, error } = await supabase
        .from("service_plans")
        .select("*")
        .eq("id", request.service_plan_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (eventsError) toast.error(`История: ${eventsError.message}`);
  }, [eventsError]);
  useEffect(() => {
    if (callbacksError) toast.error(`Перезвоны: ${callbacksError.message}`);
  }, [callbacksError]);

  // new callback form
  const [cbDue, setCbDue] = useState("");
  const [cbAssignee, setCbAssignee] = useState(currentUserId || "");
  const [cbNote, setCbNote] = useState("");
  const createCallback = useMutation({
    mutationFn: async () => {
      if (!caps.canManageCallbacks) throw new Error(DENIED_MESSAGE);
      if (!request) throw new Error("Заявка не выбрана");
      if (!cbDue) throw new Error("Укажите дату перезвона");
      if (!cbAssignee) throw new Error("Назначьте ответственного");
      const { error } = await supabase.from("tasks").insert({
        title: "Перезвон клиенту",
        description: cbNote || null,
        status: "todo",
        client_id: request.client_id,
        assignee_id: cbAssignee,
        created_by: currentUserId,
        due_at: new Date(cbDue).toISOString(),
        service_request_id: id,
        task_type: "service_callback",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Перезвон запланирован");
      setCbDue("");
      setCbNote("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rescheduleCallback = useMutation({
    mutationFn: async ({ task, when }: { task: ServiceTaskRow; when: string }) => {
      if (!caps.canManageCallbacks) throw new Error(DENIED_MESSAGE);
      const stamp = new Date().toLocaleString("ru-RU");
      const appended = `${task.description ? task.description + "\n" : ""}[${stamp}] Не дозвонились, перенос на ${new Date(when).toLocaleString("ru-RU")}`;
      const { error } = await supabase
        .from("tasks")
        .update({ due_at: new Date(when).toISOString(), description: appended, status: "todo" })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Перенесено");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeCallback = useMutation({
    mutationFn: async (taskId: string) => {
      if (!caps.canManageCallbacks) throw new Error(DENIED_MESSAGE);
      const { error } = await supabase.from("tasks").update({ status: "done" }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Перезвон завершён");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!request) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="flex items-center gap-2 flex-wrap">
              {request.issue?.slice(0, 60) || "Заявка"}
              <Badge variant="outline" className={STATUS_TONE[request.status]}>
                {SERVICE_STATUS[request.status] || request.status}
              </Badge>
            </SheetTitle>
            {onEdit && caps.canEditRequest && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(request)}
                className="shrink-0"
              >
                <Pencil className="size-4 mr-1" /> Редактировать
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* ---- Смена статуса ---- */}
        {allowed.length > 0 && caps.canChangeStatus && (
          <div className="mt-4 rounded-xl border border-border p-3 space-y-3">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Сменить статус
            </Label>
            <div className="flex items-center gap-2">
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Выберите переход…" />
                </SelectTrigger>
                <SelectContent>
                  {allowed.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SERVICE_STATUS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => {
                  if (
                    target === "cancelled" &&
                    !confirm("Отменить заявку? Действие фиксируется в истории.")
                  )
                    return;
                  if (
                    target === "done" &&
                    !confirm("Завершить заявку? Действие фиксируется в истории.")
                  )
                    return;
                  changeStatus.mutate();
                }}
                disabled={!target || changeStatus.isPending}
              >
                <ArrowRight className="size-4" />
              </Button>
            </div>
            {target === "done" && (
              <div className="space-y-2">
                <div>
                  <Label>Результат (resolution) *</Label>
                  <Textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Что сделано"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={problemResolved}
                    onChange={(e) => setProblemResolved(e.target.checked)}
                  />
                  Проблема решена
                </label>
              </div>
            )}
            {target === "rescheduled" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label>Новая дата *</Label>
                  <Input
                    type="datetime-local"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Причина *</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )}

        <Tabs defaultValue="info" className="mt-4">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="info">
              <Info className="size-4" />
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="size-4" />
            </TabsTrigger>
            <TabsTrigger value="callbacks">
              <PhoneCall className="size-4" />
            </TabsTrigger>
            <TabsTrigger value="plan">
              <CalendarClock className="size-4" />
            </TabsTrigger>
          </TabsList>

          {/* Информация */}
          <TabsContent value="info" className="space-y-2 text-sm">
            <Row label="Клиент" value={request.clients?.full_name} />
            <Row label="Объект" value={request.objects?.name} />
            <Row label="Проблема" value={request.issue} />
            <Row label="Тип" value={SERVICE_TYPE[request.service_type] || request.service_type} />
            <Row label="Приоритет" value={PRIORITY[request.priority] || request.priority} />
            <Row label="Координатор" value={staffName(request.coordinator_id)} />
            <Row label="Исполнитель" value={staffName(request.assignee_id)} />
            <Row label="Визит" value={fmtDateTime(request.scheduled_at)} />
            <Row
              label="Стоимость"
              value={`${new Intl.NumberFormat("ru-RU").format(Number(request.cost || 0))} ₸`}
            />
            <Row label="Подтверждена" value={fmtDateTime(request.confirmed_at)} />
            <Row label="Выехал" value={fmtDateTime(request.departed_at)} />
            <Row label="На месте" value={fmtDateTime(request.arrived_at)} />
            <Row label="Начата" value={fmtDateTime(request.started_at)} />
            <Row label="Завершена" value={fmtDateTime(request.completed_at)} />
            {request.resolution && <Row label="Результат" value={request.resolution} />}
            {request.reschedule_count > 0 && (
              <Row label="Переносов" value={String(request.reschedule_count)} />
            )}
            {request.notes && <Row label="Заметки" value={request.notes} />}
          </TabsContent>

          {/* История */}
          <TabsContent value="history" className="space-y-2">
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Событий пока нет</p>
            )}
            {events.map((e) => (
              <div key={e.id} className="rounded-lg border border-border p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {e.event_type === "created" ? (
                      "Создано"
                    ) : (
                      <>
                        {SERVICE_STATUS[e.from_status ?? ""] || e.from_status || "—"} →{" "}
                        {SERVICE_STATUS[e.to_status ?? ""] || e.to_status}
                      </>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtDateTime(e.occurred_at)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {staffName(e.actor_id)}
                  {e.notes ? ` · ${e.notes}` : ""}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* Перезвоны */}
          <TabsContent value="callbacks" className="space-y-3">
            {caps.canManageCallbacks && (
              <div className="rounded-xl border border-border p-3 space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Новый перезвон
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label>Когда *</Label>
                    <Input
                      type="datetime-local"
                      value={cbDue}
                      onChange={(e) => setCbDue(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Ответственный *</Label>
                    <Select value={cbAssignee} onValueChange={setCbAssignee}>
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.full_name || "Без имени"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea
                  placeholder="Причина / комментарий"
                  value={cbNote}
                  onChange={(e) => setCbNote(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => createCallback.mutate()}
                  disabled={createCallback.isPending}
                >
                  Запланировать
                </Button>
              </div>
            )}

            {callbacks
              .filter((t) => t.task_type === "service_callback")
              .map((t) => (
                <div key={t.id} className="rounded-lg border border-border p-2.5 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={
                        isOverdue(t.due_at) && t.status !== "done"
                          ? "text-red-600 font-medium"
                          : "font-medium"
                      }
                    >
                      {fmtDateTime(t.due_at)}
                    </span>
                    <Badge variant="outline">{t.status === "done" ? "Завершён" : "Активен"}</Badge>
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground whitespace-pre-line">
                      {t.description}
                    </p>
                  )}
                  {t.status !== "done" && caps.canManageCallbacks && (
                    <div className="flex gap-2 pt-1">
                      <NoAnswer
                        disabled={rescheduleCallback.isPending}
                        onReschedule={(when) => rescheduleCallback.mutate({ task: t, when })}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => closeCallback.mutate(t.id)}
                        disabled={closeCallback.isPending}
                      >
                        Дозвонились
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            {callbacks.filter((t) => t.task_type !== "service_callback").length > 0 && (
              <div className="pt-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Прочие задачи
                </Label>
                {callbacks
                  .filter((t) => t.task_type !== "service_callback")
                  .map((t) => (
                    <div key={t.id} className="rounded-lg border border-border p-2.5 text-sm mt-1">
                      <span className="font-medium">{TASK_TYPE[t.task_type ?? ""] || t.title}</span>{" "}
                      · {fmtDateTime(t.due_at)}
                    </div>
                  ))}
              </div>
            )}
          </TabsContent>

          {/* План */}
          <TabsContent value="plan" className="space-y-2 text-sm">
            {!request.service_plan_id && (
              <p className="text-muted-foreground py-6 text-center">
                Заявка не связана с планом обслуживания.
              </p>
            )}
            {plan && (
              <>
                <Row label="План" value={plan.name} />
                <Row label="Периодичность" value={`${plan.interval_days} дн.`} />
                <Row label="Следующий визит" value={fmtDateTime(plan.next_visit_at)} />
                <Row label="Активен" value={plan.is_active ? "Да" : "Нет"} />
                <Row label="Шаблон проблемы" value={plan.issue_template} />
              </>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-3 py-1 border-b border-border/50 last:border-0">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex-1 whitespace-pre-line">{value || "—"}</span>
    </div>
  );
}

function NoAnswer({
  onReschedule,
  disabled,
}: {
  onReschedule: (when: string) => void;
  disabled?: boolean;
}) {
  const [when, setWhen] = useState("");
  const [openIt, setOpenIt] = useState(false);
  if (!openIt)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpenIt(true)} disabled={disabled}>
        Не дозвонились
      </Button>
    );
  return (
    <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto">
      <Input
        type="datetime-local"
        className="h-8 min-w-0 flex-1 sm:flex-none"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
      />
      <Button
        size="sm"
        disabled={!when || disabled}
        onClick={() => {
          onReschedule(when);
          setOpenIt(false);
          setWhen("");
        }}
      >
        ОК
      </Button>
    </div>
  );
}
