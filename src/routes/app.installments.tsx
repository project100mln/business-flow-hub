import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/app/installments")({ component: Installments });

const STATUS: Record<string, string> = { active: "Активна", completed: "Закрыта", defaulted: "Просрочена" };

type Form = { client_id: string; total_amount: string; down_payment: string; months: string; notes: string };
const empty: Form = { client_id: "", total_amount: "", down_payment: "0", months: "6", notes: "" };

function Installments() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: ["installments"],
    queryFn: async () => (await supabase.from("installments").select("*, clients(full_name, phone), installment_payments(*)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: clients = [] } = useQuery({ queryKey: ["clients-min"], queryFn: async () => (await supabase.from("clients").select("id, full_name").order("full_name")).data ?? [] });

  const create = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const total = Number(form.total_amount);
      const down = Number(form.down_payment || 0);
      const months = Math.max(1, Number(form.months));
      const monthly = Math.round(((total - down) / months) * 100) / 100;
      const { data, error } = await supabase.from("installments").insert({
        client_id: form.client_id || null,
        total_amount: total, down_payment: down, months, monthly_payment: monthly,
        notes: form.notes || null, created_by: user?.id,
      }).select().single();
      if (error) throw error;
      // Generate schedule
      const start = new Date();
      const rows = Array.from({ length: months }, (_, i) => {
        const due = new Date(start.getFullYear(), start.getMonth() + i + 1, start.getDate());
        return { installment_id: data.id, due_date: due.toISOString().slice(0, 10), amount: monthly, status: "pending" };
      });
      const { error: e2 } = await supabase.from("installment_payments").insert(rows);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Рассрочка создана с графиком");
      setOpen(false); setForm(empty);
      qc.invalidateQueries({ queryKey: ["installments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("installment_payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Платёж отмечен"); qc.invalidateQueries({ queryKey: ["installments"] }); },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("installments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Удалено"); qc.invalidateQueries({ queryKey: ["installments"] }); },
  });

  const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Рассрочки</h1>
          <p className="mt-1 text-sm text-muted-foreground">Договоры рассрочки и график платежей.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(empty); }}>
          <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Новая рассрочка</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Новая рассрочка</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Клиент *</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Выбрать..." /></SelectTrigger>
                  <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Сумма, ₸ *</Label><Input type="number" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} /></div>
                <div><Label>Первый взнос</Label><Input type="number" value={form.down_payment} onChange={(e) => setForm({ ...form, down_payment: e.target.value })} /></div>
                <div><Label>Срок, мес.</Label><Input type="number" value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} /></div>
              </div>
              {form.total_amount && form.months && (
                <div className="text-sm text-muted-foreground">
                  Ежемесячный платёж: <b className="text-foreground">{fmt(Math.round((Number(form.total_amount) - Number(form.down_payment || 0)) / Number(form.months)))} ₸</b>
                </div>
              )}
              <div><Label>Заметки</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={!form.client_id || !form.total_amount || create.isPending} className="bg-gradient-primary">Создать</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Клиент</TableHead><TableHead>Сумма</TableHead><TableHead>Взнос</TableHead>
            <TableHead>Срок</TableHead><TableHead>Платёж/мес</TableHead><TableHead>Статус</TableHead>
            <TableHead className="w-32 text-right">Действия</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((i: any) => {
              const paid = (i.installment_payments || []).filter((p: any) => p.status === "paid").length;
              const total = (i.installment_payments || []).length;
              return (
                <>
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.clients?.full_name || "—"}</TableCell>
                    <TableCell>{fmt(Number(i.total_amount))} ₸</TableCell>
                    <TableCell className="text-muted-foreground">{fmt(Number(i.down_payment))} ₸</TableCell>
                    <TableCell>{paid}/{total} мес</TableCell>
                    <TableCell>{fmt(Number(i.monthly_payment))} ₸</TableCell>
                    <TableCell><Badge variant="outline">{STATUS[i.status] || i.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === i.id ? null : i.id)}>График</Button>
                      {hasRole("admin") && <Button size="icon" variant="ghost" onClick={() => confirm("Удалить?") && del.mutate(i.id)}><Trash2 className="size-4 text-destructive" /></Button>}
                    </TableCell>
                  </TableRow>
                  {expanded === i.id && (
                    <TableRow key={i.id + "-exp"}>
                      <TableCell colSpan={7} className="bg-accent/30">
                        <div className="space-y-1.5 p-2">
                          {(i.installment_payments || []).sort((a: any, b: any) => a.due_date.localeCompare(b.due_date)).map((p: any) => {
                            const overdue = p.status !== "paid" && new Date(p.due_date) < new Date();
                            return (
                              <div key={p.id} className="flex items-center justify-between text-sm border-b border-border/40 py-1.5">
                                <div className="flex items-center gap-3">
                                  <span className="text-muted-foreground w-24">{new Date(p.due_date).toLocaleDateString("ru-RU")}</span>
                                  <span>{fmt(Number(p.amount))} ₸</span>
                                  {p.status === "paid" && <Badge className="bg-success/15 text-success border-success/30" variant="outline">Оплачен {p.paid_at ? new Date(p.paid_at).toLocaleDateString("ru-RU") : ""}</Badge>}
                                  {overdue && <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline">Просрочен</Badge>}
                                  {p.status === "pending" && !overdue && <Badge variant="outline">Ожидается</Badge>}
                                </div>
                                {p.status !== "paid" && <Button size="sm" variant="outline" onClick={() => markPaid.mutate(p.id)}><Check className="size-3 mr-1" />Оплачен</Button>}
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
            {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">Рассрочек пока нет</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
