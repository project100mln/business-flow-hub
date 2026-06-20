import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/installations")({ component: Installations });

const STATUS: Record<string, string> = { scheduled: "Запланировано", in_progress: "В работе", completed: "Завершено", cancelled: "Отменено" };
const STATUS_COLOR: Record<string, string> = {
  scheduled: "bg-info/15 text-info border-info/30",
  in_progress: "bg-warning/15 text-warning border-warning/30",
  completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function Installations() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ client_id: "", product_id: "", address: "", scheduled_at: "", notes: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["installs"],
    queryFn: async () => (await supabase.from("installations").select("*, clients(full_name, phone), products(name)").order("scheduled_at", { ascending: true })).data ?? [],
  });
  const { data: clients = [] } = useQuery({ queryKey: ["clients-min"], queryFn: async () => (await supabase.from("clients").select("id, full_name, address").order("full_name")).data ?? [] });
  const { data: products = [] } = useQuery({ queryKey: ["products-filter"], queryFn: async () => (await supabase.from("products").select("id, name").eq("type", "filter").order("name")).data ?? [] });

  const create = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("installations").insert({
        client_id: form.client_id || null, product_id: form.product_id || null,
        address: form.address || null, scheduled_at: form.scheduled_at,
        notes: form.notes || null, technician_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Установка запланирована"); setOpen(false);
      setForm({ client_id: "", product_id: "", address: "", scheduled_at: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["installs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const completed = status === "completed" ? new Date().toISOString() : null;
      const { error } = await supabase.from("installations").update({ status: status as any, completed_at: completed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["installs"] }),
  });

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Установки фильтров</h1>
          <p className="mt-1 text-sm text-muted-foreground">Расписание выездов и монтажа фильтров.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Новая установка</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Запланировать установку</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Клиент</Label>
                <Select value={form.client_id} onValueChange={(v) => {
                  const c = clients.find((x: any) => x.id === v);
                  setForm({ ...form, client_id: v, address: form.address || c?.address || "" });
                }}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Фильтр</Label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Адрес</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div><Label>Дата и время *</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
              <div><Label>Заметки</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.scheduled_at || create.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Когда</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>Фильтр</TableHead>
              <TableHead>Адрес</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i: any) => (
              <TableRow key={i.id}>
                <TableCell className="whitespace-nowrap text-xs">{new Date(i.scheduled_at).toLocaleString("ru-RU")}</TableCell>
                <TableCell className="font-medium">{i.clients?.full_name || "—"}<div className="text-xs text-muted-foreground">{i.clients?.phone}</div></TableCell>
                <TableCell>{i.products?.name || "—"}</TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate">{i.address || "—"}</TableCell>
                <TableCell>
                  <Select value={i.status} onValueChange={(v) => updateStatus.mutate({ id: i.id, status: v })}>
                    <SelectTrigger className="w-auto h-7 border-0 p-0 bg-transparent [&>svg]:hidden">
                      <Badge variant="outline" className={STATUS_COLOR[i.status]}>{STATUS[i.status]}</Badge>
                    </SelectTrigger>
                    <SelectContent>{Object.entries(STATUS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Установок пока нет</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
