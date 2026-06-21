import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/deals")({ component: Deals });

const STAGES: { value: string; label: string }[] = [
  { value: "lead", label: "Лид" },
  { value: "presentation", label: "Презентация" },
  { value: "negotiation", label: "Переговоры" },
  { value: "installation", label: "На установку" },
  { value: "won", label: "Продано" },
  { value: "lost", label: "Проигрыш" },
];

function Deals() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
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
      const closed = stage === "won" || stage === "lost" ? new Date().toISOString() : null;
      const { error } = await supabase.from("deals").update({ stage: stage as any, closed_at: closed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  const byStage = (s: string) => deals.filter((d: any) => d.stage === s);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Сделки</h1>
          <p className="mt-1 text-sm text-muted-foreground">Воронка продаж пылесосов и фильтров.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Новая сделка</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Новая сделка</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Название *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Презентация Premium..." /></div>
              <div><Label>Сумма, ₸</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div>
                <Label>Клиент</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Товар</Label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v, amount: form.amount || String(products.find((p:any)=>p.id===v)?.price ?? "") })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Стадия</Label>
                <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.title || create.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {STAGES.map((s) => {
          const items = byStage(s.value);
          const total = items.reduce((sum, d: any) => sum + Number(d.amount), 0);
          return (
            <div key={s.value} className="rounded-2xl border border-border bg-gradient-surface p-3 shadow-card min-h-[400px]">
              <div className="flex items-center justify-between px-1 pb-3 border-b border-border">
                <div className="text-sm font-medium">{s.label}</div>
                <div className="text-xs text-muted-foreground">{items.length}</div>
              </div>
              <div className="text-xs text-muted-foreground px-1 pt-1.5">{new Intl.NumberFormat("ru-RU").format(total)} ₸</div>
              <div className="mt-3 space-y-2">
                {items.map((d: any) => (
                  <div key={d.id} className="rounded-lg border border-border bg-surface-elevated p-3 hover:border-border-strong transition">
                    <div className="text-sm font-medium truncate">{d.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground truncate">{d.clients?.full_name || "—"} • {d.products?.name || "без товара"}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-sm font-semibold">{new Intl.NumberFormat("ru-RU").format(Number(d.amount))} ₸</div>
                      <Select value={d.stage} onValueChange={(v) => move.mutate({ id: d.id, stage: v })}>
                        <SelectTrigger className="h-6 w-auto text-xs border-border"><SelectValue /></SelectTrigger>
                        <SelectContent>{STAGES.map((x) => <SelectItem key={x.value} value={x.value}>{x.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
