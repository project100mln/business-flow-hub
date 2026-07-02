import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useRef, useMemo, useCallback, useEffect, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Plus, Upload, Phone as PhoneIcon, History, Trash2, Download, KeyRound, Users, Bot, UserPlus, Pencil, Inbox, PhoneCall, XCircle, CheckCircle2, UserCog, Settings, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { parseContactsFile, maskPhone, exportContactsCsv } from "@/lib/call-base";
import { PinGateDialog, SetPinDialog } from "@/components/pin-gate-dialog";

export const Route = createFileRoute("/app/calls")({ component: CallCenter });

const STATUS: Record<string, string> = {
  new: "Новый контакт", queued: "В очереди", connected: "Дозвон",
  no_answer: "Не дозвон", callback: "Перезвонить", refused: "Отказ",
  interested: "Интерес есть", install_scheduled: "Назначена установка",
  passed_to_coordinator: "Передан координатору",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-info/15 text-info border-info/30",
  queued: "bg-muted text-muted-foreground border-border",
  connected: "bg-primary/15 text-primary border-primary/30",
  no_answer: "bg-warning/15 text-warning border-warning/30",
  callback: "bg-warning/15 text-warning border-warning/30",
  refused: "bg-muted text-muted-foreground border-border",
  interested: "bg-primary/15 text-primary border-primary/30",
  install_scheduled: "bg-success/15 text-success border-success/30",
  passed_to_coordinator: "bg-success/15 text-success border-success/30",
};
const TYPE: Record<string, string> = {
  cold: "Холодная база", recommendation: "Рекомендация", instagram: "Instagram", site: "Сайт", other: "Другое",
};
const AI_STATUS: Record<string, { label: string; cls: string }> = {
  disconnected: { label: "Не подключен", cls: "bg-muted text-muted-foreground border-border" },
  connecting: { label: "Подключается", cls: "bg-warning/15 text-warning border-warning/30" },
  active: { label: "Активен", cls: "bg-success/15 text-success border-success/30" },
  error: { label: "Ошибка", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

type View =
  | { kind: "all" } | { kind: "unassigned" } | { kind: "operator"; id: string }
  | { kind: "ai" } | { kind: "callbacks" } | { kind: "refusals" } | { kind: "installs" } | { kind: "reports" };

function CallCenter() {
  const qc = useQueryClient();
  const { hasRole, user } = useAuth();
  const isAdmin = hasRole("admin");
  const canManageBase = isAdmin;
  const canSeeAll = isAdmin || hasRole("manager") || hasRole("coordinator");
  const canViewFullPhone = isAdmin || hasRole("coordinator");

  const [view, setView] = useState<View>({ kind: canSeeAll ? "all" : "operator", id: user?.id ?? "" } as View);
  const [open, setOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [currentContact, setCurrentContact] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pinOpen, setPinOpen] = useState(false);
  const [setPinOpenDlg, setSetPinOpenDlg] = useState(false);
  const pendingAction = useRef<null | (() => void)>(null);
  const [pinTitle, setPinTitle] = useState("");
  const [opsOpen, setOpsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [assignTo, setAssignTo] = useState<string>("");

  const requirePin = (title: string, run: () => void) => {
    pendingAction.current = run; setPinTitle(title); setPinOpen(true);
  };

  const [form, setForm] = useState({ full_name: "", phone: "", source: "", contact_type: "cold", comment: "" });
  const [callForm, setCallForm] = useState({ result: "connected", comment: "", recording_url: "", next_step: "", next_contact_at: "" });

  const PAGE_SIZE = 50;

  const applyViewFilter = useCallback((q: any) => {
    if (!canSeeAll && user?.id) q = q.eq("assigned_operator", user.id);
    switch (view.kind) {
      case "unassigned": q = q.is("assigned_operator", null); break;
      case "operator": q = q.eq("assigned_operator", view.id); break;
      case "callbacks": q = q.in("status", ["callback", "no_answer"]); break;
      case "refusals": q = q.eq("status", "refused"); break;
      case "installs": q = q.in("status", ["install_scheduled", "passed_to_coordinator"]); break;
      default: break;
    }
    return q;
  }, [view, canSeeAll, user?.id]);

  const contactsKey = useMemo(
    () => ["cold_contacts_paged", view, canSeeAll, user?.id] as const,
    [view, canSeeAll, user?.id]
  );

  const {
    data: pages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: contactsLoading,
  } = useInfiniteQuery({
    queryKey: contactsKey,
    enabled: view.kind !== "ai" && view.kind !== "reports",
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("cold_contacts")
        .select("id,full_name,phone,contact_type,assigned_operator,status,created_at,source,comment,client_id,added_by,next_contact_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
      q = applyViewFilter(q);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0, page: pageParam as number };
    },
    getNextPageParam: (last) => {
      const loaded = (last.page + 1) * PAGE_SIZE;
      return loaded < last.count ? last.page + 1 : undefined;
    },
    staleTime: 15_000,
  });

  const filtered = useMemo(
    () => (pages?.pages ?? []).flatMap((p) => p.rows),
    [pages]
  );
  const totalFiltered = pages?.pages?.[0]?.count ?? 0;

  const { data: operators = [] } = useQuery({
    queryKey: ["operators"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_operators" as any);
      if (error) throw error;
      return (data ?? []) as { user_id: string; full_name: string | null; contacts_count: number }[];
    },
    staleTime: 60_000,
  });

  const { data: ai } = useQuery({
    queryKey: ["ai_operator"],
    queryFn: async () => (await supabase.from("ai_operator" as any).select("*").limit(1).maybeSingle()).data as any,
    staleTime: 60_000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["call_history", historyOpen], enabled: !!historyOpen,
    queryFn: async () => (await supabase.from("call_history").select("*").eq("contact_id", historyOpen!).order("called_at", { ascending: false })).data ?? [],
  });

  const operatorsById = useMemo(() => {
    const m = new Map<string, string>();
    operators.forEach((o) => m.set(o.user_id, o.full_name || o.user_id.slice(0, 6)));
    return m;
  }, [operators]);
  const operatorName = useCallback(
    (id: string | null) => (id ? (operatorsById.get(id) ?? "—") : "—"),
    [operatorsById]
  );

  const { data: counts = { all: 0, unassigned: 0, callbacks: 0, refusals: 0, installs: 0 } } = useQuery({
    queryKey: ["cold_contacts_counts", canSeeAll, user?.id],
    queryFn: async () => {
      const scope = (q: any) => (!canSeeAll && user?.id ? q.eq("assigned_operator", user.id) : q);
      const head = () => supabase.from("cold_contacts").select("id", { count: "exact", head: true });
      const [all, unassigned, callbacks, refusals, installs] = await Promise.all([
        scope(head()),
        scope(head()).is("assigned_operator", null),
        scope(head()).in("status", ["callback", "no_answer"]),
        scope(head()).eq("status", "refused"),
        scope(head()).in("status", ["install_scheduled", "passed_to_coordinator"]),
      ]);
      return {
        all: all.count ?? 0,
        unassigned: unassigned.count ?? 0,
        callbacks: callbacks.count ?? 0,
        refusals: refusals.count ?? 0,
        installs: installs.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cold_contacts").insert({
        full_name: form.full_name, phone: form.phone, source: form.source || null,
        contact_type: form.contact_type as any, comment: form.comment || null,
        added_by: user?.id, assigned_operator: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Контакт добавлен"); setOpen(false);
      setForm({ full_name: "", phone: "", source: "", contact_type: "cold", comment: "" });
      qc.invalidateQueries({ queryKey: ["cold_contacts_paged"] }); qc.invalidateQueries({ queryKey: ["cold_contacts_counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("cold_contacts").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      // Optimistic: patch only that row in the paged cache — no full refetch, no re-render storm.
      qc.setQueriesData<any>({ queryKey: ["cold_contacts_paged"] }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((p: any) => ({
            ...p,
            rows: p.rows.map((r: any) => (r.id === id ? { ...r, status } : r)),
          })),
        };
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cold_contacts_counts"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["cold_contacts_paged"] });
    },
  });

  const deleteMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("cold_contacts").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      toast.success(`Удалено: ${ids.length}`); setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["cold_contacts_paged"] }); qc.invalidateQueries({ queryKey: ["cold_contacts_counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignMany = useMutation({
    mutationFn: async ({ ids, op }: { ids: string[]; op: string | null }) => {
      const { error } = await supabase.rpc("admin_assign_contacts" as any, { _ids: ids, _operator: op });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Контакты переназначены"); setSelected(new Set()); setAssignTo("");
      qc.invalidateQueries({ queryKey: ["cold_contacts_paged"] }); qc.invalidateQueries({ queryKey: ["cold_contacts_counts"] });
      qc.invalidateQueries({ queryKey: ["operators"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logCall = useMutation({
    mutationFn: async () => {
      if (!currentContact) return;
      const { error: e1 } = await supabase.from("call_history").insert({
        contact_id: currentContact.id, operator_id: user?.id,
        result: callForm.result as any, comment: callForm.comment || null,
        recording_url: callForm.recording_url || null, next_step: callForm.next_step || null,
        next_contact_at: callForm.next_contact_at || null,
      });
      if (e1) throw e1;
      const patch: any = { status: callForm.result, next_contact_at: callForm.next_contact_at || null };
      if (callForm.result === "install_scheduled") {
        const { data: client, error: ec } = await supabase.from("clients").insert({
          full_name: currentContact.full_name, phone: currentContact.phone,
          source: currentContact.source || TYPE[currentContact.contact_type],
          notes: callForm.comment || null, created_by: user?.id, assigned_to: user?.id,
        }).select("id").single();
        if (ec) throw ec;
        patch.client_id = client.id; patch.status = "passed_to_coordinator";
        const { error: er } = await supabase.from("install_requests").insert({
          client_id: client.id, contact_id: currentContact.id,
          client_name: currentContact.full_name, phone: currentContact.phone,
          desired_at: callForm.next_contact_at || null,
          operator_comment: callForm.comment || null, status: "new", created_by: user?.id,
        });
        if (er) throw er;
      }
      const { error: e2 } = await supabase.from("cold_contacts").update(patch).eq("id", currentContact.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Звонок сохранён"); setCallOpen(false); setCurrentContact(null);
      setCallForm({ result: "connected", comment: "", recording_url: "", next_step: "", next_contact_at: "" });
      qc.invalidateQueries({ queryKey: ["cold_contacts_paged"] }); qc.invalidateQueries({ queryKey: ["cold_contacts_counts"] });
      qc.invalidateQueries({ queryKey: ["install_requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleImport = async (file: File) => {
    try {
      const parsed = await parseContactsFile(file);
      if (!parsed.length) { toast.error("Нет валидных строк"); return; }
      const rows = parsed.map((r) => ({ ...r, added_by: user?.id, assigned_operator: user?.id }));
      const { error } = await supabase.from("cold_contacts").insert(rows as any);
      if (error) throw error;
      toast.success(`Импортировано: ${rows.length}`);
      qc.invalidateQueries({ queryKey: ["cold_contacts_paged"] }); qc.invalidateQueries({ queryKey: ["cold_contacts_counts"] });
    } catch (e: any) { toast.error(e.message); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  };

  const handleExport = async () => {
    let q = supabase.from("cold_contacts").select("*").order("created_at", { ascending: false }).limit(50000);
    q = applyViewFilter(q);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    const csv = exportContactsCsv((data ?? []) as any[]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `call-base-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Экспорт готов");
  };

  const renderPhone = (c: any) => canViewFullPhone
    ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:underline"><PhoneIcon className="size-3 text-muted-foreground" />{c.phone}</a>
    : <span className="inline-flex items-center gap-1.5 text-muted-foreground"><PhoneIcon className="size-3" />{maskPhone(c.phone)}</span>;

  const NavBtn = ({ active, onClick, icon: Icon, label, count }: any) => (
    <button onClick={onClick} className={cn(
      "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
      active ? "bg-primary/10 text-primary border border-primary/30" : "hover:bg-muted text-foreground/80 border border-transparent"
    )}>
      <span className="inline-flex items-center gap-2"><Icon className="size-4" />{label}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
    </button>
  );

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">База обзвона</h1>
          <p className="mt-1 text-sm text-muted-foreground">Управление контактами, операторами и AI-обзвоном.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManageBase && (
            <>
              <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,.docx" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
              <Button variant="outline" onClick={() => requirePin("Импорт базы", () => fileRef.current?.click())}>
                <Upload className="size-4 mr-1" />Импорт
              </Button>
              <Button variant="outline" onClick={() => requirePin("Экспорт базы", handleExport)}>
                <Download className="size-4 mr-1" />Экспорт
              </Button>
              <Button variant="outline" onClick={() => setOpsOpen(true)}>
                <UserCog className="size-4 mr-1" />Операторы
              </Button>
              <Button variant="ghost" size="icon" title="PIN" onClick={() => setSetPinOpenDlg(true)}>
                <KeyRound className="size-4" />
              </Button>
            </>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Контакт</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Новый контакт</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>ФИО *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div><Label>Телефон *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div>
                  <Label>Тип контакта</Label>
                  <Select value={form.contact_type} onValueChange={(v) => setForm({ ...form, contact_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TYPE).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Источник</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
                <div><Label>Комментарий</Label><Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.full_name || !form.phone || create.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
        <aside className="space-y-1 rounded-2xl border border-border bg-gradient-surface p-3 shadow-card h-fit">
          {canSeeAll && <NavBtn active={view.kind === "all"} onClick={() => setView({ kind: "all" })} icon={Inbox} label="Все контакты" count={counts.all} />}
          {canSeeAll && <NavBtn active={view.kind === "unassigned"} onClick={() => setView({ kind: "unassigned" })} icon={Users} label="Не назначенные" count={counts.unassigned} />}
          {canSeeAll && (
            <div className="pt-2 pb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Операторы</div>
          )}
          {canSeeAll && operators.map((o) => (
            <NavBtn key={o.user_id} active={view.kind === "operator" && view.id === o.user_id}
              onClick={() => setView({ kind: "operator", id: o.user_id })}
              icon={UserCog} label={o.full_name || "Без имени"} count={Number(o.contacts_count)} />
          ))}
          {!canSeeAll && user?.id && (
            <NavBtn active={view.kind === "operator" && view.id === user.id}
              onClick={() => setView({ kind: "operator", id: user.id })}
              icon={UserCog} label="Мои контакты" count={counts.all} />
          )}
          <NavBtn active={view.kind === "ai"} onClick={() => setView({ kind: "ai" })} icon={Bot} label="AI оператор" />
          <div className="pt-2 pb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Подборки</div>
          <NavBtn active={view.kind === "callbacks"} onClick={() => setView({ kind: "callbacks" })} icon={PhoneCall} label="Перезвоны" count={counts.callbacks} />
          <NavBtn active={view.kind === "refusals"} onClick={() => setView({ kind: "refusals" })} icon={XCircle} label="Отказы" count={counts.refusals} />
          <NavBtn active={view.kind === "installs"} onClick={() => setView({ kind: "installs" })} icon={CheckCircle2} label="Назначенные установки" count={counts.installs} />
          {canSeeAll && <NavBtn active={view.kind === "reports"} onClick={() => setView({ kind: "reports" })} icon={BarChart3} label="Отчёты" />}
        </aside>

        <section className="space-y-4">
          {view.kind === "ai" ? (
            <AiOperatorPanel ai={ai} isAdmin={isAdmin} onEdit={() => setAiOpen(true)} />
          ) : view.kind === "reports" ? (
            <ReportsPanel />
          ) : (
            <>
              {canManageBase && selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3">
                  <span className="text-sm">Выбрано: {selected.size}</span>
                  <Select value={assignTo} onValueChange={setAssignTo}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Назначить оператору…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Снять назначение —</SelectItem>
                      {operators.map((o) => <SelectItem key={o.user_id} value={o.user_id}>{o.full_name || o.user_id.slice(0, 6)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!assignTo || assignMany.isPending}
                    onClick={() => assignMany.mutate({ ids: [...selected], op: assignTo === "__none__" ? null : assignTo })}>
                    Назначить
                  </Button>
                  <Button size="sm" variant="outline" className="text-destructive border-destructive/40"
                    onClick={() => requirePin(`Удалить: ${selected.size}`, () => deleteMany.mutate([...selected]))}>
                    <Trash2 className="size-4 mr-1" />Удалить
                  </Button>
                </div>
              )}

              <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canManageBase && (
                        <TableHead className="w-8">
                          <Checkbox checked={filtered.length > 0 && filtered.every((c: any) => selected.has(c.id))}
                            onCheckedChange={(v) => {
                              const next = new Set(selected);
                              filtered.forEach((c: any) => v ? next.add(c.id) : next.delete(c.id));
                              setSelected(next);
                            }} />
                        </TableHead>
                      )}
                      <TableHead>ФИО</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Оператор</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Добавлен</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c: any) => (
                      <TableRow key={c.id}>
                        {canManageBase && (
                          <TableCell>
                            <Checkbox checked={selected.has(c.id)} onCheckedChange={(v) => {
                              const next = new Set(selected);
                              v ? next.add(c.id) : next.delete(c.id);
                              setSelected(next);
                            }} />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{c.full_name}</TableCell>
                        <TableCell>{renderPhone(c)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{TYPE[c.contact_type]}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{operatorName(c.assigned_operator)}</TableCell>
                        <TableCell>
                          <Select value={c.status} onValueChange={(v) => updateStatus.mutate({ id: c.id, status: v })}>
                            <SelectTrigger className="w-auto h-7 border-0 p-0 bg-transparent [&>svg]:hidden">
                              <Badge variant="outline" className={STATUS_COLOR[c.status]}>{STATUS[c.status]}</Badge>
                            </SelectTrigger>
                            <SelectContent>{Object.entries(STATUS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{new Date(c.created_at).toLocaleDateString("ru-RU")}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="outline" onClick={() => { setCurrentContact(c); setCallOpen(true); }}>
                            <PhoneIcon className="size-3 mr-1" />Звонок
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(c.id)}>
                            <History className="size-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && <TableRow><TableCell colSpan={canManageBase ? 8 : 7} className="text-center text-muted-foreground py-12">Контактов нет</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </section>
      </div>

      <Dialog open={callOpen} onOpenChange={setCallOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Результат: {currentContact?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Результат *</Label>
              <Select value={callForm.result} onValueChange={(v) => setCallForm({ ...callForm, result: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS).filter(([v]) => v !== "new" && v !== "queued").map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Комментарий</Label><Textarea value={callForm.comment} onChange={(e) => setCallForm({ ...callForm, comment: e.target.value })} /></div>
            <div><Label>Ссылка на запись</Label><Input value={callForm.recording_url} onChange={(e) => setCallForm({ ...callForm, recording_url: e.target.value })} placeholder="https://..." /></div>
            <div><Label>Следующий шаг</Label><Input value={callForm.next_step} onChange={(e) => setCallForm({ ...callForm, next_step: e.target.value })} /></div>
            <div><Label>Дата следующего контакта{callForm.result === "install_scheduled" && " (дата установки) *"}</Label><Input type="datetime-local" value={callForm.next_contact_at} onChange={(e) => setCallForm({ ...callForm, next_contact_at: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => logCall.mutate()} disabled={logCall.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyOpen} onOpenChange={(v) => !v && setHistoryOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>История звонков</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {history.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Звонков пока не было</p>}
            {history.map((h: any) => (
              <div key={h.id} className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <Badge variant="outline" className={STATUS_COLOR[h.result]}>{STATUS[h.result]}</Badge>
                  <span className="text-muted-foreground">{new Date(h.called_at).toLocaleString("ru-RU")}</span>
                </div>
                {h.comment && <p className="text-sm">{h.comment}</p>}
                {h.next_step && <p className="text-xs text-muted-foreground">След.: {h.next_step}{h.next_contact_at && ` — ${new Date(h.next_contact_at).toLocaleString("ru-RU")}`}</p>}
                {h.recording_url && <a href={h.recording_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Запись ↗</a>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <OperatorsDialog open={opsOpen} onOpenChange={setOpsOpen} operators={operators} />
      <AiOperatorDialog open={aiOpen} onOpenChange={setAiOpen} ai={ai} />

      <PinGateDialog open={pinOpen} onOpenChange={setPinOpen} title={pinTitle}
        onSuccess={() => { pendingAction.current?.(); pendingAction.current = null; }} />
      <SetPinDialog open={setPinOpenDlg} onOpenChange={setSetPinOpenDlg} />
    </div>
  );
}

function AiOperatorPanel({ ai, isAdmin, onEdit }: { ai: any; isAdmin: boolean; onEdit: () => void }) {
  const s = ai?.connection_status ?? "disconnected";
  const st = AI_STATUS[s] ?? AI_STATUS.disconnected;
  return (
    <div className="rounded-2xl border border-border bg-gradient-surface shadow-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center"><Bot className="size-6 text-primary" /></div>
          <div>
            <h2 className="text-lg font-semibold">{ai?.name || "AI Оператор"}</h2>
            <Badge variant="outline" className={st.cls}>{st.label}</Badge>
          </div>
        </div>
        {isAdmin && <Button variant="outline" onClick={onEdit}><Settings className="size-4 mr-1" />Настроить</Button>}
      </div>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <Field label="Телефонная линия" value={ai?.phone_line} />
        <Field label="Голос" value={ai?.voice} />
        <Field label="Рабочее время" value={ai?.work_hours} />
        <Field label="Лимит звонков в день" value={ai?.daily_call_limit ? String(ai.daily_call_limit) : null} />
        <div className="sm:col-span-2">
          <div className="text-xs text-muted-foreground mb-1">Скрипт звонка</div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap min-h-[80px]">{ai?.script || "—"}</div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground border-t border-border pt-3">
        Раздел в разработке. После подключения телефонии AI-оператор будет самостоятельно обзванивать контакты по расписанию.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

function OperatorsDialog({ open, onOpenChange, operators }: { open: boolean; onOpenChange: (v: boolean) => void; operators: any[] }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_add_operator" as any, { _email: email, _name: name });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Оператор добавлен"); setEmail(""); setName("");
      qc.invalidateQueries({ queryKey: ["operators"] });
    },
    onError: (e: Error) => toast.error(e.message === "user_not_found" ? "Пользователь с таким email не найден. Сначала зарегистрируйте его." : e.message),
  });

  const rename = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase.rpc("admin_rename_operator" as any, { _user_id: editing.id, _name: editing.name });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Имя обновлено"); setEditing(null);
      qc.invalidateQueries({ queryKey: ["operators"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_remove_operator" as any, { _user_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Оператор удалён");
      qc.invalidateQueries({ queryKey: ["operators"] });
      qc.invalidateQueries({ queryKey: ["cold_contacts_paged"] }); qc.invalidateQueries({ queryKey: ["cold_contacts_counts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Управление операторами</DialogTitle>
          <DialogDescription>Назначение роли «Оператор» зарегистрированным сотрудникам.</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
          <div className="text-sm font-medium flex items-center gap-1.5"><UserPlus className="size-4" />Добавить оператора</div>
          <div className="grid sm:grid-cols-[1fr,1fr,auto] gap-2">
            <Input placeholder="Email сотрудника" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input placeholder="Имя (необязательно)" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={() => add.mutate()} disabled={!email || add.isPending}>Добавить</Button>
          </div>
          <p className="text-xs text-muted-foreground">Сотрудник должен быть уже зарегистрирован в системе.</p>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Имя</TableHead><TableHead>Контактов</TableHead><TableHead className="text-right">Действия</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {operators.map((o) => (
                <TableRow key={o.user_id}>
                  <TableCell>
                    {editing && editing.id === o.user_id ? (
                      <div className="flex gap-1">
                        <Input value={editing.name} onChange={(e) => setEditing((p) => p ? { ...p, name: e.target.value } : p)} className="h-8" />
                        <Button size="sm" onClick={() => rename.mutate()} disabled={rename.isPending}>OK</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>×</Button>
                      </div>
                    ) : (
                      <span className="font-medium">{o.full_name || "Без имени"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{Number(o.contacts_count)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ id: o.user_id, name: o.full_name || "" })}>
                      <Pencil className="size-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive"
                      onClick={() => { if (confirm("Снять роль оператора? Контакты будут не назначены.")) remove.mutate(o.user_id); }}>
                      <Trash2 className="size-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {operators.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Операторов нет</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AiOperatorDialog({ open, onOpenChange, ai }: { open: boolean; onOpenChange: (v: boolean) => void; ai: any }) {
  const qc = useQueryClient();
  const [f, setF] = useState<any>({});
  const data = { ...(ai ?? {}), ...f };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: data.name, phone_line: data.phone_line, script: data.script,
        voice: data.voice, work_hours: data.work_hours,
        daily_call_limit: data.daily_call_limit ? Number(data.daily_call_limit) : null,
        connection_status: data.connection_status || "disconnected",
      };
      if (ai?.id) {
        const { error } = await supabase.from("ai_operator" as any).update(payload).eq("id", ai.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ai_operator" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("AI-оператор сохранён"); setF({}); onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["ai_operator"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Настройка AI-оператора</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div><Label>Название</Label><Input value={data.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>Телефонная линия</Label><Input value={data.phone_line ?? ""} onChange={(e) => setF({ ...f, phone_line: e.target.value })} placeholder="+7 ..." /></div>
          <div><Label>Голос</Label>
            <Select value={data.voice ?? "female_ru"} onValueChange={(v) => setF({ ...f, voice: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="female_ru">Женский (RU)</SelectItem>
                <SelectItem value="male_ru">Мужской (RU)</SelectItem>
                <SelectItem value="female_kz">Женский (KZ)</SelectItem>
                <SelectItem value="male_kz">Мужской (KZ)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Рабочее время</Label><Input value={data.work_hours ?? ""} onChange={(e) => setF({ ...f, work_hours: e.target.value })} placeholder="09:00-18:00" /></div>
          <div><Label>Лимит звонков в день</Label><Input type="number" value={data.daily_call_limit ?? ""} onChange={(e) => setF({ ...f, daily_call_limit: e.target.value })} /></div>
          <div><Label>Скрипт звонка</Label><Textarea rows={6} value={data.script ?? ""} onChange={(e) => setF({ ...f, script: e.target.value })} /></div>
          <div><Label>Статус подключения</Label>
            <Select value={data.connection_status ?? "disconnected"} onValueChange={(v) => setF({ ...f, connection_status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(AI_STATUS).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportsPanel() {
  const { data: ops = [] } = useQuery({
    queryKey: ["cc_op_stats"],
    queryFn: async () => (await supabase.rpc("call_center_operator_stats" as any)).data ?? [],
  });
  const { data: overview } = useQuery({
    queryKey: ["cc_overview"],
    queryFn: async () => (await supabase.rpc("call_center_overview" as any)).data?.[0] ?? null,
  });
  const Kpi = ({ label, value }: { label: string; value: any }) => (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value ?? "—"}</div>
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><BarChart3 className="size-5 text-primary" />Общий отчёт колл-центра</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Всего контактов" value={overview?.total_contacts ?? 0} />
          <Kpi label="Без оператора" value={overview?.unassigned ?? 0} />
          <Kpi label="Звонков сегодня" value={overview?.calls_today ?? 0} />
          <Kpi label="Звонков за месяц" value={overview?.calls_month ?? 0} />
          <Kpi label="Назначено установок" value={overview?.installs ?? 0} />
          <Kpi label="Эффективность операторов" value={`${overview?.operators_effectiveness ?? 0}%`} />
          <Kpi label="Эффективность AI" value={`${overview?.ai_effectiveness ?? 0}%`} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">По операторам</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Оператор</TableHead>
              <TableHead className="text-right">Всего</TableHead>
              <TableHead className="text-right">Обзвонено</TableHead>
              <TableHead className="text-right">Дозвонов</TableHead>
              <TableHead className="text-right">Отказов</TableHead>
              <TableHead className="text-right">Перезвонов</TableHead>
              <TableHead className="text-right">Установок</TableHead>
              <TableHead className="text-right">Конверсия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(ops as any[]).map((o) => (
              <TableRow key={o.user_id}>
                <TableCell className="font-medium">{o.full_name || "Без имени"}</TableCell>
                <TableCell className="text-right">{o.total_contacts}</TableCell>
                <TableCell className="text-right">{o.called}</TableCell>
                <TableCell className="text-right">{o.connected}</TableCell>
                <TableCell className="text-right">{o.refused}</TableCell>
                <TableCell className="text-right">{o.callbacks}</TableCell>
                <TableCell className="text-right">{o.installs}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className={Number(o.conversion) >= 20 ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}>
                    {Number(o.conversion)}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {(ops as any[]).length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Операторов нет</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
