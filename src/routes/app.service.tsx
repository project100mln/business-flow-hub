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
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/app/service")({ component: Service });

const STATUS: Record<string, string> = { new: "Новая", in_progress: "В работе", done: "Завершена", cancelled: "Отменена" };
const PRIORITY: Record<string, string> = { low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "Срочный" };

type Form = {
  id?: string; client_id: string; object_id: string; issue: string;
  status: string; priority: string; scheduled_at: string; cost: string; notes: string;
};
const empty: Form = { client_id: "", object_id: "", issue: "", status: "new", priority: "normal", scheduled_at: "", cost: "", notes: "" };

function Service() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);

  const { data: items = [] } = useQuery({
    queryKey: ["service"],
    queryFn: async () => (await supabase.from("service_requests").select("*, clients(full_name), objects(name)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: clients = [] } = useQuery({ queryKey: ["clients-min"], queryFn: async () => (await supabase.from("clients").select("id, full_name").order("full_name")).data ?? [] });
  const { data: objects = [] } = useQuery({ queryKey: ["objects-min"], queryFn: async () => (await supabase.from("objects").select("id, name").order("name")).data ?? [] });

  const save = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const payload: any = {
        client_id: form.client_id || null,
        object_id: form.object_id || null,
        issue: form.issue,
        status: form.status,
        priority: form.priority,
        scheduled_at: form.scheduled_at || null,
        cost: form.cost ? Number(form.cost) : 0,
        notes: form.notes || null,
      };
      if (form.id) {
        const { error } = await supabase.from("service_requests").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("service_requests").insert({ ...payload, created_by: user?.id, assignee_id: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Обновлено" : "Заявка создана");
      setOpen(false); setForm(empty);
      qc.invalidateQueries({ queryKey: ["service"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Удалено"); qc.invalidateQueries({ queryKey: ["service"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Сервис</h1>
          <p className="mt-1 text-sm text-muted-foreground">Заявки на обслуживание и ремонт.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(empty); }}>
          <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Новая заявка</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{form.id ? "Редактировать" : "Новая заявка"}</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Клиент</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Объект (B2B)</Label>
                  <Select value={form.object_id} onValueChange={(v) => setForm({ ...form, object_id: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{objects.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Проблема *</Label><Textarea value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Статус</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(STATUS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Приоритет</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(PRIORITY).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Дата визита</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
                <div><Label>Стоимость, ₸</Label><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
              </div>
              <div><Label>Заметки</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate()} disabled={!form.issue || save.isPending} className="bg-gradient-primary">Сохранить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Проблема</TableHead><TableHead>Клиент / Объект</TableHead>
            <TableHead>Приоритет</TableHead><TableHead>Статус</TableHead>
            <TableHead>Визит</TableHead><TableHead className="text-right">Сумма</TableHead>
            <TableHead className="w-28 text-right">Действия</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium max-w-xs truncate">{s.issue}</TableCell>
                <TableCell className="text-muted-foreground">{s.clients?.full_name || s.objects?.name || "—"}</TableCell>
                <TableCell><Badge variant="outline">{PRIORITY[s.priority] || s.priority}</Badge></TableCell>
                <TableCell><Badge variant="outline">{STATUS[s.status] || s.status}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{s.scheduled_at ? new Date(s.scheduled_at).toLocaleString("ru-RU") : "—"}</TableCell>
                <TableCell className="text-right">{new Intl.NumberFormat("ru-RU").format(Number(s.cost || 0))} ₸</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => setForm({
                    id: s.id, client_id: s.client_id || "", object_id: s.object_id || "",
                    issue: s.issue, status: s.status, priority: s.priority,
                    scheduled_at: s.scheduled_at ? s.scheduled_at.slice(0,16) : "",
                    cost: String(s.cost || ""), notes: s.notes || "",
                  }) || setOpen(true)}><Pencil className="size-4" /></Button>
                  {hasRole("admin") && <Button size="icon" variant="ghost" onClick={() => confirm("Удалить?") && del.mutate(s.id)}><Trash2 className="size-4 text-destructive" /></Button>}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">Заявок пока нет</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
