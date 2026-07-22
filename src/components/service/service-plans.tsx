import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PRIORITY, fmtDateTime, type StaffOption } from "@/lib/service";
import { serviceKeys, invalidateServicePlans } from "@/lib/service-queries";

export function ServicePlans({ staff, isAdmin }: { staff: StaffOption[]; isAdmin: boolean }) {
  const qc = useQueryClient();
  const staffName = (uid?: string | null) => staff.find((s) => s.id === uid)?.full_name || "—";

  const {
    data: plans = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: serviceKeys.plans(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_plans")
        .select("*, clients(full_name)")
        .order("next_visit_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("service_plans").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Обновлено");
      invalidateServicePlans(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border bg-gradient-surface shadow-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>План</TableHead>
            <TableHead>Клиент</TableHead>
            <TableHead>Интервал</TableHead>
            <TableHead>Следующий визит</TableHead>
            <TableHead>Координатор</TableHead>
            <TableHead>Приоритет</TableHead>
            <TableHead className="text-right">Активен</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell className="text-muted-foreground">{p.clients?.full_name || "—"}</TableCell>
              <TableCell>{p.interval_days} дн.</TableCell>
              <TableCell className="text-muted-foreground">
                {fmtDateTime(p.next_visit_at)}
              </TableCell>
              <TableCell className="text-muted-foreground">{staffName(p.coordinator_id)}</TableCell>
              <TableCell>
                <Badge variant="outline">{PRIORITY[p.priority] || p.priority}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Switch
                  checked={p.is_active}
                  disabled={!isAdmin && false}
                  onCheckedChange={(v) => toggle.mutate({ id: p.id, is_active: v })}
                />
              </TableCell>
            </TableRow>
          ))}
          {plans.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> Загружаем планы…
                  </span>
                ) : error ? (
                  <span className="inline-flex items-center gap-2 text-destructive">
                    <AlertCircle className="size-4" /> Ошибка загрузки: {error.message}
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2"
                      onClick={() => refetch()}
                    >
                      Повторить
                    </Button>
                  </span>
                ) : (
                  "Планов обслуживания пока нет"
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
