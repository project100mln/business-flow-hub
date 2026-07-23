import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import {
  PRIORITY,
  SERVICE_TYPE,
  normalizePhone,
  type ServiceRequestWithRefs,
  type ServiceRequestUpdate,
} from "@/lib/service";
import type { ServiceCapabilities } from "@/lib/service-permissions";
import {
  serviceKeys,
  invalidateServiceRequest,
  invalidateServicePlans,
} from "@/lib/service-queries";

type Editing = ServiceRequestWithRefs | null;

// Клиент в том виде, в каком его выбирают поиск/создание (усечённый select).
type ClientOption = { id: string; full_name: string | null; phone: string | null };

const CREATE_STATUSES: Record<string, string> = {
  new: "Новая",
  callback: "Перезвон",
  scheduled: "Запланирована",
};

export function ServiceRequestDialog({
  open,
  onOpenChange,
  editing,
  currentUserId,
  caps,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Editing;
  currentUserId: string | null;
  caps: ServiceCapabilities;
}) {
  const qc = useQueryClient();
  const isEdit = !!editing?.id;

  // ---- form state ----
  const [clientId, setClientId] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [objectId, setObjectId] = useState("");
  const [productId, setProductId] = useState("");
  const [serviceType, setServiceType] = useState("one_time");
  const [issue, setIssue] = useState("");
  const [status, setStatus] = useState("new");
  const [priority, setPriority] = useState("normal");
  const [scheduledAt, setScheduledAt] = useState("");
  const [coordinatorId, setCoordinatorId] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [periodic, setPeriodic] = useState(false);
  const [intervalDays, setIntervalDays] = useState("90");
  const [planName, setPlanName] = useState("");

  // client search / creation
  const [clientSearch, setClientSearch] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ full_name: "", phone: "", address: "" });

  useEffect(() => {
    if (!open) return;
    if (editing?.id) {
      setClientId(editing.client_id || "");
      setClientLabel(editing.clients?.full_name || "");
      setObjectId(editing.object_id || "");
      setProductId(editing.product_id || "");
      setServiceType(editing.service_type || "one_time");
      setIssue(editing.issue || "");
      setStatus(editing.status || "new");
      setPriority(editing.priority || "normal");
      setScheduledAt(editing.scheduled_at ? editing.scheduled_at.slice(0, 16) : "");
      setCoordinatorId(editing.coordinator_id || "");
      setAssigneeId(editing.assignee_id || "");
      setCost(editing.cost ? String(editing.cost) : "");
      setNotes(editing.notes || "");
      setPeriodic(false);
    } else {
      setClientId("");
      setClientLabel("");
      setObjectId("");
      setProductId("");
      setServiceType("one_time");
      setIssue("");
      setStatus("new");
      setPriority("normal");
      setScheduledAt("");
      // Дефолт координатора = текущий пользователь ставим ТОЛЬКО если у роли
      // есть право назначения. Иначе поле вообще не должно попасть в payload.
      setCoordinatorId(caps.canAssignRequest ? currentUserId || "" : "");
      setAssigneeId("");
      setCost("");
      setNotes("");
      setPeriodic(false);
      setIntervalDays("90");
      setPlanName("");
    }
    setClientSearch("");
    setShowNewClient(false);
    setNewClient({ full_name: "", phone: "", address: "" });
  }, [open, editing, currentUserId, caps.canAssignRequest]);

  // сотрудники — только из profiles текущей компании (RLS ограничивает компанией)
  const { data: staff = [] } = useQuery({
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

  // поиск клиентов по телефону/имени/адресу
  const { data: matches = [] } = useQuery({
    queryKey: serviceKeys.clientSearch(clientSearch),
    enabled: clientSearch.trim().length >= 2,
    queryFn: async () => {
      const s = clientSearch.replace(/[%,]/g, " ").trim();
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, phone, address")
        .or(`full_name.ilike.%${s}%,phone.ilike.%${s}%,address.ilike.%${s}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  // потенциальные дубли по нормализованному телефону нового клиента
  const normNew = normalizePhone(newClient.phone);
  const { data: dupes = [] } = useQuery({
    queryKey: serviceKeys.clientDupe(normNew),
    enabled: showNewClient && normNew.length >= 5,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, full_name, phone");
      if (error) throw error;
      return (data ?? []).filter((c) => normalizePhone(c.phone) === normNew);
    },
  });

  const staffName = (id?: string | null) => staff.find((s) => s.id === id)?.full_name || "—";

  const selectClient = (c: ClientOption) => {
    setClientId(c.id);
    setClientLabel(`${c.full_name}${c.phone ? " · " + c.phone : ""}`);
    setClientSearch("");
    setShowNewClient(false);
  };

  const createClient = useMutation({
    mutationFn: async () => {
      if (dupes.length > 0)
        throw new Error("Клиент с таким телефоном уже существует — выберите его из списка");
      const { data, error } = await supabase
        .from("clients")
        .insert({
          full_name: newClient.full_name,
          phone: newClient.phone,
          address: newClient.address || null,
          created_by: currentUserId,
          assigned_to: currentUserId,
        })
        .select("id, full_name, phone")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (c) => {
      selectClient(c);
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Клиент создан");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (periodic && !isEdit) {
        // Периодический сервис: создаём план, первую заявку сделает триггер БД.
        // client_id в service_plans NOT NULL — форма это уже гарантирует (canSave).
        if (!clientId) throw new Error("Выберите клиента для плана обслуживания");
        const { error } = await supabase.from("service_plans").insert({
          client_id: clientId,
          object_id: objectId || null,
          product_id: productId || null,
          name: planName || issue.slice(0, 60) || "План обслуживания",
          service_type: "maintenance",
          issue_template: issue,
          interval_days: Math.max(1, Number(intervalDays) || 90),
          next_visit_at: scheduledAt
            ? new Date(scheduledAt).toISOString()
            : new Date().toISOString(),
          coordinator_id: coordinatorId || null,
          assignee_id: assigneeId || null,
          priority,
          estimated_cost: cost ? Number(cost) : null,
          notes: notes || null,
          created_by: currentUserId,
        });
        if (error) throw error;
        return;
      }

      // Whitelist payload: собираем поля пошагово и включаем поля назначения
      // (coordinator_id / assignee_id) ТОЛЬКО если у роли есть право
      // назначения. Так оператор не сможет ни очистить чужое назначение при
      // обычном редактировании, ни отправить назначение при создании.
      // Реальная защита — RLS/триггер/RPC на сервере (см. отчёт).
      const payload: ServiceRequestUpdate = {
        client_id: clientId || null,
        object_id: objectId || null,
        product_id: productId || null,
        service_type: serviceType,
        issue,
        priority,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        notes: notes || null,
      };
      if (caps.canAssignRequest) {
        payload.coordinator_id = coordinatorId || null;
        payload.assignee_id = assigneeId || null;
      }
      if (caps.canEditFinancialFields) {
        payload.cost = cost ? Number(cost) : 0;
      } else if (!isEdit) {
        payload.cost = 0;
      }
      if (isEdit) {
        // статус здесь НЕ меняем — переходы идут через карточку заявки (FSM)
        const { error } = await supabase
          .from("service_requests")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("service_requests")
          .insert({ ...payload, issue, status, created_by: currentUserId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(
        isEdit ? "Заявка обновлена" : periodic ? "План обслуживания создан" : "Заявка создана",
      );
      onOpenChange(false);
      invalidateServiceRequest(qc, editing?.id);
      if (periodic) invalidateServicePlans(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scheduledRequired = !periodic && status === "scheduled" && !scheduledAt;
  const canSave = useMemo(() => {
    if (!issue.trim()) return false;
    if (scheduledRequired) return false;
    if (periodic && (!clientId || !scheduledAt)) return false;
    return true;
  }, [issue, scheduledRequired, periodic, clientId, scheduledAt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] sm:w-full max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактировать заявку" : "Новая сервисная заявка"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[68vh] overflow-y-auto pr-1">
          {/* ---- Клиент ---- */}
          <div className="rounded-xl border border-border p-3 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Клиент</Label>
            {clientId ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-emerald-600" />
                  {clientLabel || "Выбран"}
                </div>
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
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Поиск: телефон, имя или адрес…"
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
                        <span className="text-muted-foreground">
                          {" "}
                          · {c.phone}
                          {c.address ? " · " + c.address : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {clientSearch.trim().length >= 2 && matches.length === 0 && (
                  <p className="text-xs text-muted-foreground">Ничего не найдено.</p>
                )}
                <Button size="sm" variant="outline" onClick={() => setShowNewClient((v) => !v)}>
                  <UserPlus className="size-4 mr-1" />
                  Новый клиент
                </Button>
                {showNewClient && (
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Имя *</Label>
                        <Input
                          value={newClient.full_name}
                          onChange={(e) =>
                            setNewClient({ ...newClient, full_name: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>Телефон *</Label>
                        <Input
                          value={newClient.phone}
                          onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Адрес</Label>
                      <Input
                        value={newClient.address}
                        onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                      />
                    </div>
                    {dupes.length > 0 && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 space-y-1">
                        <div className="flex items-center gap-1.5 text-amber-700 text-sm font-medium">
                          <AlertTriangle className="size-4" />
                          Возможный дубль по телефону
                        </div>
                        {dupes.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => selectClient(c)}
                            className="block w-full text-left text-sm px-2 py-1 rounded hover:bg-amber-500/10"
                          >
                            Выбрать «{c.full_name}» · {c.phone}
                          </button>
                        ))}
                      </div>
                    )}
                    <Button
                      size="sm"
                      onClick={() => createClient.mutate()}
                      disabled={
                        !newClient.full_name ||
                        !newClient.phone ||
                        dupes.length > 0 ||
                        createClient.isPending
                      }
                    >
                      Создать и выбрать
                    </Button>
                  </div>
                )}
              </>
            )}
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
              <Label>Продукт</Label>
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
            <Label>Описание проблемы *</Label>
            <Textarea value={issue} onChange={(e) => setIssue(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Тип сервиса</Label>
              <Select value={serviceType} onValueChange={setServiceType} disabled={periodic}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SERVICE_TYPE).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {!isEdit && !periodic && (
            <div>
              <Label>Начальный статус</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CREATE_STATUSES).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>
                {periodic ? "Первый визит *" : "Дата и время"}
                {scheduledRequired && (
                  <span className="text-destructive"> — обязательно для «Запланирована»</span>
                )}
              </Label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            {caps.canEditFinancialFields && (
              <div>
                <Label>Стоимость, ₸</Label>
                <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Оператор-координатор</Label>
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
              <Label>Выездной исполнитель</Label>
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

          <div>
            <Label>Заметки</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {!isEdit && (
            <div className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Периодический сервис</Label>
                  <p className="text-xs text-muted-foreground">
                    Создаст план обслуживания. Первую заявку сформирует система.
                  </p>
                </div>
                <Switch checked={periodic} onCheckedChange={setPeriodic} />
              </div>
              {periodic && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <Label>Название плана</Label>
                    <Input
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      placeholder="напр. ТО фильтра"
                    />
                  </div>
                  <div>
                    <Label>Интервал, дней *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={intervalDays}
                      onChange={(e) => setIntervalDays(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            disabled={!canSave || save.isPending}
            className="bg-gradient-primary"
          >
            {periodic ? "Создать план" : isEdit ? "Сохранить" : "Создать заявку"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
