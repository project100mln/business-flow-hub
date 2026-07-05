import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, Clock } from "lucide-react";

export const Route = createFileRoute("/app/hyla")({ component: HylaLeads });

const STATUS: Record<string, string> = {
  new: "Новый",
  quiz_done: "Квиз пройден",
  operator_contacted: "Оператор связался",
  demo_scheduled: "Демо назначено",
  demo_done: "Демо проведено",
  callback: "Перезвонить",
  thinking: "Клиент думает",
  sale: "Продажа",
  refused: "Отказ",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-info/15 text-info border-info/30",
  quiz_done: "bg-primary/15 text-primary border-primary/30",
  operator_contacted: "bg-warning/15 text-warning border-warning/30",
  demo_scheduled: "bg-warning/15 text-warning border-warning/30",
  demo_done: "bg-primary/15 text-primary border-primary/30",
  callback: "bg-warning/15 text-warning border-warning/30",
  thinking: "bg-warning/15 text-warning border-warning/30",
  sale: "bg-success/15 text-success border-success/30",
  refused: "bg-destructive/15 text-destructive border-destructive/30",
};

type Outcome = "sale" | "refused" | "thinking" | "callback";
const OUTCOMES: Array<{ value: Outcome; label: string; needsFollowUp: boolean }> = [
  { value: "sale", label: "Продажа", needsFollowUp: false },
  { value: "refused", label: "Отказ", needsFollowUp: false },
  { value: "thinking", label: "Клиент думает", needsFollowUp: true },
  { value: "callback", label: "Перезвонить", needsFollowUp: true },
];

type FollowUpFilter = "all" | "today" | "overdue" | "upcoming";

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function HylaLeads() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");
  const [operatorId, setOperatorId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [followUp, setFollowUp] = useState<FollowUpFilter>("all");

  const [closingLead, setClosingLead] = useState<any | null>(null);
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [nextAt, setNextAt] = useState<string>("");
  const [comment, setComment] = useState<string>("");

  const { data: operators = [] } = useQuery({
    queryKey: ["hyla-operators"],
    queryFn: async () => {
      const { data } = await supabase.rpc("list_operators");
      return (data ?? []) as Array<{ user_id: string; full_name: string | null }>;
    },
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["hyla_leads", status, operatorId, dateFrom, dateTo, search],
    queryFn: async () => {
      let q = (supabase as any).from("hyla_leads").select("*").order("created_at", { ascending: false }).limit(500);
      if (status !== "all") q = q.eq("status", status);
      if (operatorId !== "all") q = operatorId === "none" ? q.is("operator_id", null) : q.eq("operator_id", operatorId);
      if (dateFrom) q = q.gte("created_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      if (search.trim()) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const filteredLeads = useMemo(() => {
    if (followUp === "all") return leads;
    return leads.filter((l) => {
      if (!l.next_contact_at) return false;
      const d = new Date(l.next_contact_at);
      if (followUp === "overdue") return d.getTime() < todayStart.getTime();
      if (followUp === "today") return isSameDay(d, now);
      if (followUp === "upcoming") return d.getTime() > now.getTime() && !isSameDay(d, now);
      return true;
    });
  }, [leads, followUp]);

  const followCounts = useMemo(() => {
    let overdue = 0, today = 0, upcoming = 0;
    for (const l of leads) {
      if (!l.next_contact_at) continue;
      const d = new Date(l.next_contact_at);
      if (d.getTime() < todayStart.getTime()) overdue++;
      else if (isSameDay(d, now)) today++;
      else upcoming++;
    }
    return { overdue, today, upcoming };
  }, [leads]);

  const opName = useMemo(() => {
    const m = new Map<string, string>();
    operators.forEach((o) => m.set(o.user_id, o.full_name || "Оператор"));
    return m;
  }, [operators]);

  const kpi = useMemo(() => {
    const total = leads.length;
    const hot = leads.filter((l) => (l.score ?? 0) >= 60).length;
    const sales = leads.filter((l) => l.status === "sale").length;
    const avg = total ? Math.round(leads.reduce((s, l) => s + (l.score ?? 0), 0) / total) : 0;
    return { total, hot, sales, avg };
  }, [leads]);

  const resetFilters = () => { setStatus("all"); setOperatorId("all"); setDateFrom(""); setDateTo(""); setSearch(""); setFollowUp("all"); };

  const openClose = (lead: any) => {
    setClosingLead(lead);
    setOutcome("");
    setNextAt(lead.next_contact_at ? new Date(lead.next_contact_at).toISOString().slice(0, 16) : "");
    setComment(lead.comment ?? "");
  };

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!closingLead || !outcome) throw new Error("Выберите исход демонстрации");
      const needsFollowUp = OUTCOMES.find((o) => o.value === outcome)?.needsFollowUp;
      if (needsFollowUp && !nextAt) throw new Error("Укажите дату следующего контакта");
      const patch: Record<string, unknown> = { status: outcome };
      if (needsFollowUp) {
        patch.next_contact_at = new Date(nextAt).toISOString();
      } else {
        patch.next_contact_at = null;
      }
      if (comment.trim()) patch.comment = comment.trim();
      const { error } = await (supabase as any).from("hyla_leads").update(patch).eq("id", closingLead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Демо закрыто");
      setClosingLead(null);
      qc.invalidateQueries({ queryKey: ["hyla_leads"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Не удалось сохранить"),
  });

  const followUpChips: Array<{ v: FollowUpFilter; label: string; count?: number; icon?: any }> = [
    { v: "all", label: "Все" },
    { v: "overdue", label: "Просрочено", count: followCounts.overdue, icon: AlertTriangle },
    { v: "today", label: "На сегодня", count: followCounts.today, icon: Clock },
    { v: "upcoming", label: "Запланировано", count: followCounts.upcoming },
  ];

  const needsFollowUp = outcome ? OUTCOMES.find((o) => o.value === outcome)?.needsFollowUp : false;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">HYLA — лиды</h1>
        <p className="mt-1 text-sm text-muted-foreground">Заявки с рекламной кампании HYLA. Скоринг по результатам квиза.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Всего лидов", value: kpi.total },
          { label: "Горячие (60+)", value: kpi.hot },
          { label: "Продажи", value: kpi.sales },
          { label: "Средний скоринг", value: kpi.avg },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-gradient-surface shadow-card p-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <Label className="text-xs">Поиск</Label>
            <Input placeholder="Имя или телефон" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Статус</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {Object.entries(STATUS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Оператор</Label>
            <Select value={operatorId} onValueChange={setOperatorId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="none">Не назначен</SelectItem>
                {operators.map((o) => <SelectItem key={o.user_id} value={o.user_id}>{o.full_name || "Оператор"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Дата с</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Дата по</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground mr-1">Следующий контакт:</span>
          {followUpChips.map((c) => {
            const active = followUp === c.v;
            const Icon = c.icon;
            return (
              <button
                key={c.v}
                type="button"
                onClick={() => setFollowUp(c.v)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : c.v === "overdue" && (c.count ?? 0) > 0
                      ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/15"
                      : "bg-background border-border hover:bg-muted"
                }`}
              >
                {Icon ? <Icon className="h-3 w-3" /> : null}
                <span>{c.label}</span>
                {typeof c.count === "number" && c.count > 0 ? (
                  <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>{c.count}</span>
                ) : null}
              </button>
            );
          })}
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={resetFilters}>Сбросить</Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Клиент</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead>Город / район</TableHead>
              <TableHead>Скоринг</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>След. контакт</TableHead>
              <TableHead>Оператор</TableHead>
              <TableHead className="whitespace-nowrap">Дата</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-12">Загрузка…</TableCell></TableRow>}
            {!isLoading && filteredLeads.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-12">Лидов нет</TableCell></TableRow>}
            {filteredLeads.map((l) => {
              const nc = l.next_contact_at ? new Date(l.next_contact_at) : null;
              const isOverdue = nc && nc.getTime() < todayStart.getTime();
              const isToday = nc && isSameDay(nc, now);
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.full_name}</TableCell>
                  <TableCell className="text-xs">{l.phone}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{[l.city, l.district].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      (l.score ?? 0) >= 60 ? "bg-success/15 text-success border-success/30"
                      : (l.score ?? 0) >= 30 ? "bg-warning/15 text-warning border-warning/30"
                      : "bg-muted text-muted-foreground border-border"
                    }>{l.score ?? 0}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_COLOR[l.status] || ""}>{STATUS[l.status] || l.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {nc ? (
                      <span className={`inline-flex items-center gap-1 ${isOverdue ? "text-destructive" : isToday ? "text-warning" : "text-muted-foreground"}`}>
                        {isOverdue ? <AlertTriangle className="h-3 w-3" /> : isToday ? <Clock className="h-3 w-3" /> : null}
                        {nc.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">{l.operator_id ? (opName.get(l.operator_id) || "—") : <span className="text-muted-foreground">не назначен</span>}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleDateString("ru-RU")}</TableCell>
                  <TableCell className="text-right">
                    {l.status === "demo_scheduled" ? (
                      <Button size="sm" variant="outline" onClick={() => openClose(l)}>Завершить демо</Button>
                    ) : (l.status === "thinking" || l.status === "callback") ? (
                      <Button size="sm" variant="ghost" onClick={() => openClose(l)}>Обновить</Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!closingLead} onOpenChange={(v) => !v && setClosingLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Итог демонстрации</DialogTitle>
            <DialogDescription>
              {closingLead ? `${closingLead.full_name} · ${closingLead.phone}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs mb-2 block">Что произошло на демо?</Label>
              <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as Outcome)} className="grid grid-cols-2 gap-2">
                {OUTCOMES.map((o) => (
                  <label
                    key={o.value}
                    className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer text-sm ${outcome === o.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
                  >
                    <RadioGroupItem value={o.value} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {needsFollowUp ? (
              <div>
                <Label className="text-xs">Дата и время следующего контакта *</Label>
                <Input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} />
              </div>
            ) : null}

            <div>
              <Label className="text-xs">Комментарий</Label>
              <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что важно запомнить по этому клиенту…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClosingLead(null)}>Отмена</Button>
            <Button onClick={() => closeMutation.mutate()} disabled={!outcome || closeMutation.isPending}>
              {closeMutation.isPending ? "Сохраняю…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
