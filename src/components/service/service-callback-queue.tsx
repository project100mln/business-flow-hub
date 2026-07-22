import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime, isOverdue, isToday, type StaffOption } from "@/lib/service";
import { serviceKeys } from "@/lib/service-queries";
import type { ServiceCapabilities } from "@/lib/service-permissions";
import { DENIED_MESSAGE } from "@/lib/service-permissions";

// Очереди перезвонов/сервисных задач: Просроченные, Сегодня, Предстоящие, Без ответа, Завершённые.
export function ServiceCallbackQueue({
  staff,
  onOpenRequest,
  caps,
}: {
  staff: StaffOption[];
  onOpenRequest: (id: string) => void;
  caps: ServiceCapabilities;
}) {
  const qc = useQueryClient();
  const staffName = (uid?: string | null) => staff.find((s) => s.id === uid)?.full_name || "—";

  const {
    data: tasks = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: serviceKeys.tasksCallbacksQueue(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, clients(full_name, phone)")
        .in("task_type", ["service_callback", "service_feedback", "service_upcoming"])
        .order("due_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const done = useMutation({
    mutationFn: async (id: string) => {
      if (!caps.canManageCallbacks) throw new Error(DENIED_MESSAGE);
      const { error } = await supabase.from("tasks").update({ status: "done" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Завершено");
      // общий префикс: обновляем и KPI, и очередь перезвонов
      qc.invalidateQueries({ queryKey: serviceKeys.tasksAll });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = useMemo(() => {
    const all = tasks;
    const active = all.filter((t) => t.status !== "done");
    const noAnswer = active.filter(
      (t) => t.task_type === "service_callback" && (t.description || "").includes("Не дозвонились"),
    );
    const overdue = active.filter((t) => isOverdue(t.due_at) && !noAnswer.includes(t));
    const today = active.filter((t) => isToday(t.due_at) && !isOverdue(t.due_at));
    const upcoming = active.filter(
      (t) => !isOverdue(t.due_at) && !isToday(t.due_at) && !noAnswer.includes(t),
    );
    const closed = all.filter((t) => t.status === "done");
    return [
      { key: "overdue", title: "Просроченные", tone: "text-red-600", items: overdue },
      { key: "today", title: "Сегодня", tone: "text-amber-600", items: today },
      { key: "upcoming", title: "Предстоящие", tone: "text-foreground", items: upcoming },
      { key: "noanswer", title: "Без ответа", tone: "text-orange-600", items: noAnswer },
      {
        key: "closed",
        title: "Завершённые",
        tone: "text-muted-foreground",
        items: closed.slice(0, 30),
      },
    ];
  }, [tasks]);

  const TYPE_LABEL: Record<string, string> = {
    service_callback: "Перезвон",
    service_feedback: "Обратная связь",
    service_upcoming: "Предстоящий сервис",
  };

  if (isLoading && tasks.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Загружаем задачи…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="size-4" /> Не удалось загрузить задачи: {error.message}
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Повторить
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div
          key={g.key}
          className="rounded-2xl border border-border bg-gradient-surface shadow-card p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-sm font-semibold ${g.tone}`}>{g.title}</h3>
            <Badge variant="outline">{g.items.length}</Badge>
          </div>
          {g.items.length === 0 && <p className="text-xs text-muted-foreground py-2">Нет задач</p>}
          <div className="space-y-2">
            {g.items.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {TYPE_LABEL[t.task_type ?? ""] || t.task_type}
                    </Badge>
                    <span className="font-medium truncate">{t.clients?.full_name || "—"}</span>
                    {t.clients?.phone && (
                      <span className="text-muted-foreground text-xs">{t.clients.phone}</span>
                    )}
                  </div>
                  <div
                    className={`text-xs ${isOverdue(t.due_at) && t.status !== "done" ? "text-red-600" : "text-muted-foreground"}`}
                  >
                    {fmtDateTime(t.due_at)} · {staffName(t.assignee_id)}
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {t.service_request_id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => t.service_request_id && onOpenRequest(t.service_request_id)}
                    >
                      Заявка
                    </Button>
                  )}
                  {t.status !== "done" && caps.canManageCallbacks && (
                    <Button size="sm" variant="outline" onClick={() => done.mutate(t.id)}>
                      Готово
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
