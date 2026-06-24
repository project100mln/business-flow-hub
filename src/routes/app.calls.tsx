import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Upload, Phone as PhoneIcon, History, Trash2, Download, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { parseContactsFile, maskPhone, exportContactsCsv } from "@/lib/call-base";
import { PinGateDialog, SetPinDialog } from "@/components/pin-gate-dialog";

export const Route = createFileRoute("/app/calls")({ component: CallCenter });

const STATUS: Record<string, string> = {
  new: "Новый контакт", queued: "В очереди", connected: "Дозвон",
  no_answer: "Не дозвон", callback: "Перезвонить", refused: "Отказ",
  interested: "Интерес есть", install_scheduled: "Назначена установка",
  passed_to_coordinator: "Передан координатору",
};
const STATUS_COLOR: Record<string, string> = {
  new: "bg-info/15 text-info border-info/30",
  queued: "bg-muted text-muted-foreground border-border",
  connected: "bg-primary/15 text-primary border-primary/30",
  no_answer: "bg-warning/15 text-warning border-warning/30",
  callback: "bg-warning/15 text-warning border-warning/30",
  refused: "bg-muted text-muted-foreground border-border",
  interested: "bg-primary/15 text-primary border-primary/30",
  install_scheduled: "bg-success/15 text-success border-success/30",
  passed_to_coordinator: "bg-success/15 text-success border-success/30",
};
const TYPE: Record<string, string> = {
  cold: "Холодная база", recommendation: "Рекомендация", instagram: "Instagram", site: "Сайт", other: "Другое",
};

function CallCenter() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const canManageBase = hasRole("admin");
  const canViewFullPhone = hasRole("admin") || hasRole("coordinator");

  const [open, setOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const [currentContact, setCurrentContact] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // PIN gate state
  const [pinOpen, setPinOpen] = useState(false);
  const [setPinOpenDlg, setSetPinOpenDlg] = useState(false);
  const pendingAction = useRef<null | (() => void)>(null);
  const [pinTitle, setPinTitle] = useState("");

  const requirePin = (title: string, run: () => void) => {
    pendingAction.current = run;
    setPinTitle(title);
    setPinOpen(true);
  };

  const [form, setForm] = useState({ full_name: "", phone: "", source: "", contact_type: "cold", comment: "" });
  const [callForm, setCallForm] = useState({ result: "connected", comment: "", recording_url: "", next_step: "", next_contact_at: "" });

  const { data: contacts = [] } = useQuery({
    queryKey: ["cold_contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cold_contacts").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["call_history", historyOpen],
    enabled: !!historyOpen,
    queryFn: async () => (await supabase.from("call_history").select("*").eq("contact_id", historyOpen!).order("called_at", { ascending: false })).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await supabase.from("cold_contacts").insert({
        full_name: form.full_name, phone: form.phone, source: form.source || null,
        contact_type: form.contact_type as any, comment: form.comment || null,
        added_by: user?.id, assigned_operator: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Контакт добавлен"); setOpen(false);
      setForm({ full_name: "", phone: "", source: "", contact_type: "cold", comment: "" });
      qc.invalidateQueries({ queryKey: ["cold_contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("cold_contacts").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cold_contacts"] }),
  });

  const deleteMany = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("cold_contacts").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, ids) => {
      toast.success(`Удалено: ${ids.length}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["cold_contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logCall = useMutation({
    mutationFn: async () => {
      if (!currentContact) return;
      const user = (await supabase.auth.getUser()).data.user;
      const { error: e1 } = await supabase.from("call_history").insert({
        contact_id: currentContact.id, operator_id: user?.id,
        result: callForm.result as any, comment: callForm.comment || null,
        recording_url: callForm.recording_url || null,
        next_step: callForm.next_step || null,
        next_contact_at: callForm.next_contact_at || null,
      });
      if (e1) throw e1;

      const patch: any = { status: callForm.result, next_contact_at: callForm.next_contact_at || null };

      if (callForm.result === "install_scheduled") {
        const { data: client, error: ec } = await supabase.from("clients").insert({
          full_name: currentContact.full_name, phone: currentContact.phone,
          source: currentContact.source || TYPE[currentContact.contact_type],
          notes: callForm.comment || null, created_by: user?.id, assigned_to: user?.id,
        }).select("id").single();
        if (ec) throw ec;
        patch.client_id = client.id;
        patch.status = "passed_to_coordinator";

        const { error: er } = await supabase.from("install_requests").insert({
          client_id: client.id, contact_id: currentContact.id,
          client_name: currentContact.full_name, phone: currentContact.phone,
          desired_at: callForm.next_contact_at || null,
          operator_comment: callForm.comment || null,
          status: "new", created_by: user?.id,
        });
        if (er) throw er;
      }

      const { error: e2 } = await supabase.from("cold_contacts").update(patch).eq("id", currentContact.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Звонок сохранён");
      setCallOpen(false); setCurrentContact(null);
      setCallForm({ result: "connected", comment: "", recording_url: "", next_step: "", next_contact_at: "" });
      qc.invalidateQueries({ queryKey: ["cold_contacts"] });
      qc.invalidateQueries({ queryKey: ["install_requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleImport = async (file: File) => {
    try {
      const parsed = await parseContactsFile(file);
      if (!parsed.length) { toast.error("Нет валидных строк"); return; }
      const user = (await supabase.auth.getUser()).data.user;
      const rows = parsed.map((r) => ({ ...r, added_by: user?.id, assigned_operator: user?.id }));
      const { error } = await supabase.from("cold_contacts").insert(rows as any);
      if (error) throw error;
      toast.success(`Импортировано: ${rows.length}`);
      qc.invalidateQueries({ queryKey: ["cold_contacts"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleExport = () => {
    const csv = exportContactsCsv(contacts as any[]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `call-base-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Экспорт готов");
  };

  const renderPhone = (c: any) => canViewFullPhone
    ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:underline"><PhoneIcon className="size-3 text-muted-foreground" />{c.phone}</a>
    : <span className="inline-flex items-center gap-1.5 text-muted-foreground"><PhoneIcon className="size-3" />{maskPhone(c.phone)}</span>;

  const tabs = useMemo(() => ["all", "queue", "callback"] as const, []);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">База обзвона</h1>
          <p className="mt-1 text-sm text-muted-foreground">Холодные контакты, рекомендации и история звонков.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManageBase && (
            <>
              <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,.docx" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
              <Button variant="outline" onClick={() => requirePin("Импорт базы контактов", () => fileRef.current?.click())}>
                <Upload className="size-4 mr-1" />Импорт
              </Button>
              <Button variant="outline" onClick={() => requirePin("Экспорт базы", handleExport)}>
                <Download className="size-4 mr-1" />Экспорт
              </Button>
              {selected.size > 0 && (
                <Button variant="outline" className="text-destructive border-destructive/40"
                  onClick={() => requirePin(`Массовое удаление: ${selected.size}`, () => deleteMany.mutate([...selected]))}>
                  <Trash2 className="size-4 mr-1" />Удалить ({selected.size})
                </Button>
              )}
              <Button variant="ghost" size="icon" title="Установить PIN" onClick={() => setSetPinOpenDlg(true)}>
                <KeyRound className="size-4" />
              </Button>
            </>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Контакт</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Новый контакт</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>ФИО *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div><Label>Телефон *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div>
                  <Label>Тип контакта</Label>
                  <Select value={form.contact_type} onValueChange={(v) => setForm({ ...form, contact_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(TYPE).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Источник контакта</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
                <div><Label>Комментарий</Label><Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.full_name || !form.phone || create.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Все ({contacts.length})</TabsTrigger>
          <TabsTrigger value="queue">В работе</TabsTrigger>
          <TabsTrigger value="callback">Перезвон</TabsTrigger>
        </TabsList>
        {tabs.map((tab) => {
          const filtered = contacts.filter((c: any) => {
            if (tab === "all") return true;
            if (tab === "queue") return ["new", "queued", "connected", "interested"].includes(c.status);
            if (tab === "callback") return ["callback", "no_answer"].includes(c.status);
            return true;
          });
          const allSelected = filtered.length > 0 && filtered.every((c: any) => selected.has(c.id));
          return (
            <TabsContent key={tab} value={tab}>
              <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canManageBase && (
                        <TableHead className="w-8">
                          <Checkbox checked={allSelected} onCheckedChange={(v) => {
                            const next = new Set(selected);
                            filtered.forEach((c: any) => v ? next.add(c.id) : next.delete(c.id));
                            setSelected(next);
                          }} />
                        </TableHead>
                      )}
                      <TableHead>ФИО</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Источник</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Добавлен</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c: any) => (
                      <TableRow key={c.id}>
                        {canManageBase && (
                          <TableCell>
                            <Checkbox checked={selected.has(c.id)} onCheckedChange={(v) => {
                              const next = new Set(selected);
                              v ? next.add(c.id) : next.delete(c.id);
                              setSelected(next);
                            }} />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{c.full_name}</TableCell>
                        <TableCell>{renderPhone(c)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{TYPE[c.contact_type]}</TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-[180px] truncate">{c.source || "—"}</TableCell>
                        <TableCell>
                          <Select value={c.status} onValueChange={(v) => updateStatus.mutate({ id: c.id, status: v })}>
                            <SelectTrigger className="w-auto h-7 border-0 p-0 bg-transparent [&>svg]:hidden">
                              <Badge variant="outline" className={STATUS_COLOR[c.status]}>{STATUS[c.status]}</Badge>
                            </SelectTrigger>
                            <SelectContent>{Object.entries(STATUS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{new Date(c.created_at).toLocaleDateString("ru-RU")}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="outline" onClick={() => { setCurrentContact(c); setCallOpen(true); }}>
                            <PhoneIcon className="size-3 mr-1" />Звонок
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(c.id)}>
                            <History className="size-3" />
                          </Button>
                          {canManageBase && (
                            <Button size="sm" variant="ghost" className="text-destructive"
                              onClick={() => requirePin(`Удалить: ${c.full_name}`, () => deleteMany.mutate([c.id]))}>
                              <Trash2 className="size-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && <TableRow><TableCell colSpan={canManageBase ? 8 : 7} className="text-center text-muted-foreground py-12">Контактов нет</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      <Dialog open={callOpen} onOpenChange={setCallOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Результат звонка: {currentContact?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Результат *</Label>
              <Select value={callForm.result} onValueChange={(v) => setCallForm({ ...callForm, result: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS).filter(([v]) => v !== "new" && v !== "queued").map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Комментарий</Label><Textarea value={callForm.comment} onChange={(e) => setCallForm({ ...callForm, comment: e.target.value })} /></div>
            <div><Label>Ссылка на запись</Label><Input value={callForm.recording_url} onChange={(e) => setCallForm({ ...callForm, recording_url: e.target.value })} placeholder="https://..." /></div>
            <div><Label>Следующий шаг</Label><Input value={callForm.next_step} onChange={(e) => setCallForm({ ...callForm, next_step: e.target.value })} /></div>
            <div><Label>Дата следующего контакта {callForm.result === "install_scheduled" && "(дата установки) *"}</Label><Input type="datetime-local" value={callForm.next_contact_at} onChange={(e) => setCallForm({ ...callForm, next_contact_at: e.target.value })} /></div>
            {callForm.result === "install_scheduled" && (
              <p className="text-xs text-muted-foreground p-2 rounded bg-success/10 border border-success/20">
                ✓ Будет создана карточка клиента и заявка для координатора.
              </p>
            )}
          </div>
          <DialogFooter><Button onClick={() => logCall.mutate()} disabled={logCall.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyOpen} onOpenChange={(v) => !v && setHistoryOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>История звонков</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {history.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Звонков пока не было</p>}
            {history.map((h: any) => (
              <div key={h.id} className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <Badge variant="outline" className={STATUS_COLOR[h.result]}>{STATUS[h.result]}</Badge>
                  <span className="text-muted-foreground">{new Date(h.called_at).toLocaleString("ru-RU")}</span>
                </div>
                {h.comment && <p className="text-sm">{h.comment}</p>}
                {h.next_step && <p className="text-xs text-muted-foreground">След. шаг: {h.next_step}{h.next_contact_at && ` — ${new Date(h.next_contact_at).toLocaleString("ru-RU")}`}</p>}
                {h.recording_url && <a href={h.recording_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Запись звонка ↗</a>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <PinGateDialog open={pinOpen} onOpenChange={setPinOpen} title={pinTitle}
        onSuccess={() => { pendingAction.current?.(); pendingAction.current = null; }} />
      <SetPinDialog open={setPinOpenDlg} onOpenChange={setSetPinOpenDlg} />
    </div>
  );
}
