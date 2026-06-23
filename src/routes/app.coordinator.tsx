import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, CheckCircle2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/coordinator")({ component: Coordinator });

const STATUS: Record<string, string> = {
  new: "Новая",
  awaiting_master: "Ожидает мастера",
  sent_to_master: "Отправлена мастеру",
  accepted: "Принята мастером",
  rejected: "Отклонена мастером",
  completed: "Выполнена",
  rescheduled: "Перенесена",
  cancelled: "Отменена",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-info/15 text-info border-info/30",
  awaiting_master: "bg-warning/15 text-warning border-warning/30",
  sent_to_master: "bg-primary/15 text-primary border-primary/30",
  accepted: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  completed: "bg-success/15 text-success border-success/30",
  rescheduled: "bg-warning/15 text-warning border-warning/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function Coordinator() {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const { data: requests = [] } = useQuery({
    queryKey: ["install_requests"],
    queryFn: async () => (await supabase.from("install_requests").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const { data: masters = [] } = useQuery({
    queryKey: ["masters"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("user_id, profiles!inner(id, full_name)").eq("role", "installer");
      return (data ?? []).map((r: any) => ({ id: r.user_id, name: r.profiles?.full_name || "Мастер" }));
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from("install_requests").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["install_requests"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sendWhatsApp = async (r: any) => {
    const master = masters.find((m: any) => m.id === r.master_id);
    if (!master) { toast.error("Выберите мастера"); return; }
    const { data: prof } = await supabase.from("profiles").select("phone").eq("id", r.master_id).maybeSingle();
    const masterPhone = (prof as any)?.phone || "";

    const text = `Новая заявка PURE-HOME\n\nКлиент: ${r.client_name}\nТелефон: ${r.phone}\nАдрес: ${r.address || "—"}${r.district ? ` (${r.district})` : ""}\nДата: ${r.desired_at ? new Date(r.desired_at).toLocaleDateString("ru-RU") : "—"}\nВремя: ${r.desired_at ? new Date(r.desired_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—"}\nКомментарий: ${r.operator_comment || "—"}\n\nПринять заявку? Ответьте: ПРИНЯЛ или ОТКАЗ`;
    const phoneClean = masterPhone.replace(/\D/g, "");
    const url = phoneClean
      ? `https://wa.me/${phoneClean}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
    update.mutate({ id: r.id, patch: { status: "sent_to_master", sent_to_master_at: new Date().toISOString() } });
  };

  const setMasterResponse = (r: any, resp: "accepted" | "rejected" | "no_response") => {
    const patch: any = { master_response: resp, master_response_at: new Date().toISOString() };
    if (resp === "accepted") patch.status = "accepted";
    if (resp === "rejected") patch.status = "rejected";
    update.mutate({ id: r.id, patch });
  };

  const openEdit = (r: any) => {
    setEditForm({
      ...r,
      desired_at: r.desired_at ? new Date(r.desired_at).toISOString().slice(0, 16) : "",
    });
    setEditOpen(r.id);
  };

  const saveEdit = () => {
    if (!editOpen) return;
    update.mutate({
      id: editOpen,
      patch: {
        address: editForm.address || null, district: editForm.district || null,
        geo_lat: editForm.geo_lat ? Number(editForm.geo_lat) : null,
        geo_lng: editForm.geo_lng ? Number(editForm.geo_lng) : null,
        desired_at: editForm.desired_at || null,
        operator_comment: editForm.operator_comment || null,
        equipment_type: editForm.equipment_type || null,
        master_id: editForm.master_id || null,
        status: editForm.status,
      },
    }, { onSuccess: () => { setEditOpen(null); toast.success("Заявка обновлена"); } });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Заявки на установку</h1>
        <p className="mt-1 text-sm text-muted-foreground">Координация: распределение мастеров и контроль ответов.</p>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Клиент</TableHead>
              <TableHead>Адрес</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Оборудование</TableHead>
              <TableHead>Мастер</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Ответ</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.client_name}<div className="text-xs text-muted-foreground">{r.phone}</div></TableCell>
                <TableCell className="text-muted-foreground text-xs max-w-[200px]">{r.address || "—"}{r.district && <div className="text-[10px]">{r.district}</div>}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{r.desired_at ? new Date(r.desired_at).toLocaleString("ru-RU") : "—"}</TableCell>
                <TableCell className="text-xs">{r.equipment_type || "—"}</TableCell>
                <TableCell>
                  <Select value={r.master_id || ""} onValueChange={(v) => update.mutate({ id: r.id, patch: { master_id: v, status: r.status === "new" ? "awaiting_master" : r.status } })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Назначить..." /></SelectTrigger>
                    <SelectContent>{masters.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select value={r.status} onValueChange={(v) => update.mutate({ id: r.id, patch: { status: v } })}>
                    <SelectTrigger className="w-auto h-7 border-0 p-0 bg-transparent [&>svg]:hidden">
                      <Badge variant="outline" className={STATUS_COLOR[r.status]}>{STATUS[r.status]}</Badge>
                    </SelectTrigger>
                    <SelectContent>{Object.entries(STATUS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {r.master_response === "pending" ? (
                    <span className="text-xs text-muted-foreground">ждём</span>
                  ) : r.master_response === "accepted" ? (
                    <Badge variant="outline" className="bg-success/15 text-success border-success/30">Принял</Badge>
                  ) : r.master_response === "rejected" ? (
                    <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">Отклонил</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Не ответил</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => sendWhatsApp(r)} disabled={!r.master_id} title="Отправить мастеру в WhatsApp">
                    <MessageCircle className="size-3 mr-1" />WA
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMasterResponse(r, "accepted")} title="Принял"><CheckCircle2 className="size-3 text-success" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setMasterResponse(r, "rejected")} title="Отклонил"><XCircle className="size-3 text-destructive" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setMasterResponse(r, "no_response")} title="Не ответил"><Clock className="size-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Send className="size-3 rotate-180" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {requests.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">Заявок нет</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editOpen} onOpenChange={(v) => !v && setEditOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Редактировать заявку</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Адрес</Label><Input value={editForm.address || ""} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Район</Label><Input value={editForm.district || ""} onChange={(e) => setEditForm({ ...editForm, district: e.target.value })} /></div>
              <div><Label>Оборудование</Label><Input value={editForm.equipment_type || ""} onChange={(e) => setEditForm({ ...editForm, equipment_type: e.target.value })} placeholder="Hyla / фильтр / ..." /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Гео широта</Label><Input value={editForm.geo_lat || ""} onChange={(e) => setEditForm({ ...editForm, geo_lat: e.target.value })} /></div>
              <div><Label>Гео долгота</Label><Input value={editForm.geo_lng || ""} onChange={(e) => setEditForm({ ...editForm, geo_lng: e.target.value })} /></div>
            </div>
            <div><Label>Желаемая дата и время</Label><Input type="datetime-local" value={editForm.desired_at || ""} onChange={(e) => setEditForm({ ...editForm, desired_at: e.target.value })} /></div>
            <div><Label>Комментарий оператора</Label><Textarea value={editForm.operator_comment || ""} onChange={(e) => setEditForm({ ...editForm, operator_comment: e.target.value })} /></div>
            <div>
              <Label>Мастер</Label>
              <Select value={editForm.master_id || ""} onValueChange={(v) => setEditForm({ ...editForm, master_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{masters.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={saveEdit} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
