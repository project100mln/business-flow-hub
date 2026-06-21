import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/app/objects")({ component: Objects });

type ObjForm = {
  id?: string;
  name: string;
  company_name: string;
  bin: string;
  address: string;
  contact_person: string;
  phone: string;
  email: string;
  notes: string;
  status: string;
};

const empty: ObjForm = { name: "", company_name: "", bin: "", address: "", contact_person: "", phone: "", email: "", notes: "", status: "active" };

function Objects() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ObjForm>(empty);

  const { data: items = [] } = useQuery({
    queryKey: ["objects"],
    queryFn: async () => (await supabase.from("objects").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const save = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (form.id) {
        const { id, ...rest } = form;
        const { error } = await supabase.from("objects").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("objects").insert({ ...form, created_by: user?.id, assigned_to: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Объект обновлён" : "Объект добавлен");
      setOpen(false); setForm(empty);
      qc.invalidateQueries({ queryKey: ["objects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("objects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Удалено"); qc.invalidateQueries({ queryKey: ["objects"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Объекты (B2B)</h1>
          <p className="mt-1 text-sm text-muted-foreground">Компании, офисы, точки обслуживания.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(empty); }}>
          <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Добавить</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{form.id ? "Редактировать объект" : "Новый объект"}</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              <div><Label>Название *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Компания</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
                <div><Label>БИН</Label><Input value={form.bin} onChange={(e) => setForm({ ...form, bin: e.target.value })} /></div>
              </div>
              <div><Label>Адрес</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Контактное лицо</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
                <div><Label>Телефон</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Заметки</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending} className="bg-gradient-primary">Сохранить</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Компания / БИН</TableHead>
              <TableHead>Контакт</TableHead>
              <TableHead>Адрес</TableHead>
              <TableHead className="w-32 text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((o: any) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell className="text-muted-foreground">{[o.company_name, o.bin].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{[o.contact_person, o.phone].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{o.address || "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => { setForm({ ...empty, ...o }); setOpen(true); }}><Pencil className="size-4" /></Button>
                  {hasRole("admin") && (
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Удалить объект?")) del.mutate(o.id); }}><Trash2 className="size-4 text-destructive" /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Объектов пока нет</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
