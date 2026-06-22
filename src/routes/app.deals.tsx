import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/deals")({ component: Deals });

const STAGES: { value: string; label: string; color?: string }[] = [
  { value: "lead", label: "Лид" },
  { value: "client", label: "Клиент" },
  { value: "test_install", label: "Тест. установка" },
  { value: "using", label: "Пользуется" },
  { value: "decision", label: "Решение" },
  { value: "sale", label: "Продажа", color: "text-success" },
  { value: "dismantle", label: "Демонтаж", color: "text-warning" },
  { value: "lost", label: "Отказ", color: "text-destructive" },
];

const PAY_LABEL: Record<string, string> = { cash: "Наличные", transfer: "Перевод", installment: "Рассрочка компании" };

function Deals() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saleDeal, setSaleDeal] = useState<any>(null);
  const [payment, setPayment] = useState<{ method: string; amount: string; down: string; months: string }>({ method: "cash", amount: "", down: "0", months: "6" });
  const [form, setForm] = useState({ title: "", amount: "", stage: "lead", client_id: "", product_id: "" });

  const { data: deals = [] } = useQuery({
    queryKey: ["deals"],
    queryFn: async () => (await supabase.from("deals").select("*, clients(full_name), products(name)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => (await supabase.from("clients").select("id, full_name").order("full_name")).data ?? [],
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products-min"],
    queryFn: async () => (await supabase.from("products").select("id, name, price").order("name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("deals").insert({
        title: form.title, amount: Number(form.amount || 0), stage: form.stage as any,
        client_id: form.client_id || null, product_id: form.product_id || null, owner_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Сделка создана"); setOpen(false);
      setForm({ title: "", amount: "", stage: "lead", client_id: "", product_id: "" });
      qc.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const closed = ["sale", "lost", "dismantle"].includes(stage) ? new Date().toISOString() : null;
      const { error } = await supabase.from("deals").update({ stage: stage as any, closed_at: closed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  const handleStageChange = (d: any, stage: string) => {
    if (stage === "sale") {
      setSaleDeal(d);
      setPayment({ method: "cash", amount: String(d.amount || ""), down: "0", months: "6" });
      return;
    }
    move.mutate({ id: d.id, stage });
  };

  const closeSale = useMutation({
    mutationFn: async () => {
      if (!saleDeal) return;
      const user = (await supabase.auth.getUser()).data.user;
      const amount = Number(payment.amount || 0);
      const { error } = await supabase.from("deals").update({
        stage: "sale" as any, payment_method: payment.method as any,
        amount, closed_at: new Date().toISOString(),
      }).eq("id", saleDeal.id);
      if (error) throw error;

      if (payment.method === "installment") {
        const down = Number(payment.down || 0);
        const months = Math.max(1, Number(payment.months));
        const monthly = Math.round(((amount - down) / months) * 100) / 100;
        const { data: ins, error: e1 } = await supabase.from("installments").insert({
          client_id: saleDeal.client_id, deal_id: saleDeal.id,
          total_amount: amount, down_payment: down, months, monthly_payment: monthly,
          created_by: user?.id,
        }).select().single();
        if (e1) throw e1;
        const start = new Date();
        const rows = Array.from({ length: months }, (_, i) => {
          const due = new Date(start.getFullYear(), start.getMonth() + i + 1, start.getDate());
          return { installment_id: ins.id, due_date: due.toISOString().slice(0, 10), amount: monthly, status: "pending" };
        });
        const { error: e2 } = await supabase.from("installment_payments").insert(rows);
        if (e2) throw e2;
        if (down > 0) {
          await supabase.from("transactions").insert({
            type: "income", amount: down, category: "Рассрочка (первый взнос)",
            description: "Авто: " + saleDeal.title, deal_id: saleDeal.id, created_by: user?.id,
          });
          await supabase.from("deals").update({ paid_amount: down }).eq("id", saleDeal.id);
        }
      }
    },
    onSuccess: () => {
      toast.success("Продажа оформлена");
      setSaleDeal(null);
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["installments"] });
      qc.invalidateQueries({ queryKey: ["txs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byStage = (s: string) => deals.filter((d: any) => d.stage === s);
  const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Сделки</h1>
          <p className="mt-1 text-sm text-muted-foreground">Лид → Клиент → Тест → Решение → Продажа/Демонтаж.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Новая сделка</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Новая сделка</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Название *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Hyla GST для семьи..." /></div>
              <div><Label>Сумма, ₸</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div>
                <Label>Клиент</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Товар</Label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v, amount: form.amount || String(products.find((p: any) => p.id === v)?.price ?? "") })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Стартовый этап</Label>
                <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.filter(s => s.value !== "sale").map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.title || create.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((s) => {
          const items = byStage(s.value);
          const total = items.reduce((sum: number, d: any) => sum + Number(d.amount), 0);
          return (
            <div key={s.value} className="rounded-2xl border border-border bg-gradient-surface p-3 shadow-card min-h-[300px]">
              <div className="flex items-center justify-between px-1 pb-3 border-b border-border">
                <div className={`text-sm font-medium ${s.color || ""}`}>{s.label}</div>
                <div className="text-xs text-muted-foreground">{items.length}</div>
              </div>
              <div className="text-xs text-muted-foreground px-1 pt-1.5">{fmt(total)} ₸</div>
              <div className="mt-3 space-y-2">
                {items.map((d: any) => (
                  <div key={d.id} className="rounded-lg border border-border bg-surface-elevated p-3 hover:border-border-strong transition">
                    <div className="text-sm font-medium truncate">{d.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">{d.clients?.full_name || "—"} • {d.products?.name || "без товара"}</div>
                    {d.payment_method && <div className="mt-1"><Badge variant="outline" className="text-[10px]">{PAY_LABEL[d.payment_method]}</Badge></div>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{fmt(Number(d.amount))} ₸</div>
                      <Select value={d.stage} onValueChange={(v) => handleStageChange(d, v)}>
                        <SelectTrigger className="h-6 w-auto text-xs border-border"><SelectValue /></SelectTrigger>
                        <SelectContent>{STAGES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="text-xs text-muted-foreground/60 px-1 py-4 text-center">пусто</div>}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!saleDeal} onOpenChange={(v) => !v && setSaleDeal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Оформить продажу</DialogTitle>
            <DialogDescription>{saleDeal?.title} — {saleDeal?.clients?.full_name || "клиент не указан"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Сумма продажи, ₸ *</Label><Input type="number" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></div>
            <div>
              <Label>Способ оплаты *</Label>
              <Select value={payment.method} onValueChange={(v) => setPayment({ ...payment, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Наличные</SelectItem>
                  <SelectItem value="transfer">Перевод</SelectItem>
                  <SelectItem value="installment">Рассрочка компании</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {payment.method === "installment" && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <div><Label>Первый взнос, ₸</Label><Input type="number" value={payment.down} onChange={(e) => setPayment({ ...payment, down: e.target.value })} /></div>
                <div><Label>Срок, мес.</Label><Input type="number" value={payment.months} onChange={(e) => setPayment({ ...payment, months: e.target.value })} /></div>
                {payment.amount && payment.months && (
                  <div className="col-span-2 text-sm text-muted-foreground">
                    Ежемесячный платёж: <b className="text-foreground">{fmt(Math.round((Number(payment.amount) - Number(payment.down || 0)) / Math.max(1, Number(payment.months))))} ₸</b>
                  </div>
                )}
              </div>
            )}
            {payment.method !== "installment" && (
              <div className="text-xs text-muted-foreground">Автоматически создастся запись о поступлении в Финансы.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaleDeal(null)}>Отмена</Button>
            <Button className="bg-gradient-primary" disabled={!payment.amount || closeSale.isPending} onClick={() => closeSale.mutate()}>
              Оформить <ArrowRight className="size-4 ml-1" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="text-xs text-muted-foreground">
        Установки управляются отдельно в разделе <Link to="/app/installations" className="text-primary underline">Установки</Link>. Договоры рассрочки — в <Link to="/app/installments" className="text-primary underline">Рассрочки</Link>.
      </div>
    </div>
  );
}
