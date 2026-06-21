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
import { Plus, Boxes } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/app/products")({ component: Products });

const TYPES: Record<string, string> = { vacuum: "Пылесос", filter: "Фильтр", accessory: "Аксессуар" };

function Products() {
  const qc = useQueryClient();
  const { isAdminOrManager } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", type: "vacuum", price: "", cost: "", stock: "", description: "" });

  const { data: items = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").insert({
        name: form.name, sku: form.sku || null, type: form.type as any,
        price: Number(form.price || 0), cost: Number(form.cost || 0), stock: Number(form.stock || 0),
        description: form.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Товар добавлен"); setOpen(false);
      setForm({ name: "", sku: "", type: "vacuum", price: "", cost: "", stock: "", description: "" });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStock = useMutation({
    mutationFn: async ({ id, stock }: { id: string; stock: number }) => {
      const { error } = await supabase.from("products").update({ stock }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Товары и склад</h1>
          <p className="mt-1 text-sm text-muted-foreground">Каталог пылесосов, фильтров и аксессуаров с остатками.</p>
        </div>
        {isAdminOrManager && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="size-4 mr-1" />Новый товар</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Новый товар</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Название *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Артикул</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
                  <div><Label>Тип</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(TYPES).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Цена ₸</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                  <div><Label>Себест. ₸</Label><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
                  <div><Label>Остаток</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
                </div>
                <div><Label>Описание</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={() => create.mutate()} disabled={!form.name || create.isPending} className="bg-gradient-primary">Сохранить</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Артикул</TableHead>
              <TableHead className="text-right">Цена</TableHead>
              <TableHead className="text-right">Остаток</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium"><div className="flex items-center gap-2"><Boxes className="size-4 text-muted-foreground" />{p.name}</div></TableCell>
                <TableCell><Badge variant="outline">{TYPES[p.type]}</Badge></TableCell>
                <TableCell className="text-muted-foreground text-xs">{p.sku || "—"}</TableCell>
                <TableCell className="text-right font-semibold">{new Intl.NumberFormat("ru-RU").format(Number(p.price))} ₸</TableCell>
                <TableCell className="text-right">
                  {isAdminOrManager ? (
                    <Input type="number" defaultValue={p.stock} onBlur={(e) => { const v = Number(e.target.value); if (v !== p.stock) updateStock.mutate({ id: p.id, stock: v }); }} className="w-20 ml-auto text-right h-8" />
                  ) : (
                    <span className={p.stock <= 0 ? "text-destructive" : ""}>{p.stock}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Товаров пока нет</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
