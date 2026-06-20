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
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/tasks")({ component: Tasks });

const COLS = [
  { key: "todo", label: "К выполнению" },
  { key: "in_progress", label: "В работе" },
  { key: "done", label: "Готово" },
];

function Tasks() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", status: "todo", due_at: "" });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await supabase.from("tasks").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("tasks").insert({
        title: form.title, description: form.description || null, status: form.status as any,
        due_at: form.due_at || null, created_by: user?.id, assignee_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Задача создана"); setOpen(false);
      setForm({ title: "", description: "", status: "todo", due_at: "" });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("tasks").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Задачи</h1>
          <p className="mt-1 text-sm text-muted-foreground">Канбан-доска задач команды.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Новая задача</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Новая задача</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Название *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Описание</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Срок</Label><Input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></div>
              <div>
                <Label>Статус</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COLS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.title || create.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COLS.map((col) => {
          const items = tasks.filter((t: any) => t.status === col.key);
          return (
            <div key={col.key} className="rounded-2xl border border-border bg-gradient-surface p-3 shadow-card min-h-[400px]">
              <div className="flex items-center justify-between px-1 pb-3 border-b border-border">
                <div className="text-sm font-medium">{col.label}</div>
                <div className="text-xs text-muted-foreground">{items.length}</div>
              </div>
              <div className="mt-3 space-y-2">
                {items.map((t: any) => (
                  <div key={t.id} className="rounded-lg border border-border bg-surface-elevated p-3 hover:border-border-strong transition">
                    <div className="text-sm font-medium">{t.title}</div>
                    {t.description && <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</div>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-[10px] text-muted-foreground">{t.due_at ? new Date(t.due_at).toLocaleDateString("ru-RU") : "без срока"}</div>
                      <Select value={t.status} onValueChange={(v) => move.mutate({ id: t.id, status: v })}>
                        <SelectTrigger className="h-6 w-auto text-xs border-border"><SelectValue /></SelectTrigger>
                        <SelectContent>{COLS.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}</SelectContent>
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
