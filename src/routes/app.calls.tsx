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
import { Plus, Phone as PhoneIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/calls")({ component: Calls });

const STATUS_LABEL: Record<string, string> = {
  new: "Новый", callback: "Перезвонить", interested: "Интересно",
  presentation_scheduled: "Презентация назначена", sold: "Продано", refused: "Отказ",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-info/15 text-info border-info/30",
  callback: "bg-warning/15 text-warning border-warning/30",
  interested: "bg-primary/15 text-primary border-primary/30",
  presentation_scheduled: "bg-primary/15 text-primary border-primary/30",
  sold: "bg-success/15 text-success border-success/30",
  refused: "bg-muted text-muted-foreground border-border",
};

function Calls() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ phone: "", contact_name: "", status: "new", notes: "", client_id: "" });

  const { data: calls = [] } = useQuery({
    queryKey: ["calls"],
    queryFn: async () => {
      const { data, error } = await supabase.from("calls").select("*, clients(full_name)").order("called_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => (await supabase.from("clients").select("id, full_name, phone").order("full_name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("calls").insert({
        phone: form.phone, contact_name: form.contact_name || null, status: form.status as any,
        notes: form.notes || null, client_id: form.client_id || null, operator_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Звонок зарегистрирован");
      setOpen(false); setForm({ phone: "", contact_name: "", status: "new", notes: "", client_id: "" });
      qc.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("calls").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calls"] }),
  });

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Колл-центр</h1>
          <p className="mt-1 text-sm text-muted-foreground">Журнал исходящих звонков и их результатов.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Новый звонок</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Регистрация звонка</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Телефон *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Имя контакта</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
              <div>
                <Label>Клиент из базы</Label>
                <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} — {c.phone}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Статус</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Заметки</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="О чём говорили, что договорились..." /></div>
            </div>
            <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.phone || create.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Время</TableHead>
              <TableHead>Контакт</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Заметки</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{new Date(c.called_at).toLocaleString("ru-RU")}</TableCell>
                <TableCell className="font-medium">{c.contact_name || c.clients?.full_name || "—"}</TableCell>
                <TableCell><span className="inline-flex items-center gap-1.5"><PhoneIcon className="size-3 text-muted-foreground" />{c.phone}</span></TableCell>
                <TableCell>
                  <Select value={c.status} onValueChange={(v) => updateStatus.mutate({ id: c.id, status: v })}>
                    <SelectTrigger className="w-auto h-7 border-0 p-0 bg-transparent [&>svg]:hidden">
                      <Badge variant="outline" className={STATUS_COLOR[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                    </SelectTrigger>
                    <SelectContent>{Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-md truncate">{c.notes || "—"}</TableCell>
              </TableRow>
            ))}
            {calls.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Звонков пока нет</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
