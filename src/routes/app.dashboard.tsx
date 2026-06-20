import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Users, Briefcase, Wrench, Boxes, Wallet, TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/app/dashboard")({ component: Dashboard });

function StatCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-gradient-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [clients, calls, deals, installs, products, txs] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("calls").select("id", { count: "exact", head: true }),
        supabase.from("deals").select("amount, stage"),
        supabase.from("installations").select("id, status"),
        supabase.from("products").select("stock"),
        supabase.from("transactions").select("type, amount"),
      ]);
      const dealsArr = deals.data ?? [];
      const won = dealsArr.filter((d) => d.stage === "won").reduce((s, d) => s + Number(d.amount), 0);
      const stockTotal = (products.data ?? []).reduce((s, p) => s + (p.stock ?? 0), 0);
      const income = (txs.data ?? []).filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const expense = (txs.data ?? []).filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      return {
        clients: clients.count ?? 0,
        calls: calls.count ?? 0,
        dealsCount: dealsArr.length,
        wonAmount: won,
        installs: (installs.data ?? []).length,
        scheduledInstalls: (installs.data ?? []).filter((i) => i.status === "scheduled").length,
        stockTotal,
        income, expense, balance: income - expense,
      };
    },
  });

  const fmt = (n: number) => new Intl.NumberFormat("ru-RU").format(n);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Дашборд</h1>
        <p className="mt-1 text-sm text-muted-foreground">Сводка по всему бизнесу в реальном времени.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Клиенты" value={fmt(data?.clients ?? 0)} hint="всего в базе" />
        <StatCard icon={Phone} label="Звонки" value={fmt(data?.calls ?? 0)} hint="всего совершено" />
        <StatCard icon={Briefcase} label="Сделок" value={fmt(data?.dealsCount ?? 0)} hint={`закрыто на ${fmt(data?.wonAmount ?? 0)} ₽`} />
        <StatCard icon={Wrench} label="Установки" value={fmt(data?.installs ?? 0)} hint={`${data?.scheduledInstalls ?? 0} запланированы`} />
        <StatCard icon={Boxes} label="Товары на складе" value={fmt(data?.stockTotal ?? 0)} hint="штук всего" />
        <StatCard icon={TrendingUp} label="Доход" value={`${fmt(data?.income ?? 0)} ₽`} />
        <StatCard icon={TrendingDown} label="Расход" value={`${fmt(data?.expense ?? 0)} ₽`} />
        <StatCard icon={Wallet} label="Баланс" value={`${fmt(data?.balance ?? 0)} ₽`} />
      </div>
    </div>
  );
}
