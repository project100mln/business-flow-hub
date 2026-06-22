import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/app/finance")({ component: Finance });

function Finance() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdminOrManager, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "income", amount: "", category: "", description: "" });

  useEffect(() => {
    if (!loading && !isAdminOrManager) navigate({ to: "/app/dashboard" });
  }, [loading, isAdminOrManager, navigate]);

  const { data: txs = [] } = useQuery({
    queryKey: ["txs"],
    enabled: isAdminOrManager,
    queryFn: async () => (await supabase.from("transactions").select("*").order("occurred_at", { ascending: false }).limit(200)).data ?? [],
  });
  const { data: sales = [] } = useQuery({
    queryKey: ["sales-finance"],
    enabled: isAdminOrManager,
    queryFn: async () => (await supabase.from("deals").select("amount, paid_amount, payment_method").eq("stage", "sale")).data ?? [],
  });
  const { data: payments = [] } = useQuery({
    queryKey: ["installment-payments-finance"],
    enabled: isAdminOrManager,
    queryFn: async () => (await supabase.from("installment_payments").select("amount, status, due_date, paid_at")).data ?? [],
  });

  const income = txs.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const expense = txs.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const revenue = sales.reduce((s: number, d: any) => s + Number(d.amount), 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 1);
  const overdue = payments.filter((p: any) => p.status !== "paid" && new Date(p.due_date) < today).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const expectedNext = payments.filter((p: any) => p.status !== "paid" && new Date(p.due_date) >= nextMonthStart && new Date(p.due_date) < nextMonthEnd).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const debt = payments.filter((p: any) => p.status !== "paid").reduce((s: number, p: any) => s + Number(p.amount), 0);
  const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n));

  const create = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("transactions").insert({
        type: form.type as any, amount: Number(form.amount), category: form.category || null,
        description: form.description || null, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Операция добавлена"); setOpen(false);
      setForm({ type: "income", amount: "", category: "", description: "" });
      qc.invalidateQueries({ queryKey: ["txs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdminOrManager) return null;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Финансы</h1>
          <p className="mt-1 text-sm text-muted-foreground">Доходы, расходы и баланс компании.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Операция</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Новая операция</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Тип</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Доход</SelectItem>
                    <SelectItem value="expense">Расход</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Сумма ₸ *</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label>Категория</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="продажа, реклама, зарплата..." /></div>
              <div><Label>Описание</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.amount || create.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Общая выручка (продажи)" value={`${fmt(revenue)} ₸`} />
        <Kpi label="Получено денег" value={`${fmt(income)} ₸`} accent="text-success" icon={<TrendingUp className="size-4 text-success" />} />
        <Kpi label="Расходы" value={`${fmt(expense)} ₸`} accent="text-destructive" icon={<TrendingDown className="size-4 text-destructive" />} />
        <Kpi label="Остаток долга клиентов" value={`${fmt(debt)} ₸`} />
        <Kpi label="Просроченные платежи" value={`${fmt(overdue)} ₸`} accent={overdue > 0 ? "text-destructive" : ""} />
        <Kpi label="Ожидается в след. месяце" value={`${fmt(expectedNext)} ₸`} icon={<Wallet className="size-4 text-primary" />} />
      </div>


      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Категория</TableHead>
              <TableHead>Описание</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {txs.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(t.occurred_at).toLocaleDateString("ru-RU")}</TableCell>
                <TableCell><span className={t.type === "income" ? "text-success" : "text-destructive"}>{t.type === "income" ? "Доход" : "Расход"}</span></TableCell>
                <TableCell className="text-muted-foreground">{t.category || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{t.description || "—"}</TableCell>
                <TableCell className={`text-right font-semibold ${t.type === "income" ? "text-success" : "text-destructive"}`}>
                  {t.type === "income" ? "+" : "−"}{fmt(Number(t.amount))} ₸
                </TableCell>
              </TableRow>
            ))}
            {txs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Операций пока нет</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
