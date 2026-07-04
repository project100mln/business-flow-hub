import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/hyla")({ component: HylaLeads });

const STATUS: Record<string, string> = {
  new: "Новый",
  quiz_done: "Квиз пройден",
  operator_contacted: "Оператор связался",
  demo_scheduled: "Демо назначено",
  demo_done: "Демо проведено",
  callback: "Перезвонить",
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
  sale: "bg-success/15 text-success border-success/30",
  refused: "bg-destructive/15 text-destructive border-destructive/30",
};

function HylaLeads() {
  const [status, setStatus] = useState<string>("all");
  const [operatorId, setOperatorId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");

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

  const resetFilters = () => { setStatus("all"); setOperatorId("all"); setDateFrom(""); setDateTo(""); setSearch(""); };

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
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={resetFilters}>Сбросить</Button>
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
              <TableHead>Оператор</TableHead>
              <TableHead>UTM</TableHead>
              <TableHead className="whitespace-nowrap">Дата</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">Загрузка…</TableCell></TableRow>}
            {!isLoading && leads.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">Лидов нет</TableCell></TableRow>}
            {leads.map((l) => (
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
                <TableCell className="text-xs">{l.operator_id ? (opName.get(l.operator_id) || "—") : <span className="text-muted-foreground">не назначен</span>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{[l.utm_source, l.utm_campaign].filter(Boolean).join(" / ") || "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleDateString("ru-RU")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
