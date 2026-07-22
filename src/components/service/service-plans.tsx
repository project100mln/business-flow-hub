import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  Loader2,
  Plus,
  Pause,
  Play,
  Pencil,
  Eye,
  Search,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  PRIORITY,
  PLAN_SERVICE_TYPES,
  PLAN_DIRECTION,
  SERVICE_STATUS,
  STATUS_TONE,
  fmtDateTime,
  type ServicePlanRow,
  type StaffOption,
} from "@/lib/service";
import {
  serviceKeys,
  invalidateServicePlans,
  invalidateServiceRequest,
} from "@/lib/service-queries";

type PlanRow = ServicePlanRow & {
  clients?: { full_name: string | null; phone?: string | null } | null;
  objects?: { name: string | null } | null;
  products?: { name: string | null } | null;
};

const DIRECTIONS: Record<"all" | "water" | "hyla", string> = {
  all: "Все направления",
  water: "Фильтры воды",
  hyla: "HYLA",
};

const isPlanOverdue = (p: PlanRow): boolean =>
  p.is_active && !!p.next_visit_at && new Date(p.next_visit_at).getTime() < Date.now();

const toLocalInput = (v?: string | null): string => {
  if (!v) return "";
  // Приводим ISO из БД в локальную дату для datetime-local, без сдвига дня.
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ServicePlans({
  staff,
  isAdmin,
  canManage,
  currentUserId,
}: {
  staff: StaffOption[];
  isAdmin: boolean;
  canManage: boolean;
  currentUserId: string | null;
}) {
  const qc = useQueryClient();
  const staffName = (uid?: string | null) => staff.find((s) => s.id === uid)?.full_name || "—";

  const [search, setSearch] = useState("");
  const [fDirection, setFDirection] = useState<"all" | "water" | "hyla">("all");
  const [fStatus, setFStatus] = useState<"all" | "active" | "paused" | "overdue">("all");

  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<PlanRow | null>(null);

  const {
    data: plans = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: serviceKeys.plans(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_plans")
        .select("*, clients(full_name, phone), objects(name), products(name)")
        .order("next_visit_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanRow[];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("service_plans").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      toast.success(vars.is_active ? "План возобновлён" : "План приостановлен");
      invalidateServicePlans(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let list = plans;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(s) ||
          (p.clients?.full_name || "").toLowerCase().includes(s) ||
          (p.clients?.phone || "").toLowerCase().includes(s),
      );
    }
    if (fDirection !== "all") {
      list = list.filter((p) => PLAN_DIRECTION[p.service_type] === fDirection);
    }
    if (fStatus !== "all") {
      list = list.filter((p) =>
        fStatus === "active"
          ? p.is_active && !isPlanOverdue(p)
          : fStatus === "paused"
            ? !p.is_active
            : isPlanOverdue(p),
      );
    }
    return list;
  }, [plans, search, fDirection, fStatus]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (p: PlanRow) => {
    setEditing(p);
    setDialogOpen(true);
  };

  const confirmToggle = (p: PlanRow) => {
    if (p.is_active) {
      if (!confirm(`Приостановить план «${p.name}»? Новые заявки создаваться не будут.`)) return;
    }
    toggle.mutate({ id: p.id, is_active: !p.is_active });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8 w-full sm:w-64"
            placeholder="Поиск: план, клиент, телефон…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={fDirection}
          onValueChange={(v) => setFDirection(v as "all" | "water" | "hyla")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DIRECTIONS).map(([k, l]) => (
              <SelectItem key={k} value={k}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={fStatus}
          onValueChange={(v) => setFStatus(v as "all" | "active" | "paused" | "overdue")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все планы</SelectItem>
            <SelectItem value="active">Активные</SelectItem>
            <SelectItem value="paused">Приостановленные</SelectItem>
            <SelectItem value="overdue">Просроченные</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          {canManage && (
            <Button className="bg-gradient-primary" onClick={openCreate}>
              <Plus className="size-4 mr-1" />
              Новый план
            </Button>
          )}
        </div>
      </div>

      {/* Loading / error */}
      {isLoading && plans.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Загружаем планы…
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="size-4" /> Не удалось загрузить планы: {error.message}
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Повторить
          </Button>
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="rounded-2xl border border-border bg-gradient-surface shadow-card p-10 text-center text-sm text-muted-foreground">
          Планов обслуживания пока нет
        </div>
      )}

      {/* Mobile cards */}
      {filtered.length > 0 && (
        <div className="grid gap-2 md:hidden">
          {filtered.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              staffName={staffName}
              canManage={canManage}
              onView={() => setViewing(p)}
              onEdit={() => openEdit(p)}
              onToggle={() => confirmToggle(p)}
              toggling={toggle.isPending}
            />
          ))}
        </div>
      )}

      {/* Desktop table */}
      {filtered.length > 0 && (
        <div className="hidden md:block rounded-2xl border border-border bg-gradient-surface shadow-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>План</TableHead>
                <TableHead>Клиент</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Интервал</TableHead>
                <TableHead>Следующий визит</TableHead>
                <TableHead>Координатор</TableHead>
                <TableHead>Приоритет</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const overdue = isPlanOverdue(p);
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setViewing(p)}>
                    <TableCell className="font-medium">
                      {p.name}
                      <div className="text-[11px] text-muted-foreground">
                        {PLAN_DIRECTION[p.service_type] === "hyla" ? "HYLA" : "Фильтры воды"}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.clients?.full_name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {PLAN_SERVICE_TYPES[p.service_type] || p.service_type}
                    </TableCell>
                    <TableCell>{p.interval_days} дн.</TableCell>
                    <TableCell className={overdue ? "text-red-600" : "text-muted-foreground"}>
                      {fmtDateTime(p.next_visit_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {staffName(p.coordinator_id)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{PRIORITY[p.priority] || p.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <PlanStatusBadge plan={p} />
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" onClick={() => setViewing(p)}>
                        <Eye className="size-4" />
                      </Button>
                      {canManage && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={toggle.isPending}
                            onClick={() => confirmToggle(p)}
                            title={p.is_active ? "Приостановить" : "Возобновить"}
                          >
                            {p.is_active ? (
                              <Pause className="size-4" />
                            ) : (
                              <Play className="size-4" />
                            )}
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PlanDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        staff={staff}
        currentUserId={currentUserId}
      />
      <PlanViewDialog
        plan={viewing}
        open={!!viewing}
        onOpenChange={(v) => !v && setViewing(null)}
        staff={staff}
        canManage={canManage}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        onEdit={(p) => {
          setViewing(null);
          openEdit(p);
        }}
      />
    </div>
  );
}

function PlanStatusBadge({ plan }: { plan: PlanRow }) {
  if (!plan.is_active)
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
        Приостановлен
      </Badge>
    );
  if (isPlanOverdue(plan))
    return (
      <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
        Просрочен
      </Badge>
    );
  return (
    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
      Активен
    </Badge>
  );
}

function PlanCard({
  plan,
  staffName,
  canManage,
  onView,
  onEdit,
  onToggle,
  toggling,
}: {
  plan: PlanRow;
  staffName: (uid?: string | null) => string;
  canManage: boolean;
  onView: () => void;
  onEdit: () => void;
  onToggle: () => void;
  toggling: boolean;
}) {
  const overdue = isPlanOverdue(plan);
  return (
    <div className="rounded-2xl border border-border bg-gradient-surface shadow-card p-3">
      <button className="w-full text-left" onClick={onView}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{plan.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {plan.clients?.full_name || "—"}
              {plan.clients?.phone ? " · " + plan.clients.phone : ""}
            </div>
          </div>
          <PlanStatusBadge plan={plan} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
          <div className="text-muted-foreground">Тип</div>
          <div className="text-right">
            {PLAN_SERVICE_TYPES[plan.service_type] || plan.service_type}
          </div>
          <div className="text-muted-foreground">Интервал</div>
          <div className="text-right">{plan.interval_days} дн.</div>
          <div className="text-muted-foreground">Следующий визит</div>
          <div className={`text-right ${overdue ? "text-red-600" : ""}`}>
            {fmtDateTime(plan.next_visit_at)}
          </div>
          <div className="text-muted-foreground">Координатор</div>
          <div className="text-right">{staffName(plan.coordinator_id)}</div>
        </div>
      </button>
      {canManage && (
        <div className="mt-2 flex gap-1 justify-end">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="size-3.5 mr-1" />
            Изменить
          </Button>
          <Button size="sm" variant="outline" disabled={toggling} onClick={onToggle}>
            {plan.is_active ? (
              <>
                <Pause className="size-3.5 mr-1" />
                Пауза
              </>
            ) : (
              <>
                <Play className="size-3.5 mr-1" />
                Продолжить
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit dialog
// ---------------------------------------------------------------------------
type ClientOption = { id: string; full_name: string | null; phone: string | null };

function PlanDialog({
  open,
  onOpenChange,
  editing,
  staff,
  currentUserId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PlanRow | null;
  staff: StaffOption[];
  currentUserId: string | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!editing?.id;

  const [clientId, setClientId] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [objectId, setObjectId] = useState("");
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [serviceType, setServiceType] = useState<string>("cartridge_replacement");
  const [issueTemplate, setIssueTemplate] = useState("");
  const [intervalDays, setIntervalDays] = useState("180");
  const [nextVisitAt, setNextVisitAt] = useState("");
  const [coordinatorId, setCoordinatorId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [notes, setNotes] = useState("");

  const [clientSearch, setClientSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setClientId(editing.client_id || "");
      setClientLabel(editing.clients?.full_name || "");
      setObjectId(editing.object_id || "");
      setProductId(editing.product_id || "");
      setName(editing.name || "");
      setServiceType(editing.service_type || "cartridge_replacement");
      setIssueTemplate(editing.issue_template || "");
      setIntervalDays(String(editing.interval_days || 180));
      setNextVisitAt(toLocalInput(editing.next_visit_at));
      setCoordinatorId(editing.coordinator_id || "");
      setAssigneeId(editing.assignee_id || "");
      setPriority(editing.priority || "normal");
      setEstimatedCost(editing.estimated_cost != null ? String(editing.estimated_cost) : "");
      setNotes(editing.notes || "");
    } else {
      setClientId("");
      setClientLabel("");
      setObjectId("");
      setProductId("");
      setName("");
      setServiceType("cartridge_replacement");
      setIssueTemplate("");
      setIntervalDays("180");
      setNextVisitAt("");
      setCoordinatorId(currentUserId || "");
      setAssigneeId("");
      setPriority("normal");
      setEstimatedCost("");
      setNotes("");
    }
    setClientSearch("");
  }, [open, editing, currentUserId]);

  const { data: matches = [] } = useQuery({
    queryKey: serviceKeys.clientSearch(clientSearch),
    enabled: !isEdit && clientSearch.trim().length >= 2,
    queryFn: async () => {
      const s = clientSearch.replace(/[%,]/g, " ").trim();
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, phone")
        .or(`full_name.ilike.%${s}%,phone.ilike.%${s}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: objects = [] } = useQuery({
    queryKey: serviceKeys.objects(),
    queryFn: async () => {
      const { data, error } = await supabase.from("objects").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: products = [] } = useQuery({
    queryKey: serviceKeys.products(),
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectClient = (c: ClientOption) => {
    setClientId(c.id);
    setClientLabel(`${c.full_name || ""}${c.phone ? " · " + c.phone : ""}`);
    setClientSearch("");
  };

  const canSave =
    !!clientId &&
    !!name.trim() &&
    !!issueTemplate.trim() &&
    !!nextVisitAt &&
    Number(intervalDays) > 0;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        client_id: clientId,
        object_id: objectId || null,
        product_id: productId || null,
        name: name.trim(),
        service_type: serviceType,
        issue_template: issueTemplate.trim(),
        interval_days: Math.max(1, Number(intervalDays) || 180),
        next_visit_at: new Date(nextVisitAt).toISOString(),
        coordinator_id: coordinatorId || null,
        assignee_id: assigneeId || null,
        priority,
        estimated_cost: estimatedCost ? Number(estimatedCost) : null,
        notes: notes.trim() || null,
      };
      if (isEdit && editing) {
        const { error } = await supabase.from("service_plans").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("service_plans").insert({
          ...payload,
          is_active: true,
          created_by: currentUserId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "План обновлён" : "План создан");
      invalidateServicePlans(qc);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать план" : "Новый план обслуживания"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Client */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Клиент *
            </Label>
            {clientId ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>{clientLabel || "Выбран"}</span>
                {!isEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setClientId("");
                      setClientLabel("");
                    }}
                  >
                    Сменить
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Поиск клиента: имя или телефон…"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                  />
                </div>
                {matches.length > 0 && (
                  <div className="rounded-lg border border-border divide-y divide-border">
                    {matches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectClient(c)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                      >
                        <span className="font-medium">{c.full_name}</span>
                        <span className="text-muted-foreground"> · {c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
                {clientSearch.trim().length >= 2 && matches.length === 0 && (
                  <p className="text-xs text-muted-foreground">Ничего не найдено.</p>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Название плана *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="напр. ТО фильтра под мойкой"
              />
            </div>
            <div>
              <Label>Тип обслуживания *</Label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__water" disabled>
                    — Фильтры воды —
                  </SelectItem>
                  {Object.entries(PLAN_SERVICE_TYPES)
                    .filter(([k]) => PLAN_DIRECTION[k] === "water")
                    .map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l}
                      </SelectItem>
                    ))}
                  <SelectItem value="__hyla" disabled>
                    — HYLA —
                  </SelectItem>
                  {Object.entries(PLAN_SERVICE_TYPES)
                    .filter(([k]) => PLAN_DIRECTION[k] === "hyla")
                    .map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Объект (B2B)</Label>
              <Select value={objectId} onValueChange={setObjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {objects.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Оборудование / продукт</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Шаблон описания заявки *</Label>
            <Textarea
              value={issueTemplate}
              onChange={(e) => setIssueTemplate(e.target.value)}
              placeholder="Что нужно сделать при визите"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Интервал, дней *</Label>
              <Input
                type="number"
                min={1}
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
              />
            </div>
            <div>
              <Label>Следующий визит *</Label>
              <Input
                type="datetime-local"
                value={nextVisitAt}
                onChange={(e) => setNextVisitAt(e.target.value)}
              />
            </div>
            <div>
              <Label>Приоритет</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Координатор</Label>
              <Select value={coordinatorId} onValueChange={setCoordinatorId}>
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
            <div>
              <Label>Ответственный исполнитель</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Ориентировочная стоимость, ₸</Label>
              <Input
                type="number"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Заметка</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Отмена
          </Button>
          <Button
            className="bg-gradient-primary"
            disabled={!canSave || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" />
                Сохранение…
              </>
            ) : isEdit ? (
              "Сохранить"
            ) : (
              "Создать план"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// View / linked requests dialog
// ---------------------------------------------------------------------------
function PlanViewDialog({
  plan,
  open,
  onOpenChange,
  staff,
  canManage,
  isAdmin,
  currentUserId,
  onEdit,
}: {
  plan: PlanRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staff: StaffOption[];
  canManage: boolean;
  isAdmin: boolean;
  currentUserId: string | null;
  onEdit: (p: PlanRow) => void;
}) {
  const qc = useQueryClient();
  const staffName = (uid?: string | null) => staff.find((s) => s.id === uid)?.full_name || "—";

  const {
    data: requests = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: serviceKeys.planRequests(plan?.id),
    enabled: !!plan?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select("id, issue, status, scheduled_at, completed_at, assignee_id, created_at")
        .eq("service_plan_id", plan!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const openRequests = useMemo(
    () => requests.filter((r) => !["done", "cancelled"].includes(r.status)),
    [requests],
  );

  const createRequest = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error("Нет плана");
      if (!plan.is_active)
        throw new Error("План приостановлен — возобновите его перед созданием заявки");
      if (openRequests.length > 0)
        throw new Error("По плану уже есть активная заявка — откройте её вместо создания дубля");
      const { error } = await supabase.from("service_requests").insert({
        client_id: plan.client_id,
        object_id: plan.object_id,
        product_id: plan.product_id,
        issue: plan.issue_template,
        status: "scheduled",
        priority: plan.priority,
        scheduled_at: plan.next_visit_at,
        assignee_id: plan.assignee_id,
        coordinator_id: plan.coordinator_id,
        cost: plan.estimated_cost ?? 0,
        notes: plan.notes,
        service_type: "maintenance",
        service_plan_id: plan.id,
        created_by: currentUserId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Заявка создана");
      invalidateServicePlans(qc);
      invalidateServiceRequest(qc);
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      if (!plan) return;
      const { error } = await supabase.from("service_plans").delete().eq("id", plan.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("План удалён");
      invalidateServicePlans(qc);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!plan) return null;

  const overdue = isPlanOverdue(plan);
  const canCreateRequest = canManage && plan.is_active && openRequests.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{plan.name}</span>
            <PlanStatusBadge plan={plan} />
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Info label="Клиент" value={plan.clients?.full_name || "—"} />
            <Info label="Телефон" value={plan.clients?.phone || "—"} />
            <Info
              label="Направление"
              value={PLAN_DIRECTION[plan.service_type] === "hyla" ? "HYLA" : "Фильтры воды"}
            />
            <Info label="Тип" value={PLAN_SERVICE_TYPES[plan.service_type] || plan.service_type} />
            <Info label="Объект" value={plan.objects?.name || "—"} />
            <Info label="Оборудование" value={plan.products?.name || "—"} />
            <Info label="Интервал" value={`${plan.interval_days} дн.`} />
            <Info
              label="Следующий визит"
              value={fmtDateTime(plan.next_visit_at)}
              tone={overdue ? "text-red-600" : undefined}
            />
            <Info label="Координатор" value={staffName(plan.coordinator_id)} />
            <Info label="Исполнитель" value={staffName(plan.assignee_id)} />
            <Info label="Приоритет" value={PRIORITY[plan.priority] || plan.priority} />
            <Info label="Последняя генерация" value={fmtDateTime(plan.last_generated_at)} />
          </div>

          {plan.issue_template && (
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Шаблон заявки
              </Label>
              <p className="text-sm whitespace-pre-wrap">{plan.issue_template}</p>
            </div>
          )}
          {plan.notes && (
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Заметки
              </Label>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{plan.notes}</p>
            </div>
          )}

          {/* Linked requests */}
          <div className="rounded-xl border border-border">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <div className="text-sm font-medium">Связанные заявки</div>
              <Badge variant="outline">{requests.length}</Badge>
            </div>
            <div className="divide-y divide-border">
              {isLoading && (
                <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Загружаем…
                </div>
              )}
              {error && (
                <div className="p-3 text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="size-4" /> {error.message}
                </div>
              )}
              {!isLoading && !error && requests.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">Заявок пока нет</div>
              )}
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={STATUS_TONE[r.status]}>
                        {SERVICE_STATUS[r.status] || r.status}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {fmtDateTime(r.scheduled_at)}
                      </span>
                    </div>
                    <div className="truncate">{r.issue}</div>
                  </div>
                  <a
                    href={`/app/service?request=${r.id}`}
                    className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      window.dispatchEvent(
                        new CustomEvent("orbit:open-service-request", { detail: r.id }),
                      );
                      onOpenChange(false);
                    }}
                  >
                    Открыть <ExternalLink className="size-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {canManage && (
            <>
              <Button variant="outline" onClick={() => onEdit(plan)}>
                <Pencil className="size-4 mr-1" />
                Редактировать
              </Button>
              <Button
                variant="outline"
                disabled={createRequest.isPending || !canCreateRequest}
                title={
                  !plan.is_active
                    ? "План приостановлен"
                    : openRequests.length > 0
                      ? "По плану уже есть активная заявка"
                      : undefined
                }
                onClick={() => createRequest.mutate()}
              >
                {createRequest.isPending ? (
                  <>
                    <Loader2 className="size-4 mr-1 animate-spin" />
                    Создаём…
                  </>
                ) : (
                  <>
                    <Plus className="size-4 mr-1" />
                    Создать заявку
                  </>
                )}
              </Button>
              {isAdmin && (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={del.isPending}
                  onClick={() => {
                    if (confirm(`Удалить план «${plan.name}»? Это действие нельзя отменить.`))
                      del.mutate();
                  }}
                >
                  Удалить
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm ${tone || ""}`}>{value}</div>
    </div>
  );
}
