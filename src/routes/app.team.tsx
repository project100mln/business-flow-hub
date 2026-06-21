import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/app/team")({ component: Team });

const ROLES = [
  { v: "admin", l: "Собственник" },
  { v: "manager", l: "Менеджер" },
  { v: "operator", l: "Колл-центр" },
  { v: "installer", l: "Монтажник" },
  { v: "finance", l: "Финансист" },
];

function Team() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { hasRole, loading } = useAuth();

  useEffect(() => {
    if (!loading && !hasRole("admin")) navigate({ to: "/app/dashboard" });
  }, [loading, hasRole, navigate]);

  const { data: members = [] } = useQuery({
    queryKey: ["team"],
    enabled: hasRole("admin"),
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("*"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: string }) => {
      const { error: del } = await supabase.from("user_roles").delete().eq("user_id", user_id);
      if (del) throw del;
      const { error } = await supabase.from("user_roles").insert({ user_id, role: role as any });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Роль обновлена"); qc.invalidateQueries({ queryKey: ["team"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!hasRole("admin")) return null;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Сотрудники</h1>
        <p className="mt-1 text-sm text-muted-foreground">Управление ролями членов команды.</p>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Имя</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead>Текущая роль</TableHead>
              <TableHead>Изменить</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.full_name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{m.phone || "—"}</TableCell>
                <TableCell>{m.roles.map((r: string) => <Badge key={r} variant="outline" className="mr-1">{ROLES.find(x=>x.v===r)?.l || r}</Badge>)}</TableCell>
                <TableCell>
                  <Select value={m.roles[0] || ""} onValueChange={(v) => setRole.mutate({ user_id: m.id, role: v })}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
